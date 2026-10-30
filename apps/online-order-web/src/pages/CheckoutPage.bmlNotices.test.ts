/**
 * Bank of Maldives' merchant website rules at the point of card payment (owner, 2026-10-30:
 * "Make align with bank recommendations"): the transaction currency, the merchant outlet
 * country and the advice to keep records stand in the checkout's payment box, not only in the
 * Terms. The full page does not mount under test, so the source and the wording are checked.
 */
import { describe, expect, it } from 'vitest';
import source from './CheckoutPage.tsx?raw';
import en from '../i18n/en.json';
import dv from '../i18n/dv.json';

const KEYS = ['checkout.txn_currency_label', 'checkout.txn_currency_value', 'checkout.outlet_country_label', 'checkout.outlet_country_value', 'checkout.keep_records'] as const;

describe('Checkout card payment notices', () => {
  it('shows the currency, the outlet country and the keep-records advice in the payment box', () => {
    for (const k of KEYS) expect(source).toContain(`t('${k}')`);
    expect(source).toContain('data-testid="checkout-currency-country"');
    expect(source).toContain('data-testid="checkout-keep-records"');
  });

  it('says MVR and Maldives in English, with Dhivehi for each line', () => {
    const e = en as Record<string, string>;
    const d = dv as Record<string, string>;
    expect(e['checkout.txn_currency_value']).toBe('MVR (Maldivian Rufiyaa)');
    expect(e['checkout.outlet_country_value']).toBe('Maldives');
    expect(e['checkout.keep_records']).toMatch(/order confirmation, payment receipt and our policies/);
    for (const k of KEYS) expect(d[k]).toBeTruthy();
  });
});
