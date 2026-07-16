import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import TablesPage from '../pages/TablesPage';
import { renderWithRouter } from './testUtils';

vi.mock('../api', () => ({
  fetchTables: vi.fn().mockResolvedValue({
    tables: [{
      id: 1,
      name: '5',
      capacity: 4,
      location: 'Indoor',
      status: 'occupied',
      current_order_id: 99,
      current_order_number: '1005',
      current_order_total: 250,
    }],
  }),
  createTable: vi.fn(),
  updateTable: vi.fn(),
}));

describe('TablesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('removes floor service actions', async () => {
    renderWithRouter(<TablesPage />);
    await screen.findByText('T5');
    expect(screen.queryByRole('button', { name: /^Open$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Close$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Split Bill/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Merge/i })).toBeNull();
  });

  it('keeps table configuration actions', async () => {
    renderWithRouter(<TablesPage />);
    expect(screen.getByRole('button', { name: /\+ Add Table/i })).toBeTruthy();
    expect(await screen.findByRole('button', { name: /^Edit$/i })).toBeTruthy();
  });

  it('points staff to the POS for table service', () => {
    renderWithRouter(<TablesPage />);
    expect(screen.getByText(/POS/i)).toBeTruthy();
  });

  it('shows read-only order peek on occupied tables', async () => {
    renderWithRouter(<TablesPage />);
    expect(await screen.findByText(/#1005/)).toBeTruthy();
    expect(screen.getByText(/MVR 250\.00/)).toBeTruthy();
  });
});
