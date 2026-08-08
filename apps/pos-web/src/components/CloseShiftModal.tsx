import { useState } from "react";
import { Card, Field, Overlay } from "./OpenShiftModal";
import { CashInput } from "./CashInput";
import type { ShiftSummary } from "../hooks/useShift";

type Props = {
  summary: ShiftSummary | null;
  pendingOfflineCount?: number;
  pendingOfflineCashTotal?: number;
  pendingOfflineCardTotal?: number;
  pendingOfflineTransferTotal?: number;
  onSyncNow?: () => void;
  onConfirm: (closingCash: number, notes?: string) => Promise<void>;
  onCancel: () => void;
};

/**
 * Blind cash count: the cashier enters what is physically in the drawer
 * without seeing the expected total. Variance is revealed only after a
 * count is typed — that is the control.
 */
export function CloseShiftModal({
  summary,
  pendingOfflineCount = 0,
  pendingOfflineCashTotal = 0,
  pendingOfflineCardTotal = 0,
  pendingOfflineTransferTotal = 0,
  onSyncNow,
  onConfirm,
  onCancel,
}: Props) {
  const [closingCash, setClosingCash] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Bug-053: every cash-drawer field comes back from Laravel as a
  // decimal-cast STRING ("125.00"), not a number — coerce on read.
  const expected = Number(summary?.cash_drawer.expected_cash ?? 0);
  const closing = Number.parseFloat(closingCash);
  const hasCount = closingCash.trim() !== "" && Number.isFinite(closing);
  const variance = hasCount ? closing - expected : null;

  const submit = async () => {
    if (pendingOfflineCount > 0) {
      setErr(`Sync ${pendingOfflineCount} offline order${pendingOfflineCount === 1 ? "" : "s"} before closing the shift.`);
      return;
    }
    if (!hasCount || closing < 0) {
      setErr("Enter the cash you counted in the drawer.");
      return;
    }
    if (variance != null && Math.abs(variance) >= 0.005 && !notes.trim()) {
      setErr("Enter a reason for the cash variance before closing.");
      return;
    }
    setBusy(true);
    try { await onConfirm(closing, notes.trim() || undefined); }
    catch (e) { setErr((e as Error).message || "Could not close shift."); }
    finally { setBusy(false); }
  };

  return (
    <Overlay>
      <Card
        title="Close shift"
        subtitle="Count the cash in the drawer and enter the total below. The expected amount is hidden until you enter a count."
      >
        {/* Blind count: do not show expected, sales breakdown, or variance until counted. */}
        {hasCount && (
          <>
            <Summary label="Opening cash" value={Number(summary?.cash_drawer.opening_cash ?? 0)} />
            <Summary label="+ Cash sales" value={Number(summary?.cash_drawer.cash_sales ?? 0)} />
            {Number(summary?.cash_drawer.paid_in ?? 0) > 0 && <Summary label="+ Paid in" value={Number(summary!.cash_drawer.paid_in)} />}
            {Number(summary?.cash_drawer.credit_repayments_cash ?? 0) > 0 && (
              <Summary
                label="  incl. credit repayments (cash)"
                value={Number(summary!.cash_drawer.credit_repayments_cash ?? 0)}
              />
            )}
            {Number(summary?.cash_drawer.paid_out ?? 0) > 0 && <Summary label="− Paid out" value={Number(summary!.cash_drawer.paid_out)} negative />}
            {Number(summary?.cash_drawer.cash_refunds ?? 0) > 0 && <Summary label="− Refunds" value={Number(summary!.cash_drawer.cash_refunds)} negative />}
            <Summary label="Expected in drawer" value={expected} bold />
          </>
        )}

        {pendingOfflineCount > 0 && (
          <div style={{
            marginTop: 12, padding: "10px 12px", borderRadius: 8,
            background: "#FEE2E2", color: "#B91C1C", fontSize: 13,
          }}>
            {pendingOfflineCount} offline order{pendingOfflineCount === 1 ? "" : "s"} not synced yet.
            {pendingOfflineCashTotal > 0 && (
              <div style={{ marginTop: 4 }}>Pending cash: MVR {pendingOfflineCashTotal.toFixed(2)}</div>
            )}
            {(pendingOfflineCardTotal > 0 || pendingOfflineTransferTotal > 0) && (
              <div style={{ marginTop: 4, color: "#991B1B" }}>
                Pending card/QR MVR {pendingOfflineCardTotal.toFixed(2)} · transfer MVR {pendingOfflineTransferTotal.toFixed(2)}
              </div>
            )}
            {onSyncNow && (
              <button
                type="button"
                onClick={onSyncNow}
                style={{
                  marginTop: 8, padding: "8px 12px", borderRadius: 8, border: "none",
                  background: "#B91C1C", color: "#fff", fontWeight: 700, cursor: "pointer",
                }}
              >
                Sync now
              </button>
            )}
          </div>
        )}

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
            Count the drawer first, then type the total. Expected amount appears after you enter a count.
          </div>
        </Field>

        {variance != null && (
          <div
            data-testid="close-shift-variance"
            style={{
              marginTop: 12, padding: "10px 12px", borderRadius: 8,
              background: Math.abs(variance) < 0.005 ? "#DCFCE7"
                : variance > 0 ? "#FEF3C7" : "#FEE2E2",
              color: Math.abs(variance) < 0.005 ? "#15803D"
                : variance > 0 ? "#92400E" : "#B91C1C",
              display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700,
            }}
          >
            <span>Variance</span>
            <span>{variance >= 0 ? "+" : ""}MVR {variance.toFixed(2)}</span>
          </div>
        )}

        <Field label={variance != null && Math.abs(variance) >= 0.005 ? "Variance reason (required)" : "Notes (optional)"}>
          <input
            value={notes}
            onChange={(e) => { setNotes(e.target.value); setErr(""); }}
            placeholder={
              variance != null && Math.abs(variance) >= 0.005
                ? "e.g. Short change / found cash on floor"
                : "e.g. Found MVR 10 on floor"
            }
            style={{
              width: "100%", boxSizing: "border-box",
              padding: "12px 14px", borderRadius: 10,
              border: variance != null && Math.abs(variance) >= 0.005 && !notes.trim()
                ? "1.5px solid #F87171"
                : "1px solid #CBD5E1",
              fontSize: 14, background: "#fff",
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
