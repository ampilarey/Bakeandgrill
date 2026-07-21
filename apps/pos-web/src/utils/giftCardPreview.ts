/**
 * Cap a staged POS gift-card discount using available (not ledger) balance.
 *
 * FIX 8e — third argument is `tenderRoomMvr` (the amount that can still
 * be tendered, i.e. grand total after tax/service/fees) and is REQUIRED.
 * Previous versions accepted a "taxable subtotal" fallback which double-
 * counted service-charge/tax room and over-issued gift-card discounts.
 */
export function previewGiftCardDiscount(
  availableBalance: number,
  heldBalance: number,
  tenderRoomMvr: number,
): { ok: true; discount: number } | { ok: false; error: string } {
  if (availableBalance <= 0) {
    return {
      ok: false,
      error: heldBalance > 0
        ? 'This gift card is fully held on other unpaid orders.'
        : 'This gift card has no available balance.',
    };
  }

  return {
    ok: true,
    discount: Math.min(availableBalance, Math.max(0, tenderRoomMvr)),
  };
}
