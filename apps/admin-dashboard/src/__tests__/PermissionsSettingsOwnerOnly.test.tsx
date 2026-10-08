import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ToastProvider } from '../components/ui';

/*
 * Manager walk, 2026-10-08: a manager could open Settings → Roles &
 * permissions, which loaded nothing for them ("Failed to load role
 * permissions") and still offered "Save role defaults". The editor is the
 * owner's (roles_permissions.manage); a manager keeps the explanation and the
 * cheat sheet and is told who changes access.
 */

const perms = vi.hoisted(() => ({ manage: false }));
vi.mock('../hooks/usePermissions', () => ({
  useCurrentUserPermissions: () => ({
    can: (slug?: string) => slug !== 'roles_permissions.manage' || perms.manage,
    loading: false,
    user: null,
  }),
}));

const api = vi.hoisted(() => ({
  fetchStaff: vi.fn(),
  getRolePermissions: vi.fn(),
  getUserPermissions: vi.fn(),
  updateRolePermissions: vi.fn(),
  updateUserPermissions: vi.fn(),
}));
vi.mock('../api', () => api);

import { PermissionsSettings } from '../pages/SettingsPage/PermissionsSettingsSubPage';

function renderIt() {
  return render(
    <ToastProvider>
      <PermissionsSettings />
    </ToastProvider>,
  );
}

describe('Roles & permissions for someone who cannot change them', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.fetchStaff.mockResolvedValue({ staff: [] });
    api.getRolePermissions.mockResolvedValue({ permissions: [] });
  });

  it('shows a manager the owner-only note, not an editor that cannot load', async () => {
    perms.manage = false;
    renderIt();

    expect(screen.getByTestId('permissions-owner-only')).toHaveTextContent('Only the owner changes role defaults');
    expect(screen.getByText('How permissions work')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Save role defaults/ })).not.toBeInTheDocument();
    expect(api.getRolePermissions).not.toHaveBeenCalled();
    expect(api.fetchStaff).not.toHaveBeenCalled();
  });

  it('still gives the owner the editor', async () => {
    perms.manage = true;
    renderIt();

    await waitFor(() => expect(api.getRolePermissions).toHaveBeenCalledWith('manager'));
    expect(screen.queryByTestId('permissions-owner-only')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Role permissions/ })).toBeInTheDocument();
  });
});
