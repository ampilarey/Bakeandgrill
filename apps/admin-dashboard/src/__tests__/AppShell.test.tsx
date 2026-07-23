import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { SectionRail } from '../components/SectionRail';
import { MobileTabBar } from '../components/MobileTabBar';
import { getNavGroups, getSectionById } from '../components/navConfig';
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

const limited: StaffUser = {
  id: 2,
  name: 'Cashier',
  email: 'c@test.com',
  role: 'staff',
  permissions: ['admin.access', 'orders.view', 'dashboard.view'],
};

function mockDesktopWidth() {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1280 });
}

function mockMobileWidth() {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 390 });
}

function renderShell(path: string, user: StaffUser = owner) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="*" element={<AppShell user={user} onLogout={() => {}}><div>Page</div></AppShell>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AppShell', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    mockDesktopWidth();
  });

  it('derives the active section from the route', () => {
    renderShell('/orders');
    const tab = screen.getByRole('tab', { name: /Monitor/i });
    expect(tab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('navigation', { name: /Monitor pages/i })).toBeInTheDocument();
  });

  it('selecting a section navigates to its first permitted item', () => {
    renderShell('/orders');
    fireEvent.click(screen.getByRole('tab', { name: /Analyze/i }));
    // Owner can access Reports as first Analyze item
    expect(screen.getByRole('navigation', { name: /Analyze pages/i })).toBeInTheDocument();
  });

  it('hides sections with zero permitted items', () => {
    renderShell('/orders', limited);
    expect(screen.queryByRole('tab', { name: /Analyze/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /System/i })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Monitor/i })).toBeInTheDocument();
  });

  it('persists sidebar collapse preference', () => {
    renderShell('/dashboard');
    const collapse = screen.getByLabelText(/Collapse sidebar/i);
    fireEvent.click(collapse);
    expect(localStorage.getItem('bg_sidebar_collapsed')).toBe('true');
  });
});

describe('SectionRail', () => {
  beforeEach(() => {
    mockDesktopWidth();
  });

  it('renders only permitted items and highlights active', () => {
    const manage = getSectionById('manage')!;
    render(
      <MemoryRouter initialEntries={['/inventory']}>
        <SectionRail section={manage} user={limited} collapsed={false} lowStockCount={0} />
      </MemoryRouter>,
    );
    // limited user has no manage perms — rail empty
    expect(screen.queryByText('Inventory')).not.toBeInTheDocument();

    render(
      <MemoryRouter initialEntries={['/inventory']}>
        <SectionRail section={manage} user={owner} collapsed={false} lowStockCount={3} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Inventory')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});

describe('MobileTabBar', () => {
  beforeEach(() => {
    mockMobileWidth();
  });

  it('renders permitted sections only', () => {
    render(
      <MemoryRouter initialEntries={['/orders']}>
        <MobileTabBar user={limited} onSelectSection={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('navigation', { name: /Admin sections/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Monitor')).toBeInTheDocument();
    expect(screen.queryByLabelText('Analyze')).not.toBeInTheDocument();
  });
});

describe('nav section uniqueness (shell guard)', () => {
  it('every group item appears in exactly one section', () => {
    const seen = new Set<string>();
    for (const g of getNavGroups()) {
      for (const item of g.items) {
        expect(seen.has(item.to)).toBe(false);
        seen.add(item.to);
      }
    }
  });
});
