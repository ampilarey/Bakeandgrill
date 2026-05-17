import { useCallback, useMemo, useState } from "react";
import type { CartItem, Item, Modifier } from "../types";
import type { PosCustomer } from "../api";

export type PaymentRow = {
  id: string;
  method: "cash" | "card" | "digital_wallet";
  amount: string;
};

/** First active variant, or first listed — matches server expectation when item.has_variants. */
function defaultVariantForItem(item: Item): { id: number; name: string; price: number } | null {
  if (!item.has_variants || !item.variants?.length) return null;
  const v = item.variants.find((x) => x.is_active) ?? item.variants[0];
  return {
    id: v.id,
    name: v.name,
    price: parseFloat(String(v.price ?? 0)),
  };
}

/**
 * Resolve the price that will actually be charged for an item, taking the
 * default variant into account when the item has variants. The MenuGrid
 * uses this to show the same number cashiers will see ringing up.
 */
export function effectiveItemPrice(item: Item): number {
  const v = defaultVariantForItem(item);
  if (v) return v.price;
  return parseFloat(String(item.base_price ?? 0));
}

export const makeCartKey = (itemId: number, modifiers: Modifier[], variantId?: number | null) =>
  `${itemId}-v${variantId ?? 0}-${modifiers.map((m) => m.id).sort().join(",")}`;

export function useCart() {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [selectedModifiers, setSelectedModifiers] = useState<Modifier[]>([]);
  const [discountAmount, setDiscountAmount] = useState("");
  const [payments, setPayments] = useState<PaymentRow[]>([
    { id: crypto.randomUUID(), method: "cash", amount: "" },
  ]);
  /**
   * Customer the cashier has attached to this ticket. Optional — only set
   * when the cashier types/picks a phone or name in the OrderCart's Customer
   * Picker. Drives:
   *   - `customer_id` on the order create payload (so the order is owned by
   *     that customer and surfaces in their /customer/orders history)
   *   - "Send invoice SMS" / "Send receipt SMS" buttons (disabled when no
   *     phone is attached — see OrderCart)
   *   - Auto-fire of the post-payment receipt SMS via the existing
   *     PaymentConfirmationNotifier (already does the right thing whenever
   *     order.customer_id resolves to a row with a phone).
   * Cleared by clearCart after a successful charge.
   */
  const [attachedCustomer, setAttachedCustomer] = useState<PosCustomer | null>(null);

  const cartSubtotal = useMemo(
    () =>
      cartItems.reduce(
        (sum, item) =>
          sum +
          (item.price +
            item.modifiers.reduce((ms, m) => ms + m.price, 0)) *
            item.quantity,
        0,
      ),
    [cartItems],
  );

  /** Manual discount in MVR (defensive parse — never NaN, never negative). */
  const discountValue = useMemo(() => {
    const n = parseFloat(discountAmount);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(n, cartSubtotal);
  }, [discountAmount, cartSubtotal]);

  /** Amount the customer actually owes after discount. */
  const cartTotal = useMemo(
    () => Math.max(0, cartSubtotal - discountValue),
    [cartSubtotal, discountValue],
  );

  const handleSelectItem = useCallback((item: Item) => {
    setSelectedItem(item);
    setSelectedModifiers([]);
  }, []);

  const toggleModifier = useCallback((modifier: Modifier) => {
    setSelectedModifiers((curr) => {
      const exists = curr.find((m) => m.id === modifier.id);
      return exists ? curr.filter((m) => m.id !== modifier.id) : [...curr, modifier];
    });
  }, []);

  const addToCart = useCallback((item: Item) => {
    const modifiers = selectedItem?.id === item.id ? selectedModifiers : [];
    const defVar = defaultVariantForItem(item);
    const key = makeCartKey(item.id, modifiers, defVar?.id);
    setCartItems((curr) => {
      const existing = curr.find((ci) => makeCartKey(ci.id, ci.modifiers, ci.variant_id) === key);
      if (existing) {
        return curr.map((ci) =>
          ci === existing ? { ...ci, quantity: ci.quantity + 1 } : ci,
        );
      }
      const parsedPrice = defVar ? defVar.price : parseFloat(String(item.base_price ?? 0));
      const parsedModifiers = modifiers.map((m) => ({ ...m, price: parseFloat(String(m.price ?? 0)) }));
      return [
        ...curr,
        {
          id: item.id,
          name: item.name,
          price: parsedPrice,
          quantity: 1,
          modifiers: parsedModifiers,
          variant_id: defVar?.id ?? null,
          variant_name: defVar?.name ?? null,
        },
      ];
    });
  }, [selectedItem, selectedModifiers]);

  const updateQuantity = useCallback((itemKey: string, delta: number) => {
    setCartItems((curr) =>
      curr
        .map((item) =>
          makeCartKey(item.id, item.modifiers, item.variant_id) === itemKey
            ? { ...item, quantity: item.quantity + delta }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );
  }, []);

  const clearCart = useCallback(() => {
    setCartItems([]);
    setSelectedItem(null);
    setSelectedModifiers([]);
    setDiscountAmount("");
    setPayments([{ id: crypto.randomUUID(), method: "cash", amount: "" }]);
    setAttachedCustomer(null);
  }, []);

  const addPaymentRow = useCallback(() =>
    setPayments((curr) => [...curr, { id: crypto.randomUUID(), method: "cash", amount: "" }]), []);

  const updatePaymentRow = useCallback((id: string, changes: Partial<PaymentRow>) =>
    setPayments((curr) => curr.map((p) => (p.id === id ? { ...p, ...changes } : p))), []);

  const removePaymentRow = useCallback((id: string) =>
    setPayments((curr) => curr.filter((p) => p.id !== id)), []);

  return {
    cartItems,
    setCartItems,
    selectedItem,
    setSelectedItem,
    selectedModifiers,
    discountAmount,
    setDiscountAmount,
    discountValue,
    payments,
    setPayments,
    cartSubtotal,
    cartTotal,
    handleSelectItem,
    toggleModifier,
    addToCart,
    updateQuantity,
    clearCart,
    addPaymentRow,
    updatePaymentRow,
    removePaymentRow,
    attachedCustomer,
    setAttachedCustomer,
  };
}
