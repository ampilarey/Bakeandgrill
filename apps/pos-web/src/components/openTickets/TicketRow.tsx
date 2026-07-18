import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { palette, radius, space, btnPrimary, btnSecondary, type, z } from "../../theme";
import { posOrderTypeEmoji, posOrderTypeLabel } from "../../orderTypeLabels";
import {
  formatTicketAge,
  ticketAgeAnchor,
  ticketAgeLevel,
  ticketAgeTitle,
  TICKET_AGE_COLORS,
} from "../../utils/ticketAging";
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
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const moreBtnRef = useRef<HTMLButtonElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const [moreMenuStyle, setMoreMenuStyle] = useState<CSSProperties | null>(null);

  const closeMore = () => {
    setMoreOpen(false);
    setMoreMenuStyle(null);
  };

  const placeMoreMenu = () => {
    const btn = moreBtnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const menuWidth = 200;
    const pad = 8;
    const estimatedHeight = moreMenuRef.current?.offsetHeight
      || (moreMenuRef.current?.childElementCount ?? 4) * 44;
    const spaceBelow = window.innerHeight - r.bottom - pad;
    const spaceAbove = r.top - pad;
    const openUp = spaceBelow < estimatedHeight && spaceAbove > spaceBelow;
    let left = r.right - menuWidth;
    left = Math.max(pad, Math.min(left, window.innerWidth - menuWidth - pad));
    setMoreMenuStyle({
      position: "fixed",
      left,
      top: openUp ? undefined : r.bottom + 4,
      bottom: openUp ? window.innerHeight - r.top + 4 : undefined,
      minWidth: menuWidth,
      maxHeight: Math.max(160, openUp ? spaceAbove : spaceBelow),
      overflowY: "auto",
      background: "#fff",
      border: "1px solid #CBD5E1",
      borderRadius: radius.m,
      boxShadow: "0 8px 24px rgba(15,23,42,0.12)",
      zIndex: z.modal,
    });
  };

  useLayoutEffect(() => {
    if (!moreOpen) return;
    placeMoreMenu();
  }, [moreOpen]);

  useEffect(() => {
    if (!moreOpen) return;
    const onDoc = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (moreRef.current?.contains(target) || moreMenuRef.current?.contains(target)) {
        return;
      }
      closeMore();
    };
    const onReposition = () => placeMoreMenu();
    const onScrollClose = () => closeMore();
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc, { passive: true });
    window.addEventListener("resize", onReposition);
    // Scroll containers (Active Orders list) move the button — close rather than chase.
    window.addEventListener("scroll", onScrollClose, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onScrollClose, true);
    };
  }, [moreOpen]);

  const stage = ticketStage(t.status);
  const isPaid = t.payment_status === "paid";
  const isUnpaid = t.payment_status === "unpaid" || t.payment_status === "partial";

  const stageBadge = {
    parked: { label: "📋 PARKED", color: "#475569", bg: "#F1F5F9", border: "#CBD5E1", title: "Kitchen has not seen this yet" },
    queued: { label: "⏳ NEW", color: "#1D4ED8", bg: "#EFF6FF", border: "#BFDBFE", title: "Waiting for kitchen to start (KDS Pending)" },
    cooking: { label: "🍳 COOKING", color: "#A16207", bg: "#FEFCE8", border: "#FDE68A", title: "Kitchen is preparing this" },
    ready: { label: "✅ READY", color: "#047857", bg: "#ECFDF5", border: "#A7F3D0", title: "Ready for the customer to collect" },
  }[stage];

  const ageIso = ticketAgeAnchor(t, stage);
  const ageLevel = ticketAgeLevel(ageIso, stage);
  const ageStyle = TICKET_AGE_COLORS[ageLevel];
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
        background: isMergeTarget
          ? "#EFF6FF"
          : ageLevel !== "ok"
            ? ageStyle.bg
            : palette.panel,
        border: `1px solid ${
          isMergeTarget
            ? "#93C5FD"
            : ageLevel !== "ok"
              ? ageStyle.border
              : palette.border
        }`,
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
            {ageIso && (
              <span
                title={ticketAgeTitle(ageLevel, stage)}
                style={{
                  fontSize: 11, fontWeight: 800, letterSpacing: 0.4,
                  color: ageStyle.color, background: ageStyle.bg,
                  padding: "2px 6px", borderRadius: 4,
                  border: `1px solid ${ageStyle.border}`,
                }}
              >
                ⏱ {formatTicketAge(ageIso)}
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
              <>
                <ActionButton
                  onClick={() => handleStartCooking(t)}
                  busy={busy}
                  bg="#A16207"
                  confirm
                  confirmLabel="Start cooking on kitchen display?"
                >
                  🍳 Start cooking
                </ActionButton>
                <ActionButton
                  onClick={() => handleMarkReady(t)}
                  busy={busy}
                  bg="#047857"
                  confirm
                  confirmLabel="Mark ready and notify customer?"
                >
                  ✅ Mark ready
                </ActionButton>
              </>
            )}
            {stage === "cooking" && canManageOrderStatus && (() => {
              const needsReceive = requirePosReceivingBeforeReady
                && !(t as { pos_received_at?: string | null }).pos_received_at
                && (t as { kitchen_handover_status?: string | null }).kitchen_handover_status !== "received";
              return (
                <>
                  {needsReceive && (
                    <span
                      title="Optional when kitchen handover is enabled — Mark ready still works for small cafés"
                      style={{
                        flex: "1 1 100%",
                        textAlign: "center",
                        padding: "6px 10px",
                        borderRadius: 8,
                        fontSize: type.bodySm.fontSize,
                        fontWeight: 600,
                        color: "#B45309",
                        background: "#FFFBEB",
                        border: "1px dashed #FDE68A",
                      }}
                    >
                      Tip: receive from kitchen when food arrives
                    </span>
                  )}
                  <ActionButton
                    onClick={() => handleMarkReady(t)}
                    busy={busy}
                    bg="#047857"
                    confirm
                    confirmLabel="Mark ready and notify customer?"
                  >
                    ✅ Mark ready
                  </ActionButton>
                </>
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
                  minHeight: 44, fontSize: type.bodySm.fontSize,
                }}
              >
                💳 Charge
              </button>
            )}
            {(() => {
              const showPayLink = isUnpaid && canSendPayLink && smsNotifications.send_pay_link;
              const showBillSms = canSendBill && smsNotifications.send_bill;
              const showMerge = t.payment_status === "unpaid";
              const showSplit = t.payment_status === "unpaid" && (t.items?.length ?? 0) > 1;
              const showVoid = !isPaid && canVoidOrders;
              // Print Bill is always available — More menu is never empty.
              const moreBtnStyle: CSSProperties = {
                width: "100%",
                textAlign: "left",
                padding: "10px 12px",
                minHeight: 44,
                fontSize: type.bodySm.fontSize,
                fontWeight: 700,
                border: "none",
                borderBottom: "1px solid #E2E8F0",
                background: "#fff",
                color: "#0F172A",
                cursor: busy ? "not-allowed" : "pointer",
              };
              return (
                <div ref={moreRef} style={{ position: "relative" }}>
                  <button
                    ref={moreBtnRef}
                    type="button"
                    className="pos-ticket-action-btn"
                    disabled={busy}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (moreOpen) {
                        closeMore();
                      } else {
                        setMoreOpen(true);
                      }
                    }}
                    style={{
                      ...btnSecondary(busy),
                      padding: `${space.s}px ${space.m}px`,
                      minHeight: 44,
                      fontSize: type.bodySm.fontSize,
                    }}
                    aria-expanded={moreOpen}
                    aria-haspopup="menu"
                  >
                    More ▾
                  </button>
                  {moreOpen && moreMenuStyle && (
                    <div
                      ref={moreMenuRef}
                      role="menu"
                      onClick={(e) => e.stopPropagation()}
                      style={moreMenuStyle}
                    >
                      {showPayLink && (
                        <button
                          type="button"
                          role="menuitem"
                          disabled={busy}
                          style={moreBtnStyle}
                          onClick={() => {
                            closeMore();
                            handleSendPayLink(t);
                          }}
                        >
                          💳 Send pay link
                        </button>
                      )}
                      {showBillSms && (
                        <button
                          type="button"
                          role="menuitem"
                          disabled={busy}
                          style={moreBtnStyle}
                          onClick={() => {
                            closeMore();
                            handleSendBill(t);
                          }}
                        >
                          📱 Send Bill SMS
                        </button>
                      )}
                      <button
                        type="button"
                        role="menuitem"
                        disabled={busy}
                        style={moreBtnStyle}
                        onClick={() => {
                          closeMore();
                          handlePrintBill(t);
                        }}
                      >
                        🖨 Print Bill
                      </button>
                      {showMerge && (
                        <button
                          type="button"
                          role="menuitem"
                          disabled={busy}
                          style={moreBtnStyle}
                          title="Merge another open ticket into this one"
                          onClick={() => {
                            closeMore();
                            handleStartMerge(t);
                          }}
                        >
                          🔀 Merge
                        </button>
                      )}
                      {showSplit && (
                        <button
                          type="button"
                          role="menuitem"
                          disabled={busy}
                          style={moreBtnStyle}
                          title="Split items off into a new ticket"
                          onClick={() => {
                            closeMore();
                            onSplit(t);
                          }}
                        >
                          ✂️ Split
                        </button>
                      )}
                      {showVoid && (
                        <button
                          type="button"
                          role="menuitem"
                          disabled={busy}
                          style={{
                            ...moreBtnStyle,
                            color: palette.dangerDark,
                            borderBottom: "none",
                          }}
                          title="Void this ticket (returns stock, releases holds)"
                          onClick={() => {
                            closeMore();
                            onVoid(t);
                          }}
                        >
                          🗑️ Void
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
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
