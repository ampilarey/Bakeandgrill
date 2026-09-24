import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import ShiftsPage from '../pages/ShiftsPage';
import { renderWithRouter } from './testUtils';

const mockCan = vi.fn((slug: string) => slug === 'shifts.view_all_history');

vi.mock('../hooks/usePermissions', () => ({
  useCurrentUserPermissions: () => ({ can: mockCan, user: null, loading: false }),
}));

vi.mock('../api', () => ({
  fetchLiveShifts: vi.fn().mockResolvedValue({
    shifts: [{
      id: 1,
      user_id: 2,
      opened_at: new Date().toISOString(),
      closed_at: null,
      opening_cash: 100,
      closing_cash: null,
      variance: null,
      user: { id: 2, name: 'Cashier' },
      device: { id: 1, name: 'POS-1' },
      opening_float_expected: 160,
      opening_float_variance: -60,
      cash_movements: [
        { id: 7, type: 'cash_in', amount: '150.00', reason: 'Typo', created_at: new Date().toISOString(), user: { id: 2, name: 'Cashier' } },
        { id: 8, type: 'cash_out', amount: '20.00', reason: 'Milk', created_at: new Date().toISOString(), voided_at: new Date().toISOString(), void_reason: 'Wrong till', voided_by: { id: 1, name: 'Owner' } },
      ],
    }],
  }),
  fetchShiftHistory: vi.fn().mockResolvedValue({ shifts: [] }),
  forceCloseShift: vi.fn(),
  voidCashMovement: vi.fn().mockResolvedValue({ movement: { id: 7 } }),
}));

import { fireEvent, waitFor } from '@testing-library/react';
import * as api from '../api';

describe('ShiftsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCan.mockImplementation((slug: string) => slug === 'shifts.view_all_history');
  });

  it('shows oversight tabs only (no My Shift)', async () => {
    renderWithRouter(<ShiftsPage />);
    expect(screen.getByRole('button', { name: /Live Shifts/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /History/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /My Shift/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Open Shift/i })).toBeNull();
  });

  it('keeps Force close on Live Shifts', async () => {
    renderWithRouter(<ShiftsPage />);
    expect(await screen.findByRole('button', { name: /Force close/i })).toBeTruthy();
  });

  it('points staff to the POS for opening shifts', () => {
    renderWithRouter(<ShiftsPage />);
    expect(screen.getByText(/POS terminal/i)).toBeTruthy();
  });

  it('shows the float shortfall, lists movements and voids one with a reason (ops audit, 2026-09-25)', async () => {
    renderWithRouter(<ShiftsPage />);
    expect(await screen.findByTestId('float-variance-1')).toHaveTextContent('Short MVR 60.00 vs last close MVR 160.00');
    fireEvent.click(screen.getByTestId('float-variance-1')); // any cell expands the row
    const list = await screen.findByTestId('shift-movements-1');
    expect(list).toHaveTextContent('voided by Owner: Wrong till');
    fireEvent.click(screen.getByLabelText('Void movement 7'));
    fireEvent.change(screen.getByLabelText('Void reason'), { target: { value: 'entered 150 instead of 15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Void movement' }));
    await waitFor(() => expect(api.voidCashMovement).toHaveBeenCalledWith(1, 7, 'entered 150 instead of 15'));
  });

  it('sends the history date range to the API', async () => {
    renderWithRouter(<ShiftsPage />);
    fireEvent.click(screen.getByRole('button', { name: /History/i }));
    fireEvent.change(await screen.findByLabelText('Shift history from'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText('Shift history to'), { target: { value: '2026-09-15' } });
    fireEvent.click(screen.getByText('Apply'));
    await waitFor(() => expect(api.fetchShiftHistory).toHaveBeenLastCalledWith({ from: '2026-09-01', to: '2026-09-15', limit: 200 }));
  });

  it('shows guidance when user lacks live-view permission', () => {
    mockCan.mockReturnValue(false);
    renderWithRouter(<ShiftsPage />);
    expect(screen.queryByRole('button', { name: /Live Shifts/i })).toBeNull();
    expect(screen.getByText(/manager permissions/i)).toBeTruthy();
  });
});
