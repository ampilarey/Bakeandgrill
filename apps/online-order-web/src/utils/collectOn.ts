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
