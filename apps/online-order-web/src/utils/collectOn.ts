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

/** Parse `YYYY-MM-DD` as a local calendar date (no UTC shift). */
export function parseYmdLocal(ymd: string): Date {
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function ymdLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Calendar tomorrow in the device's local timezone as `YYYY-MM-DD`. */
export function localTomorrowYmd(now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return ymdLocal(d);
}

/**
 * Resolve the collect-tomorrow Y-m-d from the API, else local calendar tomorrow.
 */
export function resolveCollectTomorrowYmd(
  collectTomorrowDate: string | null | undefined,
  now: Date = new Date(),
): string {
  if (collectTomorrowDate && /^\d{4}-\d{2}-\d{2}/.test(collectTomorrowDate)) {
    return collectTomorrowDate.slice(0, 10);
  }
  return localTomorrowYmd(now);
}

/** True when the API collect date is the next calendar day (not day-after from cutoff). */
export function isCalendarTomorrow(
  collectTomorrowDate: string | null | undefined,
  now: Date = new Date(),
): boolean {
  return resolveCollectTomorrowYmd(collectTomorrowDate, now) === localTomorrowYmd(now);
}

/**
 * Human date for collect-tomorrow — "2026-08-06" → "Thu 6 Aug".
 * Falls back to the device's local tomorrow when the API date is missing.
 */
export function formatTomorrowDateLabel(collectTomorrowDate: string | null | undefined): string {
  return formatShortDateLabel(parseYmdLocal(resolveCollectTomorrowYmd(collectTomorrowDate)));
}

/**
 * Primary toggle/checkout heading for the collect-tomorrow slot.
 * After the kitchen cutoff the API rolls to day-after-tomorrow — do not call that "Tomorrow".
 */
export function collectDayPrimaryLabel(
  collectTomorrowDate: string | null | undefined,
  tomorrowWord: string,
  now: Date = new Date(),
): string {
  const ymd = resolveCollectTomorrowYmd(collectTomorrowDate, now);
  if (ymd === localTomorrowYmd(now)) return tomorrowWord;
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long' }).format(parseYmdLocal(ymd));
}

/**
 * Plain notice shown before pay when the whole order must be collected on the
 * API collect-tomorrow date (may be day-after-tomorrow after cutoff).
 */
export function forcedTomorrowNotice(collectTomorrowDate: string | null | undefined): string {
  const when = formatTomorrowDateLabel(collectTomorrowDate);
  const dayWord = isCalendarTomorrow(collectTomorrowDate) ? 'tomorrow' : when;
  return `This order will be for ${dayWord} because it includes items that are only available then. Collect on ${when}. You pay now.`;
}
