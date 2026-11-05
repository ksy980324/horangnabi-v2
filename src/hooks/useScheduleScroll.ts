import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { findReadingStop } from '../services/scrollSelection';

type ScrollStop = { id: string };
export function useScheduleScroll(scope: string, stops: ScrollStop[], mapRef: RefObject<HTMLElement | null>, paused: boolean) {
  const [focus, setFocus] = useState<{ scope: string; id: string }>();
  const lockedUntil = useRef(0);
  const focusStop = useCallback((id: string) => {
    // Pin/card selections win while their smooth scroll is in progress.
    lockedUntil.current = performance.now() + 1200;
    setFocus({ scope, id });
  }, [scope]);
  const clearFocus = useCallback(() => {
    lockedUntil.current = performance.now() + 1200;
    setFocus(undefined);
  }, []);

  useEffect(() => {
    if (!stops.length || paused) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      if (performance.now() < lockedUntil.current || document.querySelector('dialog[open]')) return;
      const mapElement = mapRef.current;
      if (!mapElement) return;
      const mobile = window.matchMedia('(max-width: 800px)').matches;
      const mapBounds = mapElement.getBoundingClientRect();
      const visibleTop = mobile ? Math.max(0, mapBounds.bottom + 12) : 24;
      const cards = stops.flatMap(stop => {
        const element = document.getElementById(`stop-${stop.id}`);
        if (!element) return [];
        const rect = element.getBoundingClientRect();
        return [{ id: stop.id, top: rect.top, bottom: rect.bottom }];
      });
      const atBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 3;
      const id = findReadingStop(cards, visibleTop, window.innerHeight, atBottom);
      if (id) setFocus(current => current?.scope === scope && current.id === id ? current : { scope, id });
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const unlock = () => { lockedUntil.current = 0; };
    const onKey = (event: KeyboardEvent) => { if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)) unlock(); };
    const onFocus = (event: FocusEvent) => {
      // Browser focus can scroll a pin/card into view before its click/Enter.
      // That scroll must not replace the intended selection and remove its DOM.
      if (event.target instanceof Element && (mapRef.current?.contains(event.target) || event.target.closest('.stop-select'))) {
        lockedUntil.current = performance.now() + 1200;
      }
    };
    const measureMap = () => {
      const element = mapRef.current;
      if (element) element.parentElement?.style.setProperty('--schedule-map-height', `${element.getBoundingClientRect().height}px`);
    };
    const onResize = () => { measureMap(); schedule(); };
    const observer = new ResizeObserver(measureMap);
    if (mapRef.current) observer.observe(mapRef.current);
    measureMap();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', onResize);
    window.addEventListener('wheel', unlock, { passive: true });
    window.addEventListener('touchstart', unlock, { passive: true });
    window.addEventListener('keydown', onKey);
    window.addEventListener('focusin', onFocus);
    return () => {
      cancelAnimationFrame(frame); observer.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('wheel', unlock);
      window.removeEventListener('touchstart', unlock);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('focusin', onFocus);
    };
  }, [scope, stops, mapRef, paused]);

  const activeId = focus?.scope === scope && stops.some(stop => stop.id === focus.id) ? focus.id : undefined;
  return { activeId, focusStop, clearFocus };
}
