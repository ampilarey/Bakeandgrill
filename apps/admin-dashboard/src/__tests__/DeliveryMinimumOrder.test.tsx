import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DeliverySettingsPage from '../pages/DeliverySettingsPage';
import * as api from '../api';

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }));

/* Checkout audit, 2026-09-26: an optional minimum order for delivery, off (0) by default. */
describe('DeliverySettingsPage — minimum order for delivery', () => {
  const settings = {
    default_fee: 30,
    free_threshold: 200,
    min_order: 0,
    delivery_time: '30–45 min',
    zone_fees: { Male: 20 },
    zone_whitelist: null,
    zones_enforced: false,
    fee_taxable: true,
    source: 'database' as const,
  };
  const status = { open: true, master_switch: true, max_active_orders: 0, active_delivery_orders: 0, capacity_enforced: false };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, 'getDeliveryStatus').mockResolvedValue(status as never);
    vi.spyOn(api, 'getDeliveryFeeSettings').mockResolvedValue({ settings, delivery_status: status } as never);
    vi.spyOn(api, 'getOpsAlertsSettings').mockResolvedValue({ settings: { delivery_delay_alert_sms: false } } as never);
    vi.spyOn(api, 'updateDeliveryFeeSettings').mockResolvedValue({ message: 'saved', settings, delivery_status: status } as never);
  });

  it('loads the saved minimum and sends a new one', async () => {
    render(<MemoryRouter><DeliverySettingsPage /></MemoryRouter>);

    const field = await screen.findByTestId('delivery-min-order');
    expect(field).toHaveValue(0);
    expect(screen.getByLabelText('Minimum order for delivery (MVR)')).toBe(field);

    fireEvent.change(field, { target: { value: '75' } });
    fireEvent.click(screen.getByText(/Save Zones & Fees/i));

    await waitFor(() => {
      expect(api.updateDeliveryFeeSettings).toHaveBeenCalledWith(expect.objectContaining({ min_order: 75 }));
    });
  });
});
