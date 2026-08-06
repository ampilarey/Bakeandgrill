import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderModeSheet } from './OrderModeSheet';
import { OrderDayProvider } from '../context/OrderDayContext';
import { OrderModeProvider } from '../context/OrderModeContext';

vi.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'mode.pickup': 'Pickup',
        'mode.delivery': 'Delivery',
        'mode.eat_here': 'Eat here',
        'modeSheet.title': 'How do you want your order?',
        'modeSheet.for_today': 'For today',
        'modeSheet.for_tomorrow': 'For tomorrow, {date}',
        'modeSheet.pickup_sub': 'Collect from our shop',
        'modeSheet.pickup_unavailable': 'Pickup orders are temporarily paused.',
        'modeSheet.delivery_sub': 'Delivered to your door',
        'modeSheet.delivery_tomorrow_ok': 'Arranged in advance for tomorrow',
        'modeSheet.delivery_unavailable': 'Delivery is unavailable right now.',
        'modeSheet.eat_here_sub': 'Table reserved — food ready when you arrive',
        'modeSheet.eat_here_tomorrow': 'Eat here is for today only',
        'modeSheet.eat_here_unavailable': 'Eat here is unavailable right now.',
        'sheet.close': 'Close',
        'sheet.dialog': 'Dialog',
      };
      return map[key] ?? key;
    },
    lang: 'en',
  }),
}));

function saveDay(day: 'today' | 'tomorrow') {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  localStorage.setItem('bakegrill_order_day', day);
  localStorage.setItem(
    'bakegrill_order_day_saved_on',
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
  );
}

function renderSheet(props: Partial<Parameters<typeof OrderModeSheet>[0]> = {}) {
  return render(
    <OrderModeProvider>
      <OrderDayProvider>
        <OrderModeSheet open onClose={vi.fn()} {...props} />
      </OrderDayProvider>
    </OrderModeProvider>,
  );
}

describe('OrderModeSheet', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('choosing pickup confirms the mode and closes', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderSheet({ onClose });

    await user.click(screen.getByTestId('mode-sheet-pickup'));

    expect(onClose).toHaveBeenCalled();
    expect(localStorage.getItem('bakegrill_sales_channel_confirmed')).toBe('1');
    expect(localStorage.getItem('bakegrill_sales_channel')).not.toBe('delivery');
  });

  it('today + delivery blocked: delivery card dimmed with reason, not selectable', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderSheet({
      onClose,
      deliveryBlockedToday: true,
      deliveryBlockedReason: 'Delivery hours are 6–10 PM.',
    });

    const delivery = screen.getByTestId('mode-sheet-delivery');
    expect(delivery).toHaveAttribute('aria-disabled', 'true');
    expect(delivery).toHaveTextContent('Delivery hours are 6–10 PM.');

    await user.click(delivery);
    expect(onClose).not.toHaveBeenCalled();
    expect(localStorage.getItem('bakegrill_sales_channel_confirmed')).toBeNull();
  });

  it('tomorrow: delivery selectable when caller says open (today window ignored upstream)', async () => {
    saveDay('tomorrow');
    const user = userEvent.setup();
    const onClose = vi.fn();
    // Caller computes day-aware blocking — for tomorrow with gate open, pass false.
    renderSheet({
      onClose,
      deliveryBlockedToday: false,
      tomorrowDate: '2026-08-06',
    });

    expect(screen.getByText('For tomorrow, Thu 6 Aug')).toBeInTheDocument();
    const delivery = screen.getByTestId('mode-sheet-delivery');
    expect(delivery).not.toHaveAttribute('aria-disabled');
    expect(delivery).toHaveTextContent('Arranged in advance for tomorrow');

    await user.click(delivery);
    expect(onClose).toHaveBeenCalled();
    expect(localStorage.getItem('bakegrill_sales_channel')).toBe('delivery');
  });

  it('tomorrow: delivery dimmed when tomorrow delivery gate is closed', () => {
    saveDay('tomorrow');
    renderSheet({
      deliveryBlockedToday: true,
      deliveryBlockedReason: 'Delivery for tomorrow is not available right now.',
      tomorrowDate: '2026-08-06',
    });
    const delivery = screen.getByTestId('mode-sheet-delivery');
    expect(delivery).toHaveAttribute('aria-disabled', 'true');
  });

  it('tomorrow: Eat here selectable when tomorrow dine-in gate is open', async () => {
    saveDay('tomorrow');
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderSheet({
      onClose,
      dineInAvailable: true,
      tomorrowDate: '2026-08-06',
    });
    const eatHere = screen.getByTestId('mode-sheet-dine_in');
    expect(eatHere).not.toHaveAttribute('aria-disabled');
    await user.click(eatHere);
    expect(onClose).toHaveBeenCalled();
    expect(localStorage.getItem('bakegrill_sales_channel')).toBe('dine_in');
  });

  it('pickup paused: pickup card dimmed', () => {
    renderSheet({ pickupBlocked: true });
    const pickup = screen.getByTestId('mode-sheet-pickup');
    expect(pickup).toHaveAttribute('aria-disabled', 'true');
    expect(pickup).toHaveTextContent('Pickup orders are temporarily paused.');
  });

  it('always lists Eat here; dimmed when unavailable', () => {
    renderSheet({ dineInAvailable: false });
    const eatHere = screen.getByTestId('mode-sheet-dine_in');
    expect(eatHere).toBeInTheDocument();
    expect(eatHere).toHaveAttribute('aria-disabled', 'true');
    expect(eatHere).toHaveTextContent('Eat here is unavailable right now.');
  });

  it('Eat here selectable when available today', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderSheet({ onClose, dineInAvailable: true });

    const eatHere = screen.getByTestId('mode-sheet-dine_in');
    expect(eatHere).not.toHaveAttribute('aria-disabled');
    await user.click(eatHere);
    expect(onClose).toHaveBeenCalled();
    expect(localStorage.getItem('bakegrill_sales_channel')).toBe('dine_in');
  });
});
