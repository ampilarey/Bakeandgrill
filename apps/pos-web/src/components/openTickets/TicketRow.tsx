import { palette, radius, space, btnPrimary, btnSecondary, type } from "../../theme";
import { posOrderTypeEmoji, posOrderTypeLabel } from "../../orderTypeLabels";
import { formatTicketAge, parkedTicketAgeLevel, PARKED_AGE_COLORS } from "../../utils/ticketAging";
import { ticketDisplayTotal, ticketStage, type OpenTicket } from "../../utils/openTicketUtils";
import { ActionButton } from "./ActionButton";

export type TicketRowProps = {
  ticket: OpenTicket;
  busy: boolean;
  msg: { text: string; kind: "ok" | "err" } | null;
  mergeTargetId: number | null;
  canVoidOrders: boolean;
  canHoldResume: boolean;
  canManageOrderStatus: boolean;
  canSendBill: boolean;
  canSendPayLink: boolean;
  requirePosReceivingBeforeReady: boolean;
  smsNotifications: { send_bill: boolean; send_pay_link: boolean };
  onResume: (ticket: OpenTicket) => void;
  onVoid: (ticket: OpenTicket) => void;
  onSplit: (ticket: OpenTicket) => void;
  handleFireToKitchen: (t: OpenTicket) => void;
  handleSendPayLink: (t: OpenTicket) => void;
  handleStartCooking: (t: OpenTicket) => void;
  handleMarkReady: (t: OpenTicket) => void;
  handleMarkPickedUp: (t: OpenTicket) => void;
  handleSendBill: (t: OpenTicket) => void;
  handlePrintBill: (t: OpenTicket) => void;
  handleStartMerge: (t: OpenTicket) => void;
  handlePickMergeSource: (t: OpenTicket) => void;
};

