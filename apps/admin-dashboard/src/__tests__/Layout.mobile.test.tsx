import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Layout } from '../components/Layout';
import type { StaffUser } from '../api';

vi.mock('../api', () => ({
  fetchLowStockItems: vi.fn().mockResolvedValue({ data: [] }),
}));

const user: StaffUser = {
  id: 1,
  name: 'Owner',
  email: 'o@test.com',
  role: 'owner',
  permissions: ['dashboard.view', 'orders.view'],
};

function mockMobileWidth() {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 390 });
  window.dispatchEvent(new Event('resize'));
}

describe('Layout mobile drawer', () => {
  beforeEach(() => {
    mockMobileWidth();
  });

  it('closes drawer after clicking a nav link', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Layout user={user} onLogout={() => {}}>
          <div>Page</div>
        </Layout>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByLabelText('Open menu'));
    expect(screen.getByText('Monitor')).toBeTruthy();

    const drawerOrders = document.querySelector('.admin-mobile-drawer-tile[href="/orders"]');
    expect(drawerOrders).toBeTruthy();
    fireEvent.click(drawerOrders!);
    expect(screen.queryByText('Monitor')).toBeNull();
  });
});
