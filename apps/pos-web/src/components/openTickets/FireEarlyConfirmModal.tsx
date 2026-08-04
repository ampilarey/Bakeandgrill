import { formatBusinessDayLabel } from "@shared/utils/businessDay";
import { palette, radius, space, btnPrimary, btnSecondary, type } from "../../theme";
import { ticketDisplayTotal, type OpenTicket } from "../../utils/openTicketUtils";
import { ConfirmDialogShell } from "./ConfirmDialogShell";

export function FireEarlyConfirmModal({
  ticket,
  busy,
  onCancel,
  onConfirm,
}: {
  ticket: OpenTicket;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const total = ticketDisplayTotal(ticket);
  const label = ticket.ticket_name || `Order ${ticket.order_number}`;
  const itemCount = ticket.items?.length ?? 0;
  const dayLabel = ticket.fulfil_date
    ? formatBusinessDayLabel(ticket.fulfil_date)
    : "a later day";

  return (
    <ConfirmDialogShell
      ariaLabel="Fire order early — confirm"
      busy={busy}
      onCancel={onCancel}
    >
      <div>
        <div style={{ ...type.subtitle, color: palette.warnDark }}>Fire this order early?</div>
        <div style={{ ...type.bodySm, color: palette.panelMuted, marginTop: 4 }}>
          <strong style={{ color: palette.panelInk }}>{label}</strong>
          {" · "}{itemCount} item{itemCount === 1 ? "" : "s"}
          {" · MVR "}{total.toFixed(2)}
        </div>
      </div>

      <div style={{
        background: "#FFF7ED",
        border: "1px solid #FDBA74",
        borderRadius: radius.m,
        padding: space.m,
        fontSize: type.bodySm.fontSize,
        color: "#7C2D12",
        lineHeight: 1.5,
      }}>
        This order is for <strong>{dayLabel}</strong>. Firing now sends it to the kitchen today.
        Fire anyway?
      </div>

      <div style={{ display: "flex", gap: space.s, justifyContent: "flex-end", marginTop: space.xs }}>
        <button
          type="button"
          autoFocus
          onClick={onCancel}
          disabled={busy}
          style={btnSecondary(busy)}
        >
          Not now
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          style={{
            ...btnPrimary(busy),
            background: busy ? "#FDBA74" : palette.warnDark,
          }}
        >
          {busy ? "Firing…" : "Fire anyway"}
        </button>
      </div>
    </ConfirmDialogShell>
  );
}
