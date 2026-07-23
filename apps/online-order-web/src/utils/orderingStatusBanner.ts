/** Defaults match MenuPage strings before Content Studio Phase 6. */
export const ORDER_STATUS_DEFAULTS = {
  open: 'Online ordering is open',
  closed: 'Online ordering is closed',
  pickup_only: 'Pickup only',
  closes: 'Closes {time}',
  opens: 'Opens {time}',
  delivery_from: 'Delivery from {time}',
} as const;

export type OrderingStatusCopy = {
  open: string;
  closed: string;
  pickupOnly: string;
  closes: string;
  opens: string;
  deliveryFrom: string;
};

/**
 * Compose the MenuPage ordering status bar label.
 * Timeline times are already formatted; wording comes from content (or defaults).
 * When closed, prefer a non-empty gate message (Ordering Control) over closed copy.
 */
export function composeOrderingStatusBanner(args: {
  isOpen: boolean;
  deliveryAvailable: boolean;
  closesFormatted: string;
  opensFormatted: string;
  deliveryFromFormatted: string;
  gateMessage?: string | null;
  copy: OrderingStatusCopy;
}): string {
  const {
    isOpen,
    deliveryAvailable,
    closesFormatted,
    opensFormatted,
    deliveryFromFormatted,
    gateMessage,
    copy,
  } = args;

  const part = (template: string, time: string) =>
    time ? template.replace('{time}', time) : '';

  if (!isOpen) {
    const closedBase = (gateMessage && gateMessage.trim())
      ? gateMessage.trim()
      : copy.closed;
    const opensPart = part(copy.opens, opensFormatted);
    return opensPart ? `${closedBase} · ${opensPart}` : closedBase;
  }

  if (!deliveryAvailable) {
    const bits = [copy.open, copy.pickupOnly];
    const deliveryPart = part(copy.deliveryFrom, deliveryFromFormatted);
    if (deliveryPart) bits.push(deliveryPart);
    const closesPart = part(copy.closes, closesFormatted);
    if (closesPart) bits.push(closesPart);
    return bits.join(' · ');
  }

  const closesPart = part(copy.closes, closesFormatted);
  return closesPart ? `${copy.open} · ${closesPart}` : copy.open;
}
