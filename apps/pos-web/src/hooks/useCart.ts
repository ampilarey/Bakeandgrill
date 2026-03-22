import { useCallback, useMemo, useState } from "react";
import type { CartItem, Item, Modifier } from "../types";

export type PaymentRow = {
  id: string;
  method: "cash" | "card" | "digital_wallet";
  amount: string;
};

export const makeCartKey = (itemId: number, modifiers: Modifier[]) =>
  `${itemId}-${modifiers.map((m) => m.id).sort().join(",")}`;

export function useCart() {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [selectedModifiers, setSelectedModifiers] = useState<Modifier[]>([]);
  const [discountAmount, setDiscountAmount] = useState("");
  const [payments, setPayments] = useState<PaymentRow[]>([
    { id: crypto.randomUUID(), method: "cash", amount: "" },
  ]);

  const cartTotal = useMemo(
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
    const key = makeCartKey(item.id, modifiers);
    setCartItems((curr) => {
      const existing = curr.find((ci) => makeCartKey(ci.id, ci.modifiers) === key);
      if (existing) {
        return curr.map((ci) =>
          ci === existing ? { ...ci, quantity: ci.quantity + 1 } : ci,
        );
      }
      const parsedPrice = parseFloat(String(item.base_price ?? 0));
      const parsedModifiers = modifiers.map((m) => ({ ...m, price: parseFloat(String(m.price ?? 0)) }));
      return [...curr, { id: item.id, name: item.name, price: parsedPrice, quantity: 1, modifiers: parsedModifiers }];
    });
  }, [selectedItem, selectedModifiers]);

  const updateQuantity = useCallback((itemKey: string, delta: number) => {
    setCartItems((curr) =>
      curr
        .map((item) =>
          makeCartKey(item.id, item.modifiers) === itemKey
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
    payments,
    setPayments,
    cartTotal,
    handleSelectItem,
    toggleModifier,
    addToCart,
    updateQuantity,
    clearCart,
    addPaymentRow,
    updatePaymentRow,
    removePaymentRow,
  };
}
