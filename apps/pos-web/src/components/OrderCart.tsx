import { useEffect, useRef, useState } from "react";
import type { CartItem, RestaurantTable } from "../types";
import { formatTableOption, tableIsInUse } from "../utils/tableLabels";
import type { PaymentRow } from "../hooks/useCart";
import { makeCartKey } from "../hooks/useCart";
import type { PosCustomer, PosCustomerAddress } from "../api";
import { CustomerPicker } from "./CustomerPicker";
import { CustomerRewardsPanel } from "./CustomerRewardsPanel";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { palette } from "../theme";
import { posOrderTypeEmoji, posOrderTypeLabel, isCustomerAppOrder } from "../orderTypeLabels";
import {
  EMPTY_DELIVERY_DETAILS,
  POS_ORDER_TYPES,
  type PosDeliveryDetails,
  type PosOrderType,
} from "../orderTypes";

type OrderType = PosOrderType;
const ORDER_TYPES = POS_ORDER_TYPES;

type AppliedPromo = {
  code: string;
  promotionId: number | null;
  discount: number;
  serverApplied?: boolean;
};
type AppliedLoyalty = { points: number; discount: number; serverApplied?: boolean };
type AppliedGiftCard = {
  code: string;
  discount: number;
  cardBalance: number;
  heldBalance?: number;
  serverApplied?: boolean;
};

type Props = {
  orderType: OrderType;
  setOrderType: (t: OrderType) => void;
  deliveryDetails: PosDeliveryDetails;
  setDeliveryDetails: (d: PosDeliveryDetails) => void;
  customerAddresses?: PosCustomerAddress[];
  selectedDeliveryAddressId?: number | "manual";
  onSelectDeliveryAddress?: (id: number | "manual") => void;
  onDeliveryManualEdit?: () => void;
  tables: RestaurantTable[];
  selectedTableId: number | null;
  setSelectedTableId: (id: number | null) => void;
  /** Refresh floor status after open/close/merge. */
  onRefreshTables?: () => void | Promise<void>;
  onOpenTable?: (id: number) => Promise<void>;
  onCloseTable?: (id: number) => Promise<void>;
  onMergeTables?: (sourceId: number, targetId: number) => Promise<void>;

  cartItems: CartItem[];
  setCartItems: (items: CartItem[]) => void;
  cartSubtotal: number;
  cartTax: number;
  cartServiceCharge?: number;
  serviceChargeLabel?: string;
  cartPackagingFee?: number;
  /** Grand total before gift-card tender. */
  cartGrandTotal?: number;
  /** Amount due after gift-card tender. */
  cartTotal: number;
  /** Amount due at Charge (includes delivery fee when applicable). */
  chargeTotal: number;
  /** Post-discount subtotal — base for rewards estimates. */
  taxableSubtotal: number;
  /** Server-previewed delivery fee (Delivery orders). */
  deliveryFeeEst?: number;
  discountValue: number;
  /** Sum of every staged customer-reward discount (promo + loyalty +
   *  gift card). Shown as one "Rewards" line in the cart breakdown. */
  rewardsDiscount: number;
  payments: PaymentRow[];
  discountAmount: string;
  setDiscountAmount: (v: string) => void;

  appliedPromo: AppliedPromo | null;
  setAppliedPromo: (v: AppliedPromo | null) => void;
  appliedLoyalty: AppliedLoyalty | null;
  setAppliedLoyalty: (v: AppliedLoyalty | null) => void;
  appliedGiftCard: AppliedGiftCard | null;
  setAppliedGiftCard: (v: AppliedGiftCard | null) => void;

  isSubmitting: boolean;
  pendingPaymentForOrderId: number | null;
  lastCreatedOrderId: number | null;
  openTicketsCount: number;
  /** True when any active ticket is past critical age thresholds. */
  openTicketsCritical?: boolean;

  attachedCustomer: PosCustomer | null;
  onAttachCustomer: (c: PosCustomer) => void;
  onDetachCustomer: () => void;

  /** When non-null, the cart was restored from an existing held order
   *  and is in read-only mode (no qty +/-, no clear, no save-ticket).
   *  The cashier must Cancel Resume to drop back into a fresh cart. */
  resumedOrderId: number | null;
  /** Original status of the resumed order ("held" / "pending" /
   *  "in_progress" / "ready"). Drives banner copy + decides whether
   *  Cancel Resume should re-hold the ticket. */
  resumedFromStatus?: string | null;
  /** True when the resumed ticket was already paid online — view only. */
  resumedIsPaid?: boolean;
  /** Display label (e.g. BG-20260522-0001) for resumed banners. */
  resumedOrderLabel?: string | null;
  /** Backend type slug for online delivery/pickup badges. */
  resumedOrderType?: string | null;
  /** Staff user id on the resumed ticket — distinguishes POS pickup from app orders. */
  resumedStaffUserId?: number | null;
  /** Unpaid resumed tickets are editable; paid online stays view-only. */
  isEditingActive?: boolean;
  /** True when resumed cart / type / table / delivery differ from the server. */
  hasUnsavedTicketChanges?: boolean;
  /** Push the edited cart back to the server (PATCH /orders/{id}/items). */
  onSaveActiveChanges?: () => void;
  onCancelResume: () => void;

  onClearCart: () => void;
  onSaveTicket: () => void;
  onOpenTickets: () => void;
  onCheckout: () => void;
  onRetryPayment: () => void;
  onOpenSendBill: () => void;
  smsNotifications?: { send_bill: boolean };

  canRingSales?: boolean;
  canHoldResume?: boolean;
  canViewActiveOrders?: boolean;
  canApplyDiscount?: boolean;
  canUseRewards?: boolean;
  canSendBill?: boolean;

  /** Owner-curated chip list of kitchen notes (e.g. "No salt"). The
   *  cashier taps one or more per cart line. Fetched from the public
   *  site-settings endpoint. Empty array = picker not shown. */
  quickNotes: string[];
  /** Open the chip-picker modal for the given cart line key. The
   *  parent owns the modal so it can sit above the resume banner
   *  and survive cart state churn. */
  onOpenNotePicker?: (cartKey: string) => void;
};

// Bug-039: keep the local `C` shorthand for readability, but
// every value is now sourced from the shared `palette` in
// theme.ts so a future brand tweak ripples through automatically
// instead of leaving the cart visually drifting from the rest of
// the POS.
const C = {
  panel: palette.panel,
  border: palette.border,
  border2: palette.borderStrong,
  text: palette.panelInk,
  muted: palette.panelMuted,
  subtle: palette.panelSubtle,
  bg: palette.bg,
  primary: palette.primary,
  primaryDark: palette.primaryDark,
  success: palette.success,
  // theme.ts already supplies success / successDark / successBorder
  // — `successDisabled` is the soft "tap to confirm" pill background
  // and lines up with successBorder in the design system.
  successDark: '#059669', // intermediate green not in palette yet
  successDisabled: palette.successBorder,
  warn: palette.warn,
};

