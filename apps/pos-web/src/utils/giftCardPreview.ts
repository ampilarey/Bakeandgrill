/** Cap a staged POS gift-card discount using available (not ledger) balance. */
export function previewGiftCardDiscount(
  availableBalance: number,
  heldBalance: number,
  taxableSubtotal: number,
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
    discount: Math.min(availableBalance, Math.max(0, taxableSubtotal)),
  };
}
