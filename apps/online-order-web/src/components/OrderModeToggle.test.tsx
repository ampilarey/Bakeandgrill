import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OrderModeToggle } from './OrderModeToggle';
import { OrderModeProvider } from '../context/OrderModeContext';
import { LanguageProvider } from '../context/LanguageContext';
import { setSalesChannel } from '../api/menu';

function renderToggle(props: Parameters<typeof OrderModeToggle>[0] = {}) {
  return render(
    <LanguageProvider>
      <OrderModeProvider>
        <OrderModeToggle {...props} />
      </OrderModeProvider>
    </LanguageProvider>
  );
}

describe('OrderModeToggle blocked flags', () => {
  beforeEach(() => {
    localStorage.clear();
    setSalesChannel('online_pickup');
  });

  it('disables the delivery button when deliveryBlocked', () => {
    renderToggle({ deliveryBlocked: true });
    const delivery = screen.getByRole('button', { name: /delivery/i });
    expect(delivery).toBeDisabled();
  });

  it('disables the pickup button when pickupBlocked', () => {
    renderToggle({ pickupBlocked: true });
    const pickup = screen.getByRole('button', { name: /pickup/i });
    expect(pickup).toBeDisabled();
  });

  it('does not switch mode when blocked side is clicked', async () => {
    const user = userEvent.setup();
    renderToggle({ deliveryBlocked: true });
    const delivery = screen.getByRole('button', { name: /delivery/i });
    await user.click(delivery);
    const pickup = screen.getByRole('button', { name: /pickup/i });
    expect(pickup).toHaveAttribute('aria-pressed', 'true');
    expect(delivery).toHaveAttribute('aria-pressed', 'false');
  });
});
