import { describe, expect, it } from 'vitest';
import {
  cartAllowsTomorrow,
  cartCheckoutCta,
  collectDayPrimaryLabel,
  defaultCollectOn,
  forcedTomorrowNotice,
  formatTomorrowDateLabel,
  isCalendarTomorrow,
  localTomorrowYmd,
  parseYmdLocal,
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

  it('honours a Tomorrow choice made on the menu while open', () => {
    expect(defaultCollectOn({
      shopOpen: true,
      cartForcesTomorrow: false,
      cartAllowsTomorrow: true,
      preferredDay: 'tomorrow',
    })).toBe('tomorrow');
  });

  it('ignores a preferred Tomorrow the cart cannot fulfil', () => {
    expect(defaultCollectOn({
      shopOpen: true,
      cartForcesTomorrow: false,
      cartAllowsTomorrow: false,
      preferredDay: 'tomorrow',
    })).toBe('today');
  });

  it('states the mixed-cart rule in plain language before pay', () => {
    const ymd = localTomorrowYmd();
    expect(forcedTomorrowNotice(ymd)).toContain('tomorrow');
    expect(forcedTomorrowNotice(ymd)).toContain(formatTomorrowDateLabel(ymd));
    expect(forcedTomorrowNotice(ymd)).toContain('pay now');
  });

  it('formats the API date as a human day label', () => {
    expect(formatTomorrowDateLabel('2026-08-06')).toBe('Thu 6 Aug');
    expect(formatTomorrowDateLabel('2026-12-25')).toBe('Fri 25 Dec');
  });

  it('parses Y-m-d as a local calendar date without UTC shift', () => {
    const d = parseYmdLocal('2026-08-08');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7);
    expect(d.getDate()).toBe(8);
  });

  it('falls back to the local tomorrow when the API date is missing', () => {
    const expected = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
      .format(parseYmdLocal(localTomorrowYmd()));
    expect(formatTomorrowDateLabel(null)).toBe(expected);
    expect(formatTomorrowDateLabel(undefined)).toBe(expected);
    expect(formatTomorrowDateLabel('not-a-date')).toBe(expected);
  });

  it('calls the collect slot Tomorrow only when it is calendar tomorrow', () => {
    const now = new Date(2026, 7, 7, 22, 51); // local calendar 7 Aug
    expect(isCalendarTomorrow('2026-08-08', now)).toBe(true);
    expect(isCalendarTomorrow('2026-08-09', now)).toBe(false);
    expect(collectDayPrimaryLabel('2026-08-08', 'Tomorrow', now)).toBe('Tomorrow');
    // Day-after-tomorrow (post-cutoff) must not be labelled Tomorrow.
    const dayAfter = new Intl.DateTimeFormat('en-GB', { weekday: 'long' })
      .format(parseYmdLocal('2026-08-09'));
    expect(collectDayPrimaryLabel('2026-08-09', 'Tomorrow', now)).toBe(dayAfter);
  });

  it('forced notice avoids saying tomorrow when the collect date is not calendar tomorrow', () => {
    expect(forcedTomorrowNotice('2099-01-15')).toContain('15 Jan');
    expect(forcedTomorrowNotice('2099-01-15')).not.toMatch(/for tomorrow because/);
  });
});
