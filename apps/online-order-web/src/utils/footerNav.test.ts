import { describe, expect, it } from 'vitest';
import { isExternalHref, shouldLeaveOrderApp, toOrderSpaPath } from './footerNav';

describe('footerNav', () => {
  it('marks Blade-only paths as leave-SPA', () => {
    expect(shouldLeaveOrderApp('/terms')).toBe(true);
    expect(shouldLeaveOrderApp('/refund')).toBe(true);
    expect(shouldLeaveOrderApp('/')).toBe(true);
    expect(shouldLeaveOrderApp('/terms?x=1')).toBe(true);
  });

  it('keeps SPA paths internal', () => {
    expect(shouldLeaveOrderApp('/privacy')).toBe(false);
    expect(shouldLeaveOrderApp('/hours')).toBe(false);
    expect(shouldLeaveOrderApp('/contact')).toBe(false);
    expect(shouldLeaveOrderApp('/order/privacy')).toBe(false);
  });

  it('strips /order prefix for React Router', () => {
    expect(toOrderSpaPath('/order/privacy')).toBe('/privacy');
    expect(toOrderSpaPath('/privacy')).toBe('/privacy');
    expect(toOrderSpaPath('/order')).toBe('/');
  });

  it('detects external schemes', () => {
    expect(isExternalHref('https://example.com')).toBe(true);
    expect(isExternalHref('mailto:a@b.c')).toBe(true);
    expect(isExternalHref('/privacy')).toBe(false);
  });
});
