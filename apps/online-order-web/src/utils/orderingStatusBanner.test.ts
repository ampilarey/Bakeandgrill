import { describe, expect, it } from 'vitest';
import {
  composeClosedMenuBanner,
  composeOrderingStatusBanner,
  stripCheckBackFromClosedMessage,
  ORDER_STATUS_DEFAULTS,
} from './orderingStatusBanner';

const defaults = {
  open: ORDER_STATUS_DEFAULTS.open,
  closed: ORDER_STATUS_DEFAULTS.closed,
  pickupOnly: ORDER_STATUS_DEFAULTS.pickup_only,
  closes: ORDER_STATUS_DEFAULTS.closes,
  opens: ORDER_STATUS_DEFAULTS.opens,
  deliveryFrom: ORDER_STATUS_DEFAULTS.delivery_from,
};

describe('composeOrderingStatusBanner', () => {
  it('matches today open + closes wording with {time} filled', () => {
    expect(
      composeOrderingStatusBanner({
        isOpen: true,
        deliveryAvailable: true,
        closesFormatted: '9:00 PM',
        opensFormatted: '',
        deliveryFromFormatted: '',
        copy: defaults,
      }),
    ).toBe('Online ordering is open · Closes 9:00 PM');
  });

  it('matches pickup-only composition', () => {
    expect(
      composeOrderingStatusBanner({
        isOpen: true,
        deliveryAvailable: false,
        closesFormatted: '10:00 PM',
        opensFormatted: '',
        deliveryFromFormatted: '11:00 AM',
        copy: defaults,
      }),
    ).toBe('Online ordering is open · Pickup only · Delivery from 11:00 AM · Closes 10:00 PM');
  });

  it('uses gate message when closed when admin set one', () => {
    expect(
      composeOrderingStatusBanner({
        isOpen: false,
        deliveryAvailable: true,
        closesFormatted: '',
        opensFormatted: '7:00 AM',
        deliveryFromFormatted: '',
        gateMessage: 'Kitchen closed for Eid',
        copy: defaults,
      }),
    ).toBe('Kitchen closed for Eid · Opens 7:00 AM');
  });

  it('falls back to closed default when gate message empty', () => {
    expect(
      composeOrderingStatusBanner({
        isOpen: false,
        deliveryAvailable: true,
        closesFormatted: '',
        opensFormatted: '8:00 AM',
        deliveryFromFormatted: '',
        gateMessage: '',
        copy: defaults,
      }),
    ).toBe('Online ordering is closed · Opens 8:00 AM');
  });

  it('uses custom copy templates from settings', () => {
    expect(
      composeOrderingStatusBanner({
        isOpen: true,
        deliveryAvailable: true,
        closesFormatted: '6pm',
        opensFormatted: '',
        deliveryFromFormatted: '',
        copy: { ...defaults, open: 'We are open', closes: 'Until {time}' },
      }),
    ).toBe('We are open · Until 6pm');
  });
});

describe('stripCheckBackFromClosedMessage', () => {
  it('removes the check-back sentence only', () => {
    expect(
      stripCheckBackFromClosedMessage(
        'Online ordering is currently closed. Please check back during opening hours.',
      ),
    ).toBe('Online ordering is currently closed.');
  });
});

describe('composeClosedMenuBanner', () => {
  it('keeps closed copy, drops check-back, adds opens + tomorrow', () => {
    expect(
      composeClosedMenuBanner({
        opensFormatted: '10:00 AM',
        hasTomorrowItems: true,
        gateMessage:
          'Online ordering is currently closed. Please check back during opening hours.',
      }),
    ).toBe(
      'Online ordering is currently closed. · Opens 10:00 AM · Some items can be ordered for tomorrow',
    );
  });

  it('omits tomorrow when no eligible items', () => {
    expect(
      composeClosedMenuBanner({
        opensFormatted: '10:00 AM',
        hasTomorrowItems: false,
        gateMessage: 'Online ordering is currently closed.',
      }),
    ).toBe('Online ordering is currently closed. · Opens 10:00 AM');
  });
});
