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
    }],
  }),
  fetchShiftHistory: vi.fn().mockResolvedValue({ shifts: [] }),
  forceCloseShift: vi.fn(),
}));

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

  it('shows guidance when user lacks live-view permission', () => {
    mockCan.mockReturnValue(false);
    renderWithRouter(<ShiftsPage />);
    expect(screen.queryByRole('button', { name: /Live Shifts/i })).toBeNull();
    expect(screen.getByText(/manager permissions/i)).toBeTruthy();
  });
});
