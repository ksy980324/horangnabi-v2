import { useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';
import type { Stop } from '../types';

type Drag = {
  pointerId: number;
  source: number;
  target: number;
  startY: number;
  y: number;
  cards: HTMLElement[];
  handle: HTMLSpanElement;
  stops: Stop[];
  frame: number;
};

export function useStopDrag(stops: Stop[], mapRef: RefObject<HTMLElement | null>, disabled: boolean, onDrop: (id: string, target: number) => void) {
  const drag = useRef<Drag | null>(null);
  const [preview, setPreview] = useState<{ source: number; target: number }>();

  function cancel() {
    const current = drag.current;
    if (!current) return;
    drag.current = null;
    cancelAnimationFrame(current.frame);
    if (current.handle.hasPointerCapture(current.pointerId)) current.handle.releasePointerCapture(current.pointerId);
    setPreview(undefined);
  }

  useEffect(() => {
    if (disabled || drag.current?.stops !== stops) cancel();
  }, [stops, disabled]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') cancel(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', cancel);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', cancel);
      cancelAnimationFrame(drag.current?.frame ?? 0);
    };
  }, []);

  function updateTarget(current: Drag) {
    const target = current.cards.reduce((index, card, i) => {
      if (i === current.source) return index;
      const bounds = card.getBoundingClientRect();
      return current.y > bounds.top + bounds.height / 2 ? index + 1 : index;
    }, 0);
    current.target = target;
    setPreview(previous => previous?.target === target ? previous : { source: current.source, target });
  }

  function autoScroll(current: Drag) {
    const mapBottom = window.matchMedia('(max-width: 800px)').matches ? mapRef.current?.getBoundingClientRect().bottom ?? 0 : 0;
    const top = Math.max(0, Math.min(mapBottom, window.innerHeight - 120));
    const bottom = window.innerHeight;
    const step = current.y < top + 42 ? -12 : current.y > bottom - 42 ? 12 : 0;
    if (step) {
      window.scrollBy({ top: step, behavior: 'instant' });
      updateTarget(current);
    }
    current.frame = requestAnimationFrame(() => autoScroll(current));
  }

  function handleProps(source: number) {
    return {
      onPointerDown(event: PointerEvent<HTMLSpanElement>) {
        if (disabled || drag.current || !event.isPrimary || event.button !== 0) return;
        const handle = event.currentTarget;
        const list = handle.closest('.stop-list');
        if (!list) return;
        handle.setPointerCapture(event.pointerId);
        drag.current = {
          source, target: source, pointerId: event.pointerId, startY: event.clientY, y: event.clientY,
          cards: Array.from(list.querySelectorAll<HTMLElement>(':scope > .stop-card')), handle, stops, frame: 0,
        };
      },
      onPointerMove(event: PointerEvent<HTMLSpanElement>) {
        const current = drag.current;
        if (!current || event.pointerId !== current.pointerId) return;
        current.y = event.clientY;
        if (!current.frame && Math.abs(current.y - current.startY) < 6) return;
        updateTarget(current);
        if (!current.frame) current.frame = requestAnimationFrame(() => autoScroll(current));
      },
      onPointerUp(event: PointerEvent<HTMLSpanElement>) {
        const current = drag.current;
        if (!current || event.pointerId !== current.pointerId) return;
        if (current.frame) {
          current.y = event.clientY;
          updateTarget(current);
        }
        cancel();
        if (!disabled && current.stops === stops && current.source !== current.target) onDrop(stops[source].id, current.target);
      },
      onPointerCancel: cancel,
      onLostPointerCapture: cancel,
    };
  }

  return { preview, handleProps };
}
