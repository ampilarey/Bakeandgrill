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
 * When open, default Today — unless the cart forces tomorrow.
 */
export function defaultCollectOn(args: {
  shopOpen: boolean | null;
  cartForcesTomorrow: boolean;
  cartAllowsTomorrow: boolean;
}): CollectOn {
  if (args.cartForcesTomorrow && args.cartAllowsTomorrow) return 'tomorrow';
  if (args.shopOpen === false && args.cartAllowsTomorrow) return 'tomorrow';
  return 'today';
}

/**
 * Plain notice shown before pay when the whole order must be collected tomorrow.
 */
export function forcedTomorrowNotice(collectTomorrowDate: string | null | undefined): string {
  const dateBit = collectTomorrowDate
    ? ` Collect on ${collectTomorrowDate}.`
    : '';
  return `This order will be for tomorrow because it includes items that are only available then.${dateBit} You pay now.`;
}
