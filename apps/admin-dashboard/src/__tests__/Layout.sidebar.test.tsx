import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import type { StaffUser } from '../api';

vi.mock('../api', () => ({
  fetchLowStockItems: vi.fn().mockResolvedValue({ data: [] }),
}));

const owner: StaffUser = {
  id: 1,
  name: 'Owner',
  email: 'o@test.com',
  role: 'owner',
  permissions: [],
};

function mockDesktopWidth() {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1280 });
}

function renderLayout(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppShell user={owner} onLogout={() => {}}>
        <div>Page</div>
      </AppShell>
    </MemoryRouter>,
  );
}

describe('Layout desktop section shell (compat)', () => {
  beforeEach(() => {
    mockDesktopWidth();
    localStorage.clear();
  });

  it('shows Monitor as active section on /delivery', () => {
    renderLayout('/delivery');
    expect(screen.getByRole('tab', { name: /Monitor/i })).toHaveAttribute('aria-selected', 'true');
  });

  it('does not mark Monitor active on /delivery-settings', () => {
    renderLayout('/delivery-settings');
    expect(screen.getByRole('tab', { name: /Monitor/i })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: /Manage/i })).toHaveAttribute('aria-selected', 'true');
  });

  it('auto-selects Analyze on /reports', () => {
    renderLayout('/reports');
    expect(screen.getByRole('tab', { name: /Analyze/i })).toHaveAttribute('aria-selected', 'true');
  });

  it('persists sidebar collapse via bg_sidebar_collapsed', () => {
    renderLayout('/dashboard');
    fireEvent.click(screen.getByLabelText(/Collapse sidebar/i));
    expect(localStorage.getItem('bg_sidebar_collapsed')).toBe('true');
  });
});
