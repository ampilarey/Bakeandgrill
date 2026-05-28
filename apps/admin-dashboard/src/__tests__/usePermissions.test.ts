import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import {
  clearCurrentUserPermissionCache,
  primeCurrentUserPermissionCache,
  useCurrentUserPermissions,
} from '../hooks/usePermissions';
import type { StaffUser } from '../api';

const owner: StaffUser = {
  id: 1,
  name: 'Owner',
  email: 'o@test.com',
  role: 'owner',
  permissions: ['orders.view', 'staff.view'],
};

const staff: StaffUser = {
  id: 2,
  name: 'Cashier',
  email: 's@test.com',
  role: 'staff',
  permissions: ['orders.view'],
};

describe('current user permission cache', () => {
  beforeEach(() => {
    clearCurrentUserPermissionCache();
    vi.restoreAllMocks();
  });

  it('clears cached user on logout flow', async () => {
    primeCurrentUserPermissionCache(owner);
    const { result } = renderHook(() => useCurrentUserPermissions());
    await waitFor(() => expect(result.current.user?.id).toBe(1));

    act(() => clearCurrentUserPermissionCache());
    await waitFor(() => expect(result.current.user).toBeNull());
  });

  it('primed user replaces stale owner after user switch', async () => {
    primeCurrentUserPermissionCache(owner);
    const { result } = renderHook(() => useCurrentUserPermissions());
    await waitFor(() => expect(result.current.user?.role).toBe('owner'));

    act(() => {
      clearCurrentUserPermissionCache();
      primeCurrentUserPermissionCache(staff);
    });
    await waitFor(() => {
      expect(result.current.user?.id).toBe(2);
      expect(result.current.can('staff.view')).toBe(false);
    });
  });
});
