import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { KDSPage } from '../pages/KDSPage';
import { renderWithRouter } from './testUtils';

vi.mock('../hooks/useSse', () => ({
  useSse: () => ({ connected: true }),
}));

vi.mock('../utils/audio', () => ({
  playChime: vi.fn(),
  playLateAlert: vi.fn(),
}));

vi.mock('../api/menu', () => ({
  fetchMenuGroups: vi.fn().mockResolvedValue({ data: [] }),
  fetchAdminItems: vi.fn().mockResolvedValue({ data: [] }),
}));

vi.mock('../api', () => ({
  fetchKdsOrders: vi.fn().mockResolvedValue({
    orders: [{
      id: 1,
      order_number: '1001',
      status: 'pending',
      type: 'dine_in',
      created_at: new Date().toISOString(),
      items: [{ quantity: 1, item_name: 'Burger' }],
    }],
  }),
}));

describe('KDSPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is read-only — no kitchen execution buttons', async () => {
    renderWithRouter(<KDSPage />);
    await screen.findByText('#1001');
    expect(screen.queryByRole('button', { name: /Start Cooking/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Complete/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Recall/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Sold out/i })).toBeNull();
  });

  it('keeps monitor controls', async () => {
    renderWithRouter(<KDSPage />);
    expect(screen.getByRole('button', { name: /Refresh/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Fullscreen/i })).toBeTruthy();
  });

  it('points kitchen staff to the KDS app', () => {
    renderWithRouter(<KDSPage />);
    expect(screen.getByText(/KDS app/i)).toBeTruthy();
    expect(screen.getByText(/\/kds/)).toBeTruthy();
  });
});
