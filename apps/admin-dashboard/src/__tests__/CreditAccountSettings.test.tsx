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

  it('will not save defaults over settings that did not load', async () => {
    vi.spyOn(api, 'getSiteSettings').mockRejectedValue(new Error('You do not have permission to perform this action.'));
    render(<CreditAccountSettings />);

    expect(await screen.findByText(/did not load, so Save is off/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save/ })).toBeDisabled();
  });
});
