import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { CreditAccountSettings } from '../pages/SettingsPage/CreditAccountSettings';
import { renderWithRouter as render } from './testUtils';
import * as api from '../api';

/*
 * Manager walk, 2026-10-08: a manager could save these settings but not read
 * them, so the screen showed "Open" and a blank limit, and Save would have
 * written those over the owner's real values.
 */

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, 'updateSiteSettings').mockResolvedValue();
});

describe('CreditAccountSettings', () => {
  it('shows the saved settings, not the defaults', async () => {
    vi.spyOn(api, 'getSiteSettings').mockResolvedValue({
      settings: {
        credit: [
          { key: 'credit_accounts_mode', value: 'closed', type: 'string', label: 'm', description: null },
          { key: 'credit_limit_max_mvr', value: '7000', type: 'number', label: 'l', description: null },
          { key: 'credit_payment_terms_default_days', value: '14', type: 'number', label: 't', description: null },
        ],
      },
    });
    render(<CreditAccountSettings />);

    expect(await screen.findByLabelText(/Maximum credit limit/)).toHaveValue('7000');
    expect(screen.getByRole('radio', { name: /Closed/ })).toBeChecked();
    expect(screen.getByRole('button', { name: /Save/ })).toBeEnabled();
    // The chasing numbers are on their alerts in Notifications (re-audit, 2026-10-10).
    expect(screen.getByTestId('credit-chasing-link')).toHaveTextContent(/set on those alerts in Notifications/);
    expect(screen.queryByLabelText(/Then remind every/)).toBeNull();
  });

  it('shows the wallet top-up rules and saves them beside the credit ones', async () => {
    vi.spyOn(api, 'getSiteSettings').mockResolvedValue({
      settings: {
        credit: [
          { key: 'credit_accounts_mode', value: 'open', type: 'string', label: 'm', description: null },
          { key: 'credit_limit_max_mvr', value: '7000', type: 'number', label: 'l', description: null },
          { key: 'credit_payment_terms_default_days', value: '14', type: 'number', label: 't', description: null },
          { key: 'wallet_topup_enabled', value: '1', type: 'string', label: 'w', description: null },
          { key: 'wallet_topup_presets', value: '50,150,300', type: 'string', label: 'p', description: null },
          { key: 'wallet_topup_max_mvr', value: '300', type: 'number', label: 'x', description: null },
        ],
      },
    });
    const save = vi.spyOn(api, 'updateSiteSettings').mockResolvedValue();
    render(<CreditAccountSettings />);

    expect(await screen.findByTestId('wallet-presets')).toHaveValue('50,150,300');
    expect(screen.getByTestId('wallet-max')).toHaveValue('300');
    expect(screen.getByTestId('wallet-min')).toHaveValue('50');
    expect(screen.getByTestId('wallet-topup-enabled')).toHaveAttribute('aria-checked', 'true');

    const { fireEvent } = await import('@testing-library/react');
    fireEvent.change(screen.getByTestId('wallet-presets'), { target: { value: '100, 250' } });
    fireEvent.click(screen.getByTestId('wallet-topup-enabled'));
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    await screen.findByText('Saved');
    expect(save).toHaveBeenCalledWith(expect.objectContaining({
      wallet_topup_enabled: '0',
      wallet_topup_presets: '100,250',
      wallet_topup_min_mvr: '50',
      wallet_topup_max_mvr: '300',
      credit_limit_max_mvr: '7000',
    }));
  });

  it('will not save defaults over settings that did not load', async () => {
    vi.spyOn(api, 'getSiteSettings').mockRejectedValue(new Error('You do not have permission to perform this action.'));
    render(<CreditAccountSettings />);

    expect(await screen.findByText(/did not load, so Save is off/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save/ })).toBeDisabled();
  });
});
