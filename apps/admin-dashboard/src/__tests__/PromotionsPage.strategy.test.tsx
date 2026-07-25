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

  it('tier fixed value round-trips as MVR (30 → 3000 laari → 30.00)', async () => {
    renderWithRouter(<PromotionsPage />);
    await screen.findByRole('heading', { name: 'Promotions' });
    fireEvent.click(screen.getByRole('button', { name: /\+ New Promo/i }));

    const typeSelect = await screen.findByDisplayValue('Fixed Amount (MVR)');
    fireEvent.change(typeSelect, { target: { value: 'tiered' } });

    expect(screen.getByText('Fixed (MVR)')).toBeTruthy();
    const valueInput = screen.getByDisplayValue('30.00') as HTMLInputElement;
    fireEvent.change(valueInput, { target: { value: '30' } });
    expect(valueInput.value).toBe('30.00');

    fireEvent.change(screen.getByPlaceholderText('e.g. Ramadan Special'), { target: { value: 'Tier spend' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. RAMADAN20'), { target: { value: 'TIER30' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Promo/i }));

    await waitFor(() => {
      expect(api.createPromotion).toHaveBeenCalled();
    });
    const payload = vi.mocked(api.createPromotion).mock.calls[0][0];
    expect(payload.type).toBe('tiered');
    expect(payload.metadata?.tiers?.[0]?.value).toBe(3000);
    expect(payload.metadata?.tiers?.[0]?.kind).toBe('fixed');
  });

  it('quantity-break fixed value round-trips as MVR', async () => {
    renderWithRouter(<PromotionsPage />);
    await screen.findByRole('heading', { name: 'Promotions' });
    fireEvent.click(screen.getByRole('button', { name: /\+ New Promo/i }));

    const typeSelect = await screen.findByDisplayValue('Fixed Amount (MVR)');
    fireEvent.change(typeSelect, { target: { value: 'quantity_break' } });

    const kindSelect = screen.getByDisplayValue('Percentage') as HTMLSelectElement;
    fireEvent.change(kindSelect, { target: { value: 'fixed' } });
    expect(screen.getByText('Fixed (MVR)')).toBeTruthy();
    expect(screen.getByText('Value (MVR)')).toBeTruthy();

    const valueInput = screen.getByDisplayValue('0.10') as HTMLInputElement;
    fireEvent.change(valueInput, { target: { value: '30' } });
    expect(valueInput.value).toBe('30.00');

    fireEvent.change(screen.getByPlaceholderText('e.g. Ramadan Special'), { target: { value: 'Qty break' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. RAMADAN20'), { target: { value: 'QTY30' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Promo/i }));

    await waitFor(() => {
      expect(api.createPromotion).toHaveBeenCalled();
    });
    const payload = vi.mocked(api.createPromotion).mock.calls[0][0];
    expect(payload.type).toBe('quantity_break');
    expect(payload.metadata?.kind).toBe('fixed');
    expect(payload.metadata?.value).toBe(3000);
  });

  it('shows budget concurrency helper text', async () => {
    renderWithRouter(<PromotionsPage />);
    await screen.findByRole('heading', { name: 'Promotions' });
    fireEvent.click(screen.getByRole('button', { name: /\+ New Promo/i }));
    expect(await screen.findByText(/Approximate under high concurrency/i)).toBeTruthy();
  });
});
