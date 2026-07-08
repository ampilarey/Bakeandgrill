import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import TimeClockPage from '../pages/TimeClockPage';
import { clearCurrentUserPermissionCache, primeCurrentUserPermissionCache } from '../hooks/usePermissions';
import type { StaffUser } from '../api';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    getTimeClockHistory: vi.fn().mockResolvedValue({ data: [] }),
    getTimeClockSummary: vi.fn().mockResolvedValue({ data: [] }),
  };
});

const manager: StaffUser = {
  id: 1,
  name: 'Manager',
  email: 'm@test.com',
  role: 'manager',
  permissions: ['staff.view', 'pos.time_clock'],
};

const cashier: StaffUser = {
  id: 2,
  name: 'Cashier',
  email: 'c@test.com',
  role: 'staff',
  permissions: ['pos.time_clock'],
};

describe('TimeClockPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    clearCurrentUserPermissionCache();
  });

  it('shows History for all users and Summary only for staff oversight', () => {
    primeCurrentUserPermissionCache(manager);
    render(<TimeClockPage />);
    expect(screen.getByRole('tab', { name: /History/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Summary/i })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: /Clock In\/Out/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Clock In/i })).toBeNull();
  });

  it('hides Summary tab when user lacks staff.view', () => {
    primeCurrentUserPermissionCache(cashier);
    render(<TimeClockPage />);
    expect(screen.getByRole('tab', { name: /History/i })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: /Summary/i })).toBeNull();
  });

  it('points staff to the POS for clocking in', () => {
    primeCurrentUserPermissionCache(cashier);
    render(<TimeClockPage />);
    expect(screen.getByText(/POS terminal/i)).toBeTruthy();
  });
});
