import { describe, expect, it } from 'vitest';
import { shouldShowResumedGiftCardChargeHint } from './OrderCart';

describe('FIX 8h — shouldShowResumedGiftCardChargeHint', () => {
  const baseline = {
    isResumed: true,
    isEditingActive: true,
    hasUnsavedTicketChanges: true,
    giftCardServerApplied: true,
  };

  it('shows the hint when a resumed ticket is being edited with unsaved changes AND has a server-applied gift card', () => {
    expect(shouldShowResumedGiftCardChargeHint(baseline)).toBe(true);
  });

  it('hides the hint on fresh (non-resumed) carts', () => {
    expect(
      shouldShowResumedGiftCardChargeHint({ ...baseline, isResumed: false }),
    ).toBe(false);
  });

  it('hides the hint on resumed tickets that are not being edited (view-only)', () => {
    expect(
      shouldShowResumedGiftCardChargeHint({ ...baseline, isEditingActive: false }),
    ).toBe(false);
  });

  it('hides the hint when the cashier has NOT changed the resumed ticket', () => {
    expect(
      shouldShowResumedGiftCardChargeHint({ ...baseline, hasUnsavedTicketChanges: false }),
    ).toBe(false);
  });

  it('hides the hint when the gift card was applied locally (never server-confirmed)', () => {
    expect(
      shouldShowResumedGiftCardChargeHint({ ...baseline, giftCardServerApplied: false }),
    ).toBe(false);
  });
});
