import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Item, Modifier } from '../api';

export type CartEntry = {
  item: Item;
  quantity: number;
  modifiers: Modifier[];
};

interface CartContextValue {
  cart: CartEntry[];
  cartTotal: number;
  addItem: (item: Item, quantity: number, modifiers?: Modifier[]) => void;
  updateQuantity: (index: number, quantity: number) => void;
  clearCart: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

function loadCart(): CartEntry[] {
  try {
    const raw = localStorage.getItem('bakegrill_cart');
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<{
      id: number;
      name: string;
      price: number;
      quantity: number;
      modifiers?: Array<{ id: number; name: string; price: number }>;
    }>;
    return parsed.map((entry) => ({
      item: { id: entry.id, name: entry.name, base_price: entry.price, category_id: 0 } as Item,
      quantity: entry.quantity || 1,
      modifiers: (entry.modifiers ?? []).map(
        (m) => ({ id: m.id, name: m.name, price: m.price }) as Modifier,
      ),
    }));
  } catch {
    return [];
  }
}

function saveCart(cart: CartEntry[]): void {
  const serialized = cart.map((e) => ({
    id: e.item.id,
    name: e.item.name,
    price: e.item.base_price,
    quantity: e.quantity,
    modifiers: e.modifiers.map((m) => ({ id: m.id, name: m.name, price: m.price })),
  }));
  localStorage.setItem('bakegrill_cart', JSON.stringify(serialized));
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartEntry[]>(loadCart);

  useEffect(() => { saveCart(cart); }, [cart]);

  const addItem = useCallback((item: Item, quantity: number, modifiers: Modifier[] = []) => {
    if (quantity < 1) return;
    setCart((prev) => {
      const key = modifiers.map((m) => m.id).join(',');
      const idx = prev.findIndex(
        (e) => e.item.id === item.id && e.modifiers.map((m) => m.id).join(',') === key,
      );
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + quantity };
        return next;
      }
      return [...prev, { item, quantity, modifiers }];
    });
  }, []);

  const updateQuantity = useCallback((index: number, quantity: number) => {
    setCart((prev) => {
      if (quantity <= 0) return prev.filter((_, i) => i !== index);
      const next = [...prev];
      next[index] = { ...next[index], quantity };
      return next;
    });
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  const cartTotal = useMemo(
    () =>
      cart.reduce((total, e) => {
        const modsTotal = e.modifiers.reduce((s, m) => s + parseFloat(String(m.price)), 0);
        return total + (parseFloat(String(e.item.base_price)) + modsTotal) * e.quantity;
      }, 0),
    [cart],
  );

  return (
    <CartContext.Provider value={{ cart, cartTotal, addItem, updateQuantity, clearCart }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
