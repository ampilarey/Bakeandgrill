import { useState } from "react";
import { EmptyState, PanelShell } from "./OpenTicketsPanel";
import { CashInput } from "./CashInput";
import type { ShiftRow, ShiftSummary } from "../hooks/useShift";

type Props = {
  shift: ShiftRow | null;
  summary: ShiftSummary | null;
  onCashMovement: (type: "cash_in" | "cash_out", amount: number, reason: string) => Promise<void>;
  onClose: () => void;
  onCloseShift: () => void;
  canCloseShift?: boolean;
  canCashInOut?: boolean;
};

/**
 * Live shift summary screen — the home for cash drawer reconciliation
 * during the shift. Renders the same expected-cash math the close
 * modal uses, so the cashier never sees a surprise at close time. Also
 * surfaces Paid In / Paid Out so cashiers can record cash movements
 * (tips out, supplier pay, owner draw, etc.) without contacting an
 * admin first.
 */
export function ShiftPanel({ shift, summary, onCashMovement, onClose, onCloseShift, canCloseShift = true, canCashInOut = true }: Props) {
  if (!shift || !summary) {
    return (
      <PanelShell title="Shift" onClose={onClose}>
        <EmptyState emoji="💰" title="No data yet" body="Once your shift has activity, it'll show up here." />
      </PanelShell>
    );
  }

  return (
    <PanelShell
      title="Current shift"
      subtitle={`Opened ${formatTime(shift.opened_at)}`}
      onClose={onClose}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {/* Cash drawer card */}
        <Card title="Cash drawer">
          <Row label="Opening cash" value={summary.cash_drawer.opening_cash} />
          <Row label="+ Cash sales" value={summary.cash_drawer.cash_sales} />
          {summary.cash_drawer.cash_refunds > 0 && (
            <Row label="− Refunds" value={-summary.cash_drawer.cash_refunds} />
          )}
          {summary.cash_drawer.paid_in > 0 && <Row label="+ Paid in" value={summary.cash_drawer.paid_in} />}
          {summary.cash_drawer.paid_out > 0 && <Row label="− Paid out" value={-summary.cash_drawer.paid_out} />}
          <Row label="Expected in drawer" value={summary.cash_drawer.expected_cash} bold />
        </Card>

        {/* Sales card */}
        <Card title="Sales">
          <Row label="Orders" value={summary.sales_summary.order_count} count />
          <Row label="Gross sales" value={summary.sales_summary.gross_sales} />
          {summary.sales_summary.discounts > 0 && (
            <Row label="Discounts" value={-summary.sales_summary.discounts} />
          )}
          {summary.sales_summary.refunds > 0 && (
            <Row label="Refunds" value={-summary.sales_summary.refunds} />
          )}
          <Row label="Net sales" value={summary.sales_summary.net_sales} bold />
        </Card>

        {/* Tender card */}
        <Card title="Tenders" full>
          {Object.entries(summary.tenders ?? {}).length === 0 ? (
            <div style={{ fontSize: 12, color: "#94A3B8", padding: 8 }}>No payments yet this shift.</div>
          ) : Object.entries(summary.tenders).map(([method, amount]) => (
            <Row key={method} label={methodLabel(method)} value={Number(amount)} />
          ))}
        </Card>

        {/* Cash movement card */}
        {canCashInOut && (
        <Card title="Cash management" full>
          <CashMovementForm onSubmit={onCashMovement} />
        </Card>
        )}
      </div>

      {canCloseShift && (
      <button onClick={onCloseShift} style={{
        marginTop: 14, width: "100%", padding: "14px 18px", borderRadius: 12,
        background: "#EF4444", color: "#fff", border: "none",
        fontWeight: 800, fontSize: 14, cursor: "pointer", letterSpacing: "0.04em",
      }}>
        CLOSE SHIFT
      </button>
      )}
    </PanelShell>
  );
}

function CashMovementForm({ onSubmit }: { onSubmit: Props["onCashMovement"] }) {
  const [type, setType] = useState<"cash_in" | "cash_out">("cash_in");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState("");

  const submit = async () => {
    const n = Number.parseFloat(amount);
    if (!Number.isFinite(n) || n <= 0) { setInfo("Enter an amount."); return; }
    if (!reason.trim()) { setInfo("Reason is required."); return; }
    setBusy(true);
    try {
      await onSubmit(type, n, reason.trim());
      setAmount(""); setReason(""); setInfo("Recorded.");
    } catch (e) {
      setInfo((e as Error).message || "Failed.");
    } finally { setBusy(false); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 6 }}>
        {(["cash_in", "cash_out"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            style={{
              flex: 1, padding: "8px 10px", borderRadius: 8,
              background: type === t ? "#0F172A" : "#fff",
              color: type === t ? "#fff" : "#0F172A",
              border: `1px solid ${type === t ? "#0F172A" : "#CBD5E1"}`,
              fontWeight: 700, fontSize: 12, cursor: "pointer",
            }}
          >{t === "cash_in" ? "Paid in" : "Paid out"}</button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#64748B", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Amount
          </div>
          <CashInput value={amount} onChange={setAmount} />
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#64748B", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Reason
          </div>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. supplier pay"
            style={{
              width: "100%", boxSizing: "border-box",
              padding: "14px 16px", borderRadius: 10,
              border: "2px solid #CBD5E1", fontSize: 14, background: "#fff",
              outline: "none",
            }}
          />
          <button onClick={submit} disabled={busy} style={{
            marginTop: 10, width: "100%",
            padding: "12px 16px", borderRadius: 10, border: "none",
            background: "#10B981", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer",
            minHeight: 48,
          }}>{busy ? "Saving…" : "Record cash movement"}</button>
        </div>
      </div>
      {info && <div style={{ fontSize: 12, color: "#475569" }}>{info}</div>}
    </div>
  );
}

function Card({ title, children, full }: { title: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div style={{
      background: "#fff", borderRadius: 10, border: "1px solid #E2E8F0",
      padding: 12, gridColumn: full ? "1 / -1" : "auto",
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value, bold, count }: { label: string; value: number; bold?: boolean; count?: boolean }) {
  // Bug-053: Laravel decimal-cast returns strings; coerce defensively so
  // Math.round / Math.abs / toFixed don't crash on `"125.00"`.
  const n = Number(value ?? 0);
  const fmt = count ? String(Math.round(n)) : `${n < 0 ? "−" : ""}MVR ${Math.abs(n).toFixed(2)}`;
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

function methodLabel(m: string): string {
  if (m === "cash") return "Cash";
  if (m === "card") return "Card";
  if (m === "digital_wallet") return "Transfer";
  return m;
}

function formatTime(iso: string): string {
  try { return new Date(iso).toLocaleString(undefined, { hour: "2-digit", minute: "2-digit", month: "short", day: "2-digit" }); }
  catch { return iso; }
}
