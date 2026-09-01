import { useCallback, useRef } from "react";

/**
 * Press-and-hold, for a touchscreen where there is no right-click.
 *
 * A till is used with a thumb, often at speed, so two rules matter more than
 * the timing:
 *
 *  - **A hold is not a tap.** Once the hold fires, the tap that follows when
 *    the finger lifts is swallowed. Otherwise holding "Receipts" to pin it
 *    would also navigate to Receipts, which is not what the cashier meant.
 *  - **A drag is not a hold.** Sliding more than a few pixels cancels, so a
 *    scroll through the drawer never turns into a long press by accident.
 */
export function useLongPress(
  onLongPress: () => void,
  { delayMs = 500, moveTolerancePx = 10 }: { delayMs?: number; moveTolerancePx?: number } = {},
) {
  const timer = useRef<number | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const clear = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    origin.current = null;
  }, []);

  const start = useCallback((e: React.PointerEvent) => {
    // Ignore right-click and multi-touch — neither is a deliberate hold.
    if (e.button !== 0 && e.pointerType === "mouse") return;
    fired.current = false;
    origin.current = { x: e.clientX, y: e.clientY };
    timer.current = window.setTimeout(() => {
      fired.current = true;
      timer.current = null;
      onLongPress();
    }, delayMs);
  }, [onLongPress, delayMs]);

  const move = useCallback((e: React.PointerEvent) => {
    if (timer.current === null || origin.current === null) return;
    const dx = Math.abs(e.clientX - origin.current.x);
    const dy = Math.abs(e.clientY - origin.current.y);
    if (dx > moveTolerancePx || dy > moveTolerancePx) clear();
  }, [clear, moveTolerancePx]);

  /**
   * Wrap the element's own click handler. Returns a handler that does nothing
   * when the press that preceded it was a hold.
   */
  const clickGuard = useCallback((onClick: () => void) => () => {
    if (fired.current) {
      fired.current = false;

      return;
    }
    onClick();
  }, []);

  return {
    handlers: {
      onPointerDown: start,
      onPointerMove: move,
      onPointerUp: clear,
      onPointerLeave: clear,
      onPointerCancel: clear,
      // A hold on iOS raises the text-selection loupe over the button
      // otherwise, which looks like the app has hung.
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    },
    clickGuard,
  };
}
