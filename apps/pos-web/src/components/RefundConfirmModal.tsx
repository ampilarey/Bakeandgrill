import { useState } from "react";

export type RefundConfirmModalProps = {
  /** Order number or "Order #123" label shown in the summary. */
  orderLabel: string;
  /** When set, shows FULL/PARTIAL against this total. Ops may omit it. */
  orderTotal?: number | null;
  amount: number;
  reason: string;
  /**
   * Cash-override state. In `edit` mode the cashier can toggle it here;
   * in `display` mode (Ops form already has the checkbox) it is read-only.
   */
  cashRefundOverride?: boolean;
  cashOverrideMode?: "edit" | "display";
  onCancel: () => void;
  onConfirm: (cashRefundOverride: boolean) => void;
};

/**
 * Last-mile confirm before money goes back out to a customer. Shows
 * the proposed refund — amount, reason, target order, and whether the
 * cash-override checkbox is on. The submit button is the only path
 * that should fire `createRefund`.
 */
export function RefundConfirmModal({
  orderLabel,
  orderTotal,
  amount,
  reason,
  cashRefundOverride = false,
  cashOverrideMode = "edit",
  onCancel,
  onConfirm,
}: RefundConfirmModalProps) {
  const [cashOverride, setCashOverride] = useState(cashRefundOverride);
  const effectiveOverride = cashOverrideMode === "edit" ? cashOverride : cashRefundOverride;
  const partial =
    typeof orderTotal === "number" && Number.isFinite(orderTotal)
      ? amount + 0.005 < orderTotal
      : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Confirm refund"
      onClick={onCancel}
      style={{
        position: "fixed", inset: 0, zIndex: 950,
        background: "rgba(15,23,42,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 14, width: "100%", maxWidth: 420,
          padding: 20, display: "flex", flexDirection: "column", gap: 14,
        }}
      >
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#0F172A" }}>
            Request refund?
          </div>
          <div style={{ marginTop: 4, fontSize: 13, color: "#64748B" }}>
            Money does not leave the drawer until a manager or owner approves. The customer is notified by SMS when a phone is on the order.
          </div>
        </div>
        <div style={{
          border: "1px solid #FECACA", background: "#FEF2F2",
          borderRadius: 10, padding: "12px 14px",
          display: "grid", rowGap: 6, fontSize: 13, color: "#0F172A",
        }}>
          <Row label="Order">{orderLabel}</Row>
          <Row label="Refund amount">
            <strong>MVR {amount.toFixed(2)}</strong>{" "}
            {partial !== null && (
              <span style={{ fontSize: 11, color: partial ? "#B45309" : "#15803D", fontWeight: 700 }}>
                {partial ? "PARTIAL" : "FULL"}
              </span>
            )}
          </Row>
          {typeof orderTotal === "number" && Number.isFinite(orderTotal) && (
            <Row label="Order total">MVR {orderTotal.toFixed(2)}</Row>
          )}
          {reason ? (
            <Row label="Reason">{reason}</Row>
          ) : (
            <Row label="Reason"><em style={{ color: "#94A3B8" }}>(none)</em></Row>
          )}
          {cashOverrideMode === "display" && (
            <Row label="Cash override">
              <strong style={{ color: effectiveOverride ? "#B45309" : "#15803D" }}>
                {effectiveOverride ? "ON — card portion in cash" : "OFF — reverse original tenders"}
              </strong>
            </Row>
          )}
        </div>
        {cashOverrideMode === "edit" && (
          <>
            <label style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "8px 10px", borderRadius: 8,
              background: "#F8FAFC", border: "1px solid #E2E8F0",
              fontSize: 13, color: "#0F172A", cursor: "pointer",
            }}>
              <input
                type="checkbox"
                checked={cashOverride}
                onChange={(e) => setCashOverride(e.target.checked)}
                style={{ width: 16, height: 16 }}
              />
              <span>Refund card portion in cash</span>
            </label>
            <p style={{ margin: 0, fontSize: 11, color: "#94A3B8", lineHeight: 1.4 }}>
              {cashOverride
                ? "The whole refund will be handed back as cash. The backend records the reversal breakdown."
                : "Refunds each tender in the same proportion it was paid. Server-side computes the split."}
            </p>
          </>
        )}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: "10px 16px", borderRadius: 10, fontWeight: 700,
              background: "#fff", color: "#0F172A",
              border: "1px solid #CBD5E1", cursor: "pointer", fontSize: 13,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(effectiveOverride)}
            style={{
              padding: "10px 16px", borderRadius: 10, fontWeight: 800,
              background: "#B91C1C", color: "#fff",
              border: "none", cursor: "pointer", fontSize: 13,
            }}
          >
            Yes, request refund
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span style={{ color: "#64748B", fontWeight: 600 }}>{label}</span>
      <span style={{ textAlign: "right" }}>{children}</span>
    </div>
  );
}
