/**
 * useSse — lightweight Server-Sent Events hook using fetch + ReadableStream.
 *
 * EventSource does not support custom headers, so we use fetch with a
 * ReadableStream reader instead. This lets us pass `Authorization: Bearer`
 * on every SSE connection while keeping the same reconnect behaviour.
 *
 * Usage:
 *   const { connected } = useSse('/api/stream/kds', (event) => {
 *     if (event.type === 'kds.updated') reload();
 *   });
 */
import { useEffect, useRef, useState } from 'react';
import { BASE } from '../api/client';

export interface SseEvent {
  id:   string;
  type: string;
  data: string;
}

interface UseSseOptions {
  /** Called for every parsed SSE event. Keep this stable (useCallback) to avoid re-subscribing. */
  onEvent: (event: SseEvent) => void;
  /** Reconnect delay in ms after a disconnect. Default: 3000 */
  reconnectDelay?: number;
  /** Whether to connect at all. Default: true */
  enabled?: boolean;
}

export function useSse(
  path: string,
  { onEvent, reconnectDelay = 3_000, enabled = true }: UseSseOptions,
): { connected: boolean } {
  const [connected, setConnected] = useState(false);
  const abortRef   = useRef<AbortController | null>(null);
  const onEventRef = useRef(onEvent);

  // Keep the callback ref current without restarting the stream
  useEffect(() => { onEventRef.current = onEvent; }, [onEvent]);

  useEffect(() => {
    if (!enabled) return;

    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    async function connect(lastEventId: string) {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      const token = localStorage.getItem('admin_token') ?? '';
      const url   = `${BASE}${path}${lastEventId ? `?since=${encodeURIComponent(lastEventId)}` : ''}`;

      try {
        const res = await fetch(url, {
          signal: ctrl.signal,
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept':        'text/event-stream',
            'Cache-Control': 'no-cache',
          },
        });

        if (!res.ok || !res.body) {
          throw new Error(`SSE connect failed: ${res.status}`);
        }

        setConnected(true);

        const reader  = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer    = '';
        let curId     = lastEventId;
        let curType   = 'message';
        let curData   = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (line === '') {
              // Blank line = dispatch event
              if (curData !== '') {
                onEventRef.current({ id: curId, type: curType, data: curData.trimEnd() });
                curType = 'message';
                curData = '';
              }
            } else if (line.startsWith('id:')) {
              curId = line.slice(3).trim();
            } else if (line.startsWith('event:')) {
              curType = line.slice(6).trim();
            } else if (line.startsWith('data:')) {
              curData += line.slice(5).trimStart() + '\n';
            }
            // ignore 'retry:' and comment lines (':')
          }
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return; // intentional close
        // Network error — schedule reconnect
      } finally {
        setConnected(false);
      }

      if (!stopped) {
        const retryId = (abortRef.current as AbortController & { _lastId?: string })?._lastId ?? '';
        retryTimer = setTimeout(() => connect(retryId), reconnectDelay);
      }
    }

    void connect('');

    return () => {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      abortRef.current?.abort();
    };
  // path and reconnectDelay are stable; enabled changes intentionally restart the connection
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, reconnectDelay, enabled]);

  return { connected };
}