export function TicketRow({
  ticket: t,
  busy,
  msg,
  mergeTargetId,
  canVoidOrders,
  canHoldResume,
  canManageOrderStatus,
  canSendBill,
  canSendPayLink,
  requirePosReceivingBeforeReady,
  smsNotifications,
  onResume,
  onVoid,
  onSplit,
  handleFireToKitchen,
  handleSendPayLink,
  handleStartCooking,
  handleMarkReady,
  handleMarkPickedUp,
  handleSendBill,
  handlePrintBill,
  handleStartMerge,
  handlePickMergeSource,
}: TicketRowProps) {
  const stage = ticketStage(t.status);
  const isPaid = t.payment_status === "paid";
  const isUnpaid = t.payment_status === "unpaid" || t.payment_status === "partial";
  const hasPhone = !!t.customer?.phone;

  const stageBadge = {
    parked: { label: "📋 PARKED", color: "#475569", bg: "#F1F5F9", border: "#CBD5E1", title: "Kitchen has not seen this yet" },
    queued: { label: "⏳ NEW", color: "#1D4ED8", bg: "#EFF6FF", border: "#BFDBFE", title: "Waiting for kitchen to start (KDS Pending)" },
    cooking: { label: "🍳 COOKING", color: "#A16207", bg: "#FEFCE8", border: "#FDE68A", title: "Kitchen is preparing this" },
    ready: { label: "✅ READY", color: "#047857", bg: "#ECFDF5", border: "#A7F3D0", title: "Ready for the customer to collect" },
  }[stage];

  const parkedAgeLevel = stage === "parked" ? parkedTicketAgeLevel(t.created_at) : "ok";
  const parkedAgeStyle = PARKED_AGE_COLORS[parkedAgeLevel];
  const isMergeTarget = mergeTargetId === t.id;
  const isMergeCandidate = mergeTargetId !== null && !isMergeTarget;

  const cardClickHandler = mergeTargetId === null
    ? () => onResume(t)
    : isMergeCandidate
      ? () => handlePickMergeSource(t)
      : undefined;

  return (
    <div
      role={cardClickHandler ? "button" : undefined}
      tabIndex={cardClickHandler ? 0 : undefined}
      onKeyDown={cardClickHandler ? (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          cardClickHandler();
        }
      } : undefined}
      title={mergeTargetId === null
        ? "Open ticket in main POS to add/remove items, charge, etc."
        : undefined}
      style={{
        padding: space.m,
        borderRadius: radius.l,
        background: isMergeTarget ? "#EFF6FF" : palette.panel,
        border: `1px solid ${isMergeTarget ? "#93C5FD" : palette.border}`,
        display: "flex",
        flexDirection: "column",
        gap: space.s,
        cursor: cardClickHandler ? "pointer" : "default",
      }}
      onClick={cardClickHandler}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: space.m }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 700, fontSize: type.body.fontSize, color: palette.panelInk }}>
              {t.ticket_name || `Order ${t.order_number}`}
            </div>
            <span
              title={stageBadge.title}
              style={{
                fontSize: 11, fontWeight: 800, letterSpacing: 0.4,
                color: stageBadge.color, background: stageBadge.bg,
                padding: "2px 6px", borderRadius: 4,
                border: `1px solid ${stageBadge.border}`,
              }}
            >
              {stageBadge.label}
            </span>
            {stage === "cooking" && (t as { kitchen_done_at?: string | null }).kitchen_done_at && (
              <span
                title="Kitchen marked preparation complete — cashier can mark ready for customer"
                style={{
                  fontSize: 11, fontWeight: 800, letterSpacing: 0.4,
                  color: "#047857", background: "#ECFDF5",
                  padding: "2px 6px", borderRadius: 4,
                  border: "1px solid #A7F3D0",
                }}
              >
                Kitchen done
              </span>
            )}
            {stage === "cooking" && (t as { kitchen_handover_status?: string | null }).kitchen_handover_status === "produced"
              && !(t as { pos_received_at?: string | null }).pos_received_at && (
              <span
                title="Produced — receive from kitchen before marking ready"
                style={{
                  fontSize: 11, fontWeight: 800, letterSpacing: 0.4,
                  color: "#B45309", background: "#FFFBEB",
                  padding: "2px 6px", borderRadius: 4,
                  border: "1px solid #FDE68A",
                }}
              >
                Awaiting receive
              </span>
            )}
            {stage === "cooking" && ((t as { pos_received_at?: string | null }).pos_received_at
              || (t as { kitchen_handover_status?: string | null }).kitchen_handover_status === "received") && (
              <span
                title="Received from kitchen — safe to mark ready"
                style={{
                  fontSize: 11, fontWeight: 800, letterSpacing: 0.4,
                  color: "#1D4ED8", background: "#EFF6FF",
                  padding: "2px 6px", borderRadius: 4,
                  border: "1px solid #BFDBFE",
                }}
              >
                Received
              </span>
            )}
            {stage === "parked" && (
              <span
                title={parkedAgeLevel === "critical"
                  ? "Parked 30+ minutes — fire or void soon"
                  : parkedAgeLevel === "warn"
                    ? "Parked 15+ minutes"
                    : "Time since ticket was saved"}
                style={{
                  fontSize: 11, fontWeight: 800, letterSpacing: 0.4,
                  color: parkedAgeStyle.color, background: parkedAgeStyle.bg,
                  padding: "2px 6px", borderRadius: 4,
                  border: `1px solid ${parkedAgeStyle.border}`,
                }}
              >
                ⏱ {formatTicketAge(t.created_at)}
              </span>
            )}
            {isPaid && (
              <span
                title="Customer has paid"
                style={{
                  fontSize: 11, fontWeight: 800, letterSpacing: 0.4,
                  color: "#1E40AF", background: "#EFF6FF",
                  padding: "2px 6px", borderRadius: 4,
                  border: "1px solid #BFDBFE",
                }}
              >
                💳 PAID
              </span>
            )}
            {isUnpaid && (
              <span
                title="Customer has not paid yet"
                style={{
                  fontSize: 11, fontWeight: 800, letterSpacing: 0.4,
                  color: "#B91C1C", background: "#FEF2F2",
                  padding: "2px 6px", borderRadius: 4,
                  border: "1px solid #FECACA",
                }}
              >
                {t.payment_status === "partial" ? "PARTIAL" : "UNPAID"}
              </span>
            )}
            {(t.type === "online_pickup" || t.type === "delivery") && (
              <span
                title={posOrderTypeLabel(t.type, t.user?.id) ?? t.type}
                style={{
                  fontSize: 11, fontWeight: 800, letterSpacing: 0.4,
                  color: t.type === "delivery" ? "#7C2D12" : "#92400E",
                  background: t.type === "delivery" ? "#FFF7ED" : "#FFFBEB",
                  padding: "2px 6px", borderRadius: 4,
                  border: `1px solid ${t.type === "delivery" ? "#FDBA74" : "#FDE68A"}`,
                }}
              >
                {posOrderTypeEmoji(t.type, t.user?.id)} {posOrderTypeLabel(t.type, t.user?.id)}
              </span>
            )}
          </div>
          <div style={{ fontSize: type.caption.fontSize, color: palette.panelMuted, marginTop: 2 }}>
            {(t.items?.length ?? 0)} items
            {t.type === "delivery" && t.delivery_island ? ` · ${t.delivery_island}` : ""}
            {t.user?.name ? ` · by ${t.user.name}` : ""}
            {t.ticket_note ? ` · ${t.ticket_note}` : ""}
            {t.customer?.name ? ` · ${t.customer.name}` : ""}
            {t.customer?.phone ? ` · ${t.customer.phone}` : ""}
          </div>
        </div>
        <div style={{ fontWeight: 800, fontSize: type.subtitle.fontSize, color: palette.panelInk, whiteSpace: "nowrap" }}>
          MVR {ticketDisplayTotal(t).toFixed(2)}
        </div>
      </div>

      <div style={{ display: "flex", gap: space.xs, flexWrap: "wrap" }}>
        {mergeTargetId === null && (
          <>
            {stage === "parked" && canHoldResume && (
              <ActionButton
                onClick={() => handleFireToKitchen(t)}
                busy={busy}
                bg="#A16207"
                confirm
                confirmLabel="Fire now? Tap to confirm"
              >
                🍳 Fire to kitchen
              </ActionButton>
            )}
            {stage === "queued" && canManageOrderStatus && (
              <ActionButton
                onClick={() => handleStartCooking(t)}
                busy={busy}
                bg="#A16207"
                confirm
                confirmLabel="Start cooking on kitchen display?"
              >
                🍳 Start cooking
              </ActionButton>
            )}
            {stage === "cooking" && canManageOrderStatus && (() => {
              const needsReceive = requirePosReceivingBeforeReady
                && !(t as { pos_received_at?: string | null }).pos_received_at
                && (t as { kitchen_handover_status?: string | null }).kitchen_handover_status !== "received";
              if (needsReceive) {
                return (
                  <span
                    title="Receive from kitchen first (Kitchen receiving drawer)"
                    style={{
                      flex: 1,
                      textAlign: "center",
                      padding: "8px 10px",
                      borderRadius: 8,
                      fontSize: type.bodySm.fontSize,
                      fontWeight: 700,
                      color: "#B45309",
                      background: "#FFFBEB",
                      border: "1px dashed #FDE68A",
                    }}
                  >
                    Receive from kitchen first
                  </span>
                );
              }
              return (
                <ActionButton
                  onClick={() => handleMarkReady(t)}
                  busy={busy}
                  bg="#047857"
                  confirm
                  confirmLabel="Send 'ready' SMS?"
                >
                  ✅ Mark ready
                </ActionButton>
              );
            })()}
            {stage === "ready" && isPaid && canManageOrderStatus && (
              <ActionButton
                onClick={() => handleMarkPickedUp(t)}
                busy={busy}
                bg="#0F766E"
                confirm
                confirmLabel="Confirm collected?"
              >
                📦 Picked up
              </ActionButton>
            )}
            {isUnpaid && (
              <button
                className="pos-ticket-action-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onResume(t);
                }}
                disabled={busy}
                style={{
                  ...btnPrimary(busy),
                  padding: `${space.s}px ${space.m}px`,
                  minHeight: 40, fontSize: type.bodySm.fontSize,
                }}
              >
                💳 Charge
              </button>
            )}
            {isUnpaid && hasPhone && canSendPayLink && smsNotifications.send_pay_link && (
              <ActionButton
                onClick={() => handleSendPayLink(t)}
                busy={busy}
                bg="#1D4ED8"
                confirm
                confirmLabel={`Send MVR ${ticketDisplayTotal(t).toFixed(2)} link?`}
              >
                💳 Send pay link
              </ActionButton>
            )}
            {canSendBill && smsNotifications.send_bill && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleSendBill(t);
                }}
                disabled={busy}
                className="pos-ticket-action-btn"
                style={{ ...btnSecondary(busy), padding: `${space.s}px ${space.m}px`, minHeight: 40, fontSize: type.bodySm.fontSize }}
              >
                📱 {busy ? "…" : "Send Bill SMS"}
              </button>
            )}
            <button
              className="pos-ticket-action-btn"
              onClick={(e) => {
                e.stopPropagation();
                handlePrintBill(t);
              }}
              disabled={busy}
              style={{ ...btnSecondary(busy), padding: `${space.s}px ${space.m}px`, minHeight: 40, fontSize: type.bodySm.fontSize }}
            >
              🖨 Print Bill
            </button>
            {t.payment_status === "unpaid" && (
              <button
                className="pos-ticket-action-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleStartMerge(t);
                }}
                disabled={busy}
                title="Merge another open ticket into this one"
                style={{
                  padding: `${space.s}px ${space.m}px`,
                  minHeight: 40, fontSize: type.bodySm.fontSize,
                  borderRadius: radius.m, fontWeight: 700,
                  background: "#fff", color: "#475569",
                  border: "1px solid #CBD5E1",
                  cursor: busy ? "not-allowed" : "pointer",
                }}
              >
                🔀 Merge
              </button>
            )}
            {t.payment_status === "unpaid" && (t.items?.length ?? 0) > 1 && (
              <button
                className="pos-ticket-action-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onSplit(t);
                }}
                disabled={busy}
                title="Split items off into a new ticket"
                style={{
                  padding: `${space.s}px ${space.m}px`,
                  minHeight: 40, fontSize: type.bodySm.fontSize,
                  borderRadius: radius.m, fontWeight: 700,
                  background: "#fff", color: "#475569",
                  border: "1px solid #CBD5E1",
                  cursor: busy ? "not-allowed" : "pointer",
                }}
              >
                ✂️ Split
              </button>
            )}
            {!isPaid && canVoidOrders && (
              <button
                className="pos-ticket-action-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onVoid(t);
                }}
                disabled={busy}
                title="Void this ticket (returns stock, releases holds)"
                style={{
                  padding: `${space.s}px ${space.m}px`,
                  minHeight: 40, fontSize: type.bodySm.fontSize,
                  borderRadius: radius.m, fontWeight: 700,
                  background: "#fff", color: palette.dangerDark,
                  border: `1px solid ${palette.dangerDark}`,
                  cursor: busy ? "not-allowed" : "pointer",
                }}
              >
                🗑️ Void
              </button>
            )}
          </>
        )}
        {isMergeTarget && (
          <span style={{ fontSize: type.bodySm.fontSize, color: "#1E40AF", fontWeight: 700 }}>
            Target — pick a source ticket to merge in.
          </span>
        )}
      </div>

      {msg && (
        <div style={{
          fontSize: type.caption.fontSize,
          color: msg.kind === "ok" ? palette.successDark : palette.dangerDark,
          fontWeight: 600,
        }}>
          {msg.text}
        </div>
      )}
    </div>
  );
}
