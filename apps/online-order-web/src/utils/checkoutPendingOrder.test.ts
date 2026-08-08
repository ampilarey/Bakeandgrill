import { afterEach, describe, expect, it } from 'vitest';
import {
  CHECKOUT_PENDING_ORDER_KEY,
  clearCheckoutPendingOrderId,
  dueLaarFromOrder,
  isPendingOrderReusable,
  isZeroBalanceApiError,
  readCheckoutPendingOrderId,
  writeCheckoutPendingOrderId,
} from './checkoutPendingOrder';
import { ApiRequestError } from '@shared/api';

describe('checkout pending order reuse (reorder zero_balance root cause)', () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  it('does not reuse a financially paid kitchen-pending order (post-BML online)', () => {
    expect(
      isPendingOrderReusable({
        id: 42,
        status: 'pending',
        payment_status: 'paid',
        remaining_balance_laar: 0,
        total_laar: 2108,
      }),
    ).toBe(false);
  });

  it('reuses payment_pending with remaining balance (BML retry)', () => {
    expect(
      isPendingOrderReusable({
        id: 7,
        status: 'payment_pending',
        payment_status: 'unpaid',
        remaining_balance_laar: 2108,
        total_laar: 2108,
      }),
    ).toBe(true);
  });

  it('does not reuse cancelled / refunded / completed', () => {
    for (const status of ['cancelled', 'refunded', 'completed', 'paid']) {
      expect(
        isPendingOrderReusable({
          id: 1,
          status,
          payment_status: 'unpaid',
          remaining_balance_laar: 100,
        }),
      ).toBe(false);
    }
  });

  it('dueLaar prefers remaining_balance_laar over total − gift', () => {
    expect(
      dueLaarFromOrder({
        id: 1,
        status: 'pending',
        total_laar: 5000,
        gift_card_discount_laar: 0,
        remaining_balance_laar: 0,
      }),
    ).toBe(0);
    expect(
      dueLaarFromOrder({
        id: 1,
        status: 'payment_pending',
        total_laar: 5000,
        gift_card_discount_laar: 1000,
      }),
    ).toBe(4000);
  });

  it('sessionStorage pending id read/write/clear', () => {
    expect(readCheckoutPendingOrderId()).toBeNull();
    writeCheckoutPendingOrderId(99);
    expect(sessionStorage.getItem(CHECKOUT_PENDING_ORDER_KEY)).toBe('99');
    expect(readCheckoutPendingOrderId()).toBe(99);
    clearCheckoutPendingOrderId();
    expect(readCheckoutPendingOrderId()).toBeNull();
  });

  it('detects zero_balance API errors', () => {
    expect(
      isZeroBalanceApiError(
        new ApiRequestError('Nothing to pay', 422, { code: 'zero_balance' }),
      ),
    ).toBe(true);
    expect(isZeroBalanceApiError(new Error('Network down'))).toBe(false);
  });
});
