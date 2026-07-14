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

/** Sync fallback — IndexedDB hydrate is async and loses the race after SW updates. */
const LS_SHIFT_KEY = "pos_open_shift";

function readLocalShift(): ShiftRow | null {
  try {
    const raw = localStorage.getItem(LS_SHIFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ShiftRow>;
    if (typeof parsed.id !== "number" || typeof parsed.opened_at !== "string") return null;
    return {
      id: parsed.id,
      opened_at: parsed.opened_at,
      closed_at: parsed.closed_at ?? null,
      opening_cash: Number(parsed.opening_cash ?? 0),
      closing_cash: parsed.closing_cash ?? null,
      expected_cash: parsed.expected_cash ?? null,
      variance: parsed.variance ?? null,
    };
  } catch {
    return null;
  }
}

function writeLocalShift(shift: ShiftRow): void {
  try {
    localStorage.setItem(LS_SHIFT_KEY, JSON.stringify({
      id: shift.id,
      opened_at: shift.opened_at,
      closed_at: shift.closed_at,
      opening_cash: shift.opening_cash,
      closing_cash: shift.closing_cash,
      expected_cash: shift.expected_cash,
      variance: shift.variance,
    }));
  } catch {
    /* private mode / quota — ignore */
  }
}

function clearLocalShift(): void {
  try {
    localStorage.removeItem(LS_SHIFT_KEY);
  } catch {
    /* ignore */
  }
}

function persistShiftCaches(shift: ShiftRow, deviceIdentifier?: string): void {
  writeLocalShift(shift);
  void saveCachedShift({
    shift_id: shift.id,
    opened_at: shift.opened_at,
    device_identifier: deviceIdentifier
      || localStorage.getItem("pos_device_id")
      || "unknown",
  });
}

function clearShiftCaches(): void {
  clearLocalShift();
  void clearCachedShift();
}

/**
 * Single source of truth for the cashier's current shift. The whole POS
 * is gated on the result of `current`: if it's `null` the cashier sees
 * the "Open shift" screen before any sales UI loads.
 *
 * Reopen/update safety:
 * - Hydrate synchronously from localStorage so we never flash Open-shift
 *   while an open shift is still being confirmed over the network.
 * - A null bootstrap must NOT mark us "ready" — only /shifts/current
 *   (or a non-null bootstrap) is authoritative for "no open shift".
 */
export function useShift(isLoggedIn: boolean, deviceApproved: boolean, deviceIdentifier?: string) {
  const [current, setCurrent] = useState<ShiftRow | null>(() => (
    isLoggedIn ? readLocalShift() : null
  ));
  const [loading, setLoading] = useState(() => !(isLoggedIn && readLocalShift()));
  /** True only after an authoritative network answer for "is there a shift?". */
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>("");
  const [summary, setSummary] = useState<ShiftSummary | null>(null);
  const cacheHydratedRef = useRef(false);
  const refreshGenRef = useRef(0);

  const markReady = useCallback(() => {
    setReady(true);
    setLoading(false);
  }, []);

  const applyOpenShift = useCallback((shift: ShiftRow, deviceId?: string) => {
    setCurrent(shift);
    setError("");
    persistShiftCaches(shift, deviceId ?? deviceIdentifier);
  }, [deviceIdentifier]);

  const seedFromBootstrap = useCallback((shift: PosBootstrapShift | null) => {
    if (shift) {
      applyOpenShift(shift as ShiftRow);
      // Non-null bootstrap is enough to enter the register; refresh still
      // runs in the background to stay in sync.
      markReady();
      return;
    }
    // Null bootstrap is NOT authoritative — keep any local/cached shift
    // and leave ready=false until /shifts/current confirms.
  }, [applyOpenShift, markReady]);

  const refresh = useCallback(async () => {
    if (!isLoggedIn || !deviceApproved) return;
    const gen = ++refreshGenRef.current;
    try {
      const res = await getCurrentShift();
      if (gen !== refreshGenRef.current) return;
      const shift = res.shift as ShiftRow | null;
      if (shift) {
        applyOpenShift(shift);
      } else {
        setCurrent(null);
        clearShiftCaches();
        setError("");
      }
    } catch (e) {
      if (gen !== refreshGenRef.current) return;
      // Distinguish "no shift" (genuine null response or 404) from
      // transient network/server failures so a flaky API doesn't
      // bounce a busy cashier into the Shift Closed gate mid-service.
      if (e instanceof ApiRequestError) {
        if (e.status === 404) {
          setCurrent(null);
          setError("");
          clearShiftCaches();
        } else if (e.status === 401 || e.status === 403) {
          setError(e.message);
          setCurrent(null);
          clearShiftCaches();
        } else {
          setError(e.message || "Couldn't refresh shift — retrying.");
        }
      } else {
        const cached = await loadCachedShift();
        const local = readLocalShift();
        const fallback = local ?? (cached ? {
          id: cached.shift_id,
          opened_at: cached.opened_at,
          closed_at: null,
          opening_cash: 0,
          closing_cash: null,
          expected_cash: null,
          variance: null,
        } : null);
        if (fallback) {
          setCurrent((prev) => prev ?? fallback);
        }
        setError("Network issue — shift status may be stale.");
      }
    } finally {
      if (gen === refreshGenRef.current) {
        markReady();
      }
    }
  }, [isLoggedIn, deviceApproved, applyOpenShift, markReady]);

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

  // Secondary hydrate from IndexedDB (async) — localStorage already covered mount.
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
      setLoading(false);
    });
  }, [isLoggedIn, deviceApproved]);

  useEffect(() => {
    if (!isLoggedIn) {
      cacheHydratedRef.current = false;
      refreshGenRef.current += 1;
      setReady(false);
      setLoading(true);
      setCurrent(null);
      // Drop local shift hints so the next login never inherits another cashier's drawer.
      clearShiftCaches();
      return;
    }
    if (!deviceApproved) return;

    // Confirm with the server immediately. Do not wait on bootstrap —
    // a null bootstrap used to mark ready too early and flash Open-shift.
    void refresh();
  }, [refresh, isLoggedIn, deviceApproved]);

  // Live polling for the shift summary so the cashier sees fresh expected
  // cash + sales counts without manually refreshing. 30s is plenty for
  // an actual cash drawer; faster would just hammer the API.
  //
  // Bug-027: gate polling on Page Visibility.
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
      if (document.visibilityState === "visible") {
        void refresh();
        arm();
      } else {
        disarm();
      }
    };

    if (document.visibilityState === "visible") arm();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      disarm();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [current, refreshSummary, refresh]);

  const open = useCallback(async (openingCash: number, notes?: string, deviceDbId?: number | null) => {
    const res = await openShift({
      opening_cash: openingCash,
      notes,
      ...(deviceDbId ? { device_id: deviceDbId } : {}),
    });
    await refresh();
    return res.shift;
  }, [refresh]);

  const close = useCallback(async (closingCash: number, notes?: string) => {
    if (!current) throw new Error("No open shift to close.");
    const res = await closeShift(current.id, { closing_cash: closingCash, notes });
    setCurrent(null);
    setSummary(null);
    clearShiftCaches();
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
