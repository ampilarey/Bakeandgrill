import { useCallback, useEffect, useState } from "react";
import { ApiRequestError } from "@shared/api";
import {
  closeShift,
  createCashMovement,
  getCurrentShift,
  getShiftSummary,
  openShift,
} from "../api";

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
 */
export function useShift(isLoggedIn: boolean, deviceApproved: boolean) {
  const [current, setCurrent] = useState<ShiftRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [summary, setSummary] = useState<ShiftSummary | null>(null);

  const refresh = useCallback(async () => {
    if (!isLoggedIn || !deviceApproved) return;
    try {
      const res = await getCurrentShift();
      setCurrent(res.shift as ShiftRow | null);
      setError("");
    } catch (e) {
      // 401/403 — token gone, treat as no shift.
      if (e instanceof ApiRequestError) setError(e.message);
      setCurrent(null);
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn, deviceApproved]);

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

  useEffect(() => { void refresh(); }, [refresh]);

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

    const arm = () => {
      if (timerId !== null) return;
      void refreshSummary();
      timerId = window.setInterval(() => { void refreshSummary(); }, 30_000);
    };
    const disarm = () => {
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

  const open = useCallback(async (openingCash: number, notes?: string) => {
    try {
      const res = await openShift({ opening_cash: openingCash, notes });
      await refresh();
      return res.shift;
    } catch (e) {
      throw e;
    }
  }, [refresh]);

  const close = useCallback(async (closingCash: number, notes?: string) => {
    if (!current) throw new Error("No open shift to close.");
    const res = await closeShift(current.id, { closing_cash: closingCash, notes });
    setCurrent(null);
    setSummary(null);
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
    error,
    refresh,
    refreshSummary,
    open,
    close,
    cashMovement,
  };
}
