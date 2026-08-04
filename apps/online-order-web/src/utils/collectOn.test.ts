import { describe, expect, it } from 'vitest';
import {
  cartAllowsTomorrow,
  cartCheckoutCta,
  defaultCollectOn,
  forcedTomorrowNotice,
  formatTomorrowDateLabel,
} from './collectOn';

describe('collectOn helpers', () => {
  it('requires every line to allow tomorrow', () => {
    expect(cartAllowsTomorrow([{ allow_pre_order: true }, { allow_pre_order: true }])).toBe(true);
    expect(cartAllowsTomorrow([{ allow_pre_order: true }, { allow_pre_order: false }])).toBe(false);
    expect(cartAllowsTomorrow([])).toBe(false);
  });

  it('cartCheckoutCta: closed + all allow_pre_order enables tomorrow checkout', () => {
    expect(cartCheckoutCta({
      shopOpen: false,
      lines: [{ allow_pre_order: true }, { allow_pre_order: true }],
    })).toEqual({ canCheckout: true, checkoutForTomorrow: true });
  });

  it('cartCheckoutCta: closed + mixed cart stays blocked', () => {
    expect(cartCheckoutCta({
      shopOpen: false,
      lines: [{ allow_pre_order: true }, { allow_pre_order: false }],
    })).toEqual({ canCheckout: false, checkoutForTomorrow: false });
  });

  it('cartCheckoutCta: closed + empty cart stays blocked', () => {
    expect(cartCheckoutCta({ shopOpen: false, lines: [] })).toEqual({
      canCheckout: false,
      checkoutForTomorrow: false,
    });
  });

  it('cartCheckoutCta: shop open is unchanged', () => {
    expect(cartCheckoutCta({
      shopOpen: true,
      lines: [{ allow_pre_order: false }],
    })).toEqual({ canCheckout: true, checkoutForTomorrow: false });
    expect(cartCheckoutCta({ shopOpen: true, lines: [] })).toEqual({
      canCheckout: false,
      checkoutForTomorrow: false,
    });
  });

  it('defaults to tomorrow when the shop is closed and the cart allows it', () => {
    expect(defaultCollectOn({
      shopOpen: false,
      cartForcesTomorrow: false,
      cartAllowsTomorrow: true,
    })).toBe('tomorrow');
  });

  it('defaults to today when the shop is open', () => {
    expect(defaultCollectOn({
      shopOpen: true,
      cartForcesTomorrow: false,
      cartAllowsTomorrow: true,
    })).toBe('today');
  });

  it('forces tomorrow when the cart requires it', () => {
    expect(defaultCollectOn({
      shopOpen: true,
      cartForcesTomorrow: true,
      cartAllowsTomorrow: true,
    })).toBe('tomorrow');
  });

  it('states the mixed-cart rule in plain language before pay', () => {
    expect(forcedTomorrowNotice('2026-08-05')).toContain('tomorrow');
    expect(forcedTomorrowNotice('2026-08-05')).toContain('Wed 5 Aug');
    expect(forcedTomorrowNotice('2026-08-05')).toContain('pay now');
  });

  it('formats the API date as a human day label', () => {
    expect(formatTomorrowDateLabel('2026-08-06')).toBe('Thu 6 Aug');
    expect(formatTomorrowDateLabel('2026-12-25')).toBe('Fri 25 Dec');
  });

  it('falls back to the local tomorrow when the API date is missing', () => {
    const expected = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
      .format(new Date(Date.now() + 24 * 60 * 60 * 1000));
    expect(formatTomorrowDateLabel(null)).toBe(expected);
    expect(formatTomorrowDateLabel(undefined)).toBe(expected);
    expect(formatTomorrowDateLabel('not-a-date')).toBe(expected);
  });
});
