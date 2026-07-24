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

function mockMobileWidth() {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 390 });
  window.dispatchEvent(new Event('resize'));
}

describe('Layout mobile section sheet', () => {
  beforeEach(() => {
    mockMobileWidth();
    localStorage.clear();
  });

  it('opens section sheet when a bottom tab is tapped', () => {
    render(
      <MemoryRouter initialEntries={['/orders']}>
        <AppShell user={owner} onLogout={() => {}}>
          <div>Page</div>
        </AppShell>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByLabelText('Monitor'));
    expect(screen.getByRole('dialog', { name: /Monitor pages/i })).toBeInTheDocument();
  });

  it('keeps the sheet open when switching to a different section (does not auto-navigate)', () => {
    render(
      <MemoryRouter initialEntries={['/orders']}>
        <AppShell user={owner} onLogout={() => {}}>
          <div>Page</div>
        </AppShell>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByLabelText('Manage'));
    const sheet = screen.getByRole('dialog', { name: /Manage pages/i });
    expect(sheet).toBeInTheDocument();
    // Sheet lists multiple Manage pages — not only the first destination
    expect(sheet.textContent).toMatch(/Menu Items/i);
    expect(sheet.textContent).toMatch(/Inventory/i);
  });

  it('closes the sheet after choosing a page tile', () => {
    render(
      <MemoryRouter initialEntries={['/orders']}>
        <AppShell user={owner} onLogout={() => {}}>
          <div>Page</div>
        </AppShell>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByLabelText('Monitor'));
    const ordersTiles = screen.getAllByText('Orders');
    // Prefer the tile inside the sheet dialog
    const sheet = screen.getByRole('dialog');
    const tile = ordersTiles.find((el) => sheet.contains(el)) ?? ordersTiles[0];
    fireEvent.click(tile.closest('a')!);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
