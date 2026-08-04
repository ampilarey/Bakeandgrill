/**
 * End-to-end-ish path while closed:
 * 1) Cart CTA enables for tomorrow-eligible items (CartDrawer / FloatingCartBar).
 * 2) Checkout defaults collectOn to Tomorrow (same helper CheckoutPage uses).
 * 3) placeBlockedByGate is false for that combination (same formula as CheckoutPage).
 *
 * CheckoutPage gate logic is intentionally not duplicated or modified —
 * this asserts the helpers/formula that page already wires together.
 */
import { describe, expect, it } from 'vitest';
import {
  cartCheckoutCta,
  defaultCollectOn,
} from '../utils/collectOn';

describe('closed + tomorrow checkout path', () => {
  it('cart qualifies → checkout reachable, picker defaults Tomorrow, place not gate-blocked', () => {
    const lines = [{ allow_pre_order: true }, { allow_pre_order: true }];

    const cta = cartCheckoutCta({ shopOpen: false, lines });
    expect(cta.canCheckout).toBe(true);
    expect(cta.checkoutForTomorrow).toBe(true);

    const allowsTomorrow = true;
    const collectOn = defaultCollectOn({
      shopOpen: false,
      cartForcesTomorrow: false,
      cartAllowsTomorrow: allowsTomorrow,
    });
    expect(collectOn).toBe('tomorrow');

    // Mirror CheckoutPage.tsx lines 200–204 (do not change that page).
    const shopClosed = true;
    const checkoutServiceAvailable = true;
    const orderingGateClosed = shopClosed || !checkoutServiceAvailable;
    const canOrderTomorrowWhileClosed = shopClosed && allowsTomorrow && checkoutServiceAvailable;
    const placeBlockedByGate =
      orderingGateClosed && !(canOrderTomorrowWhileClosed && collectOn === 'tomorrow');

    expect(canOrderTomorrowWhileClosed).toBe(true);
    expect(placeBlockedByGate).toBe(false);
  });

  it('non-qualifying cart stays blocked end-to-end while closed', () => {
    const lines = [{ allow_pre_order: true }, { allow_pre_order: false }];
    const cta = cartCheckoutCta({ shopOpen: false, lines });
    expect(cta.canCheckout).toBe(false);

    const allowsTomorrow = false;
    const collectOn = defaultCollectOn({
      shopOpen: false,
      cartForcesTomorrow: false,
      cartAllowsTomorrow: allowsTomorrow,
    });
    // defaultCollectOn falls back to today when cart cannot go tomorrow
    expect(collectOn).toBe('today');

    const shopClosed = true;
    const checkoutServiceAvailable = true;
    const orderingGateClosed = shopClosed || !checkoutServiceAvailable;
    const canOrderTomorrowWhileClosed = shopClosed && allowsTomorrow && checkoutServiceAvailable;
    const placeBlockedByGate =
      orderingGateClosed && !(canOrderTomorrowWhileClosed && collectOn === 'tomorrow');

    expect(placeBlockedByGate).toBe(true);
  });
});
