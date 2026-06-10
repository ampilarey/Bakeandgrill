import { palette, radius, space, shadow, btnPrimary, btnSecondary, inputField, type, z } from "../../theme";
import { ticketDisplayTotal, type OpenTicket } from "../../utils/openTicketUtils";

export function VoidConfirmModal({
  ticket,
  reason,
  busy,
  onReasonChange,
  onCancel,
  onConfirm,
}: {
  ticket: OpenTicket;
  reason: string;
  busy: boolean;
  onReasonChange: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const total = ticketDisplayTotal(ticket);
  const label = ticket.ticket_name || `Order ${ticket.order_number}`;
  const itemCount = ticket.items?.length ?? 0;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Void ticket — reason required"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.5)",
        zIndex: z.modalBackdrop,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: space.l,
        animation: "pos-fade-in 120ms ease",
      }}
      onClick={() => {
        if (!busy) onCancel();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !busy) onCancel();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(460px, 100%)",
          background: palette.panel,
          borderRadius: radius.xl,
          boxShadow: shadow.xl,
          padding: space.xl,
          display: "flex",
          flexDirection: "column",
          gap: space.m,
          animation: "pos-scale-in 140ms ease",
        }}
      >
        <div>
          <div style={{ ...type.subtitle, color: palette.dangerDark }}>🗑️ Void this ticket?</div>
          <div style={{ ...type.bodySm, color: palette.panelMuted, marginTop: 4 }}>
            <strong style={{ color: palette.panelInk }}>{label}</strong>
            {" · "}{itemCount} item{itemCount === 1 ? "" : "s"}
            {" · MVR "}{total.toFixed(2)}
          </div>
        </div>

        <div style={{
          background: "#FEF2F2",
          border: "1px solid #FCA5A5",
          borderRadius: radius.m,
          padding: space.m,
          fontSize: type.bodySm.fontSize,
          color: "#7F1D1D",
          lineHeight: 1.5,
        }}>
          Voiding will:
          <ul style={{ margin: `${space.xxs}px 0 0 ${space.l}px`, padding: 0 }}>
            <li>Return deducted stock to inventory</li>
            <li>Release any loyalty / promo / gift-card holds</li>
            <li>Free the dine-in table (if no other open ticket on it)</li>
            <li>Stay on record with your name + reason in the audit log</li>
          </ul>
        </div>

        <div>
          <label
            htmlFor="void-reason"
            style={{ ...type.label, color: palette.panelMuted, display: "block", marginBottom: space.xxs }}
          >
            Reason (required)
          </label>
          <textarea
            id="void-reason"
            autoFocus
            value={reason}
            onChange={(e) => onReasonChange(e.target.value.slice(0, 255))}
            placeholder="e.g. Customer changed mind, wrong order, walked out…"
            disabled={busy}
            rows={3}
            style={{
              ...inputField,
              width: "100%",
              fontSize: type.body.fontSize,
              resize: "vertical",
              minHeight: 72,
              fontFamily: "inherit",
            }}
          />
          <div style={{ ...type.caption, color: palette.panelMuted, marginTop: 4, textAlign: "right" }}>
            {reason.length}/255
          </div>
        </div>

        <div style={{ display: "flex", gap: space.s, justifyContent: "flex-end", marginTop: space.xs }}>
          <button type="button" onClick={onCancel} disabled={busy} style={btnSecondary(busy)}>
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || reason.trim().length === 0}
            style={{
              ...btnPrimary(busy || reason.trim().length === 0),
              background: busy || reason.trim().length === 0 ? "#FCA5A5" : palette.dangerDark,
            }}
          >
            {busy ? "Voiding…" : "🗑️ Confirm void"}
          </button>
        </div>
      </div>
    </div>
  );
}
