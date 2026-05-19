import { useEffect, useRef, useState } from "react";
import type { CartItem, RestaurantTable } from "../types";
import type { PaymentRow } from "../hooks/useCart";
import { makeCartKey } from "../hooks/useCart";
import type { PosCustomer } from "../api";
import { CustomerPicker } from "./CustomerPicker";
import { CustomerRewardsPanel } from "./CustomerRewardsPanel";
import { palette } from "../theme";

type AppliedPromo = { code: string; promotionId: number | null; discount: number };
type AppliedLoyalty = { points: number; discount: number };
type AppliedGiftCard = { code: string; discount: number; cardBalance: number };

type OrderType = "Dine-in" | "Takeaway" | "Pickup";
const ORDER_TYPES: OrderType[] = ["Dine-in", "Takeaway", "Pickup"];

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
  /** Original status of the resumed order ("held" / "pending" /
   *  "in_progress" / "ready"). Drives banner copy + decides whether
   *  Cancel Resume should re-hold the ticket. */
  resumedFromStatus?: string | null;
  /** True when the cashier opened the resumed ticket via "Edit" (vs.
   *  via a direct Charge action). Unlocks cart mutations and surfaces
   *  the "💾 Save changes" button. */
  isEditingActive?: boolean;
  /** Cashier flipped from read-only resumed mode into edit mode (e.g.
   *  tapped "Edit items" on the resume banner). */
  onUnlockEdit?: () => void;
  /** Push the edited cart back to the server (PATCH /orders/{id}/items). */
  onSaveActiveChanges?: () => void;
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
  const checkoutDisabled = p.cartItems.length === 0 || p.isSubmitting;
  const dineIn = p.orderType === "Dine-in";
  const isResumed = p.resumedOrderId !== null;
  // When the cashier opened a ticket via "Edit" we relax the resumed
  // read-only restrictions so qty +/-, kitchen notes, and Clear all
  // become usable again. The Save Changes button at the bottom
  // pushes the edits back to the server.
  const editing = isResumed && !!p.isEditingActive;
  // "Lock cart for read-only" — only applies to charge-only resumes.
  // (Save Ticket is still disabled while resumed because re-holding
  // an in-flight ticket is what Cancel Resume does.)
  const lockedReadOnly = isResumed && !editing;
  const wasHeld = p.resumedFromStatus === "held";

  // ── Two-tap confirm for the "Clear" button ────────────────────
  // One tap on Clear used to wipe the entire cart instantly — 10+
  // items, attached customer, rewards, discount, the lot. The
  // button sits in the top-right corner exactly where thumbs rest
  // on an iPad in portrait so accidental taps were common during
  // a busy ring-up. Now first tap arms ("Tap again to clear"),
  // second tap inside 2s actually clears.
  const [clearArmed, setClearArmed] = useState(false);
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
      p.onClearCart();
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
        makeCartKey(ci.id, ci.modifiers, ci.variant_id, ci.notes) ===
        makeCartKey(removed.id, removed.modifiers, removed.variant_id, removed.notes),
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
    <aside
      className="pos-cart"
      aria-label="Order cart"
      style={{
        // Bug-020: bumped from 380 → 420 so 16-char item names
        // and modifier rows stop wrapping awkwardly on iPad Mini
        // landscape (1133px viewport). Index.css narrows this
        // down on portrait & smaller phones.
        width: 420,
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
      {/* ── Resumed-ticket banner ─────────────────────────────────
            Two modes:
              editing=true  → cart unlocked, "💾 Save changes" + "Cancel"
              editing=false → read-only banner, "✏️ Edit items" + "Cancel"
            Copy adapts to whether the ticket came from `held` (parked)
            or a live status (cooking/ready), since Cancel behaves
            differently for each (re-hold vs. drop-local). */}
      {isResumed && (
        <div style={{
          padding: '10px 14px',
          background: editing ? '#EFF6FF' : '#FFFBEB',
          borderBottom: `1px solid ${editing ? '#BFDBFE' : '#FDE68A'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          flexWrap: 'wrap',
        }}>
          <div style={{ fontSize: 12, color: editing ? '#1E3A8A' : '#92400E', lineHeight: 1.4, minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 800 }}>
              {editing ? '✏️ Editing' : '🎫 Resumed'}: Order #{p.resumedOrderId}
            </div>
            <div style={{ marginTop: 2 }}>
              {editing
                ? 'Add or remove items, then Save changes. Kitchen chit will reprint.'
                : wasHeld
                  ? 'Charge to settle, or Edit to add/remove items.'
                  : 'Charge to take payment, or Edit to modify the ticket.'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {!editing && p.onUnlockEdit && (
              <button
                onClick={p.onUnlockEdit}
                disabled={p.isSubmitting}
                style={{
                  padding: '6px 10px', borderRadius: 6,
                  background: '#fff', border: '1px solid #FBBF24',
                  fontSize: 11, fontWeight: 700, color: '#92400E',
                  cursor: p.isSubmitting ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                ✏️ Edit items
              </button>
            )}
            {editing && p.onSaveActiveChanges && (
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
                💾 Save changes
              </button>
            )}
            <button
              onClick={p.onCancelResume}
              disabled={p.isSubmitting}
              style={{
                padding: '6px 10px', borderRadius: 6,
                background: '#fff', border: `1px solid ${editing ? '#93C5FD' : '#FBBF24'}`,
                fontSize: 11, fontWeight: 700, color: editing ? '#1E40AF' : '#92400E',
                cursor: p.isSubmitting ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Top: ticket header + order type pills ─────────────────── */}
      <div style={{ padding: 14, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: C.text }}>
            {isResumed ? `Order #${p.resumedOrderId}` : 'New Order'}
          </div>
          <button
            onClick={handleClearTap}
            disabled={p.cartItems.length === 0 || lockedReadOnly}
            title={lockedReadOnly ? 'Tap "Edit items" on the resume banner to make changes' : undefined}
            style={{
              fontSize: 12, fontWeight: clearArmed ? 800 : 600,
              color: clearArmed ? '#fff' : C.muted,
              background: clearArmed ? '#B91C1C' : 'transparent',
              border: 'none',
              padding: clearArmed ? '4px 10px' : 0,
              borderRadius: clearArmed ? 999 : 0,
              cursor: (p.cartItems.length === 0 || lockedReadOnly) ? 'not-allowed' : 'pointer',
              opacity: (p.cartItems.length === 0 || lockedReadOnly) ? 0.4 : 1,
            }}
          >
            {clearArmed ? 'Tap again to clear' : 'Clear'}
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
              {t}
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
            readOnly={lockedReadOnly}
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
              isResumed={lockedReadOnly}
              onLineRemoved={handleLineRemoved}
            />
          ))
        )}
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

        {/* Discount — single line. Bug-025: was inputMode="none" with
            an invisible caret, so on iPad cashiers couldn't enter a
            discount without a hardware keyboard (the "discount sheet
            in the Charge flow" the old comment referred to never
            materialised). Switched to inputMode="decimal" so iOS
            pops its numpad on focus, matching every other numeric
            field in the cart sidebar. */}
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
  const itemKey = makeCartKey(item.id, item.modifiers, item.variant_id, item.notes);
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
        (ci) => makeCartKey(ci.id, ci.modifiers, ci.variant_id, ci.notes) !== itemKey,
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
                {item.variant_name && (
                  <span style={{
                    fontSize: 11, color: C.muted, fontWeight: 500,
                  }}>
                    {' '}· {item.variant_name}
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
