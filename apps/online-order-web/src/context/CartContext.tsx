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

const CART_VERSION = 2;
const CART_KEY = 'bakegrill_cart';

type StoredCart = {
  version: number;
  entries: Array<{
    item: Item;
    quantity: number;
    modifiers: Modifier[];
  }>;
};

const CartContext = createContext<CartContextValue | null>(null);

function loadCart(): CartEntry[] {
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredCart;
    if (!parsed.version || parsed.version !== CART_VERSION) {
      // Version mismatch — discard stale data to avoid type errors
      localStorage.removeItem(CART_KEY);
      return [];
    }
    return (parsed.entries ?? []).map((e) => ({
      item: e.item,
      quantity: e.quantity || 1,
      modifiers: e.modifiers ?? [],
    }));
  } catch {
    return [];
  }
}

function saveCart(cart: CartEntry[]): void {
  const stored: StoredCart = {
    version: CART_VERSION,
    entries: cart.map((e) => ({
      item: e.item,
      quantity: e.quantity,
      modifiers: e.modifiers,
    })),
  };
  localStorage.setItem(CART_KEY, JSON.stringify(stored));
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartEntry[]>(loadCart);

  useEffect(() => { saveCart(cart); }, [cart]);

  // Clear in-memory cart when payment redirects away and removes it from localStorage
  useEffect(() => {
    const handler = () => setCart([]);
    window.addEventListener("cart_cleared", handler);
    return () => window.removeEventListener("cart_cleared", handler);
  }, []);

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
        const basePrice = Number(e.item.base_price) || 0;
        const modsTotal = e.modifiers.reduce((s, m) => s + (Number(m.price) || 0), 0);
        return total + (basePrice + modsTotal) * e.quantity;
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
