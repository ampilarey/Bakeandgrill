import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import TimeClockPage from '../pages/TimeClockPage';

vi.mock('../api', () => ({
  getTimeClockHistory: vi.fn().mockResolvedValue({ data: [] }),
  getTimeClockSummary: vi.fn().mockResolvedValue({ data: [] }),
}));

describe('TimeClockPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows oversight tabs only (no self clock in/out)', () => {
    render(<TimeClockPage />);
    expect(screen.getByRole('tab', { name: /History/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Summary/i })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: /Clock In\/Out/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Clock In/i })).toBeNull();
  });

  it('points staff to the POS for clocking in', () => {
    render(<TimeClockPage />);
    expect(screen.getByText(/POS terminal/i)).toBeTruthy();
  });
});
