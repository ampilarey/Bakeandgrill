/** Convert laar (integer cents) to MVR decimal string, e.g. 1250 → "12.50" */
export function laarToMvr(laar: number): string {
  return Number.isFinite(laar) ? (laar / 100).toFixed(2) : '0.00';
}

/** Menu / offers card price: "12.50/-" (no MVR prefix). */
export function formatCardPrice(n: number): string {
  return `${Number(n).toFixed(2)}/-`;
}

/**
 * Savings chip for discounted unit prices — prefer "X% OFF", else "Save N/-".
 * Presentation only; callers pass already-computed original vs sale.
 */
export function formatSavingsLabel(original: number, sale: number): string | null {
  if (!(original > sale) || !(original > 0) || !Number.isFinite(original) || !Number.isFinite(sale)) {
    return null;
  }
  const pct = Math.round((1 - sale / original) * 100);
  if (pct >= 1) return `${pct}% OFF`;
  return `Save ${formatCardPrice(original - sale)}`;
}

/** Convert a price value (number or string) to a display string in MVR, e.g. 12.5 → "12.50" */
export function toMVR(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return Number.isFinite(num) ? num.toFixed(2) : '0.00';
}

/** Convert a decimal MVR amount to laar (integer cents), e.g. 12.50 → 1250 */
export function toCents(mvr: number | string): number {
  const num = typeof mvr === 'string' ? parseFloat(mvr) : mvr;
  return Number.isFinite(num) ? Math.round(num * 100) : 0;
}

/**
 * Anything with a price and possibly sizes. Kept loose because the surfaces
 * that show a price are fed by several different shapes — favourites, event
 * items, cart suggestions and menu cards do not share one type.
 */
type PricedItem = {
  base_price?: number | string | null;
  has_variants?: boolean | null;
  variants?: Array<{
    is_active?: boolean | null;
    price?: number | string | null;
    effective_price?: number | string | null;
  }> | null;
};

/**
 * What to show for an item's price, and whether it is a "from" price.
 *
 * An item with sizes keeps its money on the variants and leaves base_price at
 * 0, so printing base_price advertises a real product as free. That reached
 * the live site once already — the website's featured strip said "Coke MVR
 * 0.00" while the item sheet correctly said "From 15.00/-" (fixed in
 * Item::displayPriceInfo). The same mistake was repeated on four more surfaces
 * here, plus the menu's price sort, where every sized item sorted as free and
 * "cheapest first" put all the drinks on top.
 *
 * Lowest ACTIVE variant, discounted price preferred, because an inactive size
 * is not something a customer can buy.
 */
export function itemDisplayPrice(item: PricedItem): { price: number; from: boolean } {
  const active = (item.variants ?? []).filter((v) => v?.is_active !== false);

  if (item.has_variants && active.length > 0) {
    const prices = active
      .map((v) => Number(v.effective_price ?? v.price))
      .filter((n) => Number.isFinite(n));

    if (prices.length > 0) {
      return { price: Math.min(...prices), from: true };
    }
  }

  return { price: Number(item.base_price) || 0, from: false };
}

/** Sort key for price ordering — a sized item sorts by its cheapest size. */
export function itemSortPrice(item: PricedItem): number {
  return itemDisplayPrice(item).price;
}
