import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ToastProvider } from '../components/ui';
import { arrangeGroups } from '../pages/SettingsPage/permissionSections';

/*
 * Owner, 2026-10-09: "is it possible to group and make it easier". The role
 * editor is tiles per group, in six sections, each saying how many are on;
 * a tile opens into its switches; one save bar covers every unsaved change.
 */

vi.mock('../hooks/usePermissions', () => ({
  useCurrentUserPermissions: () => ({ can: () => true, loading: false, user: null }),
}));

const api = vi.hoisted(() => ({
  fetchStaff: vi.fn(),
  getMyPermissions: vi.fn(),
  getRolePermissions: vi.fn(),
  getUserPermissions: vi.fn(),
  updateRolePermissions: vi.fn(),
  updateUserPermissions: vi.fn(),
}));
vi.mock('../api', () => api);

import { PermissionsSettings } from '../pages/SettingsPage/PermissionsSettingsSubPage';

type Perm = { slug: string; name: string; group: string };
const CATALOG: Perm[] = [
  { slug: 'pos.access', name: 'Access POS app', group: 'POS' },
  { slug: 'pos.ring_sales', name: 'Ring sales', group: 'POS' },
  { slug: 'orders.void', name: 'Void orders', group: 'Orders' },
  { slug: 'orders.view', name: 'View orders', group: 'Orders' },
  { slug: 'reports.view', name: 'View reports', group: 'Reports' },
  { slug: 'brand.new', name: 'Something new', group: 'Brand New Group' },
];
const GRANTS: Record<string, string[]> = {
  manager: ['pos.access', 'pos.ring_sales', 'orders.view', 'orders.void', 'reports.view'],
  staff: ['pos.access', 'pos.ring_sales', 'orders.view'],
  kitchen_staff: [],
};

function rolePayload(role: string) {
  return {
    role,
    permissions: CATALOG.map((p) => ({
      ...p,
      granted: GRANTS[role].includes(p.slug),
      role_default: GRANTS[role].includes(p.slug),
      customised: role === 'manager' && p.slug === 'orders.void',
      source: 'role' as const,
    })),
  };
}

function renderIt(initialUserId?: number) {
  return render(
    <ToastProvider>
      <PermissionsSettings initialUserId={initialUserId} />
    </ToastProvider>,
  );
}

describe('arrangeGroups', () => {
  it('puts groups in the sections of the admin menu, unknown ones under Other', () => {
    const sections = arrangeGroups(['Reports', 'Orders', 'Brand New Group', 'POS']);
    expect(sections.map((s) => s.label)).toEqual(['Till and orders', 'Money and reports', 'Other']);
    expect(sections[0].groups).toEqual(['POS', 'Orders']);
    expect(sections[2].groups).toEqual(['Brand New Group']);
  });
});

