import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AddMoneyCard } from './AddMoneyCard';
import { WalletTopUpResult } from './WalletTopUpResult';
import { getWalletTopUp, getWalletTopUpRules, startWalletTopUp } from '../api';

vi.mock('../context/LanguageContext', () => ({ useLanguage: () => ({ t: (key: string) => key, lang: 'en' }) }));
vi.mock('../api', () => ({ getWalletTopUpRules: vi.fn(), startWalletTopUp: vi.fn(), getWalletTopUp: vi.fn() }));

/* Owner, 2026-10-21: money into the wallet by card from the app. */
const rules = {
  enabled: true, can_top_up: true, reason: null, message: null,
  presets_mvr: [100, 200, 500, 1000], min_mvr: 50, max_mvr: 5000, daily_cap_mvr: 10000, used_today_mvr: 0, max_balance_mvr: 20000, balance_mvr: 0,
};

describe('AddMoneyCard', () => {
  it('offers the presets and sends the customer to the bank', async () => {
    vi.mocked(getWalletTopUpRules).mockResolvedValue({ rules });
    vi.mocked(startWalletTopUp).mockResolvedValue({
      payment_url: 'https://bml.test/pay/1',
      top_up: { token: 'tok', number: 'W-00001', status: 'pending', amount_mvr: 500, amount_fixed: true, balance_after_mvr: null, paid_at: null, expires_at: null, url: 'https://x/wallet/top-up/tok' },
    });
    const assign = vi.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', { configurable: true, value: { ...original, set href(v: string) { assign(v); } } });

    render(<AddMoneyCard />);
    expect(await screen.findByTestId('wallet-preset-100')).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByTestId('wallet-preset-500'));
    expect(screen.getByTestId('wallet-pay-by-card')).toHaveTextContent('wallet.pay_by_card');
    fireEvent.click(screen.getByTestId('wallet-pay-by-card'));
    await waitFor(() => expect(startWalletTopUp).toHaveBeenCalledWith(500));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://bml.test/pay/1'));

    Object.defineProperty(window, 'location', { configurable: true, value: original });
  });

  it('takes an amount of their own and refuses one outside the limits', async () => {
    vi.mocked(getWalletTopUpRules).mockResolvedValue({ rules });
    render(<AddMoneyCard />);
    const custom = await screen.findByTestId('wallet-custom-amount');
    fireEvent.change(custom, { target: { value: '20' } });
    expect(screen.getByTestId('wallet-pay-by-card')).toBeDisabled();
    fireEvent.change(custom, { target: { value: '350' } });
    expect(screen.getByTestId('wallet-pay-by-card')).toBeEnabled();
    expect(screen.getByTestId('wallet-preset-100')).toHaveAttribute('aria-checked', 'false');
  });

  it('says why when the customer may not add money, and hides when switched off', async () => {
    vi.mocked(getWalletTopUpRules).mockResolvedValue({ rules: { ...rules, can_top_up: false, reason: 'verify_phone', message: 'Verify your number before adding money to your wallet.' } });
    render(<AddMoneyCard />);
    expect(await screen.findByTestId('wallet-add-money-refused')).toHaveTextContent('wallet.verify_first');
    expect(screen.queryByTestId('wallet-pay-by-card')).toBeNull();

    vi.mocked(getWalletTopUpRules).mockClear();
    vi.mocked(getWalletTopUpRules).mockResolvedValue({ rules: { ...rules, enabled: false, can_top_up: false, reason: 'off' } });
    const { container } = render(<AddMoneyCard refreshKey={1} />);
    await waitFor(() => expect(getWalletTopUpRules).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(container.querySelector('[data-testid="wallet-add-money"]')).toBeNull());
  });
});

describe('WalletTopUpResult', () => {
  it('asks until the bank has confirmed, then says what was added', async () => {
    const pending = { token: 'tok', number: 'W-00001', status: 'pending' as const, amount_mvr: 500, amount_fixed: true, balance_after_mvr: null, paid_at: null, expires_at: null, url: 'https://x/wallet/top-up/tok' };
    vi.mocked(getWalletTopUp)
      .mockResolvedValueOnce({ top_up: pending, balance_mvr: 0 })
      .mockResolvedValueOnce({ top_up: { ...pending, status: 'paid', balance_after_mvr: 650, paid_at: '2026-10-21T10:00:00Z' }, balance_mvr: 650 });
    const onSettled = vi.fn();
    render(<WalletTopUpResult token="tok" state="CONFIRMED" onSettled={onSettled} />);
    expect(await screen.findByTestId('wallet-topup-result')).toHaveAttribute('data-state', 'checking');
    await waitFor(() => expect(screen.getByTestId('wallet-topup-result')).toHaveAttribute('data-state', 'paid'), { timeout: 4000 });
    expect(screen.getByTestId('wallet-topup-result')).toHaveTextContent('wallet.topup_done');
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it('says the payment was not completed when the bank said no', async () => {
    vi.mocked(getWalletTopUp).mockResolvedValue({
      top_up: { token: 'tok', number: 'W-00001', status: 'pending', amount_mvr: 500, amount_fixed: true, balance_after_mvr: null, paid_at: null, expires_at: null, url: 'https://x' },
      balance_mvr: 0,
    });
    render(<WalletTopUpResult token="tok" state="CANCELLED" onSettled={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId('wallet-topup-result')).toHaveAttribute('data-state', 'failed'), { timeout: 12000 });
    expect(screen.getByTestId('wallet-topup-result')).toHaveTextContent('wallet.topup_failed');
  }, 15000);
});