export function OrderCart(p: Props) {
  const checkoutDisabled = p.cartItems.length === 0 || p.isSubmitting || p.canRingSales === false
    || !!p.resumedIsPaid;
  const dineIn = p.orderType === "Dine-in";
  const isDelivery = p.orderType === "Delivery";
  const deliveryFeeEst = isDelivery ? (p.deliveryFeeEst ?? 0) : 0;
  const isResumed = p.resumedOrderId !== null;
  /** Stacked phone/portrait only — skip dock on short landscape (side cart). */
  const isNarrowStack = useMediaQuery("(max-width: 840px) and (min-height: 501px)");
  const [cartExpanded, setCartExpanded] = useState(false);
  const itemCount = p.cartItems.reduce((n, i) => n + (i.quantity || 1), 0);

  useEffect(() => {
    if (p.cartItems.length === 0) setCartExpanded(false);
  }, [p.cartItems.length]);

  useEffect(() => {
    if (!isNarrowStack) setCartExpanded(false);
  }, [isNarrowStack]);

  const dockMode = isNarrowStack && !cartExpanded;
  const sheetMode = isNarrowStack && cartExpanded;
  const cartClassName = [
    "pos-cart",
    dockMode ? "pos-cart--dock" : "",
    sheetMode ? "pos-cart--sheet" : "",
  ].filter(Boolean).join(" ");
  const selectedTableName = p.selectedTableId != null
    ? (p.tables.find((t) => t.id === p.selectedTableId)?.name ?? null)
    : null;
  const orderLabel = p.resumedOrderLabel ?? `#${p.resumedOrderId}`;
  // Unpaid active tickets open editable; Save appears when dirty.
  const editing = isResumed && !p.resumedIsPaid && !!p.isEditingActive;
  const ticketDirty = !!p.hasUnsavedTicketChanges;
  // Paid online tickets stay locked; unpaid resumed tickets are editable.
  const lockedReadOnly = isResumed && (!editing || !!p.resumedIsPaid);
  const onlineFulfillment = isResumed
    && isCustomerAppOrder(p.resumedOrderType, p.resumedStaffUserId);
  const fulfillmentLabel = posOrderTypeLabel(p.resumedOrderType, p.resumedStaffUserId);
  const fulfillmentEmoji = posOrderTypeEmoji(p.resumedOrderType, p.resumedStaffUserId);

  // ── Two-tap confirm for the "Clear" button ────────────────────
  // One tap on Clear used to wipe the entire cart instantly — 10+
  // items, attached customer, rewards, discount, the lot. The
  // button sits in the top-right corner exactly where thumbs rest
  // on an iPad in portrait so accidental taps were common during
  // a busy ring-up. Now first tap arms ("Tap again to clear"),
  // second tap inside 2s actually clears.
  const [clearArmed, setClearArmed] = useState(false);
  const [pendingOrderType, setPendingOrderType] = useState<OrderType | null>(null);
  const clearTimerRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (clearTimerRef.current !== null) {
        window.clearTimeout(clearTimerRef.current);
        clearTimerRef.current = null;
      }
    },
    [],
  );
  // Reset the arm whenever the cart becomes empty — there's
  // nothing to clear anyway, and stale arming would confuse the
  // cashier on their next pass through this card.
  useEffect(() => {
    if (p.cartItems.length === 0 && clearArmed) {
      setClearArmed(false);
      if (clearTimerRef.current !== null) {
        window.clearTimeout(clearTimerRef.current);
        clearTimerRef.current = null;
      }
    }
  }, [p.cartItems.length, clearArmed]);
  const handleClearTap = () => {
    if (clearArmed) {
      if (clearTimerRef.current !== null) {
        window.clearTimeout(clearTimerRef.current);
        clearTimerRef.current = null;
      }
      setClearArmed(false);
      // Resumed unpaid: Clear exits resume (same as Cancel) so we don't
      // sit on an empty "Order #N" shell that also blocked POS updates.
      if (isResumed && !p.resumedIsPaid) {
        p.onCancelResume();
      } else {
        p.onClearCart();
      }
    } else {
      setClearArmed(true);
      clearTimerRef.current = window.setTimeout(() => {
        setClearArmed(false);
        clearTimerRef.current = null;
      }, 2000);
    }
  };

  // ── Undo toast for cart line removals (Bug-009) ──────────────
  // Even with the higher swipe-commit threshold, a deletion is
  // still destructive enough that the user should have a quick
  // way to take it back. We surface a small toast at the bottom
  // of the cart for 5s with an "Undo" button that re-inserts the
  // removed line in its original position.
  const [recentlyRemoved, setRecentlyRemoved] = useState<{
    item: CartItem;
    indexAtRemoval: number;
    cartLengthAfter: number;
  } | null>(null);
  const undoTimerRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (undoTimerRef.current !== null) {
        window.clearTimeout(undoTimerRef.current);
        undoTimerRef.current = null;
      }
    },
    [],
  );

  const handleLineRemoved = (removed: CartItem) => {
    // Capture the index from the SNAPSHOT before the removal —
    // we read p.cartItems which still has the item because React
    // hasn't re-rendered yet at the moment the child fires this.
    const indexAtRemoval = p.cartItems.findIndex(
      (ci) =>
        makeCartKey(ci.id, ci.modifiers, ci.variant_id, ci.notes, ci.packaging_option_id) ===
        makeCartKey(removed.id, removed.modifiers, removed.variant_id, removed.notes, removed.packaging_option_id),
    );
    setRecentlyRemoved({
      item: removed,
      indexAtRemoval: indexAtRemoval >= 0 ? indexAtRemoval : 0,
      cartLengthAfter: p.cartItems.length - 1,
    });
    if (undoTimerRef.current !== null) {
      window.clearTimeout(undoTimerRef.current);
    }
    undoTimerRef.current = window.setTimeout(() => {
      setRecentlyRemoved(null);
      undoTimerRef.current = null;
    }, 5000);
  };

  const handleUndoRemove = () => {
    if (!recentlyRemoved) return;
    // Re-insert at the original index, capped at the current cart
    // length so a cart that's been mutated since (e.g. cleared)
    // still gets the line back without throwing.
    const insertAt = Math.min(recentlyRemoved.indexAtRemoval, p.cartItems.length);
    const next = [...p.cartItems];
    next.splice(insertAt, 0, recentlyRemoved.item);
    p.setCartItems(next);
    setRecentlyRemoved(null);
    if (undoTimerRef.current !== null) {
      window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
  };

  return (
    <>
    {sheetMode && (
      <button
        type="button"
        className="pos-cart-sheet-backdrop pos-cart-sheet-backdrop--open"
        aria-label="Collapse cart"
        onClick={() => setCartExpanded(false)}
      />
    )}
    <aside
      className={cartClassName}
      aria-label="Order cart"
      style={{
        background: C.panel,
        borderRadius: 14,
        border: `1px solid ${C.border}`,
        boxShadow: '0 2px 8px rgba(15,23,42,0.06)',
      }}
    >
      <div className="pos-cart-dock-bar" role="group" aria-label="Cart summary">
        <button
          type="button"
          onClick={() => {
            if (p.cartItems.length === 0) return;
            setCartExpanded(true);
          }}
          aria-expanded={cartExpanded}
          aria-label={p.cartItems.length === 0 ? "Cart empty" : "Expand cart"}
          style={{
            flex: 1, minWidth: 0, minHeight: 44, padding: 0,
            border: "none", background: "transparent", cursor: p.cartItems.length === 0 ? "default" : "pointer",
            textAlign: "left", font: "inherit", color: "inherit",
            display: "flex", alignItems: "center", gap: 8,
          }}
        >
          <span className="pos-cart-dock-summary" style={{ flex: 1, minWidth: 0 }}>
            <span
              className="pos-cart-dock-items"
              style={{ display: "block", fontSize: 12, fontWeight: 700, color: C.muted }}
            >
              {p.cartItems.length === 0
                ? "Cart empty"
                : (
                  <>
                    {`${itemCount} item${itemCount === 1 ? "" : "s"}`}
                    {selectedTableName ? (
                      <span style={{ color: C.text }}>{`, ${selectedTableName}`}</span>
                    ) : null}
                  </>
                )}
            </span>
            <span
              className="pos-cart-dock-amount"
              style={{
                display: "block", fontSize: 16, fontWeight: 800, color: C.text,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              MVR {p.chargeTotal.toFixed(2)}
            </span>
          </span>
          {p.cartItems.length > 0 && (
            <span style={{ fontSize: 18, color: C.muted, flexShrink: 0 }} aria-hidden>▴</span>
          )}
        </button>
        {/* Always visible on the mobile dock — empty cart can't expand to
            reach the in-cart Active orders button. */}
        {p.canViewActiveOrders !== false && (
          <button
            type="button"
            onClick={p.onOpenTickets}
            disabled={p.isSubmitting}
            aria-label={
              p.openTicketsCount > 0
                ? `Active orders, ${p.openTicketsCount}`
                : "Active orders"
            }
            style={{
              flexShrink: 0,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "10px 12px",
              borderRadius: 10,
              border: `1px solid ${C.border2}`,
              background: "#fff",
              color: C.text,
              fontWeight: 800,
              fontSize: 12,
              cursor: p.isSubmitting ? "not-allowed" : "pointer",
              minHeight: 44,
              opacity: p.isSubmitting ? 0.6 : 1,
            }}
          >
            Orders
            {p.openTicketsCount > 0 && (
              <span
                title={p.openTicketsCritical ? "One or more tickets are critically aged" : undefined}
                style={{
                  minWidth: 20,
                  height: 20,
                  padding: "0 6px",
                  borderRadius: 999,
                  background: p.openTicketsCritical ? "#B91C1C" : "#D4813A",
                  color: "#fff",
                  fontSize: 11,
                  fontWeight: 800,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  lineHeight: 1,
                }}
              >
                {p.openTicketsCount > 99 ? "99+" : p.openTicketsCount}
              </span>
            )}
          </button>
        )}
        {p.canRingSales !== false && !p.resumedIsPaid && (
          <button
            type="button"
            onClick={() => { if (!checkoutDisabled) p.onCheckout(); }}
            disabled={checkoutDisabled}
            style={{
              flexShrink: 0,
              padding: "12px 16px",
              borderRadius: 10,
              border: "none",
              background: checkoutDisabled ? C.successDisabled : C.success,
              color: "#fff",
              fontWeight: 800,
              fontSize: 13,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              cursor: checkoutDisabled ? "not-allowed" : "pointer",
              minHeight: 44,
            }}
          >
            {p.isSubmitting ? "…" : "Charge"}
          </button>
        )}
      </div>
      {/* ── Resumed-ticket banner ─────────────────────────────────
            Unpaid: editable immediately; Save only when dirty.
            Paid online: view-only. Cancel re-holds held tickets. */}
      {isResumed && (
        <div style={{
          padding: '10px 14px',
          background: p.resumedIsPaid ? '#ECFDF5' : ticketDirty ? '#EFF6FF' : '#FFFBEB',
          borderBottom: `1px solid ${p.resumedIsPaid ? '#A7F3D0' : ticketDirty ? '#BFDBFE' : '#FDE68A'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          flexWrap: 'wrap',
        }}>
          <div style={{
            fontSize: 12,
            color: p.resumedIsPaid ? '#065F46' : ticketDirty ? '#1E3A8A' : '#92400E',
            lineHeight: 1.4, minWidth: 0, flex: 1,
          }}>
            <div style={{ fontWeight: 800 }}>
              {p.resumedIsPaid
                ? `✅ Paid online: ${orderLabel}`
                : `🎫 Order ${orderLabel}`}
            </div>
            <div style={{ marginTop: 2 }}>
              {p.resumedIsPaid
                ? 'Paid — items are locked. You can still add or change the customer below.'
                : ticketDirty
                  ? 'Unsaved changes — Save, or Charge (auto-saves first).'
                  : 'Edit freely, then Save or Charge.'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {editing && ticketDirty && p.onSaveActiveChanges && (
              <button
                onClick={p.onSaveActiveChanges}
                disabled={p.isSubmitting || p.cartItems.length === 0}
                style={{
                  padding: '6px 10px', borderRadius: 6,
                  background: '#1D4ED8', border: 'none',
                  fontSize: 11, fontWeight: 700, color: '#fff',
                  cursor: (p.isSubmitting || p.cartItems.length === 0) ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                  opacity: (p.isSubmitting || p.cartItems.length === 0) ? 0.6 : 1,
                }}
              >
                💾 Save
              </button>
            )}
            <button
              onClick={p.onCancelResume}
              disabled={p.isSubmitting}
              style={{
                padding: '6px 10px', borderRadius: 6,
                background: '#fff', border: `1px solid ${ticketDirty ? '#93C5FD' : '#FBBF24'}`,
                fontSize: 11, fontWeight: 700, color: ticketDirty ? '#1E40AF' : '#92400E',
                cursor: p.isSubmitting ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {p.resumedIsPaid ? 'Close' : 'Cancel'}
            </button>
          </div>
        </div>
      )}

      <div className="pos-cart-body">
      {/* ── Top: ticket header + order type pills ─────────────────── */}
      <div className="pos-cart-header" style={{ padding: 14, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: C.text }}>
            {isResumed ? `Order ${orderLabel}` : 'New Order'}
          </div>
          <button
            onClick={handleClearTap}
            disabled={p.cartItems.length === 0 || lockedReadOnly}
            title={lockedReadOnly ? 'Paid ticket — items are locked' : undefined}
            style={{
              fontSize: 12, fontWeight: clearArmed ? 800 : 600,
              color: clearArmed ? '#fff' : C.muted,
              background: clearArmed ? '#B91C1C' : 'transparent',
              border: 'none',
              padding: clearArmed ? '4px 10px' : '8px 4px',
              borderRadius: clearArmed ? 999 : 0,
              minHeight: 40,
              cursor: (p.cartItems.length === 0 || lockedReadOnly) ? 'not-allowed' : 'pointer',
              opacity: (p.cartItems.length === 0 || lockedReadOnly) ? 0.4 : 1,
            }}
          >
            {clearArmed ? 'Tap again to clear' : 'Clear'}
          </button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', background: C.bg, borderRadius: 8, padding: 3, gap: 3 }}>
          {onlineFulfillment && isResumed ? (
            <div style={{
              flex: 1, padding: '8px 10px', fontSize: 12, fontWeight: 700,
              borderRadius: 6, background: '#FFFFFF', color: C.text,
              boxShadow: '0 1px 2px rgba(15,23,42,0.08)', textAlign: 'center',
            }}>
              {fulfillmentEmoji} {fulfillmentLabel}
            </div>
          ) : ORDER_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => {
                if (t !== p.orderType && p.cartItems.length > 0) {
                  setPendingOrderType(t);
                  return;
                }
                setPendingOrderType(null);
                p.setOrderType(t);
              }}
              disabled={lockedReadOnly}
              style={{
                flex: '1 1 22%',
                minWidth: 62,
                padding: '8px 4px',
                fontSize: 11,
                fontWeight: 700,
                borderRadius: 6, border: 'none', cursor: lockedReadOnly ? 'not-allowed' : 'pointer',
                background: (pendingOrderType ?? p.orderType) === t ? '#FFFFFF' : 'transparent',
                color: (pendingOrderType ?? p.orderType) === t ? C.text : C.muted,
                boxShadow: (pendingOrderType ?? p.orderType) === t ? '0 1px 2px rgba(15,23,42,0.08)' : 'none',
                transition: 'background 0.1s',
                opacity: lockedReadOnly ? 0.6 : 1,
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {pendingOrderType && pendingOrderType !== p.orderType && p.cartItems.length > 0 && (
          <div
            role="alert"
            style={{
              marginTop: 8,
              padding: '10px 12px',
              borderRadius: 8,
              background: '#FFFBEB',
              border: '1px solid #FDE68A',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600, color: '#92400E', lineHeight: 1.4 }}>
              Switch to {pendingOrderType}? Items that aren&apos;t available on {pendingOrderType} may be rejected at checkout.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => {
                  const next = pendingOrderType;
                  p.setOrderType(next);
                  // Fresh delivery form when entering Delivery; clear
                  // stale address when leaving it.
                  if (next === "Delivery" && p.orderType !== "Delivery") {
                    p.setDeliveryDetails({ ...EMPTY_DELIVERY_DETAILS });
                  } else if (next !== "Delivery") {
                    p.setDeliveryDetails({ ...EMPTY_DELIVERY_DETAILS });
                  }
                  setPendingOrderType(null);
                }}
                style={{
                  flex: 1, minHeight: 40, borderRadius: 8, border: 'none',
                  background: C.primary ?? '#D4813A', color: '#fff',
                  fontWeight: 700, fontSize: 13, cursor: 'pointer',
                }}
              >
                Switch
              </button>
              <button
                type="button"
                onClick={() => setPendingOrderType(null)}
                style={{
                  flex: 1, minHeight: 40, borderRadius: 8,
                  border: `1px solid ${C.border2}`, background: '#fff',
                  color: C.muted, fontWeight: 700, fontSize: 13, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {dineIn && (
          <div style={{ marginTop: 10 }}>
            <select
              value={p.selectedTableId ?? ""}
              onChange={(e) => p.setSelectedTableId(e.target.value ? Number(e.target.value) : null)}
              disabled={lockedReadOnly}
              style={{
                width: '100%', padding: '10px 12px',
                borderRadius: 8, border: `1px solid ${C.border2}`,
                fontSize: 13, background: '#FFFFFF', color: C.text,
              }}
            >
              <option value="">Select table</option>
              {p.tables.map((t) => {
                const ours = p.resumedOrderId != null && t.current_order_id === p.resumedOrderId;
                const inUse = tableIsInUse(t);
                // Never keep another ticket's seat selectable via sticky selection.
                const blocked = inUse && !ours;
                return (
                  <option key={t.id} value={t.id} disabled={blocked}>
                    {t.name}
                  </option>
                );
              })}
            </select>
            {p.selectedTableId != null && (p.onOpenTable || p.onCloseTable || p.onMergeTables) && (
              <TableFloorActions
                tables={p.tables}
                selectedTableId={p.selectedTableId}
                ourOrderId={p.resumedOrderId}
                onOpenTable={p.onOpenTable}
                onCloseTable={p.onCloseTable}
                onMergeTables={p.onMergeTables}
                onRefreshTables={p.onRefreshTables}
              />
            )}
          </div>
        )}

        {isDelivery && !onlineFulfillment && (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {p.customerAddresses && p.customerAddresses.length > 0 && p.onSelectDeliveryAddress && (
              <select
                value={p.selectedDeliveryAddressId ?? "manual"}
                disabled={lockedReadOnly}
                onChange={(e) => {
                  const v = e.target.value;
                  p.onSelectDeliveryAddress?.(v === "manual" ? "manual" : Number(v));
                }}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 8,
                  border: `1px solid ${C.border2}`, fontSize: 13, background: '#FFFFFF',
                }}
              >
                {p.customerAddresses.map((a) => (
                  <option key={a.id} value={a.id}>
                    {(a.label ? `${a.label} — ` : "") + a.address_line1}{a.is_default ? " (default)" : ""}
                  </option>
                ))}
                <option value="manual">Enter manually</option>
              </select>
            )}
            <input
              type="text"
              placeholder="Delivery address *"
              value={p.deliveryDetails.addressLine1}
              disabled={lockedReadOnly}
              onChange={(e) => {
                p.onDeliveryManualEdit?.();
                p.setDeliveryDetails({ ...p.deliveryDetails, addressLine1: e.target.value });
              }}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8,
                border: `1px solid ${C.border2}`, fontSize: 13, background: '#FFFFFF',
              }}
            />
            <div className="pos-cart-delivery-row" style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                placeholder="Island / area *"
                value={p.deliveryDetails.island}
                disabled={lockedReadOnly}
                onChange={(e) => p.setDeliveryDetails({ ...p.deliveryDetails, island: e.target.value })}
                style={{
                  flex: 1, padding: '10px 12px', borderRadius: 8,
                  border: `1px solid ${C.border2}`, fontSize: 13, background: '#FFFFFF',
                }}
              />
              <input
                type="tel"
                placeholder="Phone *"
                value={p.deliveryDetails.contactPhone}
                disabled={lockedReadOnly}
                onChange={(e) => p.setDeliveryDetails({ ...p.deliveryDetails, contactPhone: e.target.value })}
                style={{
                  flex: 1, padding: '10px 12px', borderRadius: 8,
                  border: `1px solid ${C.border2}`, fontSize: 13, background: '#FFFFFF',
                }}
              />
            </div>
            <input
              type="text"
              placeholder="Contact name *"
              value={p.deliveryDetails.contactName}
              disabled={lockedReadOnly}
              onChange={(e) => {
                p.onDeliveryManualEdit?.();
                p.setDeliveryDetails({ ...p.deliveryDetails, contactName: e.target.value });
              }}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8,
                border: `1px solid ${C.border2}`, fontSize: 13, background: '#FFFFFF',
              }}
            />
            <input
              type="url"
              placeholder="Google Maps / location link (optional)"
              value={p.deliveryDetails.locationLink}
              disabled={lockedReadOnly}
              onChange={(e) => {
                p.onDeliveryManualEdit?.();
                p.setDeliveryDetails({ ...p.deliveryDetails, locationLink: e.target.value });
              }}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8,
                border: `1px solid ${C.border2}`, fontSize: 13, background: '#FFFFFF',
              }}
            />
            <input
              type="text"
              placeholder="Delivery notes (optional)"
              value={p.deliveryDetails.notes}
              disabled={lockedReadOnly}
              onChange={(e) => p.setDeliveryDetails({ ...p.deliveryDetails, notes: e.target.value })}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8,
                border: `1px solid ${C.border2}`, fontSize: 13, background: '#FFFFFF',
              }}
            />
            {p.cartItems.length > 0 && deliveryFeeEst > 0 && (
              <div style={{ fontSize: 12, color: C.muted }}>
                Est. delivery fee: MVR {deliveryFeeEst.toFixed(2)} (added at checkout)
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: 10 }}>
          <CustomerPicker
            customer={p.attachedCustomer}
            onAttach={p.onAttachCustomer}
            onDetach={p.onDetachCustomer}
          />
        </div>

        {/* Rewards drawer — gift card works for walk-ins; promo/loyalty
            need an attached customer. Server apply still happens during
            charge between createOrder and settleOrder. */}
        {p.cartItems.length > 0 && p.canUseRewards !== false && (
          <CustomerRewardsPanel
            customer={p.attachedCustomer}
            taxableSubtotal={p.taxableSubtotal}
            cartLines={p.cartItems.map((item) => {
              const unit =
                item.price + item.modifiers.reduce((sum, m) => sum + m.price, 0);
              return {
                item_id: item.id,
                quantity: item.quantity,
                unit_price: unit,
                total_price: Math.round(unit * item.quantity * 100) / 100,
              };
            })}
            manualDiscountMvr={p.discountValue}
            tenderRoom={p.cartGrandTotal ?? p.cartTotal + (p.appliedGiftCard?.discount ?? 0)}
            applied={{
              promo: p.appliedPromo,
              loyalty: p.appliedLoyalty,
              giftCard: p.appliedGiftCard,
            }}
            setAppliedPromo={p.setAppliedPromo}
            setAppliedLoyalty={p.setAppliedLoyalty}
            setAppliedGiftCard={p.setAppliedGiftCard}
            orderId={p.resumedOrderId}
            readOnly={lockedReadOnly}
            canApplyGiftCard={p.canApplyDiscount !== false}
          />
        )}
      </div>

      {/* ── Cart lines ───────────────────────────────────────────── */}
      <div className="pos-cart-lines" style={{ padding: '2px 0' }}>
        {p.cartItems.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', padding: '40px 20px', color: C.subtle,
            textAlign: 'center', minHeight: 120,
          }}>
            <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.5 }}>🛒</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.muted }}>No items in ticket</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Tap items on the right to add</div>
          </div>
        ) : (
          p.cartItems.map((item) => (
            <CartLine
              key={makeCartKey(item.id, item.modifiers, item.variant_id, item.notes, item.packaging_option_id)}
              item={item}
              cartItems={p.cartItems}
              setCartItems={p.setCartItems}
              quickNotes={p.quickNotes}
              onOpenNotePicker={p.onOpenNotePicker}
              isResumed={lockedReadOnly}
              onLineRemoved={handleLineRemoved}
            />
          ))
        )}
      </div>
      </div>

      {recentlyRemoved && (
        <div
          role="status"
          aria-live="polite"
          style={{
            margin: '0 12px 8px',
            padding: '10px 12px',
            borderRadius: 10,
            background: '#0F172A',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            fontSize: 13,
          }}
        >
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Removed <strong>{recentlyRemoved.item.name}</strong>
          </span>
          <button
            onClick={handleUndoRemove}
            style={{
              padding: '6px 12px',
              borderRadius: 8,
              background: '#FBBF24',
              color: '#0F172A',
              border: 'none',
              fontWeight: 800,
              fontSize: 12,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            UNDO
          </button>
        </div>
      )}

      {/* ── Totals + payments + actions ──────────────────────────── */}
      <div className="pos-cart-footer" style={{ borderTop: `1px solid ${C.border}`, padding: 14, background: C.bg }}>
        {/* Subtotal / discount / tax breakdown.
            We render this whenever there's a discount OR tax (the most
            common case is GST/TGST on every item, so 99% of tickets land
            here). Without it the Charge button shows only the subtotal
            and the cashier under-collects from the customer. */}
        {p.cartItems.length > 0 && (p.discountValue > 0 || p.cartTax > 0 || p.rewardsDiscount > 0 || (p.cartServiceCharge ?? 0) > 0 || (p.cartPackagingFee ?? 0) > 0) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 8 }}>
            <Row label="Subtotal" value={`MVR ${p.cartSubtotal.toFixed(2)}`} />
            {p.discountValue > 0 && (
              <Row label="Discount" value={`− MVR ${p.discountValue.toFixed(2)}`} accent={C.primaryDark} />
            )}
            {p.appliedPromo && (
              <Row
                label={`Promo · ${p.appliedPromo.code}`}
                value={`− MVR ${p.appliedPromo.discount.toFixed(2)}`}
                accent={C.primaryDark}
              />
            )}
            {p.appliedLoyalty && (
              <Row
                label={`Points · ${p.appliedLoyalty.points.toLocaleString()}`}
                value={`− MVR ${p.appliedLoyalty.discount.toFixed(2)}`}
                accent={C.primaryDark}
              />
            )}
            {p.appliedGiftCard && (
              <Row
                label={`Gift card tender · ${p.appliedGiftCard.code.slice(-6) || "on ticket"}`}
                value={`− MVR ${p.appliedGiftCard.discount.toFixed(2)}`}
                accent={C.primaryDark}
              />
            )}
            {(p.cartServiceCharge ?? 0) > 0 && (
              <Row
                label={p.serviceChargeLabel ?? "Service charge"}
                value={`MVR ${(p.cartServiceCharge ?? 0).toFixed(2)}`}
              />
            )}
            {(p.cartPackagingFee ?? 0) > 0 && (
              <Row
                label="Packaging"
                value={`MVR ${(p.cartPackagingFee ?? 0).toFixed(2)}`}
              />
            )}
            {p.cartTax > 0 && (
              <Row label="GST" value={`MVR ${p.cartTax.toFixed(2)}`} />
            )}
          </div>
        )}

        {/* Discount — single line. Bug-025: was inputMode="none" with
            an invisible caret, so on iPad cashiers couldn't enter a
            discount without a hardware keyboard (the "discount sheet
            in the Charge flow" the old comment referred to never
            materialised). Switched to inputMode="decimal" so iOS
            pops its numpad on focus, matching every other numeric
            field in the cart sidebar. */}
        {p.canApplyDiscount !== false && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <label style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>Discount</label>
          <input
            value={p.discountAmount}
            onChange={(e) => p.setDiscountAmount(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            placeholder="0.00"
            inputMode="decimal"
            autoComplete="off"
            disabled={lockedReadOnly}
            style={{
              flex: 1, padding: '6px 10px', borderRadius: 6,
              border: `1px solid ${C.border2}`, fontSize: 13, textAlign: 'right',
              opacity: lockedReadOnly ? 0.5 : 1,
            }}
          />
        </div>
        )}

        {/* Save ticket / Open tickets — Save is disabled in resumed
            mode because it would create a brand new held order; the
            cashier already has Cancel Resume + edit + Save flow. */}
        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          {p.canHoldResume !== false && (
          <button
            onClick={p.onSaveTicket}
            disabled={p.cartItems.length === 0 || p.isSubmitting || isResumed}
            title={isResumed ? 'Already a resumed ticket' : undefined}
            style={smallBtn(p.cartItems.length === 0 || p.isSubmitting || isResumed)}
          >
            🎫 Save ticket
          </button>
          )}
          <button
            onClick={p.onOpenTickets}
            disabled={p.isSubmitting}
            style={{ ...smallBtn(p.isSubmitting), position: 'relative' }}
          >
            Active orders
            {p.openTicketsCount > 0 && (
              <span
                title={p.openTicketsCritical ? "One or more tickets are critically aged" : undefined}
                style={{
                  marginLeft: 6, padding: '1px 8px', borderRadius: 999,
                  background: p.openTicketsCritical ? '#B91C1C' : '#D4813A',
                  color: '#fff', fontSize: 11, fontWeight: 800,
                }}
              >{p.openTicketsCount}</span>
            )}
          </button>
        </div>

        {/* Retry-payment banner */}
        {p.pendingPaymentForOrderId !== null && (
          <div style={{
            marginTop: 10, padding: '8px 10px', borderRadius: 8,
            background: '#FEF3C7', color: '#92400E',
            border: '1px solid #FDE68A', fontSize: 12,
          }}>
            Order #{p.pendingPaymentForOrderId} created — payment failed.{" "}
            <button
              onClick={p.onRetryPayment}
              disabled={p.isSubmitting}
              style={{
                textDecoration: 'underline', fontWeight: 700, background: 'none',
                border: 'none', color: '#92400E', cursor: 'pointer', padding: 0,
              }}
            >
              Retry payment
            </button>
          </div>
        )}

        {/* Send-bill for an open order whose payment hasn't been
            attempted yet — once a charge is recorded the bug fix in
            useOrderCreation clears lastCreatedOrderId so this button
            stops appearing for already-paid tickets. */}
        {p.canSendBill !== false && p.smsNotifications?.send_bill !== false && p.lastCreatedOrderId && p.pendingPaymentForOrderId === null && (
          <button
            onClick={p.onOpenSendBill}
            style={{
              marginTop: 10, width: '100%', padding: '10px 12px', borderRadius: 8,
              background: '#FFFFFF', border: `1px solid ${C.border2}`,
              fontSize: 12, fontWeight: 700, color: C.text, cursor: 'pointer',
            }}
          >
            📱 Send Bill for #{p.lastCreatedOrderId}
          </button>
        )}

        {/* BIG CHARGE button — hidden for already-paid view-only tickets */}
        {p.canRingSales !== false && !p.resumedIsPaid && (
        <button
          onClick={p.onCheckout}
          disabled={checkoutDisabled}
          style={{
            marginTop: 12, width: '100%',
            padding: '18px 18px', borderRadius: 12,
            background: checkoutDisabled ? C.successDisabled : C.success,
            color: '#FFFFFF', border: 'none',
            cursor: checkoutDisabled ? 'not-allowed' : 'pointer',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            transition: 'background 0.12s, transform 60ms ease',
            boxShadow: checkoutDisabled ? 'none' : '0 4px 12px rgba(16,185,129,0.30)',
            minHeight: 56,
          }}
          onMouseEnter={(e) => {
            if (!checkoutDisabled) (e.currentTarget as HTMLButtonElement).style.background = C.successDark;
          }}
          onMouseLeave={(e) => {
            if (!checkoutDisabled) (e.currentTarget as HTMLButtonElement).style.background = C.success;
          }}
          onMouseDown={(e) => {
            if (!checkoutDisabled) (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.99)';
          }}
          onMouseUp={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = '';
          }}
        >
          <span style={{
            fontSize: 14, fontWeight: 800,
            letterSpacing: '0.08em', textTransform: 'uppercase',
          }}>
            {p.isSubmitting ? 'Processing…' : 'Charge'}
          </span>
          <span style={{
            fontSize: 20, fontWeight: 800,
            fontVariantNumeric: 'tabular-nums',
          }}>
            MVR {p.chargeTotal.toFixed(2)}
          </span>
        </button>
        )}
        {sheetMode && (
          <button
            type="button"
            onClick={() => setCartExpanded(false)}
            style={{
              marginTop: 8, width: "100%", padding: "10px 12px", borderRadius: 8,
              background: "#FFFFFF", border: `1px solid ${C.border2}`,
              fontSize: 12, fontWeight: 700, color: C.muted, cursor: "pointer",
            }}
          >
            ▾ Collapse cart
          </button>
        )}
      </div>
    </aside>
    </>
  );
}

/**
 * Single line in the cart list. Lives as its own component so the
 * row can manage its own swipe-to-delete state without forcing the
 * whole cart to re-render on every touchmove.
 *
 * Layout (tight 2-row): title row carries the item name + variant +
 * modifiers + notes inline alongside the line total, with a 1-tap
 * × delete button on the far right. The control row holds qty −/+
 * and the optional 📝 Note chip. Compared to the old layout this
 * saves ~24px of vertical space per item, which adds up to one or
 * two extra visible items in the cart on a 9.7" iPad.
 */
function CartLine({
  item,
  cartItems,
  setCartItems,
  quickNotes,
  onOpenNotePicker,
  isResumed,
  onLineRemoved,
}: {
  item: CartItem;
  cartItems: CartItem[];
  setCartItems: (items: CartItem[]) => void;
  quickNotes: string[];
  onOpenNotePicker?: (cartKey: string) => void;
  isResumed: boolean;
  onLineRemoved?: (removed: CartItem) => void;
}) {
  const itemKey = makeCartKey(item.id, item.modifiers, item.variant_id, item.notes, item.packaging_option_id);
  const unitPrice = Number(item.price ?? 0) +
    item.modifiers.reduce((s, m) => s + Number(m.price ?? 0), 0);
  const lineTotal = unitPrice * item.quantity;
  const notes = item.notes ?? [];

  // Swipe-to-delete state. Tracks the horizontal drag offset; positive
  // = swiped left (Mail.app pattern). We only act on big swipes so
  // accidental brushes during a +/− tap don't accidentally delete.
  //
  // CRITICAL: we mirror the drag offset in a ref. `touchend` often
  // fires before React has flushed the last `touchmove` setState — so
  // reading `drag` directly inside `onTouchEnd` returns the stale
  // pre-final-move value, and a hard left swipe that obviously
  // crossed SWIPE_COMMIT would silently snap back instead of
  // deleting. The ref is updated synchronously in `touchmove` and is
  // the source of truth for the release decision.
  const [drag, setDrag] = useState(0);
  const dragRef = useRef(0);
  const startXRef = useRef<number | null>(null);
  const SWIPE_REVEAL = 80;       // px to reveal the delete affordance
  // Bug-009: auto-commit threshold raised so a casual swipe-left
  // can't yeet a line item off the cart. The cashier now has to
  // commit to a strong, deliberate, almost-full-width swipe — or
  // (the more discoverable path) tap the red "Delete" strip once
  // the reveal threshold is reached.
  const SWIPE_COMMIT = 220;
  const isDragging = drag > 0;

  const setDragTo = (next: number) => {
    dragRef.current = next;
    setDrag(next);
  };

  const removeLine = () => {
    setCartItems(
      cartItems.filter(
        (ci) => makeCartKey(ci.id, ci.modifiers, ci.variant_id, ci.notes, ci.packaging_option_id) !== itemKey,
      ),
    );
    // Surface the removed line to the parent so it can show the
    // undo toast. Snapshot is the original item, not a copy of
    // the cart — we only need the line that vanished.
    onLineRemoved?.(item);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (isResumed) return;
    startXRef.current = e.touches[0].clientX;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (isResumed || startXRef.current == null) return;
    const dx = startXRef.current - e.touches[0].clientX;
    // Only follow leftward swipes — rightward gestures are reserved
    // for the iOS back-swipe at the screen edge.
    setDragTo(Math.max(0, Math.min(dx, 200)));
  };
  const onTouchEnd = () => {
    if (isResumed) return;
    // Read the synchronous ref, not `drag` — see comment above.
    const committed = dragRef.current;
    if (committed >= SWIPE_COMMIT) {
      removeLine();
    } else if (committed >= SWIPE_REVEAL) {
      // Snap to the revealed position so the cashier sees the delete
      // hint and can tap to confirm rather than committing on a
      // half-swipe. A second swipe-left or tapping the red strip
      // commits.
      setDragTo(SWIPE_REVEAL);
    } else {
      setDragTo(0);
    }
    startXRef.current = null;
  };

  return (
    <div
      className="pos-cart-line"
      style={{
        position: 'relative',
        borderBottom: `1px solid ${C.border}`,
        overflow: 'hidden',
      }}
    >
      {/* Red "Delete" backdrop revealed by a left swipe. Hit target
          is the full strip so a confirming tap is forgiving. */}
      {isDragging && (
        <button
          onClick={removeLine}
          aria-label="Delete item"
          style={{
            position: 'absolute', top: 0, bottom: 0, right: 0,
            width: SWIPE_REVEAL,
            background: '#EF4444', color: '#FFFFFF',
            border: 'none', fontSize: 12, fontWeight: 800,
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          Delete
        </button>
      )}

      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          padding: '6px 10px',
          display: 'flex', flexDirection: 'column', gap: 2,
          background: C.panel,
          transform: `translateX(-${drag}px)`,
          transition: startXRef.current == null ? 'transform 0.15s ease' : 'none',
        }}
      >
        {/* Single-row layout:
              [−] qty [+]  name · variant · @ unit       total  📝
            Item names are usually short on this menu, so the @ unit
            hint fits inline with the title and saves a whole sub-line
            of vertical space. The explicit × delete button was dropped
            — cashiers swipe a row left to reveal the red Delete strip
            (Mail.app pattern). */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          minHeight: 32,
        }}>
          {/* Qty stepper — left side, compact 26×26 buttons. */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 2,
            flexShrink: 0,
          }}>
            <button
              aria-label="Decrease quantity"
              className="pos-qty-btn"
              disabled={isResumed}
              title={isResumed ? 'Cancel resume to edit items' : undefined}
              onClick={() =>
                setCartItems(
                  cartItems
                    .map((ci) =>
                      makeCartKey(ci.id, ci.modifiers, ci.variant_id, ci.notes, ci.packaging_option_id) === itemKey
                        ? { ...ci, quantity: ci.quantity - 1 }
                        : ci,
                    )
                    .filter((ci) => ci.quantity > 0),
                )
              }
              style={qtyBtnStyle(isResumed)}
            >−</button>
            <span style={{
              minWidth: 18, textAlign: 'center',
              fontSize: 13, fontWeight: 700, color: C.text,
              fontVariantNumeric: 'tabular-nums',
            }}>
              {item.quantity}
            </span>
            <button
              aria-label="Increase quantity"
              className="pos-qty-btn"
              disabled={isResumed}
              title={isResumed ? 'Cancel resume to edit items' : undefined}
              onClick={() =>
                setCartItems(
                  cartItems.map((ci) =>
                    makeCartKey(ci.id, ci.modifiers, ci.variant_id, ci.notes, ci.packaging_option_id) === itemKey
                      ? { ...ci, quantity: ci.quantity + 1 }
                      : ci,
                  ),
                )
              }
              style={qtyBtnStyle(isResumed)}
            >+</button>
          </div>

          {/* Name · variant · @ unit price — all inline with ellipsis,
              so long names truncate cleanly instead of pushing the
              line total off the screen on narrow tablet portrait.
              Variant + @ unit are rendered in a smaller, muted font
              so the cashier's eye lands on the name first; the unit
              price still reads as "metadata" the way the variant does.
              We show @ unit whenever the item carries a variant or
              modifiers (price isn't obvious from the name alone) OR
              the qty is > 1 (where unit ≠ total). Plain single-qty
              items skip it since "total" and "unit" are the same. */}
          {(() => {
            const showUnit =
              item.quantity > 1 ||
              !!item.variant_name ||
              item.modifiers.length > 0;
            return (
              <div style={{
                flex: 1, minWidth: 0, color: C.text, lineHeight: 1.2,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{item.name}</span>
                {item.is_catering && (
                  <span style={{
                    marginLeft: 6, fontSize: 9, fontWeight: 800, letterSpacing: '0.04em',
                    textTransform: 'uppercase', color: '#64748B', background: '#F1F5F9',
                    border: '1px solid #E2E8F0', borderRadius: 3, padding: '1px 4px',
                    verticalAlign: 'middle',
                  }}>
                    Catering
                  </span>
                )}
                {item.variant_name && (
                  <span style={{
                    fontSize: 11, color: C.muted, fontWeight: 500,
                  }}>
                    {' '}· {item.variant_name}
                  </span>
                )}
                {item.packaging_option_name && (
                  <span style={{
                    fontSize: 11, color: C.muted, fontWeight: 500,
                  }}>
                    {' '}· {item.packaging_option_name}
                    {Number(item.packaging_fee ?? 0) > 0
                      ? ` +${Number(item.packaging_fee).toFixed(2)}`
                      : ''}
                  </span>
                )}
                {showUnit && (
                  <span style={{
                    fontSize: 11, color: C.subtle, fontWeight: 500,
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {' '}· @ {unitPrice.toFixed(2)}
                  </span>
                )}
              </div>
            );
          })()}

          {/* Line total — right-aligned, tabular figures so columns
              line up vertically even at different quantities. */}
          <div style={{
            fontSize: 13, fontWeight: 700, color: C.text,
            whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
            flexShrink: 0,
          }}>
            {lineTotal.toFixed(2)}
          </div>

          {/* Note chip — tiny icon-only when no notes attached, becomes
              a coloured pill with the count when notes exist. Hidden
              entirely when the owner hasn't curated any quick-note
              chips so the row stays even tighter for the common case. */}
          {quickNotes.length > 0 && (
            <button
              type="button"
              className="pos-line-action-btn"
              aria-label={notes.length > 0 ? `Edit notes (${notes.length})` : 'Add a note'}
              disabled={isResumed}
              title={isResumed ? 'Cancel resume to edit items' : 'Add kitchen note'}
              onClick={() => onOpenNotePicker?.(itemKey)}
              style={{
                width: 26, height: 26, borderRadius: 999,
                border: `1px solid ${notes.length > 0 ? '#FBD9B8' : 'transparent'}`,
                background: notes.length > 0 ? '#FEF3E8' : 'transparent',
                color: notes.length > 0 ? C.primaryDark : C.subtle,
                fontSize: 12,
                cursor: isResumed ? 'not-allowed' : 'pointer',
                opacity: isResumed ? 0.4 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
                position: 'relative',
              }}
            >
              📝
              {notes.length > 0 && (
                <span style={{
                  position: 'absolute', top: -3, right: -3,
                  background: C.primary, color: '#fff',
                  fontSize: 9, fontWeight: 800,
                  width: 14, height: 14, borderRadius: 999,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '1.5px solid #fff',
                }}>
                  {notes.length}
                </span>
              )}
            </button>
          )}
        </div>

        {/* Optional second line — only renders for modifier and note
            metadata that wouldn't fit cleanly inline. Indented under
            the qty stepper so the column visually lines up with the
            name above. Unit price is no longer here (it lives inline
            in the title for qty > 1). */}
        {(item.modifiers.length > 0 || notes.length > 0) && (
          <div style={{
            paddingLeft: 70,  // qty stepper + gap width, aligned with name
            display: 'flex', flexWrap: 'wrap', alignItems: 'center',
            gap: 6, fontSize: 10, color: C.subtle, lineHeight: 1.2,
          }}>
            {item.modifiers.length > 0 && (
              <span style={{ color: C.muted }}>
                + {item.modifiers.map((m) => m.name).join(', ')}
              </span>
            )}
            {notes.length > 0 && notes.map((n) => (
              <span
                key={n}
                style={{
                  padding: '0 6px',
                  borderRadius: 999,
                  background: '#FEF3E8',
                  color: C.primaryDark,
                  border: '1px solid #FBD9B8',
                  fontWeight: 700,
                }}
              >
                {n}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TableFloorActions({
  tables,
  selectedTableId,
  ourOrderId,
  onOpenTable,
  onCloseTable,
  onMergeTables,
  onRefreshTables,
}: {
  tables: RestaurantTable[];
  selectedTableId: number;
  ourOrderId?: number | null;
  onOpenTable?: (id: number) => Promise<void>;
  onCloseTable?: (id: number) => Promise<void>;
  onMergeTables?: (sourceId: number, targetId: number) => Promise<void>;
  onRefreshTables?: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [mergeTargetId, setMergeTargetId] = useState<number | "">("");
  const selected = tables.find((t) => t.id === selectedTableId);
  const selectedInUse = selected ? tableIsInUse(selected) : false;
  const mergeTargets = tables.filter((t) => t.id !== selectedTableId && tableIsInUse(t));

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr("");
    try {
      await fn();
      await onRefreshTables?.();
    } catch (e) {
      setErr((e as Error).message || "Table action failed.");
    } finally {
      setBusy(false);
    }
  };

  if (!selected) return null;

  return (
    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: selectedInUse ? "#B45309" : "#15803d" }}>
        {formatTableOption(selected, { ourOrderId })}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {!selectedInUse && onOpenTable && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => onOpenTable(selected.id))}
            style={{ ...smallBtn(busy), flex: "none", color: "#15803d", borderColor: "#BBF7D0" }}
          >
            Open check
          </button>
        )}
        {selectedInUse && onCloseTable && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => onCloseTable(selected.id))}
            style={{ ...smallBtn(busy), flex: "none" }}
          >
            Close table
          </button>
        )}
      </div>
      {selectedInUse && onMergeTables && mergeTargets.length > 0 && (
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <select
            value={mergeTargetId}
            onChange={(e) => setMergeTargetId(e.target.value ? Number(e.target.value) : "")}
            style={{
              flex: 1, padding: "8px 10px", borderRadius: 8,
              border: `1px solid ${C.border2}`, fontSize: 12, background: "#fff",
            }}
          >
            <option value="">Merge into…</option>
            {mergeTargets.map((t) => (
              <option key={t.id} value={t.id}>{formatTableOption(t)}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy || mergeTargetId === ""}
            onClick={() => {
              if (mergeTargetId === "") return;
              void run(() => onMergeTables(selected.id, mergeTargetId));
            }}
            style={{ ...smallBtn(busy || mergeTargetId === ""), flex: "none" }}
          >
            Merge
          </button>
        </div>
      )}
      {err && <div style={{ fontSize: 11, color: "#B91C1C" }}>{err}</div>}
    </div>
  );
}

function qtyBtnStyle(isResumed: boolean): React.CSSProperties {
  return {
    width: 26, height: 26, borderRadius: 6,
    background: C.bg, border: `1px solid ${C.border}`,
    fontSize: 15, lineHeight: 1, color: C.text,
    cursor: isResumed ? 'not-allowed' : 'pointer',
    opacity: isResumed ? 0.4 : 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 0,
    flexShrink: 0,
  };
}

function Row({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      fontSize: 12, color: accent ?? C.muted,
      letterSpacing: '0.01em',
    }}>
      <span style={{ fontWeight: 500 }}>{label}</span>
      <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}

function smallBtn(disabled: boolean): React.CSSProperties {
  return {
    flex: 1, padding: '8px 10px', borderRadius: 8,
    background: '#FFFFFF', border: `1px solid ${C.border2}`,
    fontSize: 12, fontWeight: 600, color: C.muted, cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  };
}
