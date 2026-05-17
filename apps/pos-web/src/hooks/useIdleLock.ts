import { useEffect, useRef } from "react";

/**
 * Idle-lock hook for the POS.
 *
 * Calls `onIdle()` after `timeoutMs` of inactivity. Activity is any
 * user-driven event we care about: pointerdown, keydown, touchstart,
 * wheel, visibilitychange (a fresh tab-switch back resets the timer).
 *
 * We *don't* listen to mousemove — those fire even when the cashier
 * brushes the trackpad and would defeat the idle timeout on laptops.
 * Pointerdown + keydown is the right granularity for a counter device:
 * if you haven't touched the screen or pressed a key in N minutes,
 * you're not standing at the till.
 *
 * Disable cases (returns early without registering listeners):
 *   - `enabled` is false (the cashier is already on the lock screen,
 *     or hasn't logged in, etc.)
 *   - `timeoutMs <= 0` (cashier disabled auto-lock)
 *
 * Notes:
 *   - The timer is reset on every activity using `setTimeout`/`clearTimeout`,
 *     not the more expensive Date-diff polling approach, so the hook is
 *     effectively zero-cost when idle.
 *   - `onIdle` is held in a ref so changing it between renders doesn't
 *     rip down the whole subscription.
 */
export function useIdleLock({
  enabled,
  timeoutMs,
  onIdle,
}: {
  enabled: boolean;
  timeoutMs: number;
  onIdle: () => void;
}): void {
  const onIdleRef = useRef(onIdle);
  useEffect(() => { onIdleRef.current = onIdle; }, [onIdle]);

  useEffect(() => {
    if (!enabled || timeoutMs <= 0) return;

    let timer: number | null = null;

    const arm = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => onIdleRef.current(), timeoutMs);
    };

    const onActivity = () => arm();
    const onVisibility = () => {
      if (document.visibilityState === "visible") arm();
    };

    const events: Array<keyof WindowEventMap> = [
      "pointerdown",
      "keydown",
      "touchstart",
      "wheel",
    ];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    document.addEventListener("visibilitychange", onVisibility);

    arm(); // start the timer immediately on mount

    return () => {
      if (timer !== null) window.clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, onActivity));
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, timeoutMs]);
}

/** localStorage key for the cashier-configured idle-lock timeout in
 *  minutes. 0 = never auto-lock. Default 5 min. */
export const IDLE_LOCK_MIN_KEY = "pos_idle_lock_minutes";

export function getIdleLockMinutes(): number {
  const raw = localStorage.getItem(IDLE_LOCK_MIN_KEY);
  if (raw === null) return 5; // sensible default
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 5;
}
