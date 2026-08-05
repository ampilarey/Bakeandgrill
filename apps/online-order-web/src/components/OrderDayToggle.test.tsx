import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderDayToggle } from './OrderDayToggle';
import { OrderDayProvider } from '../context/OrderDayContext';

vi.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'day.today': 'Today',
        'day.tomorrow': 'Tomorrow',
        'day.toggle_aria': 'Order day',
      };
      return map[key] ?? key;
    },
    lang: 'en',
  }),
}));

function renderToggle(props: Parameters<typeof OrderDayToggle>[0] = {}) {
  return render(
    <OrderDayProvider>
      <OrderDayToggle {...props} />
    </OrderDayProvider>,
  );
}

describe('OrderDayToggle', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to Today and shows the real tomorrow date', () => {
    renderToggle({ tomorrowDate: '2026-08-06' });
    expect(screen.getByTestId('order-day-today')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('order-day-tomorrow')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('order-day-tomorrow')).toHaveTextContent('Thu 6 Aug');
  });

  it('selecting Tomorrow activates it, persists it and fires onDaySelect', async () => {
    const user = userEvent.setup();
    const onDaySelect = vi.fn();
    renderToggle({ tomorrowDate: '2026-08-06', onDaySelect });

    await user.click(screen.getByTestId('order-day-tomorrow'));

    expect(screen.getByTestId('order-day-tomorrow')).toHaveAttribute('aria-pressed', 'true');
    expect(onDaySelect).toHaveBeenCalledWith('tomorrow');
    expect(localStorage.getItem('bakegrill_order_day')).toBe('tomorrow');
  });

  it('blocked day taps call onBlockedTap and do not switch', async () => {
    const user = userEvent.setup();
    const onBlockedTap = vi.fn();
    const onDaySelect = vi.fn();
    renderToggle({ tomorrowBlocked: true, onBlockedTap, onDaySelect });

    await user.click(screen.getByTestId('order-day-tomorrow'));

    expect(onBlockedTap).toHaveBeenCalledWith('tomorrow');
    expect(onDaySelect).not.toHaveBeenCalled();
    expect(screen.getByTestId('order-day-today')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('order-day-tomorrow')).toHaveAttribute('aria-disabled', 'true');
  });

  it('beforeDaySelect can veto the switch (parent shows a confirm instead)', async () => {
    const user = userEvent.setup();
    const beforeDaySelect = vi.fn(() => false);
    const onDaySelect = vi.fn();
    renderToggle({ beforeDaySelect, onDaySelect });

    await user.click(screen.getByTestId('order-day-tomorrow'));

    expect(beforeDaySelect).toHaveBeenCalledWith('tomorrow');
    expect(onDaySelect).not.toHaveBeenCalled();
    expect(screen.getByTestId('order-day-today')).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem('bakegrill_order_day')).toBeNull();
  });

  it('tapping the already-active day is a no-op (no confirm, no onDaySelect)', async () => {
    const user = userEvent.setup();
    const beforeDaySelect = vi.fn(() => true);
    const onDaySelect = vi.fn();
    renderToggle({ beforeDaySelect, onDaySelect });

    await user.click(screen.getByTestId('order-day-today'));

    expect(beforeDaySelect).not.toHaveBeenCalled();
    expect(onDaySelect).not.toHaveBeenCalled();
  });

  it('closed shop: today blocked, tap reports it', async () => {
    const user = userEvent.setup();
    localStorage.setItem('bakegrill_order_day', 'tomorrow');
    localStorage.setItem(
      'bakegrill_order_day_saved_on',
      (() => {
        const d = new Date();
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      })(),
    );
    const onBlockedTap = vi.fn();
    renderToggle({ todayBlocked: true, onBlockedTap });

    expect(screen.getByTestId('order-day-tomorrow')).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByTestId('order-day-today'));
    expect(onBlockedTap).toHaveBeenCalledWith('today');
    expect(screen.getByTestId('order-day-tomorrow')).toHaveAttribute('aria-pressed', 'true');
  });
});
