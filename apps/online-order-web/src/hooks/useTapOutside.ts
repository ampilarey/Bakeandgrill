import { useEffect, useRef, type RefObject } from 'react';

/**
 * Calls `onOutside` when the customer taps anywhere outside `refs` while
 * `active` (owner, 2026-10-07: an open search panel or prayer banner "should
 * be hidden on any click outside the box").
 *
 * A tap, not a touch: a finger that starts outside and scrolls the page is
 * reading the menu, not dismissing anything. Touch scrolling ends in
 * `pointercancel`, so only a lift without one counts; a mouse that dragged
 * further than a tap is ignored the same way.
 */
export function useTapOutside(
  refs: ReadonlyArray<RefObject<HTMLElement | null>>,
  active: boolean,
  onOutside: () => void,
) {
  const latest = useRef(onOutside);
  latest.current = onOutside;
  const refsRef = useRef(refs);
  refsRef.current = refs;

  useEffect(() => {
    if (!active) return;
    let start: { x: number; y: number; id: number } | null = null;
    const inside = (target: EventTarget | null) =>
      target instanceof Node && refsRef.current.some((r) => r.current?.contains(target));
    const onDown = (e: PointerEvent) => {
      start = inside(e.target) ? null : { x: e.clientX, y: e.clientY, id: e.pointerId };
    };
    const onCancel = () => { start = null; };
    const onUp = (e: PointerEvent) => {
      const s = start;
      start = null;
      if (!s || s.id !== e.pointerId) return;
      if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > 10) return;
      latest.current();
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('pointercancel', onCancel, true);
    document.addEventListener('pointerup', onUp, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('pointercancel', onCancel, true);
      document.removeEventListener('pointerup', onUp, true);
    };
  }, [active]);
}
