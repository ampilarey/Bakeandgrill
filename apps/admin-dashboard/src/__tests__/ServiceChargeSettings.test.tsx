import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ServiceChargeSettings } from '../pages/SettingsPage/ServiceChargeSettings';
import * as api from '../api';

describe('ServiceChargeSettings', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, 'getServiceChargeSettings').mockResolvedValue({
      settings: {
        enabled: true,
        label: 'Service charge',
        type: 'percent',
        value: 10,
        apply_dine_in: true,
        apply_takeaway: false,
        apply_online_pickup: false,
        apply_delivery: false,
        taxable: true,
        show_on_receipts: true,
      },
    });
    vi.spyOn(api, 'updateServiceChargeSettings').mockResolvedValue({
      message: 'saved',
      settings: {
        enabled: true,
        label: 'Service charge',
        type: 'percent',
        value: 10,
        apply_dine_in: true,
        apply_takeaway: false,
        apply_online_pickup: false,
        apply_delivery: false,
        taxable: true,
        show_on_receipts: true,
      },
    });
  });

  it('renders service charge controls from API', async () => {
    render(<ServiceChargeSettings />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Service charge')).toBeTruthy();
      expect(screen.getByDisplayValue('10')).toBeTruthy();
      expect(screen.getByText('Dine-in')).toBeTruthy();
    });
  });
});
