import { useRef, useState } from "react";
import type { CartItem, RestaurantTable } from "../types";
import type { PaymentRow } from "../hooks/useCart";
import { makeCartKey } from "../hooks/useCart";
import type { PosCustomer } from "../api";
import { CustomerPicker } from "./CustomerPicker";
import { CustomerRewardsPanel } from "./CustomerRewardsPanel";

type AppliedPromo = { code: string; promotionId: number | null; discount: number };
type AppliedLoyalty = { points: number; discount: number };
type AppliedGiftCard = { code: string; discount: number; cardBalance: number };

type OrderType = "Dine-in" | "Takeaway" | "Online Pickup";
const ORDER_TYPES: OrderType[] = ["Dine-in", "Takeaway", "Online Pickup"];

type Props = {
  orderType: OrderType;
  setOrderType: (t: OrderType) => void;
  tables: RestaurantTable[];
  selectedTableId: number | null;
  setSelectedTableId: (id: number | null) => void;

  cartItems: CartItem[];
  setCartItems: (items: CartItem[]) => void;
  cartSubtotal: number;
  cartTax: number;
  cartTotal: number;
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

  attachedCustomer: PosCustomer | null;
  onAttachCustomer: (c: PosCustomer) => void;
  onDetachCustomer: () => void;

  /** When non-null, the cart was restored from an existing held order
   *  and is in read-only mode (no qty +/-, no clear, no save-ticket).
   *  The cashier must Cancel Resume to drop back into a fresh cart. */
  resumedOrderId: number | null;
  onCancelResume: () => void;

  onClearCart: () => void;
  onSaveTicket: () => void;
  onOpenTickets: () => void;
  onCheckout: () => void;
  onRetryPayment: () => void;
  onOpenSendBill: () => void;

  /** Owner-curated chip list of kitchen notes (e.g. "No salt"). The
   *  cashier taps one or more per cart line. Fetched from the public
   *  site-settings endpoint. Empty array = picker not shown. */
  quickNotes: string[];
  /** Open the chip-picker modal for the given cart line key. The
   *  parent owns the modal so it can sit above the resume banner
   *  and survive cart state churn. */
  onOpenNotePicker?: (cartKey: string) => void;
};

const C = {
  panel: '#FFFFFF',
  border: '#E2E8F0',
  border2: '#CBD5E1',
  text: '#0F172A',
  muted: '#64748B',
  subtle: '#94A3B8',
  bg: '#F8FAFC',
  primary: '#D4813A',
  primaryDark: '#B86820',
  success: '#10B981',
  successDark: '#059669',
  successDisabled: '#A7F3D0',
  warn: '#F59E0B',
};

