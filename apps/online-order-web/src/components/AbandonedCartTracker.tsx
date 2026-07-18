import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { snapshotCustomerCart } from '../api/promotions';

/**
 * Best-effort abandoned-cart snapshot for signed-in customers browsing
 * the menu/cart — not only checkout. Debounced so rapid add/remove
 * doesn't spam the API.
 */
export function AbandonedCartTracker() {
  const { isAuthenticated, authReady } = useAuth();
  const { cart, cartTotal } = useCart();

  useEffect(() => {
    if (!authReady || !isAuthenticated || cart.length === 0) return;

    const timer = window.setTimeout(() => {
      const subtotalLaar = Math.round(cartTotal * 100);
      void snapshotCustomerCart({
        items: cart.map((entry) => {
          const unit =
            entry.variantPrice != null
              ? Number(entry.variantPrice)
              : Number(entry.item.base_price);
          const mods = entry.modifiers.reduce((s, m) => s + (Number(m.price) || 0), 0);
          return {
            id: entry.item.id,
            name: entry.variantName
              ? `${entry.item.name} (${entry.variantName})`
              : entry.item.name,
            quantity: entry.quantity,
            price: unit + mods,
          };
        }),
        subtotal_laar: subtotalLaar,
      }).catch(() => { /* best-effort */ });
    }, 2000);

    return () => window.clearTimeout(timer);
  }, [authReady, isAuthenticated, cart, cartTotal]);

  return null;
}
