import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CommandPalette } from '../components/CommandPalette';
import * as api from '../api';
import * as permsHook from '../hooks/usePermissions';

vi.mock('../api', () => ({
  fetchOrders: vi.fn(),
  fetchStaff: vi.fn(),
}));

describe('CommandPalette permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not fetch staff or orders without permission', async () => {
    vi.spyOn(permsHook, 'useCurrentUserPermissions').mockReturnValue({
      user: { id: 1, name: 'S', role: 'staff', permissions: [] } as never,
      loading: false,
      can: () => false,
    });

    render(
      <MemoryRouter>
        <CommandPalette open onClose={() => {}} />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByPlaceholderText(/search pages/i), { target: { value: 'order' } });

    await waitFor(() => {
      expect(api.fetchOrders).not.toHaveBeenCalled();
      expect(api.fetchStaff).not.toHaveBeenCalled();
    }, { timeout: 800 });
  });

  it('fetches only orders when user has orders.view', async () => {
    vi.spyOn(permsHook, 'useCurrentUserPermissions').mockReturnValue({
      user: { id: 1, name: 'S', role: 'staff', permissions: ['orders.view'] } as never,
      loading: false,
      can: (slug?: string) => slug === 'orders.view',
    });
    vi.mocked(api.fetchOrders).mockResolvedValue({ data: [{ id: 1, order_number: '1001', status: 'pending', total: 50 }] } as never);

    render(
      <MemoryRouter>
        <CommandPalette open onClose={() => {}} />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByPlaceholderText(/search pages/i), { target: { value: '1001' } });

    await waitFor(() => {
      expect(api.fetchOrders).toHaveBeenCalled();
      expect(api.fetchStaff).not.toHaveBeenCalled();
    }, { timeout: 800 });
  });
});