export function OrderCart(p: Props) {
  const checkoutDisabled = p.cartItems.length === 0 || p.isSubmitting;
  const dineIn = p.orderType === "Dine-in";
  const isResumed = p.resumedOrderId !== null;

  return (
    <aside
      className="pos-cart"
      style={{
        width: 380,
        flexShrink: 0,
        background: C.panel,
        borderRadius: 14,
        border: `1px solid ${C.border}`,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 2px 8px rgba(15,23,42,0.06)',
      }}
    >
      {/* ── Resumed-ticket banner (read-only mode) ────────────────── */}
      {isResumed && (
        <div style={{
          padding: '10px 14px',
          background: '#FFFBEB',
          borderBottom: `1px solid #FDE68A`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        }}>
          <div style={{ fontSize: 12, color: '#92400E', lineHeight: 1.4 }}>
            <div style={{ fontWeight: 800 }}>🎫 Resumed: Order #{p.resumedOrderId}</div>
            <div style={{ marginTop: 2 }}>Charge to settle. To edit, cancel resume.</div>
          </div>
          <button
            onClick={p.onCancelResume}
            disabled={p.isSubmitting}
            style={{
              padding: '6px 10px', borderRadius: 6,
              background: '#fff', border: '1px solid #FBBF24',
              fontSize: 11, fontWeight: 700, color: '#92400E',
              cursor: p.isSubmitting ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Cancel resume
          </button>
        </div>
      )}

      {/* ── Top: ticket header + order type pills ─────────────────── */}
      <div style={{ padding: 14, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: C.text }}>
            {isResumed ? `Order #${p.resumedOrderId}` : 'New Order'}
          </div>
          <button
            onClick={p.onClearCart}
            disabled={p.cartItems.length === 0 || isResumed}
            title={isResumed ? 'Cancel resume to edit items' : undefined}
            style={{
              fontSize: 12, fontWeight: 600, color: C.muted,
              background: 'transparent', border: 'none',
              cursor: (p.cartItems.length === 0 || isResumed) ? 'not-allowed' : 'pointer',
              opacity: (p.cartItems.length === 0 || isResumed) ? 0.4 : 1,
            }}
          >
            Clear
          </button>
        </div>

        <div style={{ display: 'flex', background: C.bg, borderRadius: 8, padding: 3, gap: 3 }}>
          {ORDER_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => p.setOrderType(t)}
              style={{
                flex: 1, padding: '8px 6px', fontSize: 12, fontWeight: 700,
                borderRadius: 6, border: 'none', cursor: 'pointer',
                background: p.orderType === t ? '#FFFFFF' : 'transparent',
                color: p.orderType === t ? C.text : C.muted,
                boxShadow: p.orderType === t ? '0 1px 2px rgba(15,23,42,0.08)' : 'none',
                transition: 'background 0.1s',
              }}
            >
              {t === "Online Pickup" ? "Pickup" : t}
            </button>
          ))}
        </div>

        {dineIn && (
          <select
            value={p.selectedTableId ?? ""}
            onChange={(e) => p.setSelectedTableId(e.target.value ? Number(e.target.value) : null)}
            style={{
              marginTop: 10, width: '100%', padding: '10px 12px',
              borderRadius: 8, border: `1px solid ${C.border2}`,
              fontSize: 13, background: '#FFFFFF', color: C.text,
            }}
          >
            <option value="">Select table</option>
            {p.tables.map((t) => (
              <option key={t.id} value={t.id}>{t.name} ({t.status})</option>
            ))}
          </select>
        )}

        <div style={{ marginTop: 10 }}>
          <CustomerPicker
            customer={p.attachedCustomer}
            onAttach={p.onAttachCustomer}
            onDetach={p.onDetachCustomer}
          />
        </div>

        {/* Customer rewards drawer — only renders when a customer is
            attached AND the cart has items. Loads the customer's loyalty
            balance + lifetime stats from the new pos-summary endpoint
            and lets the cashier stage promo / loyalty / gift card
            against the ticket. Actual server-side apply happens during
            charge, between createOrder and settleOrder. */}
        {p.attachedCustomer && p.cartItems.length > 0 && (
          <CustomerRewardsPanel
            customer={p.attachedCustomer}
            taxableSubtotal={p.cartSubtotal}
            applied={{
              promo: p.appliedPromo,
              loyalty: p.appliedLoyalty,
              giftCard: p.appliedGiftCard,
            }}
            setAppliedPromo={p.setAppliedPromo}
            setAppliedLoyalty={p.setAppliedLoyalty}
            setAppliedGiftCard={p.setAppliedGiftCard}
            readOnly={isResumed}
          />
        )}
      </div>

      {/* ── Cart lines ───────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'auto', padding: '2px 0' }}>
        {p.cartItems.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', padding: '40px 20px', color: C.subtle,
            textAlign: 'center', height: '100%',
          }}>
            <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.5 }}>🛒</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.muted }}>No items in ticket</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Tap items on the right to add</div>
          </div>
        ) : (
          p.cartItems.map((item) => (
            <CartLine
              key={makeCartKey(item.id, item.modifiers, item.variant_id, item.notes)}
              item={item}
              cartItems={p.cartItems}
              setCartItems={p.setCartItems}
              quickNotes={p.quickNotes}
              onOpenNotePicker={p.onOpenNotePicker}
              isResumed={isResumed}
            />
          ))
        )}
      </div>

      {/* ── Totals + payments + actions ──────────────────────────── */}
      <div style={{ borderTop: `1px solid ${C.border}`, padding: 14, background: C.bg }}>
        {/* Subtotal / discount / tax breakdown.
            We render this whenever there's a discount OR tax (the most
            common case is GST/TGST on every item, so 99% of tickets land
            here). Without it the Charge button shows only the subtotal
            and the cashier under-collects from the customer. */}
        {p.cartItems.length > 0 && (p.discountValue > 0 || p.cartTax > 0 || p.rewardsDiscount > 0) && (
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
                label={`Gift card · ${p.appliedGiftCard.code.slice(-6)}`}
                value={`− MVR ${p.appliedGiftCard.discount.toFixed(2)}`}
                accent={C.primaryDark}
              />
            )}
            {p.cartTax > 0 && (
              <Row label="GST" value={`MVR ${p.cartTax.toFixed(2)}`} />
            )}
          </div>
        )}

        {/* Discount — single line. inputMode="none" so iPad doesn't
            pop the soft keyboard mid-cart-edit; cashier opens a
            dedicated discount sheet via the Charge flow when they
            need a numpad. For a one-off tweak a hardware keyboard
            or paste from clipboard still works. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <label style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>Discount</label>
          <input
            value={p.discountAmount}
            onChange={(e) => p.setDiscountAmount(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            placeholder="0.00"
            inputMode="none"
            autoComplete="off"
            style={{
              flex: 1, padding: '6px 10px', borderRadius: 6,
              border: `1px solid ${C.border2}`, fontSize: 13, textAlign: 'right',
              caretColor: 'transparent',
            }}
          />
        </div>

        {/* Save ticket / Open tickets — Save is disabled in resumed
            mode because it would create a brand new held order; the
            cashier already has Cancel Resume + edit + Save flow. */}
        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          <button
            onClick={p.onSaveTicket}
            disabled={p.cartItems.length === 0 || p.isSubmitting || isResumed}
            title={isResumed ? 'Already a resumed ticket' : undefined}
            style={smallBtn(p.cartItems.length === 0 || p.isSubmitting || isResumed)}
          >
            🎫 Save ticket
          </button>
          <button
            onClick={p.onOpenTickets}
            disabled={p.isSubmitting}
            style={{ ...smallBtn(p.isSubmitting), position: 'relative' }}
          >
            Open tickets
            {p.openTicketsCount > 0 && (
              <span style={{
                marginLeft: 6, padding: '1px 8px', borderRadius: 999,
                background: '#D4813A', color: '#fff', fontSize: 11, fontWeight: 800,
              }}>{p.openTicketsCount}</span>
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
        {p.lastCreatedOrderId && p.pendingPaymentForOrderId === null && (
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

        {/* BIG CHARGE button — green keeps the "money" affordance
            (Loyverse / Toast / Square all use a colored CTA distinct
            from the brand colour for this specific action). */}
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
            MVR {p.cartTotal.toFixed(2)}
          </span>
        </button>
      </div>
    </aside>
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
}: {
  item: CartItem;
  cartItems: CartItem[];
  setCartItems: (items: CartItem[]) => void;
  quickNotes: string[];
  onOpenNotePicker?: (cartKey: string) => void;
  isResumed: boolean;
}) {
  const itemKey = makeCartKey(item.id, item.modifiers, item.variant_id, item.notes);
  const unitPrice = Number(item.price ?? 0) +
    item.modifiers.reduce((s, m) => s + Number(m.price ?? 0), 0);
  const lineTotal = unitPrice * item.quantity;
  const notes = item.notes ?? [];

  // Swipe-to-delete state. Tracks the horizontal drag offset; positive
  // = swiped left (Mail.app pattern). We only act on big swipes so
  // accidental brushes during a +/− tap don't accidentally delete.
  const [drag, setDrag] = useState(0);
  const startXRef = useRef<number | null>(null);
  const SWIPE_REVEAL = 80;       // px to reveal the delete affordance
  const SWIPE_COMMIT = 140;      // px to auto-commit on release
  const isDragging = drag > 0;

  const removeLine = () => {
    setCartItems(
      cartItems.filter(
        (ci) => makeCartKey(ci.id, ci.modifiers, ci.variant_id, ci.notes) !== itemKey,
      ),
    );
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
    setDrag(Math.max(0, Math.min(dx, 200)));
  };
  const onTouchEnd = () => {
    if (isResumed) return;
    if (drag >= SWIPE_COMMIT) {
      removeLine();
    } else if (drag >= SWIPE_REVEAL) {
      // Snap to the revealed position so the cashier sees the delete
      // hint and can tap to confirm rather than committing on a
      // half-swipe. A second swipe-left or tapping the red strip
      // commits.
      setDrag(SWIPE_REVEAL);
    } else {
      setDrag(0);
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
        {/* Single-row layout: qty stepper · name+variant · price ·
            note chip · × delete. Everything the cashier needs on one
            ~38px row so 8–10 items are visible on a 9.7" iPad without
            scrolling. Modifiers and notes wrap onto a secondary tight
            line below only when they exist. */}
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
              disabled={isResumed}
              title={isResumed ? 'Cancel resume to edit items' : undefined}
              onClick={() =>
                setCartItems(
                  cartItems
                    .map((ci) =>
                      makeCartKey(ci.id, ci.modifiers, ci.variant_id, ci.notes) === itemKey
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
              disabled={isResumed}
              title={isResumed ? 'Cancel resume to edit items' : undefined}
              onClick={() =>
                setCartItems(
                  cartItems.map((ci) =>
                    makeCartKey(ci.id, ci.modifiers, ci.variant_id, ci.notes) === itemKey
                      ? { ...ci, quantity: ci.quantity + 1 }
                      : ci,
                  ),
                )
              }
              style={qtyBtnStyle(isResumed)}
            >+</button>
          </div>

          {/* Name + variant — flex:1 with ellipsis so long names don't
              push the price off-screen on narrow tablet portrait. */}
          <div style={{
            flex: 1, minWidth: 0, fontSize: 13, color: C.text,
            lineHeight: 1.2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            <span style={{ fontWeight: 600 }}>{item.name}</span>
            {item.variant_name && (
              <span style={{ color: C.muted, fontWeight: 500 }}> · {item.variant_name}</span>
            )}
          </div>

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

          {/* × delete — last item in the row, ghost button so it
              doesn't compete visually with the qty stepper but is
              still a one-tap escape for the whole line. */}
          <button
            type="button"
            aria-label={`Remove ${item.name}`}
            disabled={isResumed}
            title={isResumed ? 'Cancel resume to edit items' : 'Remove item'}
            onClick={removeLine}
            style={{
              width: 26, height: 26, borderRadius: 999,
              background: 'transparent', border: 'none',
              color: C.subtle, fontSize: 16, lineHeight: 1,
              cursor: isResumed ? 'not-allowed' : 'pointer',
              opacity: isResumed ? 0.3 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, padding: 0,
            }}
            onMouseEnter={(e) => { if (!isResumed) e.currentTarget.style.color = '#EF4444'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = C.subtle; }}
          >×</button>
        </div>

        {/* Optional second line — only renders when there's something
            worth showing (modifiers, notes, or a useful unit-price
            hint for qty > 1). Indented under the qty stepper so the
            visual column lines up with the title above. */}
        {(item.modifiers.length > 0 || notes.length > 0 || item.quantity > 1) && (
          <div style={{
            paddingLeft: 70,  // qty stepper + gap width, aligned with name
            display: 'flex', flexWrap: 'wrap', alignItems: 'center',
            gap: 6, fontSize: 10, color: C.subtle, lineHeight: 1.2,
          }}>
            {item.quantity > 1 && (
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                @ {unitPrice.toFixed(2)}
              </span>
            )}
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
