import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RefundPayoutSettings } from '../pages/SettingsPage/RefundPayoutSettings';
import * as api from '../api';

/* Refund audit, 2026-09-25: card slip reference switch and the deposit payout owner threshold. */

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, 'getSiteSettings').mockResolvedValue({
    settings: {
      general: [
        { key: 'pos_card_reference_required', value: '0', type: 'boolean', label: 'x', description: null },
        { key: 'deposit_payout_owner_threshold_mvr', value: '500', type: 'number', label: 'y', description: null },
      ],
    },
  });
  vi.spyOn(api, 'updateSiteSettings').mockResolvedValue();
});

describe('RefundPayoutSettings', () => {
  it('loads both settings and saves them as site settings', async () => {
    render(<RefundPayoutSettings />);
    const threshold = await screen.findByTestId('deposit-payout-threshold');
    expect(threshold).toHaveValue('500');
    fireEvent.click(screen.getByRole('switch'));
    fireEvent.change(threshold, { target: { value: '250' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    await waitFor(() => expect(api.updateSiteSettings).toHaveBeenCalledWith({
      pos_card_reference_required: '1',
      deposit_payout_owner_threshold_mvr: '250',
    }));
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
  });

  it('refuses a negative threshold', async () => {
    render(<RefundPayoutSettings />);
    fireEvent.change(await screen.findByTestId('deposit-payout-threshold'), { target: { value: '-5' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    expect(await screen.findByText(/must be a number, zero or more/)).toBeInTheDocument();
    expect(api.updateSiteSettings).not.toHaveBeenCalled();
  });
});
