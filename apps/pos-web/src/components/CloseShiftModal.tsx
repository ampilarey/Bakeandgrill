import { useEffect, useState } from "react";
import { Card, Field, Overlay } from "./OpenShiftModal";
import { CashInput } from "./CashInput";
import type { ShiftSummary } from "../hooks/useShift";

type Props = {
  summary: ShiftSummary | null;
  onConfirm: (closingCash: number, notes?: string) => Promise<void>;
  onCancel: () => void;
};

/**
 * Show the same numbers the cashier saw in the live shift panel, then
 * ask them to count the drawer. Variance is computed live so the
 * cashier can never be surprised by what closes.
 */
export function CloseShiftModal({ summary, onConfirm, onCancel }: Props) {
  const [closingCash, setClosingCash] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Bug-053: every cash-drawer field comes back from Laravel as a
  // decimal-cast STRING ("125.00"), not a number — the `?? 0`
  // fallback only catches null/undefined and lets strings through,
  // which then crash later in toFixed/arithmetic. Coerce on read.
  const expected = Number(summary?.cash_drawer.expected_cash ?? 0);
  const closing = Number.parseFloat(closingCash);
  const variance = Number.isFinite(closing) ? closing - expected : null;

  // Pre-fill with the expected drawer so the cashier just confirms when
  // the count matches — the common case in a tight shop. The previous
  // guard `if (expected && …)` was falsy for an expected of 0, which
  // forced cashiers to manually type "0" on slow shifts.
  useEffect(() => {
    if (closingCash !== "" || summary == null) return;
    setClosingCash(expected.toFixed(2));
  }, [expected, closingCash, summary]);

  const submit = async () => {
    if (closing == null || !Number.isFinite(closing) || closing < 0) {
      setErr("Enter the cash you counted in the drawer.");
      return;
    }
    setBusy(true);
    try { await onConfirm(closing, notes.trim() || undefined); }
    catch (e) { setErr((e as Error).message || "Could not close shift."); }
    finally { setBusy(false); }
  };

  return (
    <Overlay>
      <Card title="Close shift" subtitle="Count the cash in the drawer and enter the total below.">
        <Summary label="Opening cash" value={Number(summary?.cash_drawer.opening_cash ?? 0)} />
        <Summary label="+ Cash sales" value={Number(summary?.cash_drawer.cash_sales ?? 0)} />
        {Number(summary?.cash_drawer.paid_in ?? 0) > 0 && <Summary label="+ Paid in" value={Number(summary!.cash_drawer.paid_in)} />}
        {Number(summary?.cash_drawer.paid_out ?? 0) > 0 && <Summary label="− Paid out" value={Number(summary!.cash_drawer.paid_out)} negative />}
        {Number(summary?.cash_drawer.cash_refunds ?? 0) > 0 && <Summary label="− Refunds" value={Number(summary!.cash_drawer.cash_refunds)} negative />}
        <Summary label="Expected in drawer" value={expected} bold />

        {Number(summary?.open_unpaid_orders ?? 0) > 0 && (
          <div style={{
            marginTop: 12, padding: "10px 12px", borderRadius: 8,
            background: "#FEF3C7", color: "#92400E", fontSize: 13,
          }}>
            This shift has {summary!.open_unpaid_orders} open unpaid order
            {summary!.open_unpaid_orders === 1 ? "" : "s"} created during it.
            They will stay active and can be paid by another staff shift.
          </div>
        )}

        <Field label="Counted cash">
          <CashInput
            autoFocus
            value={closingCash}
            onChange={(v) => { setClosingCash(v); setErr(""); }}
          />
          <div style={{ marginTop: 6, fontSize: 11, color: "#64748B" }}>
            Pre-filled with expected. Tap the numpad to adjust if the count differs.
          </div>
        </Field>

        {variance != null && (
          <div style={{
            marginTop: 12, padding: "10px 12px", borderRadius: 8,
            background: Math.abs(variance) < 0.005 ? "#DCFCE7"
              : variance > 0 ? "#FEF3C7" : "#FEE2E2",
            color: Math.abs(variance) < 0.005 ? "#15803D"
              : variance > 0 ? "#92400E" : "#B91C1C",
            display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700,
          }}>
            <span>Variance</span>
            <span>{variance >= 0 ? "+" : ""}MVR {variance.toFixed(2)}</span>
          </div>
        )}

        <Field label="Notes (optional)">
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Found MVR 10 on floor"
            style={{
              width: "100%", boxSizing: "border-box",
              padding: "12px 14px", borderRadius: 10,
              border: "1px solid #CBD5E1", fontSize: 14, background: "#fff",
            }}
          />
        </Field>

        {err && <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: "#FEE2E2", color: "#B91C1C", fontSize: 13 }}>{err}</div>}

        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button onClick={onCancel} disabled={busy} style={{
            flex: 1, padding: "12px 18px", borderRadius: 10,
            border: "1px solid #CBD5E1", background: "#fff", color: "#475569",
            fontWeight: 600, fontSize: 14, cursor: "pointer",
          }}>Cancel</button>
          <button onClick={submit} disabled={busy} style={{
            flex: 1, padding: "12px 18px", borderRadius: 10,
            border: "none", background: "#EF4444", color: "#fff",
            fontWeight: 700, fontSize: 14, cursor: "pointer",
          }}>{busy ? "Closing…" : "Close shift"}</button>
        </div>
      </Card>
    </Overlay>
  );
}

function Summary({ label, value, bold, negative }: { label: string; value: number; bold?: boolean; negative?: boolean }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", padding: "6px 0",
      fontSize: 13, color: bold ? "#0F172A" : "#475569",
      fontWeight: bold ? 700 : 500,
      borderTop: bold ? "1px solid #E2E8F0" : "none",
      marginTop: bold ? 6 : 0,
    }}>
      <span>{label}</span>
      <span>{negative ? "−" : ""}MVR {Math.abs(value).toFixed(2)}</span>
    </div>
  );
}
