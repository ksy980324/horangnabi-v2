import { useEffect, useState, type RefObject } from 'react';

export function useScheduleMapSize(mapRef: RefObject<HTMLElement | null>, scope: string | undefined) {
  const [automatic, setAutomatic] = useState(false);
  const [override, setOverride] = useState<boolean>();

  useEffect(() => {
    setOverride(undefined);
    setAutomatic(false);
    const map = mapRef.current;
    const planner = map?.parentElement;
    if (!scope || !map || !planner) return;

    const mobile = window.matchMedia('(max-width: 800px)');
    const readStickyTop = () => Number.parseFloat(getComputedStyle(map).top) || 8;
    let stickyTop = readStickyTop();
    let compact = false;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const top = planner.getBoundingClientRect().top;
      const next = mobile.matches && top < stickyTop - (compact ? 8 : 32);
      if (next === compact) return;
      compact = next;
      setAutomatic(next);
      setOverride(undefined);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const onResize = () => { stickyTop = readStickyTop(); schedule(); };
    schedule();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', onResize);
    };
  }, [mapRef, scope]);

  const compact = override ?? automatic;
  return { compact, toggle: () => setOverride(!compact) };
}
