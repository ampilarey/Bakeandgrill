import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AccountPage } from './AccountPage';

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    authReady: true,
    customerName: 'Shop',
    setAuth: vi.fn(),
    clearAuth: vi.fn(),
  }),
}));

vi.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (k: string) => k,
    lang: 'en',
    setLang: vi.fn(),
  }),
}));

vi.mock('../hooks/usePushNotifications', () => ({
  usePushNotifications: () => ({
    supported: false,
    permission: 'default',
    subscribed: false,
    busy: false,
    error: null,
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  }),
}));

vi.mock('../components/PrayerBar', () => ({
  PrayerBar: () => null,
}));

vi.mock('../components/AuthBlock', () => ({
  AuthBlock: () => null,
}));

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return {
    ...actual,
    getCustomerMe: vi.fn(),
    getLoyaltyAccount: vi.fn().mockResolvedValue(null),
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

import { getCustomerMe } from '../api';

describe('Account trade deliveries link', () => {
  beforeEach(() => {
    vi.mocked(getCustomerMe).mockReset();
  });

  it('does not render deliveries link without a trade account', async () => {
    vi.mocked(getCustomerMe).mockResolvedValue({
      customer: {
        id: 1,
        phone: '+9607700001',
        name: 'Retail',
        is_profile_complete: true,
        has_trade_account: false,
      },
      has_trade_account: false,
    });

    render(
      <MemoryRouter>
        <AccountPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(getCustomerMe).toHaveBeenCalled());
    expect(screen.queryByTestId('account-trade-deliveries-link')).not.toBeInTheDocument();
  });

  it('renders deliveries link for a trade account shop', async () => {
    vi.mocked(getCustomerMe).mockResolvedValue({
      customer: {
        id: 2,
        phone: '+9607700002',
        name: 'Shop',
        is_profile_complete: true,
        has_trade_account: true,
      },
      has_trade_account: true,
    });

    render(
      <MemoryRouter>
        <AccountPage />
      </MemoryRouter>,
    );

    expect(await screen.findByTestId('account-trade-deliveries-link')).toBeInTheDocument();
    expect(screen.getByTestId('account-trade-statement-link')).toBeInTheDocument();
  });
});
