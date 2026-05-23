import { useCallback, useEffect, useRef, useState } from "react";
import { getApiBaseUrl } from "../api";

type HealthResponse = { status?: string };

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

  const ping = useCallback(async () => {
    if (!navigator.onLine) {
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
        let ok = true;
        try {
          const data = (await res.json()) as HealthResponse;
          ok = data.status === "ok" || data.status === "healthy" || res.ok;
        } catch {
          ok = true;
        }
        setIsReachable(ok);
        if (ok) setLastOnlineAt(Date.now());
      } else {
        setIsReachable(false);
      }
    } catch {
      setIsReachable(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const onOnline = () => {
      setIsOnline(true);
      void ping();
    };
    const onOffline = () => {
      setIsOnline(false);
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
