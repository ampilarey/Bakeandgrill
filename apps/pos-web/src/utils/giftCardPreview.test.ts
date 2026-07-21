import { describe, expect, it } from 'vitest';
import { previewGiftCardDiscount } from './giftCardPreview';

describe('previewGiftCardDiscount', () => {
  it('caps discount at available balance and tender room', () => {
    expect(previewGiftCardDiscount(100, 0, 40)).toEqual({ ok: true, discount: 40 });
    expect(previewGiftCardDiscount(25, 75, 100)).toEqual({ ok: true, discount: 25 });
  });

  it('rejects zero available with held message when funds are reserved', () => {
    expect(previewGiftCardDiscount(0, 50, 20)).toEqual({
      ok: false,
      error: 'This gift card is fully held on other unpaid orders.',
    });
  });

  it('rejects empty available with generic message', () => {
    expect(previewGiftCardDiscount(0, 0, 20)).toEqual({
      ok: false,
      error: 'This gift card has no available balance.',
    });
  });

  it('third argument is REQUIRED tenderRoomMvr — negative rooms clamp to zero', () => {
    // FIX 8e: no taxable-subtotal fallback. Negative or zero tender
    // room means no discount can be issued.
    expect(previewGiftCardDiscount(500, 0, 0)).toEqual({ ok: true, discount: 0 });
    expect(previewGiftCardDiscount(500, 0, -5)).toEqual({ ok: true, discount: 0 });
  });
});
