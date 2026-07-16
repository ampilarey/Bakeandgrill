import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PaymentCommissionSettings } from '../pages/SettingsPage/PaymentCommissionSettings';
import * as api from '../api';

describe('PaymentCommissionSettings', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, 'getPaymentCommissionSettings').mockResolvedValue({
      settings: {
        enabled: true,
        pos_card_rate_bp: 250,
        online_gateway_rate_bp: 300,
        pos_card_rate_percent: 2.5,
        online_gateway_rate_percent: 3,
      },
    });
    vi.spyOn(api, 'updatePaymentCommissionSettings').mockResolvedValue({
      message: 'saved',
      settings: {
        enabled: true,
        pos_card_rate_bp: 250,
        online_gateway_rate_bp: 300,
        pos_card_rate_percent: 2.5,
        online_gateway_rate_percent: 3,
      },
    });
  });

  it('renders separate POS and gateway rate fields', async () => {
    render(<PaymentCommissionSettings />);

    await waitFor(() => {
      expect(screen.getByText('POS card / QR rate (%)')).toBeTruthy();
      expect(screen.getByText('Online / BML gateway rate (%)')).toBeTruthy();
      expect(screen.getByDisplayValue('2.5')).toBeTruthy();
      expect(screen.getByDisplayValue('3')).toBeTruthy();
    });
  });
});
