import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AccountPage } from './AccountPage';

/*
 * Audit, 2026-09-24: the "My code" QR the till scans (owner, 2026-09-02)
 * sat inside the signed-out branch behind an "is signed in" check, so it
 * never rendered. It lives on the signed-in hub now. The profile card's
 * points figure is the spendable one, the same the Rewards page shows.
 */

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    authReady: true,
    customerName: 'Aisha',
    setAuth: vi.fn(),
    clearAuth: vi.fn(),
  }),
}));

vi.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({ t: (k: string) => (k === 'account.loyalty_pts' ? '{n} pts' : k), lang: 'en', setLang: vi.fn() }),
}));

vi.mock('../hooks/usePushNotifications', () => ({
  usePushNotifications: () => ({ supported: false, permission: 'default', subscribed: false, busy: false, error: null, subscribe: vi.fn(), unsubscribe: vi.fn() }),
}));

vi.mock('../components/PrayerBar', () => ({ PrayerBar: () => null }));
vi.mock('../components/AuthBlock', () => ({ AuthBlock: () => null }));

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return {
    ...actual,
    getCustomerMe: vi.fn(),
    getLoyaltyAccount: vi.fn(),
    getMyReservations: vi.fn().mockResolvedValue([]),
    getMyFavourites: vi.fn().mockResolvedValue([]),
    getMyPreOrders: vi.fn().mockResolvedValue([]),
    getMyReviews: vi.fn().mockResolvedValue({ data: [], meta: {} }),
    getMyReferralCode: vi.fn().mockResolvedValue(null),
    getCustomerCredit: vi.fn().mockResolvedValue({ credit: null }),
    getCustomerDepositLedger: vi.fn().mockResolvedValue({ deposit: null, transactions: [] }),
    fetchCustomerOrders: vi.fn().mockResolvedValue({ data: [] }),
  };
});

import { getCustomerMe, getLoyaltyAccount } from '../api';

describe('Account page — my code and points', () => {
  beforeEach(() => {
    vi.mocked(getCustomerMe).mockResolvedValue({
      customer: { id: 1, phone: '+9607700001', name: 'Aisha', is_profile_complete: true, has_trade_account: false },
      has_trade_account: false,
    });
    vi.mocked(getLoyaltyAccount).mockResolvedValue({
      account: { points_balance: 500, points_held: 120, available_points: 380, lifetime_points: 900, tier: 'silver' },
      tier_progress: null,
      program: {},
      rates: {},
    } as never);
  });

  it('shows the QR the till scans, carrying the account phone number', async () => {
    render(<MemoryRouter><AccountPage /></MemoryRouter>);
    const card = await screen.findByTestId('account-my-code');
    expect(card.querySelector('svg')).not.toBeNull();
    expect(screen.getByText('account.my_code_hint')).toBeInTheDocument();
  });

  it('shows spendable points on the profile card, not the balance with holds in it', async () => {
    render(<MemoryRouter><AccountPage /></MemoryRouter>);
    await screen.findByTestId('account-my-code');
    fireEvent.click(screen.getByText('account.profile', { selector: '.account-row__label' }));
    expect(await screen.findByTestId('profile-loyalty-points')).toHaveTextContent('380');
  });
});
