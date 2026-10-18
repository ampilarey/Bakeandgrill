import { beforeEach, describe, expect, it } from 'vitest';
import { captureCardCode, cardCode, clearCardCode } from '../lib/cardCode';

describe('a printed card QR', () => {
  beforeEach(() => {
    sessionStorage.clear();
    window.history.replaceState(null, '', '/order/');
  });

  it('keeps the code for checkout and takes it out of the address', () => {
    window.history.replaceState(null, '', '/order/?promo=dc-ab12-cd34&table=x');
    captureCardCode();
    expect(cardCode('promo')).toBe('DC-AB12-CD34');
    expect(window.location.search).toBe('?table=x');
    clearCardCode('promo');
    expect(cardCode('promo')).toBe('');
  });

  it('keeps a gift card code apart and ignores anything that is not a code', () => {
    window.history.replaceState(null, '', '/order/?gift=GC7Q2KXX&promo=<script>');
    captureCardCode();
    expect(cardCode('gift')).toBe('GC7Q2KXX');
    expect(cardCode('promo')).toBe('');
  });
});
