import { describe, expect, it } from 'vitest';
import { pickupSlotError } from '../pages/OnlineOrderingPage';

// Audit, 2026-10-16: the form took 5-240 minutes and up to 200 orders while
// the checkout quietly used 15-120 and 50.
describe('pickup slot limits match the checkout', () => {
  it('refuses what the checkout would clamp', () => {
    expect(pickupSlotError(5, 8)).toBe('Slot length must be 15 to 120 minutes.');
    expect(pickupSlotError(240, 8)).toBe('Slot length must be 15 to 120 minutes.');
    expect(pickupSlotError(30, 200)).toBe('Orders per slot must be 1 to 50.');
    expect(pickupSlotError(30, 0)).toBe('Orders per slot must be 1 to 50.');
    expect(pickupSlotError(Number.NaN, 8)).toBe('Slot length must be 15 to 120 minutes.');
  });

  it('accepts the edges and the usual values', () => {
    expect(pickupSlotError(15, 1)).toBeNull();
    expect(pickupSlotError(120, 50)).toBeNull();
    expect(pickupSlotError(30, 8)).toBeNull();
  });
});
