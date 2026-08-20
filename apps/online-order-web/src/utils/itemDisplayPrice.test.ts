/**
 * The MVR 0.00 bug, generalised.
 *
 * The owner caught it on the website's featured strip — "Coke MVR 0.00" while
 * the item sheet for the same product correctly said "From 15.00/-". An item
 * with sizes keeps its money on the variants and leaves base_price at 0, so
 * anything printing base_price advertises a real product as free.
 *
 * The same mistake was repeated on four more surfaces in this app (favourites,
 * the event order page, the cart's upsell panel, the item sheet's pairings)
 * and, worse, in the menu's price sort, where every sized item sorted as free
 * and "cheapest first" put all the drinks above a 5.00 bun.
 *
 * ProductCard already had the rule right; this is that rule, shared.
 */
import { describe, expect, it } from 'vitest';

import { itemDisplayPrice, itemSortPrice } from './money';

const sized = (variants: Array<Record<string, unknown>>) => ({
  base_price: 0,
  has_variants: true,
  variants,
});

describe('itemDisplayPrice', () => {
  it('shows the cheapest size for an item priced by size, never 0.00', () => {
    const coke = sized([
      { is_active: true, price: 25 },
      { is_active: true, price: 15 },
    ]);

    expect(itemDisplayPrice(coke)).toEqual({ price: 15, from: true });
  });

  it('ignores a size nobody can order', () => {
    // A retired size must not set the advertised price.
    const item = sized([
      { is_active: false, price: 5 },
      { is_active: true, price: 15 },
    ]);

    expect(itemDisplayPrice(item).price).toBe(15);
  });

  it('prefers a discounted size price over its original', () => {
    const item = sized([
      { is_active: true, price: 25, effective_price: 20 },
      { is_active: true, price: 22 },
    ]);

    expect(itemDisplayPrice(item).price).toBe(20);
  });

  it('leaves a plain item alone and does not label it From', () => {
    // One price is not a "from" price.
    expect(itemDisplayPrice({ base_price: 8.5 })).toEqual({ price: 8.5, from: false });
  });

  it('falls back to base_price when a sized item has no usable sizes', () => {
    const broken = { base_price: 12, has_variants: true, variants: [{ is_active: false, price: 5 }] };
    expect(itemDisplayPrice(broken)).toEqual({ price: 12, from: false });
  });

  it('treats a missing price as zero rather than NaN', () => {
    // NaN would render "MVR NaN", which is worse than 0.00.
    expect(itemDisplayPrice({}).price).toBe(0);
    expect(itemDisplayPrice({ base_price: null }).price).toBe(0);
  });

  it('accepts prices that arrive as strings', () => {
    // The API serialises decimals as strings on some surfaces.
    expect(itemDisplayPrice({ base_price: '8.50' }).price).toBe(8.5);
    expect(itemDisplayPrice(sized([{ is_active: true, price: '15.00' }])).price).toBe(15);
  });

  it('counts a variant with no explicit is_active as sellable', () => {
    // Some payloads omit the flag; treating that as inactive would hide the
    // only size and put the item back at 0.00.
    expect(itemDisplayPrice(sized([{ price: 15 }])).price).toBe(15);
  });
});

describe('itemSortPrice', () => {
  it('sorts a sized item by its cheapest size, not by zero', () => {
    // The reported effect: "price: low to high" led with every drink.
    const bun = { base_price: 5 };
    const coke = sized([{ is_active: true, price: 15 }, { is_active: true, price: 25 }]);
    const platter = sized([{ is_active: true, price: 120 }]);

    const order = [platter, coke, bun]
      .sort((a, b) => itemSortPrice(a) - itemSortPrice(b))
      .map(itemSortPrice);

    expect(order).toEqual([5, 15, 120]);
  });

  it('still puts a genuinely free item first', () => {
    const free = { base_price: 0 };
    const bun = { base_price: 5 };

    expect([bun, free].sort((a, b) => itemSortPrice(a) - itemSortPrice(b))[0]).toBe(free);
  });
});
