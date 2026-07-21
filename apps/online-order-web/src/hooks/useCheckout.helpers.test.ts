import { describe, expect, it } from 'vitest';
import { computeReferralRoomLaar, mapGiftCardError } from './useCheckout';
import { ApiRequestError } from '@shared/api';

describe('FIX 3 — computeReferralRoomLaar ignores gift-card tender', () => {
  it('subtotal 100 with a 100 gift card staged and a valid 20 MVR referral → 20 referral is accepted', () => {
    const subtotalLaar = 100 * 100;
    const promoLaar = 0;
    const loyaltyLaar = 0;
    const configuredLaar = 20 * 100;

    // The removed line was subtracting the gift-card delta from the
    // room. That would produce room = 100 - 0 - 0 - 100 = 0 laar and
    // clamp the estimate to 0, showing "No referral discount applies".
    const room = computeReferralRoomLaar({ subtotalLaar, promoLaar, loyaltyLaar });
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
    expect(computeReferralRoomLaar({ subtotalLaar, promoLaar, loyaltyLaar })).toBe(30 * 100);
  });
});

describe('FIX 7 — mapGiftCardError translates expired card errors', () => {
  it('renders a friendly renewal message with the expires_at date when the body carries reason=expired', () => {
    const e = new ApiRequestError('Card unavailable', 422, {
      reason: 'expired',
      expires_at: '2024-01-15',
    });
    expect(mapGiftCardError(e)).toMatch(/expired/i);
    expect(mapGiftCardError(e)).toMatch(/contact us to renew/i);
    // Formatted via Intl.DateTimeFormat('en', dateStyle: 'medium') → "Jan 15, 2024"
    expect(mapGiftCardError(e)).toMatch(/Jan 15, 2024/);
  });

  it('detects "expired" in the raw error message when no reason field exists', () => {
    const e = new ApiRequestError('This gift card has expired.', 422, {
      message: 'This gift card has expired.',
    });
    expect(mapGiftCardError(e)).toMatch(/expired/i);
    expect(mapGiftCardError(e)).toMatch(/contact us to renew/i);
  });

  it('passes non-expired errors through verbatim', () => {
    const e = new Error('This gift card is fully held on other unpaid orders.');
    expect(mapGiftCardError(e)).toBe(
      'This gift card is fully held on other unpaid orders.',
    );
  });
});
