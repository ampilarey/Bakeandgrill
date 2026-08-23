import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DeliverySettingsPage from '../pages/DeliverySettingsPage';
import * as api from '../api';

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }));

/**
 * The switch that decides whether GST is charged on delivery.
 *
 * A delivery charge is a taxable supply in the Maldives, so this is on by
 * default — but it is a tax position, and the owner has to be able to change it
 * without a deploy. If the checkbox does not reach the server, the change is
 * silently lost and the site keeps charging whatever it charged before.
 */
describe('DeliverySettingsPage — GST on delivery', () => {
  const settings = {
    default_fee: 30,
    free_threshold: 200,
    delivery_time: '30–45 min',
    zone_fees: { Male: 20 },
    zone_whitelist: null,
    zones_enforced: false,
    fee_taxable: true,
    source: 'database' as const,
  };

  const status = {
    open: true,
    master_switch: true,
    max_active_orders: 0,
    active_delivery_orders: 0,
    capacity_enforced: false,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, 'getDeliveryStatus').mockResolvedValue(status as never);
    vi.spyOn(api, 'getDeliveryFeeSettings').mockResolvedValue({
      settings,
      delivery_status: status,
    } as never);
    vi.spyOn(api, 'getOpsAlertsSettings').mockResolvedValue({
      settings: { delivery_delay_alert_sms: false },
    } as never);
    vi.spyOn(api, 'updateDeliveryFeeSettings').mockResolvedValue({
      message: 'saved',
      settings,
      delivery_status: status,
    } as never);
  });

  const renderPage = () =>
    render(
      <MemoryRouter>
        <DeliverySettingsPage />
      </MemoryRouter>,
    );

  it('reflects the saved setting', async () => {
    renderPage();

    const box = await screen.findByTestId('delivery-fee-taxable');
    expect((box as HTMLInputElement).checked).toBe(true);
  });

  it('sends the change when GST on delivery is switched off', async () => {
    renderPage();

    const box = await screen.findByTestId('delivery-fee-taxable');
    fireEvent.click(box);
    fireEvent.click(screen.getByText(/Save Zones & Fees/i));

    await waitFor(() => {
      expect(api.updateDeliveryFeeSettings).toHaveBeenCalledWith(
        expect.objectContaining({ fee_taxable: false }),
      );
    });
  });

  it('treats a response without the flag as taxable', async () => {
    // An older backend that does not send fee_taxable must not read as "off" —
    // defaulting to untaxed is exactly the bug this switch was added to fix.
    const { fee_taxable: _omitted, ...withoutFlag } = settings;
    vi.spyOn(api, 'getDeliveryFeeSettings').mockResolvedValue({
      settings: withoutFlag,
      delivery_status: status,
    } as never);

    renderPage();

    const box = await screen.findByTestId('delivery-fee-taxable');
    expect((box as HTMLInputElement).checked).toBe(true);
  });
});
