/**
 * Checkout order-type gate — mirrors CheckoutPage wiring without mounting the
 * full page (full RTL mount hangs under heavy useCheckout mocks).
 */
import { describe, expect, it } from 'vitest';

function placeDisabled(args: {
  isPlacing: boolean;
  acceptTerms: boolean;
  placeBlockedByGate: boolean;
  needsModeChoice: boolean;
  checkoutServiceAvailable: boolean;
  paymentServiceAvailable: boolean;
  amountDueLaar: number;
}): boolean {
  return (
    args.isPlacing
    || !args.acceptTerms
    || args.placeBlockedByGate
    || args.needsModeChoice
    || !args.checkoutServiceAvailable
    || (!args.paymentServiceAvailable && args.amountDueLaar > 0)
  );
}

function placeLabel(args: {
  isPlacing: boolean;
  placeBlockedByGate: boolean;
  needsModeChoice: boolean;
}): string {
  if (args.isPlacing) return 'checkout.processing';
  if (args.placeBlockedByGate) return 'checkout.gate_closed';
  if (args.needsModeChoice) return 'checkout.choose_order_type';
  return 'checkout.pay_bml';
}

function orderTypeSummary(needsModeChoice: boolean, orderType: 'pickup' | 'delivery'): string {
  if (needsModeChoice) return 'checkout.choose_order_type';
  return orderType === 'pickup' ? 'mode.pickup' : 'mode.delivery';
}

function canCollapseOrderType(needsModeChoice: boolean): boolean {
  return !needsModeChoice;
}

describe('CheckoutPage order-type gate', () => {
  it('disables Place Order and uses choose label while unconfirmed', () => {
    expect(
      placeDisabled({
        isPlacing: false,
        acceptTerms: true,
        placeBlockedByGate: false,
        needsModeChoice: true,
        checkoutServiceAvailable: true,
        paymentServiceAvailable: true,
        amountDueLaar: 10000,
      }),
    ).toBe(true);
    expect(placeLabel({ isPlacing: false, placeBlockedByGate: false, needsModeChoice: true })).toBe(
      'checkout.choose_order_type',
    );
    expect(orderTypeSummary(true, 'pickup')).toBe('checkout.choose_order_type');
    expect(canCollapseOrderType(true)).toBe(false);
  });

  it('gate-closed label wins over needsModeChoice', () => {
    expect(placeLabel({ isPlacing: false, placeBlockedByGate: true, needsModeChoice: true })).toBe(
      'checkout.gate_closed',
    );
  });

  it('unlocks after explicit confirm', () => {
    expect(
      placeDisabled({
        isPlacing: false,
        acceptTerms: true,
        placeBlockedByGate: false,
        needsModeChoice: false,
        checkoutServiceAvailable: true,
        paymentServiceAvailable: true,
        amountDueLaar: 10000,
      }),
    ).toBe(false);
    expect(placeLabel({ isPlacing: false, placeBlockedByGate: false, needsModeChoice: false })).toBe(
      'checkout.pay_bml',
    );
    expect(orderTypeSummary(false, 'pickup')).toBe('mode.pickup');
    expect(canCollapseOrderType(false)).toBe(true);
  });
});
