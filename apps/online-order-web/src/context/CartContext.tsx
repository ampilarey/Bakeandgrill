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
  packagingOptionId?: number | null;
  packagingOptionName?: string | null;
  packagingFee?: number | null;
  packagingFeeMode?: 'per_unit' | 'per_line' | null;
};

export type UpdateEntryInput = {
  quantity: number;
  modifiers?: Modifier[];
  variant?: Variant | null;
  packagingOptionId?: number | null;
  /** Defaults to the line's existing item. */
  item?: Item;
};

interface CartContextValue {
  cart: CartEntry[];
  cartTotal: number;
  addItem: (
    item: Item,
    quantity: number,
    modifiers?: Modifier[],
    variant?: Variant | null,
    packagingOptionId?: number | null,
  ) => void;
  updateQuantity: (index: number, quantity: number) => void;
  /**
   * Edit a cart line in place (Item sheet edit mode). Merges into an identical
   * existing line when item+variant+modifiers+packaging match another index.
   */
  updateEntry: (index: number, data: UpdateEntryInput) => void;
  clearCart: () => void;
  pruneCartToAllowedItemIds: (allowedIds: Set<number>) => void;
  refreshPricesFromMenu: (items: Item[]) => void;
}

/** Stable key for merge identity (item + variant + mods + packaging). */
export function cartLineKey(
  itemId: number,
  variantId: number | null | undefined,
  modifiers: Modifier[],
  packagingOptionId?: number | null,
): string {
  const modKey = [...modifiers].sort((a, b) => a.id - b.id).map((m) => m.id).join(',');
  return `${itemId}|${variantId ?? ''}|${modKey}|p${packagingOptionId ?? 0}`;
}

function priceSnapshot(item: Item, variant?: Variant | null) {
  const unitPrice = variant
    ? Number(variant.effective_price ?? variant.price)
    : Number(item.special?.effective_price ?? item.base_price);
  const originalPrice = variant
    ? (variant.effective_price != null && variant.original_price != null
      ? Number(variant.original_price)
      : null)
    : (item.special?.original_price != null ? Number(item.special.original_price) : null);
  return { unitPrice, originalPrice };
}

function packagingSnapshot(item: Item, packagingOptionId?: number | null) {
  const mode = item.packaging_fee_mode === 'per_line' ? 'per_line' as const : 'per_unit' as const;
  const options = item.packaging_options ?? [];
  let opt = packagingOptionId != null
    ? options.find((o) => o.id === packagingOptionId)
    : undefined;
  if (!opt && options.length > 0) {
    opt = options.find((o) => o.is_default) ?? options[0];
  }
  if (opt) {
    return {
      packagingOptionId: opt.id,
      packagingOptionName: opt.name ?? null,
      packagingFee: Math.max(0, Number(opt.fee) || 0),
      packagingFeeMode: mode,
    };
  }
  return {
    packagingOptionId: null as number | null,
    packagingOptionName: null as string | null,
    packagingFee: Math.max(0, Number(item.packaging_fee ?? 0) || 0),
    packagingFeeMode: mode,
  };
}

const CART_VERSION = 5;
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
    packagingOptionId?: number | null;
    packagingOptionName?: string | null;
    packagingFee?: number | null;
    packagingFeeMode?: 'per_unit' | 'per_line' | null;
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
    return (parsed.entries ?? []).map((e) => {
      const packaging = packagingSnapshot(e.item, e.packagingOptionId);
      return {
        item: e.item,
        quantity: e.quantity || 1,
        modifiers: e.modifiers ?? [],
        variantId: e.variantId ?? null,
        variantName: e.variantName ?? null,
        variantPrice: e.variantPrice ?? null,
        originalPrice: e.originalPrice ?? null,
        packagingOptionId: e.packagingOptionId ?? packaging.packagingOptionId,
        packagingOptionName: e.packagingOptionName ?? packaging.packagingOptionName,
        packagingFee: e.packagingFee ?? packaging.packagingFee,
        packagingFeeMode: e.packagingFeeMode ?? packaging.packagingFeeMode,
      };
    });
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
      packagingOptionId: e.packagingOptionId ?? null,
      packagingOptionName: e.packagingOptionName ?? null,
      packagingFee: e.packagingFee ?? null,
      packagingFeeMode: e.packagingFeeMode ?? null,
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

  const addItem = useCallback((
    item: Item,
    quantity: number,
    modifiers: Modifier[] = [],
    variant?: Variant | null,
    packagingOptionId?: number | null,
  ) => {
    if (quantity < 1) return;
    setCart((prev) => {
      const variantId = variant?.id ?? null;
      const packaging = packagingSnapshot(item, packagingOptionId);
      const key = cartLineKey(item.id, variantId, modifiers, packaging.packagingOptionId);
      const idx = prev.findIndex(
        (e) => cartLineKey(e.item.id, e.variantId, e.modifiers, e.packagingOptionId) === key,
      );

      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + quantity };
        return next;
      }

      const { unitPrice, originalPrice } = priceSnapshot(item, variant);

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
          ...packaging,
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

  const updateEntry = useCallback((index: number, data: UpdateEntryInput) => {
    if (data.quantity < 1) {
      setCart((prev) => prev.filter((_, i) => i !== index));
      return;
    }
    setCart((prev) => {
      if (index < 0 || index >= prev.length) return prev;
      const current = prev[index];
      const item = data.item ?? current.item;
      const modifiers = data.modifiers ?? current.modifiers;
      const variant =
        data.variant === undefined
          ? (current.variantId != null
            ? ({
                id: current.variantId,
                name: current.variantName ?? '',
                price: current.variantPrice ?? item.base_price,
                effective_price: current.variantPrice ?? item.base_price,
                original_price: current.originalPrice ?? undefined,
                is_active: true,
              } as Variant)
            : null)
          : data.variant;
      const variantId = variant?.id ?? null;
      const packaging = packagingSnapshot(
        item,
        data.packagingOptionId !== undefined
          ? data.packagingOptionId
          : current.packagingOptionId,
      );
      const { unitPrice, originalPrice } = priceSnapshot(item, variant);
      const key = cartLineKey(item.id, variantId, modifiers, packaging.packagingOptionId);

      const mergeIdx = prev.findIndex(
        (e, i) =>
          i !== index
          && cartLineKey(e.item.id, e.variantId, e.modifiers, e.packagingOptionId) === key,
      );

      const updated: CartEntry = {
        item,
        quantity: data.quantity,
        modifiers,
        variantId,
        variantName: variant?.name ?? null,
        variantPrice: unitPrice,
        originalPrice,
        ...packaging,
      };

      if (mergeIdx >= 0) {
        const next = prev.filter((_, i) => i !== index);
        const adjustedMerge = mergeIdx > index ? mergeIdx - 1 : mergeIdx;
        next[adjustedMerge] = {
          ...next[adjustedMerge],
          quantity: next[adjustedMerge].quantity + data.quantity,
          item,
          variantId,
          variantName: variant?.name ?? null,
          variantPrice: unitPrice,
          originalPrice,
          modifiers,
          ...packaging,
        };
        return next;
      }

      const next = [...prev];
      next[index] = updated;
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
        const packaging = packagingSnapshot(fresh, entry.packagingOptionId);
        return {
          ...entry,
          item: fresh,
          variantPrice: unitPrice,
          originalPrice,
          ...packaging,
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
    <CartContext.Provider value={{ cart, cartTotal, addItem, updateQuantity, updateEntry, clearCart, pruneCartToAllowedItemIds, refreshPricesFromMenu }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
