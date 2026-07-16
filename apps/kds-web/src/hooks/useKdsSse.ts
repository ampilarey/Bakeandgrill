/**
 * SSE hook for standalone KDS — uses fetch + ReadableStream so we can
 * pass Authorization: Bearer with the kds_token (EventSource cannot).
 */
import { useEffect, useRef, useState } from "react";

export interface KdsSseEvent {
  id: string;
  type: string;
  data: string;
}

const apiBaseUrl =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  (import.meta.env.PROD ? "/api" : "http://localhost:8000/api");

interface UseKdsSseOptions {
  token: string | null;
  onEvent: (event: KdsSseEvent) => void;
  enabled?: boolean;
  /**
   * Keep reporting connected=true briefly after the stream ends so the
   * kitchen UI does not flicker "Polling…" on every server stream rotate.
   */
  disconnectGraceMs?: number;
}

export function useKdsSse({
  token,
  onEvent,
  enabled = true,
  disconnectGraceMs = 2_500,
}: UseKdsSseOptions): { connected: boolean } {
  const [connected, setConnected] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const onEventRef = useRef(onEvent);
  const lastEventId = useRef("");
  const disconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    const useSse = import.meta.env.VITE_KDS_USE_SSE !== "false";
    if (!enabled || !token || !useSse) {
      setConnected(false);
      return;
    }

    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const clearDisconnectTimer = () => {
      if (disconnectTimer.current) {
        clearTimeout(disconnectTimer.current);
        disconnectTimer.current = null;
      }
    };

    const markConnected = () => {
      clearDisconnectTimer();
      setConnected(true);
    };

    const scheduleDisconnected = () => {
      if (stopped) {
        setConnected(false);
        return;
      }
      clearDisconnectTimer();
      disconnectTimer.current = setTimeout(() => {
        disconnectTimer.current = null;
        if (!stopped) setConnected(false);
      }, disconnectGraceMs);
    };

    async function connect(sinceId: string) {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      const url = `${apiBaseUrl}/stream/kds${sinceId ? `?since=${encodeURIComponent(sinceId)}` : ""}`;

      try {
        const res = await fetch(url, {
          signal: ctrl.signal,
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "text/event-stream",
            "Cache-Control": "no-cache",
          },
        });

        if (!res.ok || !res.body) {
          throw new Error(`SSE connect failed: ${res.status}`);
        }

        markConnected();

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let curId = sinceId;
        let curType = "message";
        let curData = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (line === "") {
              if (curData !== "") {
                onEventRef.current({ id: curId, type: curType, data: curData.trimEnd() });
                curType = "message";
                curData = "";
              }
            } else if (line.startsWith("id:")) {
              curId = line.slice(3).trim();
              lastEventId.current = curId;
            } else if (line.startsWith("event:")) {
              curType = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              curData += line.slice(5).trimStart() + "\n";
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
      } finally {
        if (!stopped) scheduleDisconnected();
      }

      if (!stopped) {
        retryTimer = setTimeout(() => connect(lastEventId.current), 250);
      }
    }

    void connect(lastEventId.current);

    return () => {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      clearDisconnectTimer();
      abortRef.current?.abort();
      setConnected(false);
    };
  }, [token, enabled, disconnectGraceMs]);

  return { connected };
}
