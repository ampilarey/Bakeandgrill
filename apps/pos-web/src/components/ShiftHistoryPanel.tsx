import { useCallback, useEffect, useMemo, useState } from "react";
import { forceCloseShift, getLiveShifts, getShiftHistory, getShiftSummary } from "../api";
import type { ShiftHistoryParams, ShiftHistoryRow } from "../api/shifts";
import { EmptyState, PanelShell } from "./OpenTicketsPanel";
import { canSeeOpenShiftExpectedCash } from "../utils/shiftDisplay";
import {
  formatForeignHeldSummary,
  fromLaari,
  labelForLaari,
} from "../utils/cashDenominations";

type Props = {
  onClose: () => void;
  staffRole?: string | null;
  /** Owners and managers: every cashier's shifts, the live list and force-close. */
  canViewAll?: boolean;
  /** Called after a force-close so the shell can refresh its own shift state. */
  onShiftsChanged?: () => void;
};

type ShiftRow = ShiftHistoryRow;
type Summary = Awaited<ReturnType<typeof getShiftSummary>>;

/**
 * Shift history audit, 2026-10-02. The list used to show closed shifts
 * only, with a number and a variance and nothing else: no cashier, no
 * till, no way to tell a counted drawer from a force-closed one, and no
 * sign of who is on shift right now. Owners and managers now see the open
 * shifts first, every row names its cashier and till, and the list can be
 * narrowed by date and cashier like the admin page.
 */
export function ShiftHistoryPanel({ onClose, staffRole = null, canViewAll = false, onShiftsChanged }: Props) {
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [live, setLive] = useState<ShiftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [userId, setUserId] = useState<number | "">("");
  const [applied, setApplied] = useState<ShiftHistoryParams>({});
  // Cashier options come from the unfiltered load so narrowing by one
  // cashier does not hide the others from the picker.
  const [cashiers, setCashiers] = useState<Array<{ id: number; name: string }>>([]);

  const loadLive = useCallback(async (): Promise<ShiftRow[]> => {
    if (!canViewAll) return [];
    try {
      const res = await getLiveShifts();
      const rows = res.shifts ?? [];
      setLive(rows);
      return rows;
    } catch { return []; /* the history still loads */ }
  }, [canViewAll]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const [histRes, liveRows] = await Promise.all([getShiftHistory(applied), loadLive()]);
        if (cancelled) return;
        const rows = histRes.shifts ?? [];
        setShifts(rows);
        setErr("");
        if (Object.keys(applied).length === 0) {
          const seen = new Map<number, string>();
          for (const r of rows) if (r.user) seen.set(r.user.id, r.user.name);
          setCashiers([...seen].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)));
        }
        // Keep the selection if it is still listed; otherwise the shift
        // that matters most: one that is open now, else the latest closed.
        setSelectedId((curr) => (
          curr != null && (rows.some((r) => r.id === curr) || liveRows.some((r) => r.id === curr))
            ? curr
            : (liveRows[0]?.id ?? rows[0]?.id ?? null)
        ));
      } catch (e) { if (!cancelled) setErr((e as Error).message); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [applied, loadLive]);

  useEffect(() => {
    if (selectedId == null) return;
    setSummary(null);
    void getShiftSummary(selectedId).then(setSummary).catch(() => setSummary(null));
  }, [selectedId]);

  const selected = useMemo(
    () => live.find((s) => s.id === selectedId) ?? shifts.find((s) => s.id === selectedId) ?? null,
    [live, shifts, selectedId],
  );

  const applyFilters = () => {
    const next: ShiftHistoryParams = {};
    if (from) next.from = from;
    if (to) next.to = to;
    if (userId !== "") next.user_id = userId;
    if (from || to) next.limit = 200;
    setApplied(next);
  };
  const clearFilters = () => { setFrom(""); setTo(""); setUserId(""); setApplied({}); };
  const filtered = Object.keys(applied).length > 0;

  const handleForceClosed = async () => {
    await loadLive();
    setApplied((a) => ({ ...a })); // reload history: the shift is in it now
    onShiftsChanged?.();
  };

  const subtitle = filtered
    ? `${shifts.length} shift${shifts.length === 1 ? "" : "s"} in the filter`
    : canViewAll ? "Everyone's shifts (last 60)" : "Your past shifts (last 60)";

  return (
    <PanelShell title="Shift history" subtitle={subtitle} onClose={onClose}>
      <div className="pos-shift-history" style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 12, minHeight: 0, height: "100%" }}>
        <div style={{ overflow: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
          {canViewAll && (
            <div data-testid="shift-history-filters" style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "0 0 6px" }}>
              <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} aria-label="From date" style={filterInput} />
              <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-label="To date" style={filterInput} />
              <select value={userId} onChange={(e) => setUserId(e.target.value === "" ? "" : Number(e.target.value))} aria-label="Cashier" style={filterInput}>
                <option value="">All cashiers</option>
                {cashiers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button type="button" onClick={applyFilters} style={filterBtn}>Apply</button>
              {filtered && <button type="button" onClick={clearFilters} style={{ ...filterBtn, background: "#fff", color: "#475569" }}>Clear</button>}
            </div>
          )}

          {canViewAll && live.length > 0 && (
            <div data-testid="shift-history-live" style={{ marginBottom: 6 }}>
              <div style={sectionLabel}>Open now</div>
              {live.map((s) => (
                <ShiftRowButton key={`live-${s.id}`} shift={s} selected={selectedId === s.id} onClick={() => setSelectedId(s.id)} />
              ))}
            </div>
          )}

          {loading && <div style={{ color: "#64748B", fontSize: 13, padding: 8 }}>Loading…</div>}
          {err && <div style={{ color: "#B91C1C", fontSize: 13 }}>{err}</div>}
          {!loading && shifts.length === 0 && (
            <EmptyState emoji="📚" title={filtered ? "Nothing in this range" : "No history yet"} body={filtered ? "Try a wider date range or another cashier." : "Closed shifts will appear here."} />
          )}
          {canViewAll && live.length > 0 && shifts.length > 0 && <div style={sectionLabel}>Closed</div>}
          {shifts.map((s) => (
            <ShiftRowButton key={s.id} shift={s} selected={selectedId === s.id} onClick={() => setSelectedId(s.id)} />
          ))}
        </div>

        <div style={{ background: "#F8FAFC", borderRadius: 10, padding: 14, overflow: "auto" }}>
          {selected ? (
            <ShiftDetail
              shift={selected}
              summary={summary}
              staffRole={staffRole}
              canForceClose={canViewAll}
              onForceClosed={handleForceClosed}
            />
          ) : (
            <EmptyState emoji="📊" title="Pick a shift" body="Select one on the left to see its X/Z report." />
          )}
        </div>
      </div>
    </PanelShell>
  );
}

