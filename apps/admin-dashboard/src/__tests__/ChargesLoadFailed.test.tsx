import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServiceChargeSettings = vi.fn();
const getPaymentCommissionSettings = vi.fn();
vi.mock('../api', () => ({
  getServiceChargeSettings: (...a: unknown[]) => getServiceChargeSettings(...a),
  updateServiceChargeSettings: vi.fn(),
  getPaymentCommissionSettings: (...a: unknown[]) => getPaymentCommissionSettings(...a),
  updatePaymentCommissionSettings: vi.fn(),
}));

import { ServiceChargeSettings } from '../pages/SettingsPage/ServiceChargeSettings';
import { PaymentCommissionSettings } from '../pages/SettingsPage/PaymentCommissionSettings';

// Audit, 2026-10-16: a failed first load said "Loading…" for ever.
describe('Charges & fees: a failed load says so and offers Retry', () => {
  beforeEach(() => {
    getServiceChargeSettings.mockReset();
    getPaymentCommissionSettings.mockReset();
  });

  it('service charge: shows the error, and Retry loads the form', async () => {
    getServiceChargeSettings
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({ settings: { enabled: false, type: 'percent', value: 10, label: 'Service charge', apply_to: [] } });
    render(<ServiceChargeSettings />);

    const box = await screen.findByTestId('settings-load-failed');
    expect(box).toHaveTextContent("Couldn't load the service charge settings: Network error");
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByText(/Save service charge|Service charge/);
    expect(screen.queryByTestId('settings-load-failed')).not.toBeInTheDocument();
    expect(getServiceChargeSettings).toHaveBeenCalledTimes(2);
  });

  it('payment commission: shows the error with Retry', async () => {
    getPaymentCommissionSettings.mockRejectedValue(new Error('Server busy'));
    render(<PaymentCommissionSettings />);

    expect(await screen.findByTestId('settings-load-failed'))
      .toHaveTextContent("Couldn't load the payment commission settings: Server busy");
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(getPaymentCommissionSettings).toHaveBeenCalledTimes(2);
  });
});
