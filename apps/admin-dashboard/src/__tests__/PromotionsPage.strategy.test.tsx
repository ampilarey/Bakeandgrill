import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { PromotionsPage } from '../pages/PromotionsPage';
import { renderWithRouter } from './testUtils';
import * as api from '../api';

describe('PromotionsPage strategy fields', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(api, 'fetchPromotions').mockResolvedValue({ data: [] });
    vi.spyOn(api, 'createPromotion').mockResolvedValue({
      promotion: {
        id: 1,
        name: 'BOGO',
        code: 'BOGO',
        type: 'buy_x_get_y',
        discount_value: 0,
        scope: 'order',
        redemptions_count: 0,
        stackable: false,
        is_active: true,
        created_at: new Date().toISOString(),
        metadata: { buy_qty: 2, get_qty: 1, get_discount_pct: 100, cheapest: true },
      },
    });
  });

  it('shows tiered / quantity break / BOGO / free delivery in type picker', async () => {
    renderWithRouter(<PromotionsPage />);
    await screen.findByRole('heading', { name: 'Promotions' });
    fireEvent.click(screen.getByRole('button', { name: /\+ New Promo/i }));

    expect(await screen.findByText('Create New Promotion')).toBeTruthy();
    const typeSelect = screen.getByDisplayValue('Fixed Amount (MVR)') as HTMLSelectElement;
    const labels = Array.from(typeSelect.options).map((o) => o.label);
    expect(labels).toEqual(expect.arrayContaining([
      'Tiered (spend & save)',
      'Quantity break',
      'BOGO / Buy X Get Y',
      'Free delivery',
    ]));
  });

  it('renders BOGO fields and first-order toggle', async () => {
    renderWithRouter(<PromotionsPage />);
    await screen.findByRole('heading', { name: 'Promotions' });
    fireEvent.click(screen.getByRole('button', { name: /\+ New Promo/i }));

    const typeSelect = await screen.findByDisplayValue('Fixed Amount (MVR)');
    fireEvent.change(typeSelect, { target: { value: 'buy_x_get_y' } });

    expect(await screen.findByText('Buy qty')).toBeTruthy();
    expect(screen.getByText('Get qty')).toBeTruthy();
    expect(screen.getByText('First order only')).toBeTruthy();
    expect(screen.getByText('Campaign budget (MVR, optional)')).toBeTruthy();
  });

  it('lists spent / budget progress', async () => {
    vi.mocked(api.fetchPromotions).mockResolvedValue({
      data: [{
        id: 9,
        name: 'Budgeted',
        code: 'BUD',
        type: 'fixed',
        discount_value: 1000,
        scope: 'order',
        redemptions_count: 2,
        budget_laar: 10000,
        spent_laar: 2500,
        stackable: false,
        is_active: true,
        created_at: new Date().toISOString(),
      }],
    });

    renderWithRouter(<PromotionsPage />);
    await waitFor(() => {
      expect(screen.getByText('25 / 100')).toBeTruthy();
    });
  });
});
