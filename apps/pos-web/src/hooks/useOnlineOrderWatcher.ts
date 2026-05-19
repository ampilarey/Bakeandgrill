import { useEffect, useRef, useState } from "react";
import { fetchRecentOnlineOrders } from "../api";
import type { IncomingOnlineOrder } from "../api";

const POLL_INTERVAL_MS = 30_000;
const STORAGE_KEY = "pos_online_orders_last_seen_id";

// Bug-023: lazy module-level AudioContext for the new-order chime.
// We used to `new AudioContext()` on every chime, which hit iOS
// Safari's per-page AudioContext limit (around 6) after a busy
// lunch — chimes then silently failed for the rest of the
// session. Now we keep ONE instance and create the oscillator
// per beep; the context is initialised lazily on the first
// successful playback (browsers block before any user gesture
// anyway, so the try/catch absorbs the pre-gesture rejection).
type WindowWithAudio = Window & {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
};

let sharedAudioCtx: AudioContext | null = null;
function playNewOrderChime(): void {
  try {
    const wa = window as WindowWithAudio;
    const AC = wa.AudioContext ?? wa.webkitAudioContext;
    if (!AC) return;
    if (!sharedAudioCtx) sharedAudioCtx = new AC();
    const ctx = sharedAudioCtx;
    // iOS may suspend the context when the tab backgrounds; resume
    // here so the next beep after coming back to the tab is audible.
    if (ctx.state === "suspended") void ctx.resume();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880;
    g.gain.value = 0.08;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.18);
    // Don't close the shared context on `ended` — we want to reuse it.
  } catch { /* no sound — toast stands on its own */ }
}

function readLastSeenId(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const n = raw ? Number.parseInt(raw, 10) : 0;
    return Number.isFinite(n) ? n : 0;
  } catch { return 0; }
}

/**
 * Background watcher that polls the staff `/orders` endpoint every 30s
 * for online_pickup orders that haven't been handed over yet. New
 * orders (id > the highest we've already seen, persisted in
 * localStorage so a tab reload doesn't re-trigger) are pushed onto a
 * toast queue the App renders in the bottom corner.
 *
 * Intentionally lightweight:
 *   - Single endpoint, paginated to the last 10 unhandled orders.
 *   - localStorage-backed high-water mark so the toast only fires for
 *     genuinely-new orders, not for orders the cashier already saw on
 *     the previous shift.
 *   - Polling pauses when the tab is hidden (visibilitychange) and
 *     resumes on focus, so we don't burn battery on a backgrounded
 *     iPad in the storeroom.
 *   - Skips the very first poll's "new" detection so the cashier
 *     doesn't get a flood of toasts on initial sign-in for every
 *     order that already existed before they logged in.
 *
 * The Sound API call is silenced gracefully — browsers block audio
 * without a user gesture, so the toast still appears visually even
 * if the chime is muted by the OS.
 */
export function useOnlineOrderWatcher(enabled: boolean) {
  const [toasts, setToasts] = useState<IncomingOnlineOrder[]>([]);
  const lastSeenIdRef = useRef<number>(readLastSeenId());
  const isFirstPollRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!enabled) {
      isFirstPollRef.current = true;
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    let cancelled = false;

    const tick = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const orders = await fetchRecentOnlineOrders(10);
        if (cancelled) return;

        const lastSeen = Number(lastSeenIdRef.current);
        // First poll after login: just record the highest id as the
        // baseline, don't toast. From then on, ANY order with a higher
        // id is "new since last time we looked".
        if (isFirstPollRef.current) {
          isFirstPollRef.current = false;
          const max = orders.reduce((m, o) => Math.max(m, o.id), lastSeen);
          lastSeenIdRef.current = max;
          localStorage.setItem(STORAGE_KEY, String(max));
          return;
        }

        const fresh = orders.filter((o) => o.id > lastSeen);
        if (fresh.length === 0) return;

        // Sort oldest-first so the cashier sees them appear in arrival
        // order in the corner stack — newest order ends up on top.
        fresh.sort((a, b) => a.id - b.id);
        setToasts((curr) => [...curr, ...fresh]);

        const newMax = fresh.reduce((m, o) => Math.max(m, o.id), lastSeen);
        lastSeenIdRef.current = newMax;
        localStorage.setItem(STORAGE_KEY, String(newMax));

        // Best-effort chime via WebAudio (cheap sine beep, no asset
        // file, no decode). Browsers block playback before any user
        // gesture so the helper keeps things silent until the
        // cashier has interacted with the page. The visual toast
        // is the source of truth either way.
        playNewOrderChime();
      } catch { /* network blip — try again next tick */ }
    };

    void tick();
    timerRef.current = setInterval(() => void tick(), POLL_INTERVAL_MS);

    // Re-poll immediately when the tab comes back to the foreground so
    // a cashier returning to the POS sees toasts for orders that
    // landed while they were on another app.
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [enabled]);

  const dismiss = (id: number) => {
    setToasts((curr) => curr.filter((o) => o.id !== id));
  };

  return { toasts, dismiss };
}
