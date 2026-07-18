import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { snapshotCustomerCart, snapshotGuestCart } from '../api/promotions';
import { readGuestPhone } from '../utils/guestPhone';

/**
 * Best-effort abandoned-cart snapshot:
 * - signed-in customers always
 * - guests when a Maldives phone was entered at checkout (persisted locally)
 */
export function AbandonedCartTracker() {
  const { isAuthenticated, authReady } = useAuth();
  const { cart, cartTotal } = useCart();

  useEffect(() => {
    if (!authReady || cart.length === 0) return;

    const guestPhone = !isAuthenticated ? readGuestPhone() : '';
    if (!isAuthenticated && !guestPhone) return;

    const timer = window.setTimeout(() => {
      const subtotalLaar = Math.round(cartTotal * 100);
      const items = cart.map((entry) => {
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
      });

      const payload = { items, subtotal_laar: subtotalLaar };

      if (isAuthenticated) {
        void snapshotCustomerCart(payload).catch(() => { /* best-effort */ });
      } else {
        void snapshotGuestCart({ phone: guestPhone, ...payload }).catch(() => { /* best-effort */ });
      }
    }, 2000);

    return () => window.clearTimeout(timer);
  }, [authReady, isAuthenticated, cart, cartTotal]);

  return null;
}
