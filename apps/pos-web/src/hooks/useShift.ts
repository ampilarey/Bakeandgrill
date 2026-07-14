import { useCallback, useEffect, useRef, useState } from "react";
import { ApiRequestError } from "@shared/api";
import type { PosBootstrapShift } from "../api";
import {
  closeShift,
  createCashMovement,
  getCurrentShift,
  getShiftSummary,
  openShift,
} from "../api";
import { saveCachedShift, loadCachedShift, clearCachedShift } from "../offline/db";

export type ShiftRow = {
  id: number;
  opened_at: string;
  closed_at: string | null;
  opening_cash: number;
  closing_cash: number | null;
  expected_cash: number | null;
  variance: number | null;
};

export type ShiftSummary = Awaited<ReturnType<typeof getShiftSummary>>;

/**
 * Single source of truth for the cashier's current shift. The whole POS
 * is gated on the result of `current`: if it's `null` the cashier sees
 * the "Open shift" screen before any sales UI loads. This matches the
 * Loyverse "hard shift gate" behaviour.
 *
 * `ready` is false until IndexedDB hydrate + at least one network check
 * (bootstrap or /shifts/current) finishes — so we never flash "Open shift"
 * while an already-open shift is still loading after app reopen/update.
 */
export function useShift(isLoggedIn: boolean, deviceApproved: boolean, deviceIdentifier?: string) {
  const [current, setCurrent] = useState<ShiftRow | null>(null);
  const [loading, setLoading] = useState(true);
  /** True after first authoritative (network) shift check completes. */
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>("");
  const [summary, setSummary] = useState<ShiftSummary | null>(null);
  const cacheHydratedRef = useRef(false);
  const networkCheckedRef = useRef(false);

  const markNetworkChecked = useCallback(() => {
    networkCheckedRef.current = true;
    setReady(true);
    setLoading(false);
  }, []);

  const seedFromBootstrap = useCallback((shift: PosBootstrapShift | null) => {
    // Never wipe a cached/open shift with a null bootstrap payload — that
    // caused the "Open shift" flash on iPad reopen/update. A follow-up
    // refresh confirms whether the shift is truly closed.
    if (shift) {
      setCurrent(shift);
      setError("");
      if (deviceIdentifier) {
        void saveCachedShift({
          shift_id: shift.id,
          opened_at: shift.opened_at,
          device_identifier: deviceIdentifier,
        });
      }
    }
    markNetworkChecked();
  }, [deviceIdentifier, markNetworkChecked]);

  const refresh = useCallback(async () => {
    if (!isLoggedIn || !deviceApproved) return;
    try {
      const res = await getCurrentShift();
      const shift = res.shift as ShiftRow | null;
      setCurrent(shift);
      if (shift && deviceIdentifier) {
        void saveCachedShift({
          shift_id: shift.id,
          opened_at: shift.opened_at,
          device_identifier: deviceIdentifier,
        });
      } else if (!shift) {
        void clearCachedShift();
      }
      setError("");
    } catch (e) {
      // Distinguish "no shift" (genuine null response or 404) from
      // transient network/server failures so a flaky API doesn't
      // bounce a busy cashier into the Shift Closed gate mid-service.
      //
      //   - 404            → server says "no current shift" → treat as null
      //   - 401 / 403      → token gone → bubble up via setError, blank shift
      //   - 5xx / network  → keep the LAST known shift in place + log error
      //                       so the cashier can keep ringing while we retry
      if (e instanceof ApiRequestError) {
        if (e.status === 404) {
          setCurrent(null);
          setError("");
          void clearCachedShift();
        } else if (e.status === 401 || e.status === 403) {
          setError(e.message);
          setCurrent(null);
        } else {
          // 5xx or other API error — keep existing shift, surface message
          // so a banner can prompt the cashier to retry.
          setError(e.message || "Couldn't refresh shift — retrying.");
        }
      } else {
        // Network / offline — keep last shift; hydrate from IndexedDB
        // cache on cold start when the API is unreachable.
        const cached = await loadCachedShift();
        if (cached) {
          setCurrent((prev) => prev ?? {
            id: cached.shift_id,
            opened_at: cached.opened_at,
            closed_at: null,
            opening_cash: 0,
            closing_cash: null,
            expected_cash: null,
            variance: null,
          });
        }
        setError("Network issue — shift status may be stale.");
      }
    } finally {
      markNetworkChecked();
    }
  }, [isLoggedIn, deviceApproved, deviceIdentifier, markNetworkChecked]);

  const refreshSummary = useCallback(async () => {
    if (!current) {
      setSummary(null);
      return;
    }
    try {
      const s = await getShiftSummary(current.id);
      setSummary(s);
    } catch {
      /* ignore — summary is best-effort */
    }
  }, [current]);

  // Hydrate shift from IndexedDB immediately so reopen/update can show
  // the register without waiting on the network when we already cached
  // an open shift. Keep `ready` false until network confirms — so a
  // cache miss never flashes the Open-shift gate early.
  useEffect(() => {
    if (!isLoggedIn || !deviceApproved || cacheHydratedRef.current) return;
    cacheHydratedRef.current = true;
    void loadCachedShift().then((cached) => {
      if (!cached) return;
      setCurrent((prev) => prev ?? {
        id: cached.shift_id,
        opened_at: cached.opened_at,
        closed_at: null,
        opening_cash: 0,
        closing_cash: null,
        expected_cash: null,
        variance: null,
      });
      // Optimistic UI only — still wait for bootstrap/refresh before
      // treating "no shift" as authoritative.
      setLoading(false);
    });
  }, [isLoggedIn, deviceApproved]);

  useEffect(() => {
    if (!isLoggedIn) {
      cacheHydratedRef.current = false;
      networkCheckedRef.current = false;
      setReady(false);
      setLoading(true);
      return;
    }
    if (!deviceApproved) return;

    // Confirm shift ASAP. Bootstrap may also seed; refresh always runs
    // so a null bootstrap cannot leave us stuck on a stale "no shift".
    const handle = window.setTimeout(() => {
      void refresh();
    }, 150);

    return () => window.clearTimeout(handle);
  }, [refresh, isLoggedIn, deviceApproved]);

  // Live polling for the shift summary so the cashier sees fresh expected
  // cash + sales counts without manually refreshing. 30s is plenty for
  // an actual cash drawer; faster would just hammer the API.
  //
  // Bug-027: gate polling on Page Visibility. If the iPad screen is off,
  // the POS tab is backgrounded, or another app is focused, the
  // interval used to keep firing — burning battery and hitting the
  // /shifts/{id}/summary endpoint with stale-tab requests. Now the
  // interval clears when document.visibilityState !== "visible" and
  // re-arms on visibilitychange. A burst-refresh runs on each
  // become-visible event so the first thing the cashier sees when
  // they wake the screen is already up-to-date.
  useEffect(() => {
    if (!current) return;
    let timerId: number | null = null;
    let summaryDelayId: number | null = null;

    const arm = () => {
      if (timerId !== null) return;
      summaryDelayId = window.setTimeout(() => { void refreshSummary(); }, 5000);
      timerId = window.setInterval(() => { void refreshSummary(); }, 30_000);
    };
    const disarm = () => {
      if (summaryDelayId !== null) {
        window.clearTimeout(summaryDelayId);
        summaryDelayId = null;
      }
      if (timerId !== null) {
        window.clearInterval(timerId);
        timerId = null;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") arm();
      else disarm();
    };

    if (document.visibilityState === "visible") arm();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      disarm();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [current, refreshSummary]);

  const open = useCallback(async (openingCash: number, notes?: string, deviceDbId?: number | null) => {
    try {
      const res = await openShift({
        opening_cash: openingCash,
        notes,
        ...(deviceDbId ? { device_id: deviceDbId } : {}),
      });
      await refresh();
      const opened = res.shift as ShiftRow;
      if (deviceIdentifier) {
        void saveCachedShift({
          shift_id: opened.id,
          opened_at: opened.opened_at,
          device_identifier: deviceIdentifier,
        });
      }
      return res.shift;
    } catch (e) {
      throw e;
    }
  }, [refresh, deviceIdentifier]);

  const close = useCallback(async (closingCash: number, notes?: string) => {
    if (!current) throw new Error("No open shift to close.");
    const res = await closeShift(current.id, { closing_cash: closingCash, notes });
    setCurrent(null);
    setSummary(null);
    await clearCachedShift();
    return res;
  }, [current]);

  const cashMovement = useCallback(async (
    type: "cash_in" | "cash_out",
    amount: number,
    reason: string,
  ) => {
    if (!current) throw new Error("Cannot record cash movement without an open shift.");
    await createCashMovement(current.id, { type, amount, reason });
    await refreshSummary();
  }, [current, refreshSummary]);

  return {
    current,
    summary,
    loading,
    ready,
    error,
    refresh,
    refreshSummary,
    seedFromBootstrap,
    open,
    close,
    cashMovement,
  };
}
