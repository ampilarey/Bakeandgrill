import { describe, expect, it } from 'vitest';
import { isDeliveryBlocked, isPickupBlocked } from './fulfilmentAvailability';

describe('isPickupBlocked', () => {
  it('blocks when service is off', () => {
    expect(isPickupBlocked({ serviceAvailable: false })).toBe(true);
  });

  it('allows when service is on', () => {
    expect(isPickupBlocked({ serviceAvailable: true })).toBe(false);
  });
});

describe('isDeliveryBlocked', () => {
  const base = {
    isOpen: true as boolean | null,
    deliveryAvailable: true,
    eligibilityAccepting: true as boolean | null,
    serviceAvailable: true,
  };

  it('blocks when service is off', () => {
    expect(isDeliveryBlocked({ ...base, serviceAvailable: false })).toBe(true);
  });

  it('blocks when eligibility is known and not accepting', () => {
    expect(isDeliveryBlocked({ ...base, eligibilityAccepting: false })).toBe(true);
  });

  it('does not block when eligibility is unknown (null)', () => {
    expect(isDeliveryBlocked({ ...base, eligibilityAccepting: null })).toBe(false);
  });

  it('blocks when shop is open and delivery_available is false', () => {
    expect(isDeliveryBlocked({ ...base, deliveryAvailable: false })).toBe(true);
  });

  it('does not use delivery_available when shop is closed', () => {
    expect(
      isDeliveryBlocked({
        ...base,
        isOpen: false,
        deliveryAvailable: false,
      }),
    ).toBe(false);
  });

  it('does not use delivery_available when open status is unknown', () => {
    expect(
      isDeliveryBlocked({
        ...base,
        isOpen: null,
        deliveryAvailable: false,
      }),
    ).toBe(false);
  });

  it('allows when all signals are clear', () => {
    expect(isDeliveryBlocked(base)).toBe(false);
  });

  describe('forTomorrow orders', () => {
    it('ignores window / eligibility / delivery_available', () => {
      expect(
        isDeliveryBlocked({
          ...base,
          forTomorrow: true,
          eligibilityAccepting: false,
          deliveryAvailable: false,
          isOpen: false,
        }),
      ).toBe(false);
    });

    it('still blocks when the delivery service is switched off', () => {
      expect(
        isDeliveryBlocked({ ...base, forTomorrow: true, serviceAvailable: false }),
      ).toBe(true);
    });
  });
});
