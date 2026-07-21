import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Stub the auth + api layer so the page thinks the user is signed in
// and never hits the network.
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    authReady: true,
    customerName: 'Test',
    setAuth: () => undefined,
    clearAuth: () => undefined,
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../api/auth', () => ({
  getCustomerMe: vi.fn(async () => ({ customer: { name: '' } })),
}));

const purchaseGiftCardMock = vi.fn();
vi.mock('../api/promotions', () => ({
  purchaseGiftCard: (...args: unknown[]) => purchaseGiftCardMock(...args),
}));

import { BuyGiftCardPage } from './BuyGiftCardPage';
import { LanguageProvider } from '../context/LanguageContext';

function mount() {
  return render(
    <MemoryRouter>
      <LanguageProvider>
        <BuyGiftCardPage />
      </LanguageProvider>
    </MemoryRouter>,
  );
}

describe('BuyGiftCardPage FIX 8d — whole-MVR only', () => {
  beforeEach(() => {
    purchaseGiftCardMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the Pay button with the exact selected amount for preset (whole MVR)', async () => {
    mount();
    // Default preset is 200 → Pay MVR 200
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Pay MVR 200$/i })).toBeTruthy();
    });
  });

  it('shows a dash in the Pay label when a decimal amount is typed', async () => {
    const user = userEvent.setup();
    mount();

    const input = screen.getByPlaceholderText(/Or enter custom/i);
    await user.clear(input);
    await user.type(input, '100.5');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Pay MVR —/i })).toBeTruthy();
    });
  });

  it('rejects decimals with an amount error and does NOT call purchaseGiftCard', async () => {
    const user = userEvent.setup();
    mount();

    const input = screen.getByPlaceholderText(/Or enter custom/i);
    await user.clear(input);
    await user.type(input, '100.5');

    const payBtn = screen.getByRole('button', { name: /Pay MVR/i });
    await user.click(payBtn);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/between MVR 50 and MVR 5000/i);
    });
    expect(purchaseGiftCardMock).not.toHaveBeenCalled();
  });

  it('accepts whole-MVR custom amount and calls purchaseGiftCard with an integer', async () => {
    purchaseGiftCardMock.mockResolvedValueOnce({
      order_id: 1,
      order_number: 'X',
      payment_url: '',
      payment_id: 0,
      amount: 250,
    });
    const user = userEvent.setup();
    mount();

    const input = screen.getByPlaceholderText(/Or enter custom/i);
    await user.clear(input);
    await user.type(input, '250');

    const phone = screen.getByPlaceholderText(/7XXXXXX/i);
    await user.type(phone, '7654321');

    const sender = screen.getByPlaceholderText(/e\.g\.|Aisha/i);
    await user.type(sender, 'Alice');

    const payBtn = screen.getByRole('button', { name: /Pay MVR 250$/i });
    await user.click(payBtn);

    await waitFor(() => {
      expect(purchaseGiftCardMock).toHaveBeenCalledTimes(1);
    });
    const arg = purchaseGiftCardMock.mock.calls[0][0] as { amount: number };
    expect(arg.amount).toBe(250);
    expect(Number.isInteger(arg.amount)).toBe(true);
  });
});
