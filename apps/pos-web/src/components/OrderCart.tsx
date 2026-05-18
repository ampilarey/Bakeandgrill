import type { CartItem, RestaurantTable } from "../types";
import type { PaymentRow } from "../hooks/useCart";
import { makeCartKey } from "../hooks/useCart";
import type { PosCustomer } from "../api";
import { CustomerPicker } from "./CustomerPicker";

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
  payments: PaymentRow[];
  discountAmount: string;
  setDiscountAmount: (v: string) => void;

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
    <aside style={{
      width: 380,
      flexShrink: 0,
      background: C.panel,
      borderRadius: 12,
      border: `1px solid ${C.border}`,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
    }}>
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
      </div>

      {/* ── Cart lines ───────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
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
          p.cartItems.map((item) => {
            const itemKey = makeCartKey(item.id, item.modifiers, item.variant_id);
            const lineTotal =
              (Number(item.price ?? 0) +
                item.modifiers.reduce((s, m) => s + Number(m.price ?? 0), 0)) *
              item.quantity;
            return (
              <div
                key={itemKey}
                style={{
                  padding: '10px 14px',
                  borderBottom: `1px solid ${C.border}`,
                  display: 'flex', flexDirection: 'column', gap: 6,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: C.text }}>{item.name}</div>
                    {item.variant_name && (
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{item.variant_name}</div>
                    )}
                    {item.modifiers.length > 0 && (
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                        + {item.modifiers.map((m) => m.name).join(", ")}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.text, whiteSpace: 'nowrap' }}>
                    MVR {lineTotal.toFixed(2)}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                      aria-label="Decrease quantity"
                      disabled={isResumed}
                      title={isResumed ? 'Cancel resume to edit items' : undefined}
                      onClick={() =>
                        p.setCartItems(
                          p.cartItems
                            .map((ci) =>
                              makeCartKey(ci.id, ci.modifiers, ci.variant_id) === itemKey
                                ? { ...ci, quantity: ci.quantity - 1 }
                                : ci,
                            )
                            .filter((ci) => ci.quantity > 0),
                        )
                      }
                      style={{
                        width: 32, height: 32, borderRadius: 8,
                        background: C.bg, border: `1px solid ${C.border}`,
                        fontSize: 18, lineHeight: 1, color: C.text,
                        cursor: isResumed ? 'not-allowed' : 'pointer',
                        opacity: isResumed ? 0.4 : 1,
                      }}
                    >−</button>
                    <span style={{ minWidth: 28, textAlign: 'center', fontSize: 14, fontWeight: 700, color: C.text }}>
                      {item.quantity}
                    </span>
                    <button
                      aria-label="Increase quantity"
                      disabled={isResumed}
                      title={isResumed ? 'Cancel resume to edit items' : undefined}
                      onClick={() =>
                        p.setCartItems(
                          p.cartItems.map((ci) =>
                            makeCartKey(ci.id, ci.modifiers, ci.variant_id) === itemKey
                              ? { ...ci, quantity: ci.quantity + 1 }
                              : ci,
                          ),
                        )
                      }
                      style={{
                        width: 32, height: 32, borderRadius: 8,
                        background: C.bg, border: `1px solid ${C.border}`,
                        fontSize: 18, lineHeight: 1, color: C.text,
                        cursor: isResumed ? 'not-allowed' : 'pointer',
                        opacity: isResumed ? 0.4 : 1,
                      }}
                    >+</button>
                  </div>
                  <div style={{ fontSize: 11, color: C.subtle }}>
                    @ MVR {Number(item.price ?? 0).toFixed(2)}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Totals + payments + actions ──────────────────────────── */}
      <div style={{ borderTop: `1px solid ${C.border}`, padding: 14, background: C.bg }}>
        {/* Subtotal / discount / tax breakdown.
            We render this whenever there's a discount OR tax (the most
            common case is GST/TGST on every item, so 99% of tickets land
            here). Without it the Charge button shows only the subtotal
            and the cashier under-collects from the customer. */}
        {p.cartItems.length > 0 && (p.discountValue > 0 || p.cartTax > 0) && (
          <>
            <Row label="Subtotal" value={`MVR ${p.cartSubtotal.toFixed(2)}`} />
            {p.discountValue > 0 && (
              <Row label="Discount" value={`− MVR ${p.discountValue.toFixed(2)}`} accent={C.primaryDark} />
            )}
            {p.cartTax > 0 && (
              <Row label="GST" value={`MVR ${p.cartTax.toFixed(2)}`} />
            )}
          </>
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

        {/* Send-bill after a successful order */}
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

        {/* BIG CHARGE button */}
        <button
          onClick={p.onCheckout}
          disabled={checkoutDisabled}
          style={{
            marginTop: 12, width: '100%',
            padding: '16px 18px', borderRadius: 10,
            background: checkoutDisabled ? C.successDisabled : C.success,
            color: '#FFFFFF', border: 'none',
            cursor: checkoutDisabled ? 'not-allowed' : 'pointer',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            transition: 'background 0.1s',
          }}
          onMouseEnter={(e) => {
            if (!checkoutDisabled) (e.currentTarget as HTMLButtonElement).style.background = C.successDark;
          }}
          onMouseLeave={(e) => {
            if (!checkoutDisabled) (e.currentTarget as HTMLButtonElement).style.background = C.success;
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '0.04em' }}>
            {p.isSubmitting ? 'PROCESSING…' : 'CHARGE'}
          </span>
          <span style={{ fontSize: 18, fontWeight: 800 }}>
            MVR {p.cartTotal.toFixed(2)}
          </span>
        </button>
      </div>
    </aside>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      fontSize: 12, color: accent ?? C.muted, marginTop: 2,
    }}>
      <span>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
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
