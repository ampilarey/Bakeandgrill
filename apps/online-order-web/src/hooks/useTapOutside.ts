import { useEffect, useRef, type RefObject } from 'react';

/**
 * Calls `onOutside` when the customer touches the page anywhere outside
 * `refs` while `active`: a tap, or a finger (or wheel) that starts scrolling
 * (owner, 2026-10-07: an open search panel or prayer banner "should be hidden
 * on any click outside the box", and "when i touch to scroll" too).
 *
 * A tap closes on lift, not on touch: closing can move the page (the prayer
 * banner shrinks), and by then the tap has already picked what it landed on.
 * A scroll closes as it starts, which is the browser's `pointercancel`.
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
    let armed: number | null = null;
    const inside = (target: EventTarget | null) =>
      target instanceof Node && refsRef.current.some((r) => r.current?.contains(target));
    const onDown = (e: PointerEvent) => {
      armed = inside(e.target) ? null : e.pointerId;
    };
    const onEnd = (e: PointerEvent) => {
      if (armed === null || armed !== e.pointerId) return;
      armed = null;
      latest.current();
    };
    const onWheel = (e: WheelEvent) => {
      if (!inside(e.target)) latest.current();
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('pointerup', onEnd, true);
    document.addEventListener('pointercancel', onEnd, true);
    document.addEventListener('wheel', onWheel, { capture: true, passive: true });
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('pointerup', onEnd, true);
      document.removeEventListener('pointercancel', onEnd, true);
      document.removeEventListener('wheel', onWheel, { capture: true } as EventListenerOptions);
    };
  }, [active]);
}
