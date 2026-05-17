import type { CartItem } from "../types";
import type { PaymentRow } from "../hooks/useCart";
import { makeCartKey } from "../hooks/useCart";

type Props = {
  cartItems: CartItem[];
  setCartItems: (items: CartItem[]) => void;
  cartSubtotal: number;
  cartTotal: number;
  discountValue: number;
  payments: PaymentRow[];
  setPayments: (rows: PaymentRow[]) => void;
  discountAmount: string;
  setDiscountAmount: (v: string) => void;
  lastHeldOrderId: number | null;
  isSubmitting: boolean;
  pendingPaymentForOrderId: number | null;
  onAddPaymentRow: () => void;
  onUpdatePaymentRow: (id: string, changes: Partial<PaymentRow>) => void;
  onRemovePaymentRow: (id: string) => void;
  onClearCart: () => void;
  onHoldOrder: () => void;
  onResumeLastHold: () => void;
  onCheckout: () => void;
  onRetryPayment: () => void;
};

export function OrderCart({
  cartItems, setCartItems, cartSubtotal, cartTotal, discountValue,
  payments, setPayments, discountAmount, setDiscountAmount,
  lastHeldOrderId, isSubmitting, pendingPaymentForOrderId,
  onAddPaymentRow, onUpdatePaymentRow, onRemovePaymentRow, onClearCart,
  onHoldOrder, onResumeLastHold, onCheckout, onRetryPayment,
}: Props) {
  const checkoutDisabled = cartItems.length === 0 || isSubmitting;
  void setPayments;

  return (
    <section className="col-span-3">
      <div className="bg-white rounded-xl p-4 shadow-sm h-full flex flex-col">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-700">Cart</p>
          <button className="text-xs text-slate-500 hover:text-slate-800" onClick={onClearCart}>
            Clear
          </button>
        </div>

        <div className="mt-4 flex-1 space-y-3 overflow-auto">
          {cartItems.length === 0 && (
            <p className="text-sm text-slate-400">No items yet.</p>
          )}
          {cartItems.map((item) => {
            const itemKey = makeCartKey(item.id, item.modifiers, item.variant_id);
            return (
              <div key={itemKey}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{item.name}</p>
                    {item.variant_name && (
                      <p className="text-xs text-slate-500">{item.variant_name}</p>
                    )}
                    {item.modifiers.length > 0 && (
                      <p className="text-xs text-slate-500">
                        {item.modifiers.map((m) => m.name).join(", ")}
                      </p>
                    )}
                  </div>
                  <p className="text-sm">MVR {parseFloat(String(item.price ?? 0)).toFixed(2)}</p>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-2">
                    <button
                      className="h-11 w-11 rounded-full border border-slate-200 text-lg leading-none"
                      aria-label="Decrease quantity"
                      onClick={() =>
                        setCartItems(
                          cartItems
                            .map((ci) =>
                              makeCartKey(ci.id, ci.modifiers, ci.variant_id) === itemKey
                                ? { ...ci, quantity: ci.quantity - 1 }
                                : ci,
                            )
                            .filter((ci) => ci.quantity > 0),
                        )
                      }
                    >
                      −
                    </button>
                    <span className="text-sm w-6 text-center">{item.quantity}</span>
                    <button
                      className="h-11 w-11 rounded-full border border-slate-200 text-lg leading-none"
                      aria-label="Increase quantity"
                      onClick={() =>
                        setCartItems(
                          cartItems.map((ci) =>
                            makeCartKey(ci.id, ci.modifiers, ci.variant_id) === itemKey
                              ? { ...ci, quantity: ci.quantity + 1 }
                              : ci,
                          ),
                        )
                      }
                    >
                      +
                    </button>
                  </div>
                  <p className="text-sm font-semibold">
                    MVR{" "}
                    {(
                      (parseFloat(String(item.price ?? 0)) + item.modifiers.reduce((s, m) => s + parseFloat(String(m.price ?? 0)), 0)) *
                      item.quantity
                    ).toFixed(2)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="border-t border-slate-200 pt-3 mt-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Payments</span>
            <button
              className="text-xs font-semibold text-slate-600 hover:text-slate-900"
              onClick={onAddPaymentRow}
            >
              Add split
            </button>
          </div>

          <div className="mt-2 space-y-2">
            {payments.map((payment, index) => (
              <div key={payment.id} className="flex items-center gap-2">
                <select
                  className="rounded-md border border-slate-200 px-2 py-2 text-xs"
                  value={payment.method}
                  onChange={(e) =>
                    onUpdatePaymentRow(payment.id, { method: e.target.value as PaymentRow["method"] })
                  }
                >
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="digital_wallet">Wallet</option>
                </select>
                <input
                  className="flex-1 rounded-md border border-slate-200 px-2 py-2 text-sm"
                  placeholder="Amount"
                  inputMode="decimal"
                  value={payment.amount}
                  onChange={(e) => onUpdatePaymentRow(payment.id, { amount: e.target.value })}
                />
                {index > 0 && (
                  <button
                    className="text-xs text-slate-400 hover:text-slate-700"
                    onClick={() => onRemovePaymentRow(payment.id)}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between mt-2">
            <span className="text-sm text-slate-500">Discount (MVR)</span>
            <input
              className="w-24 rounded-md border border-slate-200 px-2 py-2 text-sm text-right"
              placeholder="0"
              inputMode="decimal"
              value={discountAmount}
              onChange={(e) => setDiscountAmount(e.target.value)}
            />
          </div>

          {discountValue > 0 && (
            <div className="flex items-center justify-between mt-2 text-xs text-slate-500">
              <span>Subtotal</span>
              <span>MVR {cartSubtotal.toFixed(2)}</span>
            </div>
          )}
          {discountValue > 0 && (
            <div className="flex items-center justify-between text-xs" style={{ color: '#B86820' }}>
              <span>Discount</span>
              <span>− MVR {discountValue.toFixed(2)}</span>
            </div>
          )}

          <div className="flex items-center justify-between mt-3">
            <span className="text-sm text-slate-500">Total due</span>
            <span className="text-lg font-semibold">MVR {cartTotal.toFixed(2)}</span>
          </div>

          {lastHeldOrderId && (
            <div className="mt-2 text-xs text-slate-500">Last held order: {lastHeldOrderId}</div>
          )}

          {pendingPaymentForOrderId !== null && (
            <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Order #{pendingPaymentForOrderId} was created but payment failed.{" "}
              <button
                onClick={onRetryPayment}
                className="underline font-semibold"
                disabled={isSubmitting}
              >
                Retry payment
              </button>
            </div>
          )}

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              className="rounded-lg border border-slate-200 py-3 text-sm font-semibold text-slate-600 disabled:opacity-40"
              onClick={onHoldOrder}
              disabled={cartItems.length === 0 || isSubmitting}
            >
              Hold
            </button>
            <button
              className="rounded-lg border border-slate-200 py-3 text-sm font-semibold text-slate-600 disabled:opacity-40"
              onClick={onResumeLastHold}
              disabled={!lastHeldOrderId || isSubmitting}
            >
              Resume
            </button>
          </div>

          <button
            className="w-full mt-3 rounded-lg bg-emerald-600 text-white py-3 font-semibold disabled:bg-emerald-300 disabled:cursor-not-allowed"
            onClick={onCheckout}
            disabled={checkoutDisabled}
          >
            {isSubmitting ? "Processing…" : "Checkout"}
          </button>
        </div>
      </div>
    </section>
  );
}
