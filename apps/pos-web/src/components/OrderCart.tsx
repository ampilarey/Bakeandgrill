import type { CartItem } from "../types";
import type { PaymentRow } from "../hooks/useCart";
import { makeCartKey } from "../hooks/useCart";

type Props = {
  cartItems: CartItem[];
  setCartItems: (items: CartItem[]) => void;
  cartTotal: number;
  payments: PaymentRow[];
  setPayments: (rows: PaymentRow[]) => void;
  discountAmount: string;
  setDiscountAmount: (v: string) => void;
  lastHeldOrderId: number | null;
  onAddPaymentRow: () => void;
  onUpdatePaymentRow: (id: string, changes: Partial<PaymentRow>) => void;
  onRemovePaymentRow: (id: string) => void;
  onHoldOrder: () => void;
  onResumeLastHold: () => void;
  onCheckout: () => void;
};

export function OrderCart({
  cartItems, setCartItems, cartTotal, payments, setPayments,
  discountAmount, setDiscountAmount, lastHeldOrderId,
  onAddPaymentRow, onUpdatePaymentRow, onRemovePaymentRow,
  onHoldOrder, onResumeLastHold, onCheckout,
}: Props) {
  const clearAll = () => {
    setCartItems([]);
    setPayments([{ id: crypto.randomUUID(), method: "cash", amount: "" }]);
  };

  return (
    <section className="col-span-3">
      <div className="bg-white rounded-xl p-4 shadow-sm h-full flex flex-col">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-700">Cart</p>
          <button className="text-xs text-slate-500 hover:text-slate-800" onClick={clearAll}>
            Clear
          </button>
        </div>

        <div className="mt-4 flex-1 space-y-3 overflow-auto">
          {cartItems.length === 0 && (
            <p className="text-sm text-slate-400">No items yet.</p>
          )}
          {cartItems.map((item) => {
            const itemKey = makeCartKey(item.id, item.modifiers);
            return (
              <div key={itemKey}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{item.name}</p>
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
                      className="h-7 w-7 rounded-full border border-slate-200"
                      onClick={() =>
                        setCartItems(
                          cartItems
                            .map((ci) =>
                              makeCartKey(ci.id, ci.modifiers) === itemKey
                                ? { ...ci, quantity: ci.quantity - 1 }
                                : ci,
                            )
                            .filter((ci) => ci.quantity > 0),
                        )
                      }
                    >
                      -
                    </button>
                    <span className="text-sm">{item.quantity}</span>
                    <button
                      className="h-7 w-7 rounded-full border border-slate-200"
                      onClick={() =>
                        setCartItems(
                          cartItems.map((ci) =>
                            makeCartKey(ci.id, ci.modifiers) === itemKey
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
                  className="rounded-md border border-slate-200 px-2 py-1 text-xs"
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
                  className="flex-1 rounded-md border border-slate-200 px-2 py-1 text-xs"
                  placeholder="Amount"
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
              className="w-20 rounded-md border border-slate-200 px-2 py-1 text-sm text-right"
              placeholder="0"
              value={discountAmount}
              onChange={(e) => setDiscountAmount(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between mt-3">
            <span className="text-sm text-slate-500">Total</span>
            <span className="text-lg font-semibold">MVR {cartTotal.toFixed(2)}</span>
          </div>

          {lastHeldOrderId && (
            <div className="mt-2 text-xs text-slate-500">Last held order: {lastHeldOrderId}</div>
          )}

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              className="rounded-lg border border-slate-200 py-2 text-sm font-semibold text-slate-600"
              onClick={onHoldOrder}
            >
              Hold
            </button>
            <button
              className="rounded-lg border border-slate-200 py-2 text-sm font-semibold text-slate-600"
              onClick={onResumeLastHold}
            >
              Resume
            </button>
          </div>

          <button
            className="w-full mt-3 rounded-lg bg-emerald-600 text-white py-2 font-semibold"
            onClick={onCheckout}
          >
            Checkout
          </button>
        </div>
      </div>
    </section>
  );
}
