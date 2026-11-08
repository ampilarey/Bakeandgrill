import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import type { PromotionChannel, PromotionOrderType } from '../api';
import { OrderLimitsField, orderLimitText } from './PromotionOrderLimits';

/* Owner, 2026-11-08: "today all online orders will get 10% discount", "all dine in customers…". */
describe('Which orders on an offer', () => {
  it('words the limit the way the till and the server do', () => {
    expect(orderLimitText(null, null)).toBeNull();
    expect(orderLimitText(['till', 'online'], ['dine_in', 'takeaway', 'online_pickup', 'delivery'])).toBeNull();
    expect(orderLimitText(null, ['dine_in'])).toBe('Dine-in only');
    expect(orderLimitText(['online'], null)).toBe('App orders only');
    expect(orderLimitText(['online'], ['online_pickup', 'delivery'])).toBe('App orders · pickup and delivery only');
  });

  it('picks where ordered and the type, and nothing picked is every order', () => {
    function Host() {
      const [v, setV] = useState<{ order_channels: PromotionChannel[] | null; order_types: PromotionOrderType[] | null }>({ order_channels: null, order_types: null });
      return <OrderLimitsField channels={v.order_channels} types={v.order_types} onChange={setV} />;
    }
    render(<Host />);
    expect(screen.getByTestId('promo-which-orders-summary')).toHaveTextContent('Every order');
    fireEvent.click(screen.getByRole('button', { name: 'Dine-in' }));
    expect(screen.getByTestId('promo-which-orders-summary')).toHaveTextContent('Dine-in only');
    expect(screen.getByRole('button', { name: 'Dine-in' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Order app' }));
    expect(screen.getByTestId('promo-which-orders-summary')).toHaveTextContent('App orders · dine-in only');
    fireEvent.click(screen.getByRole('button', { name: 'Dine-in' }));
    fireEvent.click(screen.getByRole('button', { name: 'Order app' }));
    expect(screen.getByTestId('promo-which-orders-summary')).toHaveTextContent('Every order');
  });
});
