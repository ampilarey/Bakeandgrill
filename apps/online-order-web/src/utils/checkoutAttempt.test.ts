import { afterEach, describe, expect, it } from 'vitest';
import {
  attemptFor,
  checkoutSignature,
  clearCheckoutPendingOrderId,
  readCheckoutAttempt,
  writeCheckoutAttempt,
  writeCheckoutPendingOrderId,
  readCheckoutPendingOrderId,
} from './checkoutPendingOrder';

/*
 * Checkout audit, 2026-09-26: an unpaid order is only reused for the same
 * cart. Changing the cart, the order type, the pickup time or the address
 * starts a new order with a new key.
 */

const base = {
  orderType: 'online_pickup',
  collectOn: 'today',
  pickupSlotAt: '2026-09-28T12:00:00+05:00',
  partySize: 2,
  tableToken: null,
  address: null,
  items: [
    { id: 1, quantity: 2, variantId: null, packagingOptionId: null, modifierIds: [5, 3] },
    { id: 7, quantity: 1 },
  ],
};

describe('checkout attempt fingerprint', () => {
  afterEach(() => sessionStorage.clear());

  it('ignores line order and modifier order', () => {
    const a = checkoutSignature(base);
    const b = checkoutSignature({
      ...base,
      items: [{ id: 7, quantity: 1 }, { id: 1, quantity: 2, modifierIds: [3, 5] }],
    });
    expect(a).toBe(b);
  });

  it('changes when the cart, type, time or address changes', () => {
    const a = checkoutSignature(base);
    expect(checkoutSignature({ ...base, items: [...base.items, { id: 9, quantity: 1 }] })).not.toBe(a);
    expect(checkoutSignature({ ...base, items: [{ ...base.items[0], quantity: 3 }, base.items[1]] })).not.toBe(a);
    expect(checkoutSignature({ ...base, orderType: 'delivery', address: { line1: 'A', island: 'Male' } })).not.toBe(a);
    expect(checkoutSignature({ ...base, pickupSlotAt: '2026-09-28T12:30:00+05:00' })).not.toBe(a);
    const d1 = checkoutSignature({ ...base, orderType: 'delivery', pickupSlotAt: null, address: { line1: 'A', island: 'Male' } });
    const d2 = checkoutSignature({ ...base, orderType: 'delivery', pickupSlotAt: null, address: { line1: 'B', island: 'Male' } });
    expect(d1).not.toBe(d2);
  });

  it('keeps the key while the cart is the same and makes a new one when it changes', () => {
    const sig = checkoutSignature(base);
    const first = attemptFor(sig, readCheckoutAttempt());
    expect(first.changed).toBe(false);
    writeCheckoutAttempt(first.attempt);

    const again = attemptFor(sig, readCheckoutAttempt());
    expect(again.changed).toBe(false);
    expect(again.attempt.key).toBe(first.attempt.key);

    const other = attemptFor(checkoutSignature({ ...base, items: [base.items[1]] }), readCheckoutAttempt());
    expect(other.changed).toBe(true);
    expect(other.attempt.key).not.toBe(first.attempt.key);
    expect(other.attempt.key).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(other.attempt.key.length).toBeLessThanOrEqual(40);
  });

  it('clearing the pending order clears the attempt too', () => {
    writeCheckoutPendingOrderId(42);
    writeCheckoutAttempt({ signature: 'x', key: 'k' });
    clearCheckoutPendingOrderId();
    expect(readCheckoutPendingOrderId()).toBeNull();
    expect(readCheckoutAttempt()).toBeNull();
  });
});
