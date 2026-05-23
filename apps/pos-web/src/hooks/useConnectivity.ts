import { useCallback, useEffect, useRef, useState } from "react";

type HealthResponse = { status?: string };

/**
 * Tracks browser online state plus periodic API reachability.
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
      const base = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.PROD ? "/api" : "http://localhost:8000/api");
      const res = await fetch(`${base}/health`, { method: "GET", cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as HealthResponse;
        const ok = data.status === "ok" || data.status === "healthy" || res.ok;
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
