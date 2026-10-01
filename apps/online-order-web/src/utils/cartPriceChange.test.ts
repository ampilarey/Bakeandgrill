import { describe, expect, it } from 'vitest';
import { cartPriceChangeMessage } from './cartPriceChange';

const strings: Record<string, string> = {
  'cart.toast_price_changed_one': 'Price updated: {name} is now MVR {now} (was MVR {was}).',
  'cart.toast_price_changed_many': 'Prices updated on {n} items in your cart. Please check the total.',
};
const t = (key: string) => strings[key] ?? key;

describe('cartPriceChangeMessage', () => {
  it('says nothing when nothing moved', () => {
    expect(cartPriceChangeMessage([], t)).toBeNull();
  });

  it('names one dish with both prices', () => {
    expect(cartPriceChangeMessage([{ name: 'Milk tea', was: 100, now: 80 }], t))
      .toBe('Price updated: Milk tea is now MVR 80.00 (was MVR 100.00).');
  });

  it('counts several', () => {
    expect(cartPriceChangeMessage([
      { name: 'Milk tea', was: 100, now: 80 },
      { name: 'Iced tea', was: 30, now: 35 },
    ], t)).toBe('Prices updated on 2 items in your cart. Please check the total.');
  });
});