function ShiftRowButton({ shift: s, selected, onClick }: { shift: ShiftRow; selected: boolean; onClick: () => void }) {
  const open = !s.closed_at;
  const forced = !!s.force_closed_at;
  const dim = selected ? "#CBD5E1" : "#64748B";
  return (
    <button
      onClick={onClick}
      data-testid={`shift-row-${s.id}`}
      style={{
        textAlign: "left", padding: 10, borderRadius: 8, width: "100%",
        background: selected ? "#0F172A" : "#fff",
        color: selected ? "#fff" : "#0F172A",
        border: `1px solid ${selected ? "#0F172A" : open ? "#86EFAC" : "#E2E8F0"}`,
        cursor: "pointer",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontWeight: 700, fontSize: 13 }}>
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          #{s.id}
          {s.user?.name ? ` · ${s.user.name}` : ""}
          {s.device?.name ? <span style={{ color: dim, fontWeight: 600 }}> · {s.device.name}</span> : null}
        </span>
        <span style={{ flexShrink: 0, color: varianceColour(s, selected) }}>
          {open ? "open" : forced ? "not counted" : varianceLabel(s)}
        </span>
      </div>
      <div style={{ fontSize: 11, marginTop: 4, color: dim, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <span>{formatTime(s.opened_at)} → {s.closed_at ? formatTime(s.closed_at) : "now"}</span>
        {forced && <span style={pill(selected)}>Force-closed</span>}
        {open && <span style={{ ...pill(selected), background: selected ? "#14532D" : "#DCFCE7", color: selected ? "#86EFAC" : "#166534" }}>On shift</span>}
      </div>
    </button>
  );
}

function ShiftDetail({
  shift,
  summary,
  staffRole,
  canForceClose,
  onForceClosed,
}: {
  shift: ShiftRow;
  summary: Summary | null;
  staffRole: string | null | undefined;
  canForceClose: boolean;
  onForceClosed: () => Promise<void>;
}) {
  const isClosed = !!shift.closed_at;
  const forced = !!shift.force_closed_at;
  // The server strips expected_cash/variance for cashiers (blind count):
  // render the reconciliation only when the response actually carries it.
  // Open rows additionally require the manager/owner role (same control
  // as ShiftPanel).
  const hasReconciliation = shift.expected_cash != null && shift.variance != null;
  const showExpectedMath = (isClosed && hasReconciliation)
    || (!isClosed && canSeeOpenShiftExpectedCash(staffRole));
  const floatVar = shift.opening_float_variance == null ? null : Number(shift.opening_float_variance);

  const [forcing, setForcing] = useState(false);
  const [forceNotes, setForceNotes] = useState("");
  const [forceBusy, setForceBusy] = useState(false);
  const [forceErr, setForceErr] = useState("");
  useEffect(() => { setForcing(false); setForceNotes(""); setForceErr(""); }, [shift.id]);

  const confirmForceClose = async () => {
    setForceBusy(true);
    setForceErr("");
    try {
      await forceCloseShift(shift.id, forceNotes.trim() || undefined);
      setForcing(false);
      await onForceClosed();
    } catch (e) { setForceErr((e as Error).message || "Could not force-close."); }
    finally { setForceBusy(false); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#0F172A" }}>
          Shift #{shift.id}{shift.user?.name ? ` · ${shift.user.name}` : ""}
        </div>
        <div style={{ fontSize: 12, color: "#64748B", marginTop: 4 }}>
          {formatTime(shift.opened_at)} → {shift.closed_at ? formatTime(shift.closed_at) : "still open"}
          {shift.device?.name ? ` · ${shift.device.name}` : ""}
        </div>
      </div>

      {forced && (
        <div data-testid="shift-history-forced" style={{
          padding: "10px 12px", borderRadius: 8, background: "#FEF3C7", color: "#92400E",
          border: "1px solid #FCD34D", fontSize: 13, lineHeight: 1.45,
        }}>
          <strong>Force-closed{shift.force_closer?.name ? ` by ${shift.force_closer.name}` : ""}</strong>
          {shift.force_closed_at ? ` on ${formatTime(shift.force_closed_at)}` : ""}. The drawer was never counted:
          the counted total below is the expected one, so the variance says nothing.
        </div>
      )}

      {!isClosed && canForceClose && (
        <div data-testid="shift-history-force-close" style={{ background: "#fff", borderRadius: 10, border: "1px solid #FCD34D", padding: 12 }}>
          {!forcing ? (
            <button type="button" onClick={() => setForcing(true)} style={{ ...filterBtn, background: "#B45309" }}>
              Force close this shift
            </button>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 12, color: "#92400E", lineHeight: 1.4 }}>
                This closes {shift.user?.name ? `${shift.user.name}'s` : "the"} shift without a count. Use it when they have walked away from the till.
              </div>
              <input
                value={forceNotes}
                onChange={(e) => setForceNotes(e.target.value)}
                placeholder="Reason (optional)"
                aria-label="Force-close reason"
                style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #CBD5E1", fontSize: 13 }}
              />
              {forceErr && <div style={{ color: "#B91C1C", fontSize: 12 }}>{forceErr}</div>}
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={() => setForcing(false)} disabled={forceBusy} style={{ ...filterBtn, background: "#fff", color: "#475569" }}>Cancel</button>
                <button type="button" onClick={() => void confirmForceClose()} disabled={forceBusy} style={{ ...filterBtn, background: "#B45309" }}>
                  {forceBusy ? "Closing…" : "Confirm force close"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <Section title="Cash drawer">
        <Row label="Opening cash" value={Number(shift.opening_cash)} />
        {shift.opening_float_expected != null && (
          <div data-testid="shift-history-float-check" style={{ fontSize: 11, marginTop: -2, marginBottom: 4, color: floatVar != null && Math.abs(floatVar) >= 0.01 ? "#92400E" : "#64748B", fontWeight: 600 }}>
            {floatVar != null && Math.abs(floatVar) >= 0.01
              ? `${floatVar < 0 ? "Short" : "Over"} MVR ${Math.abs(floatVar).toFixed(2)} against the last close on this till (MVR ${Number(shift.opening_float_expected).toFixed(2)})`
              : `Matches the last close on this till (MVR ${Number(shift.opening_float_expected).toFixed(2)})`}
          </div>
        )}
        {showExpectedMath && summary && <Row label="+ Cash sales" value={summary.cash_drawer.cash_sales} />}
        {showExpectedMath && summary && summary.cash_drawer.paid_in > 0 && (
          <Row label="+ Paid in" value={summary.cash_drawer.paid_in} />
        )}
        {showExpectedMath && summary && summary.cash_drawer.paid_out > 0 && (
          <Row label="− Paid out" value={-summary.cash_drawer.paid_out} />
        )}
        {showExpectedMath ? (
          <>
            <Row label="Expected" value={Number(shift.expected_cash ?? 0)} bold />
            {isClosed && <Row label={forced ? "Counted (not counted: set to expected)" : "Counted"} value={Number(shift.closing_cash ?? 0)} bold />}
            {isClosed && (
              <div data-testid="shift-history-variance">
                {forced ? (
                  <Row label="Variance" text="not counted" bold />
                ) : noCashHandled(shift, summary) ? (
                  <Row label="Variance" text="no cash handled" bold />
                ) : (
                  <Row label="Variance" value={Number(shift.variance ?? 0)} bold signed />
                )}
                {(() => {
                  const fx = shift.foreign_currency_held ?? [];
                  const v = Number(shift.variance ?? 0);
                  if (forced || !fx.length || Math.abs(v) < 0.005) return null;
                  const summary = formatForeignHeldSummary(fx);
                  return (
                    <div
                      data-testid="shift-history-fx-beside-variance"
                      style={{ fontSize: 12, color: "#92400E", marginTop: 4, fontWeight: 600 }}
                    >
                      {v < 0 ? `Short MVR ${Math.abs(v).toFixed(2)}` : `Over MVR ${v.toFixed(2)}`}
                      {" · "}
                      {summary}
                    </div>
                  );
                })()}
              </div>
            )}
            {!isClosed && (
              <div style={{ fontSize: 12, color: "#64748B", paddingTop: 6, lineHeight: 1.4 }}>
                Still open: counted and variance appear once it is closed.
              </div>
            )}
            {isClosed && !forced && shift.cash_count_method && (
              <div style={{ fontSize: 11, color: "#64748B", marginTop: 6 }}>
                Count method: {shift.cash_count_method === "denominations" ? "denominations" : "plain total"}
              </div>
            )}
          </>
        ) : isClosed ? (
          <>
            <Row label="Counted" value={Number(shift.closing_cash ?? 0)} bold />
            <div style={{ fontSize: 12, color: "#64748B", paddingTop: 6, lineHeight: 1.4 }}>
              The drawer reconciliation for this shift is recorded and visible to
              managers and owners.
            </div>
          </>
        ) : (
          <div style={{ fontSize: 12, color: "#64748B", paddingTop: 6, lineHeight: 1.4 }}>
            Expected drawer total stays hidden until this shift is closed and counted.
          </div>
        )}
      </Section>

      {isClosed && !forced && shift.cash_count_breakdown && Object.keys(shift.cash_count_breakdown).length > 0 && (
        <Section title="Denomination breakdown">
          <div data-testid="shift-history-denom-breakdown">
            {Object.entries(shift.cash_count_breakdown)
              .map(([laari, count]) => ({ laari: Number(laari), count: Number(count) }))
              .filter((r) => r.count > 0)
              .sort((a, b) => b.laari - a.laari)
              .map((r) => (
                <div
                  key={r.laari}
                  style={{
                    display: "flex", justifyContent: "space-between", padding: "4px 0",
                    fontSize: 13, color: "#475569",
                  }}
                >
                  <span>{labelForLaari(r.laari)} × {r.count}</span>
                  <span>MVR {fromLaari(r.laari * r.count).toFixed(2)}</span>
                </div>
              ))}
          </div>
        </Section>
      )}

      {isClosed && (shift.foreign_currency_held?.length ?? 0) > 0 && (
        <Section title="Foreign currency held">
          <div data-testid="shift-history-foreign-currency">
            {shift.foreign_currency_held!.map((r, i) => (
              <div
                key={i}
                style={{
                  display: "flex", justifyContent: "space-between", padding: "4px 0",
                  fontSize: 13, color: "#475569",
                }}
              >
                <span>{r.currency} {Number(r.denomination)} × {r.count}</span>
                <span>accepted MVR {Number(r.accepted_mvr).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {summary && (
        <Section title="Sales">
          <Row label="Orders" value={summary.sales_summary.order_count} count />
          <Row label="Gross sales" value={summary.sales_summary.gross_sales} />
          <Row label="Discounts" value={-summary.sales_summary.discounts} />
          <Row label="Refunds" value={-summary.sales_summary.refunds} />
          <Row label="Net sales" value={summary.sales_summary.net_sales} bold />
        </Section>
      )}

      {summary && Object.keys(summary.tenders ?? {}).length > 0 && (
        <Section title="Tenders">
          {Object.entries(summary.tenders)
            .filter(([m]) => showExpectedMath || m !== "cash")
            .map(([m, v]) => (
              <Row key={m} label={m.replace("_", " ")} value={Number(v)} />
            ))}
        </Section>
      )}

      {shift.notes && (
        <Section title="Notes">
          <div style={{ fontSize: 13, color: "#475569", whiteSpace: "pre-wrap" }}>{shift.notes}</div>
        </Section>
      )}

      <button onClick={() => window.print()} style={{
        alignSelf: "flex-start", padding: "8px 14px", borderRadius: 8,
        background: "#fff", border: "1px solid #CBD5E1", color: "#475569",
        fontWeight: 600, fontSize: 13, cursor: "pointer",
      }}>Print</button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #E2E8F0", padding: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value, text, bold, count, signed }: {
  label: string;
  value?: number;
  /** A word instead of a number ("not counted"). */
  text?: string;
  bold?: boolean;
  count?: boolean;
  /** Show "+" on a positive number (a variance); zero stays unsigned. */
  signed?: boolean;
}) {
  // Bug-053: see ShiftPanel — Laravel returns strings for decimal casts.
  const n = Number(value ?? 0);
  const fmt = text ?? (count
    ? String(Math.round(n))
    : `${n < -0.005 ? "−" : signed && n > 0.005 ? "+" : ""}MVR ${Math.abs(n).toFixed(2)}`);
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", padding: "4px 0",
      fontSize: 13, color: bold ? "#0F172A" : "#475569",
      fontWeight: bold ? 700 : 500,
      borderTop: bold ? "1px solid #E2E8F0" : "none",
      marginTop: bold ? 6 : 0,
    }}>
      <span>{label}</span><span>{fmt}</span>
    </div>
  );
}

/** Nothing went through the drawer: opening, counted and expected all zero. */
function noCashHandled(s: ShiftRow, summary: Summary | null): boolean {
  const zero = (v: unknown) => Math.abs(Number(v ?? 0)) < 0.005;
  if (!zero(s.opening_cash) || !zero(s.closing_cash) || !zero(s.expected_cash) || !zero(s.variance)) return false;
  if (summary && (!zero(summary.cash_drawer.cash_sales) || !zero(summary.cash_drawer.paid_in) || !zero(summary.cash_drawer.paid_out))) return false;
  return true;
}

/** The list's right-hand figure for a closed, counted shift. */
function varianceLabel(s: ShiftRow): string {
  if (s.variance == null) return "—"; // cashiers see no reconciliation
  const v = Number(s.variance);
  if (Math.abs(v) < 0.005) {
    const zero = (x: unknown) => Math.abs(Number(x ?? 0)) < 0.005;
    return zero(s.opening_cash) && zero(s.closing_cash) && zero(s.expected_cash) ? "no cash" : "MVR 0.00";
  }
  return `${v > 0 ? "+" : "−"}MVR ${Math.abs(v).toFixed(2)}`;
}

function varianceColour(s: ShiftRow, selected: boolean): string {
  if (!s.closed_at) return selected ? "#86EFAC" : "#15803D";
  if (s.force_closed_at || s.variance == null) return selected ? "#CBD5E1" : "#64748B";
  const v = Number(s.variance);
  if (Math.abs(v) < 0.005) {
    const zero = (x: unknown) => Math.abs(Number(x ?? 0)) < 0.005;
    const nothing = zero(s.opening_cash) && zero(s.closing_cash) && zero(s.expected_cash);
    return nothing ? (selected ? "#CBD5E1" : "#64748B") : (selected ? "#86EFAC" : "#15803D");
  }
  return selected ? "#FDE68A" : "#92400E";
}

function pill(selected: boolean): React.CSSProperties {
  return {
    padding: "1px 6px", borderRadius: 999, fontSize: 10, fontWeight: 700,
    background: selected ? "#78350F" : "#FEF3C7", color: selected ? "#FDE68A" : "#92400E",
  };
}

const sectionLabel: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: "#64748B", textTransform: "uppercase",
  letterSpacing: "0.08em", padding: "6px 2px 4px",
};
const filterInput: React.CSSProperties = {
  flex: "1 1 120px", minWidth: 0, padding: "6px 8px", borderRadius: 8,
  border: "1px solid #CBD5E1", fontSize: 12, background: "#fff", color: "#0F172A",
};
const filterBtn: React.CSSProperties = {
  padding: "6px 12px", borderRadius: 8, border: "1px solid #CBD5E1",
  background: "#0F172A", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer",
};

function formatTime(iso: string): string {
  try { return new Date(iso).toLocaleString(undefined, { hour: "2-digit", minute: "2-digit", month: "short", day: "2-digit" }); }
  catch { return iso; }
}
