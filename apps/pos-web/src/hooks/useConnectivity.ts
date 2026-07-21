import { useCallback, useEffect, useRef, useState } from "react";
import { getApiBaseUrl } from "../api";

type HealthResponse = { status?: string };

/** Grace period after login before a failed health ping marks us offline. */
const STARTUP_GRACE_MS = 8_000;
/** Require consecutive failures so one slow ping doesn't flip offline mode. */
const FAILURES_BEFORE_OFFLINE = 2;

/**
 * Tracks browser online state plus periodic API reachability.
 * Uses the same API base URL as the authenticated client so a
 * baked-in localhost VITE_API_BASE_URL cannot leave the POS stuck
 * in "Offline" while menu/orders still work via /api.
 */
export function useConnectivity(enabled: boolean) {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [isReachable, setIsReachable] = useState(() => navigator.onLine);
  const [lastOnlineAt, setLastOnlineAt] = useState<number | null>(
    navigator.onLine ? Date.now() : null,
  );
  const timerRef = useRef<number | null>(null);
  const failStreakRef = useRef(0);
  const enabledAtRef = useRef(0);

  const ping = useCallback(async () => {
    if (!navigator.onLine) {
      failStreakRef.current = 0;
      setIsReachable(false);
      return;
    }
    try {
      const res = await fetch(`${getApiBaseUrl()}/health`, {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
      });
      if (res.ok) {
        // FIX 20 — require BOTH a parseable JSON body AND the expected
        // "status" field. A captive-portal or misrouted proxy that hands
        // us HTML with a 200 status must not be treated as reachable —
        // orders would then post into a black hole. Parse failure or
        // unrecognised status → count as offline.
        let ok = false;
        try {
          const data = (await res.json()) as HealthResponse;
          ok = data?.status === "ok" || data?.status === "healthy";
        } catch {
          ok = false;
        }
        if (ok) {
          failStreakRef.current = 0;
          setIsReachable(true);
          setLastOnlineAt(Date.now());
          return;
        }
      }
      failStreakRef.current += 1;
    } catch {
      failStreakRef.current += 1;
    }

    const inGrace = Date.now() - enabledAtRef.current < STARTUP_GRACE_MS;
    if (inGrace || failStreakRef.current < FAILURES_BEFORE_OFFLINE) {
      return;
    }
    setIsReachable(false);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    enabledAtRef.current = Date.now();
    failStreakRef.current = 0;
    setIsReachable(navigator.onLine);

    const onOnline = () => {
      setIsOnline(true);
      failStreakRef.current = 0;
      void ping();
    };
    const onOffline = () => {
      setIsOnline(false);
      failStreakRef.current = 0;
      setIsReachable(false);
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    void ping();
    timerRef.current = window.setInterval(() => {
      if (document.visibilityState === "visible") void ping();
    }, 30_000);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
    };
  }, [enabled, ping]);

  return { isOnline, isReachable, lastOnlineAt, ping };
}
