import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Item, Modifier } from '../api';
import type { Variant } from '@shared/types';

export type CartEntry = {
  item: Item;
  quantity: number;
  modifiers: Modifier[];
  variantId?: number | null;
  variantName?: string | null;
  /** Price snapshot captured at add-time (variant or item effective price). */
  variantPrice?: number | null;
  /** Original catalog price before special, for strikethrough display. */
  originalPrice?: number | null;
};

interface CartContextValue {
  cart: CartEntry[];
  cartTotal: number;
  addItem: (item: Item, quantity: number, modifiers?: Modifier[], variant?: Variant | null) => void;
  updateQuantity: (index: number, quantity: number) => void;
  clearCart: () => void;
  pruneCartToAllowedItemIds: (allowedIds: Set<number>) => void;
  refreshPricesFromMenu: (items: Item[]) => void;
}

const CART_VERSION = 4;
const CART_KEY = 'bakegrill_cart';

type StoredCart = {
  version: number;
  entries: Array<{
    item: Item;
    quantity: number;
    modifiers: Modifier[];
    variantId?: number | null;
    variantName?: string | null;
    variantPrice?: number | null;
    originalPrice?: number | null;
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
      variantId: e.variantId ?? null,
      variantName: e.variantName ?? null,
      variantPrice: e.variantPrice ?? null,
      originalPrice: e.originalPrice ?? null,
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
      variantId: e.variantId ?? null,
      variantName: e.variantName ?? null,
      variantPrice: e.variantPrice ?? null,
      originalPrice: e.originalPrice ?? null,
    })),
  };
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(stored));
  } catch {
    // QuotaExceededError or Safari private mode — cart stays in memory only
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartEntry[]>(loadCart);

  useEffect(() => { saveCart(cart); }, [cart]);

  // Clear in-memory cart when payment redirects away and removes it from localStorage
  useEffect(() => {
    const handler = () => setCart([]);
    window.addEventListener('cart_cleared', handler);
    return () => window.removeEventListener('cart_cleared', handler);
  }, []);

  const addItem = useCallback((item: Item, quantity: number, modifiers: Modifier[] = [], variant?: Variant | null) => {
    if (quantity < 1) return;
    setCart((prev) => {
      const modKey = [...modifiers].sort((a, b) => a.id - b.id).map((m) => m.id).join(',');
      const variantId = variant?.id ?? null;

      const idx = prev.findIndex(
        (e) =>
          e.item.id === item.id &&
          (e.variantId ?? null) === variantId &&
          [...e.modifiers].sort((a, b) => a.id - b.id).map((m) => m.id).join(',') === modKey,
      );

      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + quantity };
        return next;
      }

      const unitPrice = variant
        ? Number(variant.effective_price ?? variant.price)
        : Number(item.special?.effective_price ?? item.base_price);
      const originalPrice = variant
        ? (variant.effective_price != null && variant.original_price != null ? Number(variant.original_price) : null)
        : (item.special?.original_price != null ? Number(item.special.original_price) : null);

      return [
        ...prev,
        {
          item,
          quantity,
          modifiers,
          variantId,
          variantName: variant?.name ?? null,
          variantPrice: unitPrice,
          originalPrice,
        },
      ];
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

  const pruneCartToAllowedItemIds = useCallback((allowedIds: Set<number>) => {
    setCart((prev) => prev.filter((e) => allowedIds.has(e.item.id)));
  }, []);

  const refreshPricesFromMenu = useCallback((items: Item[]) => {
    const byId = new Map(items.map((i) => [i.id, i]));
    setCart((prev) =>
      prev.map((entry) => {
        const fresh = byId.get(entry.item.id);
        if (!fresh) return entry;
        const variant = entry.variantId
          ? fresh.variants?.find((v) => v.id === entry.variantId)
          : null;
        const unitPrice = variant
          ? Number(variant.effective_price ?? variant.price)
          : Number(fresh.special?.effective_price ?? fresh.base_price);
        const originalPrice = variant
          ? (variant.effective_price != null && variant.original_price != null
            ? Number(variant.original_price)
            : null)
          : (fresh.special?.original_price != null ? Number(fresh.special.original_price) : null);
        return {
          ...entry,
          item: fresh,
          variantPrice: unitPrice,
          originalPrice,
        };
      }),
    );
  }, []);

  const cartTotal = useMemo(
    () =>
      cart.reduce((total, e) => {
        // Use variant price snapshot when available, fall back to item base_price
        const basePrice = (e.variantPrice != null ? e.variantPrice : Number(e.item.base_price)) || 0;
        const modsTotal = e.modifiers.reduce((s, m) => s + (Number(m.price) || 0), 0);
        return total + (basePrice + modsTotal) * e.quantity;
      }, 0),
    [cart],
  );

  return (
    <CartContext.Provider value={{ cart, cartTotal, addItem, updateQuantity, clearCart, pruneCartToAllowedItemIds, refreshPricesFromMenu }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
