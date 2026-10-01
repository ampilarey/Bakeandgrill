import type { CartPriceChange } from '../context/CartContext';
import { toMVR } from './money';

/**
 * The toast shown when a cart re-priced from the menu has moved (pricing
 * audit, 2026-10-01). One line names the dish and both prices; several just
 * count them, since a toast is no place for a list.
 */
export function cartPriceChangeMessage(
  changes: CartPriceChange[],
  t: (key: string) => string,
): string | null {
  if (changes.length === 0) return null;
  if (changes.length === 1) {
    const [c] = changes;
    return t('cart.toast_price_changed_one')
      .replace('{name}', c.name)
      .replace('{was}', toMVR(c.was))
      .replace('{now}', toMVR(c.now));
  }
  return t('cart.toast_price_changed_many').replace('{n}', String(changes.length));
}
