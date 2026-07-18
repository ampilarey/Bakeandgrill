/** Synthetic BML purchase orders — not kitchen / food tracking. */
export function isGiftCardOrder(order: { type?: string | null } | null | undefined): boolean {
  return order?.type === 'gift_card';
}
