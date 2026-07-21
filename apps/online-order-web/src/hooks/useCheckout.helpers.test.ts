import { describe, expect, it } from 'vitest';
import { referralRoomLaar } from './useCheckout';

describe('FIX 3 — referralRoomLaar ignores gift-card tender', () => {
  it('subtotal 100 with a 100 gift card staged and a valid 20 MVR referral → 20 referral is accepted', () => {
    const subtotalLaar = 100 * 100;
    const promoLaar = 0;
    const loyaltyLaar = 0;
    const configuredLaar = 20 * 100;

    // The removed line was subtracting the gift-card delta from the
    // room. That would produce room = 100 - 0 - 0 - 100 = 0 laar and
    // clamp the estimate to 0, showing "No referral discount applies".
    const room = referralRoomLaar({ subtotalLaar, promoLaar, loyaltyLaar });
    const est = Math.min(configuredLaar, room);

    expect(room).toBe(subtotalLaar);
    expect(est).toBe(configuredLaar);
    expect(est).toBeGreaterThan(0);
  });

  it('promo + loyalty (real pre-tax discounts) DO consume referral room', () => {
    const subtotalLaar = 100 * 100;
    const promoLaar = 30 * 100;
    const loyaltyLaar = 40 * 100;
    // Only 30 MVR of room left; 40 MVR referral clamps to 30.
    expect(referralRoomLaar({ subtotalLaar, promoLaar, loyaltyLaar })).toBe(30 * 100);
  });
});