describe('Roles & permissions editor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.fetchStaff.mockResolvedValue({ staff: [{ id: 7, name: 'Aisha', role: 'staff' }] });
    api.getRolePermissions.mockImplementation((role: string) => Promise.resolve(rolePayload(role)));
    api.updateRolePermissions.mockResolvedValue(undefined);
    api.updateUserPermissions.mockResolvedValue(undefined);
  });

  it('offers the way back when opened from Team → Staff', async () => {
    // Owner, 2026-10-12: Staff → More → Permissions opens this one editor
    // on that person instead of a second pop-up, so the page says how to
    // get back; opened from Settings, there is no such link.
    api.getUserPermissions.mockResolvedValue({ role: 'staff', permissions: rolePayload('staff').permissions });
    const onBack = vi.fn();
    render(
      <ToastProvider>
        <PermissionsSettings initialUserId={7} onBack={onBack} backLabel="Back to Staff" />
      </ToastProvider>,
    );
    expect(await screen.findByRole('tab', { name: /One person/, selected: true })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('perm-back'));
    expect(onBack).toHaveBeenCalled();
    expect(screen.getByTestId('perm-back')).toHaveTextContent('Back to Staff');
  });

  it('has no back link when opened from Settings', async () => {
    renderIt();
    await screen.findByRole('tab', { name: /Manager\s*5/ });
    expect(screen.queryByTestId('perm-back')).not.toBeInTheDocument();
  });

  it('shows each role with how many it has, and the groups as tiles with counts', async () => {
    renderIt();
    await waitFor(() => expect(screen.getByRole('tab', { name: /Manager\s*5/ })).toBeInTheDocument());
    expect(screen.getByRole('tab', { name: /Cashier\s*3/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Kitchen staff\s*0/ })).toBeInTheDocument();

    expect(screen.getByTestId('perm-section-till')).toHaveTextContent('Till and orders');
    expect(screen.getByTestId('perm-tile-orders')).toHaveTextContent('2 of 2 on');
    expect(screen.getByTestId('perm-tile-orders')).toHaveTextContent('1 changed');
    // A group no section names is still there.
    expect(screen.getByTestId('perm-section-other')).toHaveTextContent('Brand New Group');
    // Closed tiles keep the switches off the page.
    expect(screen.queryByRole('switch', { name: 'Void orders' })).not.toBeInTheDocument();
  });

  it('saves only what changed, after a switch inside an opened group', async () => {
    renderIt();
    fireEvent.click(await screen.findByTestId('perm-tile-orders'));
    const panel = screen.getByTestId('perm-panel-orders');
    expect(within(panel).getByTestId('role-custom-orders.void')).toHaveTextContent('changed');

    fireEvent.click(within(panel).getByRole('switch', { name: 'Void orders' }));
    const bar = screen.getByTestId('permissions-savebar');
    expect(bar).toHaveTextContent('1 unsaved change');
    expect(bar).toHaveTextContent('Manager 1');

    fireEvent.click(within(bar).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.updateRolePermissions).toHaveBeenCalledWith('manager', { 'orders.void': false }));
    await waitFor(() => expect(screen.queryByTestId('permissions-savebar')).not.toBeInTheDocument());
  });

  it('switches a whole group off, and putting a switch back clears the change', async () => {
    renderIt();
    fireEvent.click(await screen.findByTestId('perm-tile-pos'));
    const panel = screen.getByTestId('perm-panel-pos');
    fireEvent.click(within(panel).getByRole('button', { name: 'All off' }));
    expect(panel).toHaveTextContent('0 of 2 on');
    expect(screen.getByTestId('permissions-savebar')).toHaveTextContent('2 unsaved changes');

    fireEvent.click(within(panel).getByRole('switch', { name: 'Ring sales' }));
    expect(screen.getByTestId('permissions-savebar')).toHaveTextContent('1 unsaved change');
    fireEvent.click(within(panel).getByRole('switch', { name: 'Access POS app' }));
    expect(screen.queryByTestId('permissions-savebar')).not.toBeInTheDocument();
  });

  it('keeps unsaved changes when moving to another role, and saves both', async () => {
    renderIt();
    fireEvent.click(await screen.findByTestId('perm-tile-reports'));
    fireEvent.click(screen.getByRole('switch', { name: 'View reports' }));

    fireEvent.click(screen.getByRole('tab', { name: /Cashier/ }));
    fireEvent.click(screen.getByRole('switch', { name: 'View reports' }));
    const bar = screen.getByTestId('permissions-savebar');
    expect(bar).toHaveTextContent('2 unsaved changes');
    expect(bar).toHaveTextContent('Manager 1 · Cashier 1');

    fireEvent.click(within(bar).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.updateRolePermissions).toHaveBeenCalledTimes(2));
    expect(api.updateRolePermissions).toHaveBeenCalledWith('manager', { 'reports.view': false });
    expect(api.updateRolePermissions).toHaveBeenCalledWith('staff', { 'reports.view': true });
  });

  it('finds a permission by name and opens only the groups that hold it', async () => {
    renderIt();
    await screen.findByTestId('perm-tile-orders');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find a permission' }), { target: { value: 'void' } });
    const panel = screen.getByTestId('perm-panel-orders');
    expect(within(panel).getByRole('switch', { name: 'Void orders' })).toBeInTheDocument();
    expect(within(panel).queryByRole('switch', { name: 'View orders' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('perm-section-money')).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Find a permission' }), { target: { value: 'zzz' } });
    expect(screen.getByText(/Nothing matches "zzz"/)).toBeInTheDocument();
  });

  it('shows the owner every permission, on and locked', async () => {
    renderIt();
    await screen.findByTestId('perm-tile-orders');
    fireEvent.click(screen.getByRole('tab', { name: /Owner/ }));
    expect(screen.getByText(/The owner always has every permission/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('perm-tile-orders'));
    const sw = screen.getByRole('switch', { name: 'Void orders' });
    expect(sw).toHaveAttribute('aria-checked', 'true');
    expect(sw).toBeDisabled();
  });

  // Owner, 2026-10-12: one person looks like a role. The same switches, with
  // the role's answer as the start; a switch set away from the role wears a
  // "For them" mark that puts it back.
  function mockAisha() {
    api.getUserPermissions.mockResolvedValue({
      user_id: 7,
      name: 'Aisha',
      role: 'staff',
      permissions: CATALOG.map((p) => ({
        ...p,
        granted: p.slug === 'reports.view' || GRANTS.staff.includes(p.slug),
        role_default: GRANTS.staff.includes(p.slug),
        override_mode: p.slug === 'reports.view' ? 'allow' : 'inherit',
        source: p.slug === 'reports.view' ? 'override' : 'role',
      })),
    });
  }

  it("sets one person's switches, and saves them as Allow, Deny and As role", async () => {
    mockAisha();
    renderIt(7);
    await waitFor(() => expect(api.getUserPermissions).toHaveBeenCalledWith(7));
    expect(await screen.findByText(/1 set just for them/)).toBeInTheDocument();
    expect(screen.getByTestId('perm-tile-reports')).toHaveTextContent('1 set for them');

    fireEvent.click(screen.getByRole('button', { name: 'Open all' }));
    // Cashiers cannot void: on is theirs alone, and the row says so.
    const voidSw = screen.getByRole('switch', { name: 'Void orders' });
    expect(voidSw).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByTestId('user-own-orders.void')).not.toBeInTheDocument();
    fireEvent.click(voidSw);
    expect(screen.getByTestId('user-own-orders.void')).toHaveTextContent('For them');
    // Cashiers ring sales: off is a Deny for them.
    fireEvent.click(screen.getByRole('switch', { name: 'Ring sales' }));
    // View reports was allowed just for them: the mark follows the role again.
    expect(screen.getByRole('switch', { name: 'View reports' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByTestId('user-own-reports.view'));
    expect(screen.queryByTestId('user-own-reports.view')).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'View reports' })).toHaveAttribute('aria-checked', 'false');

    const bar = screen.getByTestId('permissions-savebar');
    expect(bar).toHaveTextContent('3 unsaved changes');
    expect(bar).toHaveTextContent('Aisha 3');
    fireEvent.click(within(bar).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.updateUserPermissions).toHaveBeenCalledWith(7, {
      'orders.void': true,
      'pos.ring_sales': false,
      'reports.view': null,
    }));
  });

  it('a switch put back to what the role gives leaves nothing to save', async () => {
    mockAisha();
    renderIt(7);
    await screen.findByText(/1 set just for them/);
    fireEvent.click(screen.getByRole('button', { name: 'Open all' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Void orders' }));
    expect(screen.getByTestId('permissions-savebar')).toHaveTextContent('1 unsaved change');
    fireEvent.click(screen.getByRole('switch', { name: 'Void orders' }));
    expect(screen.queryByTestId('permissions-savebar')).not.toBeInTheDocument();
    // An Allow that only repeats the role is kept as it was, too.
    fireEvent.click(screen.getByRole('switch', { name: 'View reports' }));
    fireEvent.click(screen.getByRole('switch', { name: 'View reports' }));
    expect(screen.queryByTestId('permissions-savebar')).not.toBeInTheDocument();
    expect(screen.getByTestId('user-own-reports.view')).toBeInTheDocument();
  });

  it('switches a whole group on, off, or back to the role for one person', async () => {
    mockAisha();
    renderIt(7);
    await screen.findByText(/1 set just for them/);
    fireEvent.click(screen.getByTestId('perm-tile-pos'));
    const panel = screen.getByTestId('perm-panel-pos');
    expect(within(panel).getByRole('button', { name: 'All on' })).toBeDisabled();
    expect(within(panel).getByRole('button', { name: 'All as role' })).toBeDisabled();

    fireEvent.click(within(panel).getByRole('button', { name: 'All off' }));
    expect(panel).toHaveTextContent('0 of 2 on');
    expect(screen.getByTestId('permissions-savebar')).toHaveTextContent('2 unsaved changes');
    expect(within(panel).getAllByText('For them')).toHaveLength(2);

    fireEvent.click(within(panel).getByRole('button', { name: 'All as role' }));
    expect(panel).toHaveTextContent('2 of 2 on');
    expect(screen.queryByTestId('permissions-savebar')).not.toBeInTheDocument();
  });
});
