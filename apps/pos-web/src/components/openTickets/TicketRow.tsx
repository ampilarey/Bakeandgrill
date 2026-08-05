import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { palette, radius, space, btnPrimary, btnSecondary, type, z } from "../../theme";
import { useMediaQuery } from "../../hooks/useMediaQuery";
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
  const isNarrow = useMediaQuery("(max-width: 840px)");
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

  const stage = ticketStage(t);
  const isPaid = t.payment_status === "paid";
  const isUnpaid = t.payment_status === "unpaid" || t.payment_status === "partial";

  const collectTomorrow = Boolean(t.fulfil_date && !t.fired_at);
  const prepaidDineIn = t.type === "dine_in" && !t.user && !t.fired_at;
  const arrivalTime = t.pickup_slot_at
    ? new Date(t.pickup_slot_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : null;
  const stageBadge = {
    tomorrow: {
      label: "Collect tomorrow",
      color: palette.panelMuted,
      bg: palette.bgAlt,
      border: palette.borderStrong,
      title: `Customer collects on ${t.fulfil_date}. Nothing to fire until then.`,
    },
    parked: {
      label: collectTomorrow
        ? "Collect tomorrow"
        : prepaidDineIn
          ? "Prepaid dine-in"
          : "Parked",
      color: palette.panelMuted,
      bg: palette.bgAlt,
      border: palette.borderStrong,
      title: collectTomorrow
        ? `Customer collects on ${t.fulfil_date}. Fire when ready for the kitchen.`
        : prepaidDineIn
          ? `Paid online, eating in${arrivalTime ? ` — arriving ${arrivalTime}` : ""}. Fire ~15 min before arrival, then Seat from Reservations.`
          : "Kitchen has not seen this yet",
    },
    queued: { label: "New", color: palette.info, bg: palette.infoBg, border: "#BFDBFE", title: "Waiting for kitchen to start (KDS Pending)" },
    cooking: { label: "Cooking", color: palette.warnDark, bg: palette.warnBg, border: palette.warnBorder, title: "Kitchen is preparing this" },
    ready: { label: "Ready", color: palette.successDark, bg: palette.successBg, border: palette.successBorder, title: "Ready for the customer to collect" },
  }[stage];

  const ageIso = ticketAgeAnchor(t, stage);
  const ageLevel = ticketAgeLevel(ageIso, stage);
  const ageStyle = TICKET_AGE_COLORS[ageLevel];
  const isMergeTarget = mergeTargetId === t.id;
  const isMergeCandidate = mergeTargetId !== null && !isMergeTarget;

  const kitchenNote = (() => {
    if (stage !== "cooking") return null;
    if ((t as { kitchen_done_at?: string | null }).kitchen_done_at) return "Kitchen done";
    if (
      (t as { kitchen_handover_status?: string | null }).kitchen_handover_status === "produced"
      && !(t as { pos_received_at?: string | null }).pos_received_at
    ) {
      return "Awaiting receive";
    }
    if (
      (t as { pos_received_at?: string | null }).pos_received_at
      || (t as { kitchen_handover_status?: string | null }).kitchen_handover_status === "received"
    ) {
      return "Received";
    }
    return null;
  })();

  const typeLabel = posOrderTypeLabel(t.type, t.user?.id);
  const typeEmoji = posOrderTypeEmoji(t.type, t.user?.id);

  const cardClickHandler = mergeTargetId === null
    ? () => onResume(t)
    : isMergeCandidate
      ? () => handlePickMergeSource(t)
      : undefined;

  const badgeBase: CSSProperties = {
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 0.3,
    padding: "2px 7px",
    borderRadius: radius.s,
    border: "1px solid",
    whiteSpace: "nowrap",
  };

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
        padding: isNarrow ? space.m : space.m,
        borderRadius: radius.l,
        background: isMergeTarget
          ? palette.infoBg
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
        gap: isNarrow ? space.m : space.s,
        cursor: cardClickHandler ? "pointer" : "default",
        boxShadow: isNarrow ? "0 1px 3px rgba(15,23,42,0.06)" : undefined,
      }}
      onClick={cardClickHandler}
    >
      {/* Primary scan line: name · stage · pay → total */}
      <div style={{
        display: "flex",
        flexDirection: isNarrow ? "column" : "row",
        justifyContent: "space-between",
        alignItems: isNarrow ? "stretch" : "flex-start",
        gap: isNarrow ? 6 : space.m,
      }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: isNarrow ? "space-between" : "flex-start",
            gap: 8,
          }}>
            <div style={{
              fontWeight: 800,
              fontSize: isNarrow ? 16 : type.body.fontSize,
              color: palette.panelInk,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              minWidth: 0,
              flex: 1,
            }}>
              {t.ticket_name || `Order ${t.order_number}`}
            </div>
            {isNarrow && (
              <div style={{
                fontWeight: 800,
                fontSize: 16,
                color: palette.panelInk,
                whiteSpace: "nowrap",
                flexShrink: 0,
                fontVariantNumeric: "tabular-nums",
              }}>
                MVR {ticketDisplayTotal(t).toFixed(2)}
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
            <span
              title={stageBadge.title}
              style={{
                ...badgeBase,
                color: stageBadge.color,
                background: stageBadge.bg,
                borderColor: stageBadge.border,
              }}
            >
              {stageBadge.label}
            </span>
            {isPaid && (
              <span
                title="Customer has paid"
                style={{
                  ...badgeBase,
                  color: palette.info,
                  background: palette.infoBg,
                  borderColor: "#BFDBFE",
                }}
              >
                Paid
              </span>
            )}
            {isUnpaid && (
              <span
                title="Customer has not paid yet"
                style={{
                  ...badgeBase,
                  color: palette.dangerDark,
                  background: palette.dangerBg,
                  borderColor: palette.dangerBorder,
                }}
              >
                {t.payment_status === "partial" ? "Partial" : "Unpaid"}
              </span>
            )}
            {t.table?.name ? (
              <span
                title={t.table.location ? `Table ${t.table.name} · ${t.table.location}` : `Table ${t.table.name}`}
                style={{
                  ...badgeBase,
                  color: "#9A3412",
                  background: "#FFF7ED",
                  borderColor: "#FDBA74",
                }}
              >
                🍽 {t.table.name}
              </span>
            ) : null}
            {prepaidDineIn && arrivalTime ? (
              <span
                title="Prepaid dine-in — customer arrival time"
                style={{
                  ...badgeBase,
                  color: "#6D28D9",
                  background: "#F5F3FF",
                  borderColor: "#DDD6FE",
                }}
              >
                Arrives {arrivalTime}
              </span>
            ) : null}
          </div>
          <div
            className={isNarrow ? "pos-open-tickets-meta-clamp" : undefined}
            style={{
              fontSize: type.caption.fontSize,
              color: palette.panelMuted,
              marginTop: 6,
              lineHeight: 1.35,
            }}
          >
            {(t.items?.length ?? 0)} items
            {typeLabel ? ` · ${typeEmoji ? `${typeEmoji} ` : ""}${typeLabel}` : ""}
            {t.type === "delivery" && t.delivery_island ? ` · ${t.delivery_island}` : ""}
            {ageIso ? (
              <span
                title={ticketAgeTitle(ageLevel, stage, { fulfil_date: t.fulfil_date })}
                style={{
                  color: ageLevel !== "ok" ? ageStyle.color : palette.panelMuted,
                  fontWeight: ageLevel !== "ok" ? 700 : 500,
                }}
              >
                {` · ${formatTicketAge(ageIso)}`}
              </span>
            ) : null}
            {kitchenNote ? ` · ${kitchenNote}` : ""}
            {!isNarrow && t.user?.name ? ` · ${t.user.name}` : ""}
            {t.customer?.name ? ` · ${t.customer.name}` : ""}
            {t.customer?.phone ? ` · ${t.customer.phone}` : ""}
            {t.ticket_note ? ` · ${t.ticket_note}` : ""}
          </div>
        </div>
        {!isNarrow && (
          <div style={{
            fontWeight: 800,
            fontSize: type.subtitle.fontSize,
            color: palette.panelInk,
            whiteSpace: "nowrap",
            flexShrink: 0,
            paddingTop: 1,
          }}>
            MVR {ticketDisplayTotal(t).toFixed(2)}
          </div>
        )}
      </div>

      <div style={{
        display: "flex",
        gap: space.s,
        flexWrap: "wrap",
      }}>
        {mergeTargetId === null && (
          <>
            {(stage === "parked" || stage === "tomorrow") && canHoldResume && (
              <ActionButton
                onClick={() => handleFireToKitchen(t)}
                busy={busy}
                bg="#A16207"
                confirm
                confirmLabel="Fire now? Tap to confirm"
                grow={isNarrow}
              >
                {isNarrow ? "Fire" : "Fire to kitchen"}
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
                  grow={isNarrow}
                >
                  {isNarrow ? "Cook" : "Start cooking"}
                </ActionButton>
                <ActionButton
                  onClick={() => handleMarkReady(t)}
                  busy={busy}
                  bg={palette.successDark}
                  confirm
                  confirmLabel="Mark ready and notify customer?"
                  grow={isNarrow}
                >
                  {isNarrow ? "Ready" : "Mark ready"}
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
                        padding: "6px 10px",
                        borderRadius: radius.m,
                        fontSize: type.caption.fontSize,
                        fontWeight: 600,
                        color: palette.warnDark,
                        background: palette.warnBg,
                        border: `1px dashed ${palette.warnBorder}`,
                      }}
                    >
                      Receive from kitchen when food arrives
                    </span>
                  )}
                  <ActionButton
                    onClick={() => handleMarkReady(t)}
                    busy={busy}
                    bg={palette.successDark}
                    confirm
                    confirmLabel="Mark ready and notify customer?"
                    grow={isNarrow}
                  >
                    {isNarrow ? "Ready" : "Mark ready"}
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
                grow={isNarrow}
              >
                {isNarrow ? "Collected" : "Picked up"}
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
                  minHeight: 44,
                  fontSize: type.bodySm.fontSize,
                  flex: isNarrow ? "1 1 auto" : undefined,
                }}
              >
                Charge
              </button>
            )}
            {isNarrow && mergeTargetId === null && !isUnpaid && (
              <button
                className="pos-ticket-action-btn"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onResume(t);
                }}
                disabled={busy}
                style={{
                  ...btnSecondary(busy),
                  padding: `${space.s}px ${space.m}px`,
                  minHeight: 44,
                  fontSize: type.bodySm.fontSize,
                  flex: "1 1 auto",
                }}
              >
                Open
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
                <div ref={moreRef} style={{ position: "relative", flexShrink: 0 }}>
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
                    More
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
