import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OrderModeToggle } from './OrderModeToggle';
import { OrderModeProvider } from '../context/OrderModeContext';
import { LanguageProvider } from '../context/LanguageContext';
import { confirmSalesChannel, setSalesChannel } from '../api/menu';

function renderToggle(props: Parameters<typeof OrderModeToggle>[0] = {}) {
  return render(
    <LanguageProvider>
      <OrderModeProvider>
        <OrderModeToggle {...props} />
      </OrderModeProvider>
    </LanguageProvider>
  );
}

describe('OrderModeToggle', () => {
  beforeEach(() => {
    localStorage.clear();
    setSalesChannel('online_pickup');
  });

  it('renders neither pill active when mode is unconfirmed', () => {
    renderToggle();
    const pickup = screen.getByRole('button', { name: /pickup/i });
    const delivery = screen.getByRole('button', { name: /delivery/i });
    expect(pickup).toHaveAttribute('aria-pressed', 'false');
    expect(delivery).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText(/choose pickup or delivery/i)).toBeTruthy();
  });

  it('activates the tapped pill and confirms', async () => {
    const user = userEvent.setup();
    renderToggle();
    const delivery = screen.getByRole('button', { name: /delivery/i });
    await user.click(delivery);
    expect(delivery).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /pickup/i })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByText(/choose pickup or delivery/i)).toBeNull();
  });

  it('keeps delivery tappable (not disabled) when deliveryBlocked and calls onBlockedTap', async () => {
    const user = userEvent.setup();
    const onBlockedTap = vi.fn();
    renderToggle({ deliveryBlocked: true, onBlockedTap });
    const delivery = screen.getByRole('button', { name: /delivery/i });
    expect(delivery).not.toBeDisabled();
    expect(delivery).toHaveAttribute('aria-disabled', 'true');
    await user.click(delivery);
    expect(onBlockedTap).toHaveBeenCalledWith('delivery');
  });

  it('keeps pickup tappable when pickupBlocked and calls onBlockedTap', async () => {
    const user = userEvent.setup();
    const onBlockedTap = vi.fn();
    renderToggle({ pickupBlocked: true, onBlockedTap });
    const pickup = screen.getByRole('button', { name: /pickup/i });
    expect(pickup).not.toBeDisabled();
    await user.click(pickup);
    expect(onBlockedTap).toHaveBeenCalledWith('pickup');
  });

  it('does not switch mode when blocked side is clicked', async () => {
    confirmSalesChannel();
    const user = userEvent.setup();
    renderToggle({ deliveryBlocked: true });
    const delivery = screen.getByRole('button', { name: /delivery/i });
    await user.click(delivery);
    const pickup = screen.getByRole('button', { name: /pickup/i });
    expect(pickup).toHaveAttribute('aria-pressed', 'true');
    expect(delivery).toHaveAttribute('aria-pressed', 'false');
  });
});
