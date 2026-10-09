import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Check, ChevronsDownUp, ChevronsUpDown, CircleHelp, Search, Shield, User, X } from 'lucide-react';
import {
  fetchStaff,
  getMyPermissions,
  getUserPermissions,
  updateUserPermissions,
  getRolePermissions,
  updateRolePermissions,
  type PermissionItem,
} from '../../api';
import { useToast } from '../../components/ui';
import { Btn, ConfirmDialog, Switch, TabScrollRow, useConfirmDialog } from '../../components/SharedUI';
import { useCurrentUserPermissions } from '../../hooks/usePermissions';
import { COMMON_PERMISSION_SLUGS, ROLE_CHEAT_SHEET } from '../../components/permissionsCheatSheet';
import { PermissionBoard, type BoardRow, type OverrideMode } from './PermissionBoard';

/*
 * Roles & permissions. Owner, 2026-10-09: "is it possible to group and make
 * it easier". The editor was one list of about 190 permissions, a slug under
 * each, 14,700px tall on a phone and 27,000px for one person's overrides.
 * Now: the role picked by a chip that says how much it has, the groups as
 * tiles in six sections (PermissionBoard), a search, a filter for what is on,
 * off or changed, whole-group switches, and one save bar for every unsaved
 * change, roles and person together. Switching role keeps what you changed
 * on the other one.
 */

type Mode = 'roles' | 'users';
type Filter = 'all' | 'on' | 'off' | 'changed';

export const ROLE_OPTIONS = [
  { slug: 'owner', label: 'Owner (Admin)' },
  { slug: 'manager', label: 'Manager (Supervisor)' },
  { slug: 'staff', label: 'Staff (Cashier)' },
  { slug: 'kitchen_staff', label: 'Kitchen Staff' },
];

/** The roles whose defaults can change, in the order the chips show them. */
const EDITABLE_ROLES = ['manager', 'staff', 'kitchen_staff'] as const;
/** The names the Staff page uses. */
const ROLE_SHORT: Record<string, string> = {
  owner: 'Owner',
  manager: 'Manager',
  staff: 'Cashier',
  kitchen_staff: 'Kitchen staff',
};
const roleName = (slug: string) => ROLE_SHORT[slug] ?? slug;

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'on', label: 'On' },
  { id: 'off', label: 'Off' },
  { id: 'changed', label: 'Changed' },
];

/** How a person's row is set on the server: their own Allow / Deny, or as their role. */
function savedMode(p: PermissionItem): OverrideMode {
  if (p.override_mode) return p.override_mode;
  if (p.source === 'override') return p.granted ? 'allow' : 'deny';
  return 'inherit';
}

