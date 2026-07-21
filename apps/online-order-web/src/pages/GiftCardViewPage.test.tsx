import { describe, expect, it } from 'vitest';
import { friendlyGiftCardViewError } from './GiftCardViewPage';

const t = (key: string) => key === 'gift.view_invalid' ? 'This gift card link is invalid or has expired.' : key;

describe('friendlyGiftCardViewError (FIX 8g)', () => {
  it('maps 410 and body status "expired" to an expired-link message', () => {
    expect(friendlyGiftCardViewError(410, null, t)).toMatch(/expired/i);
    expect(friendlyGiftCardViewError(200, 'expired', t)).toMatch(/expired/i);
  });

  it('maps cancelled to a cancelled message', () => {
    expect(friendlyGiftCardViewError(422, 'cancelled', t)).toMatch(/cancelled/i);
  });

  it('maps depleted to a fully-redeemed message', () => {
    expect(friendlyGiftCardViewError(422, 'depleted', t)).toMatch(/fully redeemed/i);
  });

  it('maps 5xx to a try-again message', () => {
    expect(friendlyGiftCardViewError(500, null, t)).toMatch(/try again/i);
    expect(friendlyGiftCardViewError(503, null, t)).toMatch(/try again/i);
  });

  it('falls back to gift.view_invalid for 404 and unknown states', () => {
    expect(friendlyGiftCardViewError(404, null, t)).toBe('This gift card link is invalid or has expired.');
    expect(friendlyGiftCardViewError(400, 'unknown_state', t)).toBe('This gift card link is invalid or has expired.');
  });
});
