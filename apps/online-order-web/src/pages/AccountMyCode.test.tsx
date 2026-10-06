import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AccountPage } from './AccountPage';
import { realName, prettyPhone } from './AccountPage/AccountHub';

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

// A stable `t`: the profile hook re-fetches when it changes, as the real
// provider's does not, and a fresh function per render would reset the
// customer after every state change.
const t = (k: string) => (k === 'account.loyalty_pts' ? '{n} pts' : k);
vi.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({ t, lang: 'en', setLang: vi.fn() }),
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
    updateCustomerProfile: vi.fn(),
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

import { getCustomerMe, getLoyaltyAccount, updateCustomerProfile } from '../api';

describe('Account page — my code and points', () => {
  beforeEach(() => {
    vi.mocked(getCustomerMe).mockResolvedValue({
      customer: { id: 1, phone: '+9607700001', name: 'Aisha', is_profile_complete: true, has_trade_account: false, sms_opt_out: false },
      has_trade_account: false,
    });
    vi.mocked(updateCustomerProfile).mockResolvedValue({
      customer: { id: 1, phone: '+9607700001', name: 'Aisha', is_profile_complete: true, has_trade_account: false, sms_opt_out: true },
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

  it('switches promotional SMS off from Settings and links to the preferences page', async () => {
    render(<MemoryRouter><AccountPage /></MemoryRouter>);
    const toggle = await screen.findByTestId('promo-sms-toggle');
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(toggle);
    await waitFor(() => expect(updateCustomerProfile).toHaveBeenCalledWith({ sms_opt_out: true }));
    await waitFor(() => expect(screen.getByTestId('promo-sms-toggle')).toHaveAttribute('aria-pressed', 'false'));
    expect(screen.getByTestId('account-link-leave-/sms/preferences')).toBeInTheDocument();
  });

  it('shows spendable points on the profile card, not the balance with holds in it', async () => {
    render(<MemoryRouter><AccountPage /></MemoryRouter>);
    await screen.findByTestId('account-my-code');
    fireEvent.click(screen.getByTestId('account-row-profile'));
    expect(await screen.findByTestId('profile-loyalty-points')).toHaveTextContent('380');
  });

  /*
   * Owner, 2026-10-06 (screenshot, "Hi, 7820288"): "Enhance the customer
   * my acc page after login". The card leads with the real name, the
   * number written out, and spendable points; the code opens full screen.
   */
  it('greets by name, never by the phone digits sign-in stores', async () => {
    render(<MemoryRouter><AccountPage /></MemoryRouter>);
    const hero = await screen.findByTestId('account-hero');
    await waitFor(() => expect(hero).toHaveTextContent('Aisha'));
    expect(hero).toHaveTextContent('+960 770 0001');
    expect(await screen.findByTestId('account-hero-points')).toHaveTextContent('380');
  });

  it('asks for an email when the account has none', async () => {
    vi.mocked(getCustomerMe).mockResolvedValue({
      customer: { id: 1, phone: '+9607700001', name: '7700001', email: null, is_profile_complete: false, has_trade_account: false, sms_opt_out: false },
      has_trade_account: false,
    } as never);
    render(<MemoryRouter><AccountPage /></MemoryRouter>);
    expect(await screen.findByTestId('account-profile-nudge')).toHaveTextContent('account.nudge_title_email');
    // The stored "name" is the phone digits, so the session name is used.
    expect(screen.getByTestId('account-hero')).toHaveTextContent('Aisha');
  });

  it('never treats phone digits as a name', () => {
    expect(realName('7700001', '+960 770 0001', null)).toBeNull();
    expect(realName('7700001', 'Aisha')).toBe('Aisha');
    expect(realName('  Aishath Ali ')).toBe('Aishath Ali');
    expect(prettyPhone('+9607820288')).toBe('+960 782 0288');
    expect(prettyPhone('7820288')).toBe('+960 782 0288');
  });

  it('opens the code full screen and closes it with Escape', async () => {
    render(<MemoryRouter><AccountPage /></MemoryRouter>);
    fireEvent.click(await screen.findByTestId('account-my-code-open'));
    const full = screen.getByTestId('account-my-code-full');
    expect(full.querySelector('svg')).not.toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('account-my-code-full')).not.toBeInTheDocument();
  });

  it('links the complaint box, tagged as from the app', async () => {
    render(<MemoryRouter><AccountPage /></MemoryRouter>);
    const row = await screen.findByTestId('account-row-complain');
    expect(row.getAttribute('href')).toContain('/complain?from=app');
  });

  it('reaches pre-orders from the hub', async () => {
    render(<MemoryRouter><AccountPage /></MemoryRouter>);
    fireEvent.click(await screen.findByTestId('account-row-preorders'));
    expect(await screen.findByText('account.po_title')).toBeInTheDocument();
  });
});
