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
  useEffect(() => {
    if (!current) return;
    void refreshSummary();
    const id = setInterval(() => { void refreshSummary(); }, 30_000);
    return () => clearInterval(id);
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
