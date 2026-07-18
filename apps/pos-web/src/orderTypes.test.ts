import { describe, expect, it } from 'vitest';
import { isValidMvMobile, normalizeMvPhone, validateDeliveryDetails } from './orderTypes';

describe('isValidMvMobile', () => {
  it('accepts 3/6/7/9 local prefixes', () => {
    expect(isValidMvMobile('7654321')).toBe(true);
    expect(isValidMvMobile('6654321')).toBe(true);
    expect(isValidMvMobile('3654321')).toBe(true);
    expect(isValidMvMobile('9654321')).toBe(true);
    expect(isValidMvMobile('+9607654321')).toBe(true);
  });

  it('rejects invalid prefixes and short junk', () => {
    expect(isValidMvMobile('1234567')).toBe(false);
    expect(isValidMvMobile('5234567')).toBe(false);
    expect(isValidMvMobile('12345')).toBe(false);
  });
});

describe('validateDeliveryDetails', () => {
  it('allows 6-prefix mobiles after phone normalize', () => {
    expect(validateDeliveryDetails({
      addressLine1: 'Street 1',
      addressLine2: '',
      island: 'Male',
      contactName: 'Aisha',
      contactPhone: '6654321',
      notes: '',
      locationLink: '',
    })).toBeNull();
  });
});

describe('normalizeMvPhone', () => {
  it('prefixes local 7-digit numbers', () => {
    expect(normalizeMvPhone('7654321')).toBe('+9607654321');
  });
});