function errorText(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

/** A role's rows with its unsaved changes applied; the owner's are every permission, on. */
function roleRowsFor(
  role: string,
  rolePerms: Record<string, PermissionItem[]>,
  roleChanges: Record<string, Record<string, boolean>>,
): BoardRow[] {
  if (role === 'owner') {
    const any = EDITABLE_ROLES.map((r) => rolePerms[r]).find((list) => list && list.length > 0) ?? [];
    return any.map((p) => ({ slug: p.slug, name: p.name, group: p.group, on: true }));
  }
  const changes = roleChanges[role] ?? {};
  return (rolePerms[role] ?? []).map((p) => {
    const next = changes[p.slug];
    return {
      slug: p.slug,
      name: p.name,
      group: p.group,
      on: next ?? p.granted,
      pending: next !== undefined,
      marked: p.customised === true,
      roleOn: p.role_default,
    };
  });
}

export function PermissionsSettings({ initialUserId }: { initialUserId?: number | null }) {
  const { success, error } = useToast();
  // Role defaults and per-person overrides are the owner's
  // (roles_permissions.manage). Anyone else gets the explanation and their
  // own access (owner, 2026-10-08: "If the manager has given the permission
  // he must see the permission").
  const { can, loading: meLoading } = useCurrentUserPermissions();
  const canManage = can('roles_permissions.manage');
  const dialog = useConfirmDialog();

  const [mode, setMode] = useState<Mode>(initialUserId ? 'users' : 'roles');
  const [helpOpen, setHelpOpen] = useState(false);

  const [selectedRole, setSelectedRole] = useState<string>('manager');
  const [rolePerms, setRolePerms] = useState<Record<string, PermissionItem[]>>({});
  const [roleChanges, setRoleChanges] = useState<Record<string, Record<string, boolean>>>({});
  const [loadingRoles, setLoadingRoles] = useState(false);

  const [staff, setStaff] = useState<{ id: number; name: string; role: string }[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [selectedUserRole, setSelectedUserRole] = useState('');
  const [userPerms, setUserPerms] = useState<PermissionItem[]>([]);
  const [userChanges, setUserChanges] = useState<Record<string, OverrideMode>>({});
  const [loadingUser, setLoadingUser] = useState(false);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [saving, setSaving] = useState(false);

  const [myAccess, setMyAccess] = useState<{ slug: string; name: string; group: string }[] | null>(null);

  useEffect(() => {
    if (canManage || meLoading) return;
    getMyPermissions()
      .then(({ permissions }) => setMyAccess(permissions))
      .catch(() => setMyAccess([]));
  }, [canManage, meLoading]);

  useEffect(() => {
    if (!canManage) return;
    fetchStaff()
      .then(({ staff: s }) => setStaff(
        s.filter((u) => u.role !== 'owner').map((u) => ({ id: u.id, name: u.name, role: u.role ?? 'staff' })),
      ))
      .catch(() => error('Failed to load staff'));
  }, [canManage]);

  // All three editable roles at once: the chips show what each has, and
  // moving between them is instant and keeps unsaved changes.
  useEffect(() => {
    if (!canManage) return;
    setLoadingRoles(true);
    Promise.allSettled(EDITABLE_ROLES.map((r) => getRolePermissions(r)))
      .then((results) => {
        const loaded: Record<string, PermissionItem[]> = {};
        results.forEach((res, i) => {
          if (res.status === 'fulfilled') loaded[EDITABLE_ROLES[i]] = res.value.permissions;
        });
        setRolePerms(loaded);
        if (results.some((r) => r.status === 'rejected')) error('Failed to load role permissions');
      })
      .finally(() => setLoadingRoles(false));
  }, [canManage]);

  useEffect(() => {
    if (initialUserId) {
      setMode('users');
      setSelectedUserId(initialUserId);
    }
  }, [initialUserId]);

  useEffect(() => {
    if (!selectedUserId || !canManage) return;
    setLoadingUser(true);
    getUserPermissions(selectedUserId)
      .then(({ permissions, role }) => {
        setUserPerms(permissions);
        setSelectedUserRole(role);
        setUserChanges({});
      })
      .catch(() => error('Failed to load user permissions'))
      .finally(() => setLoadingUser(false));
  }, [selectedUserId, canManage]);

  // ── rows ──────────────────────────────────────────────────────────────────
  const roleRows = useMemo(
    () => roleRowsFor(selectedRole, rolePerms, roleChanges),
    [selectedRole, rolePerms, roleChanges],
  );

  const userRows = useMemo<BoardRow[]>(() => userPerms.map((p) => {
    const m = userChanges[p.slug] ?? savedMode(p);
    const roleOn = p.role_default ?? p.granted;
    return {
      slug: p.slug,
      name: p.name,
      group: p.group,
      on: m === 'inherit' ? roleOn : m === 'allow',
      pending: userChanges[p.slug] !== undefined,
      marked: m !== 'inherit',
      roleOn,
      mode: m,
    };
  }), [userPerms, userChanges]);

  const myRows = useMemo<BoardRow[]>(
    () => (myAccess ?? []).map((p) => ({ slug: p.slug, name: p.name, group: p.group, on: true })),
    [myAccess],
  );

  const rows = !canManage ? myRows : mode === 'roles' ? roleRows : userRows;
  const q = query.trim().toLowerCase();
  const shown = useMemo<Set<string> | null>(() => {
    if (!q && filter === 'all') return null;
    return new Set(rows.filter((r) => {
      if (q && !`${r.name} ${r.slug} ${r.group}`.toLowerCase().includes(q)) return false;
      if (filter === 'on') return r.on;
      if (filter === 'off') return !r.on;
      if (filter === 'changed') return Boolean(r.pending || r.marked);
      return true;
    }).map((r) => r.slug));
  }, [rows, q, filter]);

  const allGroups = useMemo(() => [...new Set(rows.map((r) => r.group))], [rows]);
  const allOpen = allGroups.length > 0 && allGroups.every((g) => open.has(g));
  const toggleGroup = (group: string) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(group)) next.delete(group); else next.add(group);
    return next;
  });

  // ── changes ───────────────────────────────────────────────────────────────
  const setRolePerm = (role: string, slugs: string[], on: boolean) => {
    setRoleChanges((all) => {
      const mine = { ...(all[role] ?? {}) };
      for (const slug of slugs) {
        const saved = rolePerms[role]?.find((p) => p.slug === slug)?.granted;
        if (on === saved) delete mine[slug];
        else mine[slug] = on;
      }
      return { ...all, [role]: mine };
    });
  };

  const setUserMode = (slugs: string[], next: OverrideMode) => {
    setUserChanges((all) => {
      const mine = { ...all };
      for (const slug of slugs) {
        const p = userPerms.find((x) => x.slug === slug);
        if (!p) continue;
        if (next === savedMode(p)) delete mine[slug];
        else mine[slug] = next;
      }
      return mine;
    });
  };

  const pendingRoles = EDITABLE_ROLES
    .map((r) => [r, Object.keys(roleChanges[r] ?? {}).length] as const)
    .filter(([, n]) => n > 0);
  const pendingUser = Object.keys(userChanges).length;
  const pendingTotal = pendingRoles.reduce((sum, [, n]) => sum + n, 0) + pendingUser;
  const selectedUser = staff.find((s) => s.id === selectedUserId) ?? null;

  useEffect(() => {
    if (pendingTotal === 0) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [pendingTotal]);

  const undoAll = () => {
    setRoleChanges({});
    setUserChanges({});
  };

  const saveAll = async () => {
    if (saving || pendingTotal === 0) return;
    setSaving(true);
    let saved = 0;
    let failed = false;
    for (const [role] of pendingRoles) {
      try {
        // Only what changed: the server keeps every permission a save does
        // not name, so a change made elsewhere meanwhile is not overwritten.
        await updateRolePermissions(role, roleChanges[role] ?? {});
        const { permissions } = await getRolePermissions(role);
        setRolePerms((all) => ({ ...all, [role]: permissions }));
        setRoleChanges((all) => {
          const next = { ...all };
          delete next[role];
          return next;
        });
        saved += 1;
      } catch (e) {
        failed = true;
        error(`${roleName(role)}: ${errorText(e, 'Failed to save role permissions')}`);
      }
    }
    if (pendingUser > 0 && selectedUserId) {
      try {
        const payload: Record<string, boolean | null> = {};
        Object.entries(userChanges).forEach(([slug, m]) => {
          payload[slug] = m === 'inherit' ? null : m === 'allow';
        });
        await updateUserPermissions(selectedUserId, payload);
        const { permissions } = await getUserPermissions(selectedUserId);
        setUserPerms(permissions);
        setUserChanges({});
        saved += 1;
      } catch (e) {
        failed = true;
        error(`${selectedUser?.name ?? 'This person'}: ${errorText(e, 'Failed to save user permissions')}`);
      }
    }
    setSaving(false);
    if (!failed && saved > 0) success('Permissions saved');
  };

  const pickUser = (id: number | null) => {
    if (id === selectedUserId) return;
    if (pendingUser === 0) {
      setSelectedUserId(id);
      return;
    }
    dialog.ask({
      title: 'Leave without saving?',
      message: `${pendingUser} change${pendingUser === 1 ? '' : 's'} for ${selectedUser?.name ?? 'this person'} ${pendingUser === 1 ? 'is' : 'are'} not saved.`,
      confirmLabel: 'Discard changes',
      danger: true,
      onConfirm: () => {
        setUserChanges({});
        setSelectedUserId(id);
      },
    });
  };

  // ── pieces ────────────────────────────────────────────────────────────────
  const toolbar = (withFilters: boolean) => (
    <div className="perm-toolbar">
      <label className="perm-search">
        <Search size={16} aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a permission"
          aria-label="Find a permission"
        />
        {query && (
          <button type="button" className="perm-search-clear" aria-label="Clear search" onClick={() => setQuery('')}>
            <X size={14} aria-hidden />
          </button>
        )}
      </label>
      {withFilters && (
        <TabScrollRow className="perm-filters" role="group" aria-label="Show">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className="perm-chip"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </TabScrollRow>
      )}
      <button
        type="button"
        className="perm-chip perm-openall"
        onClick={() => setOpen(allOpen ? new Set() : new Set(allGroups))}
        disabled={shown !== null}
      >
        {allOpen ? <ChevronsDownUp size={14} aria-hidden /> : <ChevronsUpDown size={14} aria-hidden />}
        {allOpen ? 'Close all' : 'Open all'}
      </button>
    </div>
  );

  const nothingMatches = shown !== null && shown.size === 0 && (
    <p className="perm-empty">
      Nothing matches{q ? ` "${query.trim()}"` : ''}{filter !== 'all' ? ` in ${FILTERS.find((f) => f.id === filter)?.label.toLowerCase()}` : ''}.
    </p>
  );

  const skeleton = (
    <div className="perm-tiles" aria-hidden>
      {Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton perm-tile-skeleton" />)}
    </div>
  );

  const help = (
    <div className="perm-help" data-testid="permissions-help">
      <ul>
        <li>The <strong>owner</strong> always has everything; nothing here changes that.</li>
        <li>A <strong>role</strong>'s switches apply to everyone with that role.</li>
        <li><strong>One person</strong>: Allow or Deny wins over their role, for them only. "As role" follows the role again.</li>
        <li>Signing in here needs <strong>Access admin panel</strong>; the POS PIN needs <strong>Access POS app</strong>.</li>
        <li>A "View" permission only shows a screen; changing things needs the matching "Manage" one.</li>
      </ul>
      <details className="perm-cheat">
        <summary>What each role is for</summary>
        <div className="perm-cheat-roles">
          {ROLE_CHEAT_SHEET.map((role) => (
            <div key={role.slug}>
              <p className="perm-cheat-title">{role.label}</p>
              <p className="perm-cheat-summary">{role.summary}</p>
              {role.can.length > 0 && (
                <ul className="perm-cheat-can">{role.can.map((line) => <li key={line}>{line}</li>)}</ul>
              )}
              {role.cannot.length > 0 && (
                <ul className="perm-cheat-cannot">{role.cannot.map((line) => <li key={line}>{line}</li>)}</ul>
              )}
            </div>
          ))}
        </div>
        <div className="table-scroll perm-cheat-table">
          <table>
            <thead>
              <tr><th>Permission</th><th>Opens</th><th>Usually</th></tr>
            </thead>
            <tbody>
              {COMMON_PERMISSION_SLUGS.map((row) => (
                <tr key={row.slug}>
                  <td><code>{row.slug}</code></td>
                  <td>{row.gates}</td>
                  <td>{row.typical}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );

  const helpToggle = (
    <button
      type="button"
      className="perm-chip perm-help-toggle"
      aria-expanded={helpOpen}
      onClick={() => setHelpOpen((v) => !v)}
    >
      <CircleHelp size={14} aria-hidden /> How it works
    </button>
  );

  // ── someone who cannot edit roles ─────────────────────────────────────────
  if (!canManage) {
    return (
      <div className="perm-page">
        <div className="perm-topline">
          <p data-testid="permissions-owner-only" className="perm-owner-only">
            Only the owner changes role defaults and one person's overrides. Ask the owner if someone needs more or less access.
          </p>
          {helpToggle}
        </div>
        {helpOpen && help}
        {myAccess && myAccess.length > 0 && (
          <div data-testid="my-access" className="perm-mine">
            <p className="perm-mine-title">What you can do</p>
            <p className="perm-mine-sub">
              Your access as the owner has set it, {myAccess.length} permission{myAccess.length === 1 ? '' : 's'}. Open a group to see them.
            </p>
            {toolbar(false)}
            {nothingMatches}
            <PermissionBoard
              rows={myRows}
              shown={shown}
              open={open}
              onToggle={toggleGroup}
              countText={(on) => `${on} permission${on === 1 ? '' : 's'}`}
              meter={false}
              renderControl={() => <Check size={16} aria-label="Yes" className="perm-yes" />}
            />
          </div>
        )}
      </div>
    );
  }

  // ── the editor ────────────────────────────────────────────────────────────
  const roleIsOwner = selectedRole === 'owner';
  const roleTileNote = (groupRows: readonly BoardRow[]) => {
    const pending = groupRows.filter((r) => r.pending).length;
    if (pending > 0) return { text: `${pending} unsaved`, tone: 'rust' as const };
    const custom = groupRows.filter((r) => r.marked).length;
    if (custom > 0) return { text: `${custom} changed`, tone: 'brown' as const };
    return null;
  };
  const userTileNote = (groupRows: readonly BoardRow[]) => {
    const pending = groupRows.filter((r) => r.pending).length;
    if (pending > 0) return { text: `${pending} unsaved`, tone: 'rust' as const };
    const own = groupRows.filter((r) => r.marked).length;
    if (own > 0) return { text: `${own} set for them`, tone: 'brown' as const };
    return null;
  };

  let body: ReactNode;
  if (mode === 'roles') {
    body = (
      <>
        <div className="perm-roles" role="tablist" aria-label="Role">
          {[...EDITABLE_ROLES, 'owner'].map((r) => {
            const list = roleRowsFor(r, rolePerms, roleChanges);
            const on = list.filter((x) => x.on).length;
            const changed = Object.keys(roleChanges[r] ?? {}).length;
            return (
              <button
                key={r}
                type="button"
                role="tab"
                aria-selected={selectedRole === r}
                className="perm-role"
                onClick={() => setSelectedRole(r)}
                title={ROLE_OPTIONS.find((o) => o.slug === r)?.label}
              >
                <span>{roleName(r)}</span>
                <span className="perm-role-count">{r === 'owner' ? 'all' : loadingRoles ? '…' : on}</span>
                {changed > 0 && <span className="perm-role-dot" aria-label={`${changed} unsaved`} />}
              </button>
            );
          })}
        </div>
        {roleIsOwner && (
          <p className="perm-note">The owner always has every permission. These are shown for reference and cannot be switched off.</p>
        )}
        {toolbar(!roleIsOwner)}
        {loadingRoles ? skeleton : (
          <>
            {nothingMatches}
            <PermissionBoard
              rows={roleRows}
              shown={shown}
              open={open}
              onToggle={toggleGroup}
              tileNote={roleIsOwner ? undefined : roleTileNote}
              renderControl={(row) => (
                <span className="perm-row-end">
                  {row.marked && !row.pending && (
                    <span
                      className="perm-flag"
                      title={`You changed this; the standard for ${roleName(selectedRole)} is ${row.roleOn ? 'on' : 'off'}`}
                      data-testid={`role-custom-${row.slug}`}
                    >
                      changed
                    </span>
                  )}
                  <Switch
                    size="sm"
                    checked={row.on}
                    disabled={roleIsOwner || saving}
                    onChange={(next) => setRolePerm(selectedRole, [row.slug], next)}
                    aria-label={row.name}
                  />
                </span>
              )}
              groupTools={roleIsOwner ? undefined : (_group, groupRows) => {
                const slugs = groupRows.map((r) => r.slug);
                const allOn = groupRows.every((r) => r.on);
                const allOff = groupRows.every((r) => !r.on);
                return (
                  <>
                    <button type="button" className="perm-chip" disabled={allOn || saving} onClick={() => setRolePerm(selectedRole, slugs, true)}>
                      All on
                    </button>
                    <button type="button" className="perm-chip" disabled={allOff || saving} onClick={() => setRolePerm(selectedRole, slugs, false)}>
                      All off
                    </button>
                  </>
                );
              }}
            />
          </>
        )}
      </>
    );
  } else {
    const ownCount = userRows.filter((r) => r.marked).length;
    body = (
      <>
        <div className="perm-person">
          <select
            value={selectedUserId ?? ''}
            onChange={(e) => pickUser(Number(e.target.value) || null)}
            aria-label="Staff member"
            className="perm-person-select"
          >
            <option value="">Choose a staff member…</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.name} · {roleName(s.role)}</option>)}
          </select>
          {selectedUserId && selectedUserRole && !loadingUser && (
            <p className="perm-person-line">
              <span className="perm-role-chip">{roleName(selectedUserRole)}</span>
              {ownCount > 0 ? (
                <>
                  <span>{ownCount} set just for them.</span>
                  <button
                    type="button"
                    className="perm-chip"
                    disabled={saving}
                    onClick={() => setUserMode(userRows.filter((r) => r.mode !== 'inherit').map((r) => r.slug), 'inherit')}
                  >
                    Put all back to their role
                  </button>
                </>
              ) : (
                <span>Everything follows their role.</span>
              )}
            </p>
          )}
        </div>
        {!selectedUserId ? (
          <p className="perm-note">Pick someone to see what they can do, and to allow or deny something for them only.</p>
        ) : loadingUser ? skeleton : (
          <>
            {toolbar(true)}
            {nothingMatches}
            <PermissionBoard
              rows={userRows}
              shown={shown}
              open={open}
              onToggle={toggleGroup}
              tileNote={userTileNote}
              wideRows
              renderControl={(row) => (
                <span className="perm-seg" role="radiogroup" aria-label={row.name}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={row.mode === 'inherit'}
                    className="perm-seg-btn perm-seg-btn--role"
                    disabled={saving}
                    onClick={() => setUserMode([row.slug], 'inherit')}
                    title={`As their role: ${row.roleOn ? 'allowed' : 'not allowed'}`}
                  >
                    As role {row.roleOn ? <Check size={13} aria-label="(on)" /> : <X size={13} aria-label="(off)" />}
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={row.mode === 'allow'}
                    className="perm-seg-btn perm-seg-btn--allow"
                    disabled={saving}
                    onClick={() => setUserMode([row.slug], 'allow')}
                  >
                    Allow
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={row.mode === 'deny'}
                    className="perm-seg-btn perm-seg-btn--deny"
                    disabled={saving}
                    onClick={() => setUserMode([row.slug], 'deny')}
                  >
                    Deny
                  </button>
                </span>
              )}
              groupTools={(_group, groupRows) => {
                const own = groupRows.filter((r) => r.mode !== 'inherit').map((r) => r.slug);
                return own.length > 0 ? (
                  <button type="button" className="perm-chip" disabled={saving} onClick={() => setUserMode(own, 'inherit')}>
                    All as role
                  </button>
                ) : null;
              }}
            />
          </>
        )}
      </>
    );
  }

  const pendingParts = [
    ...pendingRoles.map(([r, n]) => `${roleName(r)} ${n}`),
    ...(pendingUser > 0 ? [`${selectedUser?.name ?? 'This person'} ${pendingUser}`] : []),
  ];

  return (
    <div className="perm-page">
      <div className="perm-topline">
        <TabScrollRow className="perm-modes" role="tablist" aria-label="Edit by" fit>
          <button type="button" role="tab" aria-selected={mode === 'roles'} className="perm-mode" onClick={() => setMode('roles')}>
            <Shield size={15} aria-hidden /> Roles
          </button>
          <button type="button" role="tab" aria-selected={mode === 'users'} className="perm-mode" onClick={() => setMode('users')}>
            <User size={15} aria-hidden /> One person
          </button>
        </TabScrollRow>
        {helpToggle}
      </div>
      {helpOpen && help}

      {body}

      {pendingTotal > 0 && (
        <div className="perm-savebar" data-testid="permissions-savebar" role="region" aria-label="Unsaved changes">
          <span className="perm-savebar-text">
            <strong>{pendingTotal} unsaved change{pendingTotal === 1 ? '' : 's'}</strong>
            <span className="perm-savebar-parts">{pendingParts.join(' · ')}</span>
          </span>
          <Btn variant="secondary" small onClick={undoAll} disabled={saving}>Undo</Btn>
          <Btn variant="primary" small onClick={() => void saveAll()} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Btn>
        </div>
      )}

      <ConfirmDialog state={dialog.state} close={dialog.close} />
    </div>
  );
}
