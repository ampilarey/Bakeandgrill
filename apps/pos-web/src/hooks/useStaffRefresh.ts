import { useEffect, useRef } from "react";
import { PERMISSIONS_STALE_EVENT } from "../api/client";

export const STAFF_REFRESH = {
  /** After sign-in: late enough that the menu and the shift load first. */
  firstMs: 3000,
  /** While the till is on screen. */
  everyMs: 60_000,
  /** Back on screen or refused by the server: not again within this. */
  minGapMs: 10_000,
};

/**
 * Re-read the signed-in person (role, permissions, preferences) while the
 * till is in use. Owner, 2026-10-10: Pickup was switched off for cashiers in
 * Admin, yet a signed-in till still offered it (and not Dine-in): its list
 * was the one from sign-in, read again only at the next sign-in or unlock.
 *
 * Now: shortly after sign-in, every minute while the till is on screen and
 * online, when it comes back on screen, and at once when the server refuses
 * something the till offered (PERMISSIONS_STALE_EVENT). A change made in
 * Admin reaches an open till within a minute.
 */
export function useStaffRefresh(isLoggedIn: boolean, refresh: () => void): void {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const lastAtRef = useRef(0);

  useEffect(() => {
    if (!isLoggedIn) return;
    const run = () => {
      lastAtRef.current = Date.now();
      refreshRef.current();
    };
    const first = window.setTimeout(run, STAFF_REFRESH.firstMs);
    const every = window.setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine !== false) run();
    }, STAFF_REFRESH.everyMs);
    const soon = () => {
      if (Date.now() - lastAtRef.current > STAFF_REFRESH.minGapMs) run();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") soon();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(PERMISSIONS_STALE_EVENT, soon);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(every);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(PERMISSIONS_STALE_EVENT, soon);
    };
  }, [isLoggedIn]);
}
