export type CollectOn = 'today' | 'tomorrow';

export type CollectOnCartLine = {
  allow_pre_order?: boolean | null;
};

/**
 * Mixed-cart rule (owner decision): one collection date for the whole order.
 * If any line cannot be ordered for tomorrow, Today stays available only when
 * the shop is open; Tomorrow requires every line to allow it.
 */
export function cartAllowsTomorrow(lines: CollectOnCartLine[]): boolean {
  if (lines.length === 0) return false;
  return lines.every((line) => Boolean(line.allow_pre_order));
}

/**
 * Cart checkout button eligibility shared by CartDrawer and the
 * FloatingCartBar → CartSheet path (both render CartDrawer).
 *
 * While the shop is closed, checkout stays available only when every
 * line allows tomorrow collection — so the customer can reach the
 * Today/Tomorrow picker that CheckoutPage already handles.
 */
export type CartCheckoutCta = {
  canCheckout: boolean;
  /** Shop closed + cart qualifies for tomorrow — label must say so. */
  checkoutForTomorrow: boolean;
};

export function cartCheckoutCta(args: {
  shopOpen: boolean;
  lines: CollectOnCartLine[];
}): CartCheckoutCta {
  const hasItems = args.lines.length > 0;
  if (!hasItems) {
    return { canCheckout: false, checkoutForTomorrow: false };
  }
  if (args.shopOpen) {
    return { canCheckout: true, checkoutForTomorrow: false };
  }
  const forTomorrow = cartAllowsTomorrow(args.lines);
  return { canCheckout: forTomorrow, checkoutForTomorrow: forTomorrow };
}

/**
 * When the shop is closed, checkout defaults to Tomorrow (if the cart allows).
 * When open, default Today — unless the cart forces tomorrow or the customer
 * already picked Tomorrow on the menu (preferredDay).
 */
export function defaultCollectOn(args: {
  shopOpen: boolean | null;
  cartForcesTomorrow: boolean;
  cartAllowsTomorrow: boolean;
  /** App-wide day choice made on the menu (getOrderDay()). */
  preferredDay?: CollectOn;
}): CollectOn {
  if (args.cartForcesTomorrow && args.cartAllowsTomorrow) return 'tomorrow';
  if (args.shopOpen === false && args.cartAllowsTomorrow) return 'tomorrow';
  if (args.preferredDay === 'tomorrow' && args.cartAllowsTomorrow) return 'tomorrow';
  return 'today';
}

/** "Wed 5 Aug" — shared short label for day pickers/summaries. */
export function formatShortDateLabel(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).format(date);
}

/**
 * Human date for "tomorrow" — "2026-08-06" → "Wed 6 Aug".
 * Falls back to the device's local tomorrow when the API date is missing.
 */
export function formatTomorrowDateLabel(collectTomorrowDate: string | null | undefined): string {
  const date = collectTomorrowDate && /^\d{4}-\d{2}-\d{2}/.test(collectTomorrowDate)
    ? new Date(`${collectTomorrowDate.slice(0, 10)}T00:00:00`)
    : new Date(Date.now() + 24 * 60 * 60 * 1000);
  return formatShortDateLabel(date);
}

/**
 * Plain notice shown before pay when the whole order must be collected tomorrow.
 */
export function forcedTomorrowNotice(collectTomorrowDate: string | null | undefined): string {
  return `This order will be for tomorrow because it includes items that are only available then. Collect on ${formatTomorrowDateLabel(collectTomorrowDate)}. You pay now.`;
}
