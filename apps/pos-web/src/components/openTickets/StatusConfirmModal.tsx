import { palette, radius, space, btnPrimary, btnSecondary, type } from "../../theme";
import { ticketDisplayTotal, type OpenTicket } from "../../utils/openTicketUtils";
import { ConfirmDialogShell } from "./ConfirmDialogShell";

/** The word on a ticket's done button: Collected, Picked up or Delivered. */
export function doneLabelFor(t: Pick<OpenTicket, "type">): string {
  if (t.type === "delivery") return "Delivered";
  if (t.type === "online_pickup") return "Picked up";
  return "Collected";
}

/**
 * Mark ready and Collected / Picked up / Delivered ask once more
 * (owner, 2026-10-15): Mark ready messages the customer, and the done
 * button takes the order off Active orders with no undo on the till.
 */
export function StatusConfirmModal({
  ticket,
  kind,
  busy,
  onCancel,
  onConfirm,
}: {
  ticket: OpenTicket;
  kind: "ready" | "done";
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const label = ticket.ticket_name || `Order ${ticket.order_number}`;
  const itemCount = ticket.items?.length ?? 0;
  const total = ticketDisplayTotal(ticket);
  const done = doneLabelFor(ticket);
  const title = kind === "ready" ? "Mark this order ready?" : `${done}?`;
  const note = kind === "ready"
    ? "The customer is told the order is ready."
    : `The order is completed and leaves Active orders. This can't be undone here.`;
  const action = kind === "ready" ? "Mark ready" : done;

  return (
    <ConfirmDialogShell ariaLabel={`${action} — confirm`} busy={busy} onCancel={onCancel}>
      <div>
        <div style={{ ...type.subtitle, color: palette.panelInk }}>{title}</div>
        <div style={{ ...type.bodySm, color: palette.panelMuted, marginTop: 4 }}>
          <strong style={{ color: palette.panelInk }}>{label}</strong>
          {" · "}{itemCount} item{itemCount === 1 ? "" : "s"}
          {" · MVR "}{total.toFixed(2)}
        </div>
      </div>
      <div
        data-testid="status-confirm-note"
        style={{
          background: palette.successBg,
          border: `1px solid ${palette.successBorder}`,
          borderRadius: radius.m,
          padding: space.m,
          fontSize: type.bodySm.fontSize,
          color: palette.successDark,
          lineHeight: 1.5,
        }}
      >
        {note}
      </div>
      <div style={{ display: "flex", gap: space.s, justifyContent: "flex-end", marginTop: space.xs }}>
        <button type="button" autoFocus onClick={onCancel} disabled={busy} style={btnSecondary(busy)}>
          Not yet
        </button>
        <button
          type="button"
          data-testid="status-confirm-ok"
          onClick={onConfirm}
          disabled={busy}
          style={{ ...btnPrimary(busy), background: busy ? palette.successBorder : palette.successDark }}
        >
          {action}
        </button>
      </div>
    </ConfirmDialogShell>
  );
}
