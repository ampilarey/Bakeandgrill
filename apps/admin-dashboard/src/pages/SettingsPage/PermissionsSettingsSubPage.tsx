import { useEffect, useState } from 'react';
import { Save, RefreshCw, Shield, Users } from 'lucide-react';
import {
  fetchStaff,
  getUserPermissions,
  updateUserPermissions,
  getRolePermissions,
  updateRolePermissions,
  type PermissionItem,
} from '../../api';
import { Button, Card, Badge, useToast } from '../../components/ui';

type Tab = 'roles' | 'users';

const ROLE_OPTIONS = [
  { slug: 'owner', label: 'Owner (Admin)' },
  { slug: 'manager', label: 'Manager (Supervisor)' },
  { slug: 'staff', label: 'Staff (Cashier)' },
];

type OverrideMode = 'inherit' | 'allow' | 'deny';

function PermissionGroupList({
  grouped,
  readOnly,
  roleMode,
  overrides,
  onRoleToggle,
  onOverrideChange,
  onResetOverride,
}: {
  grouped: Record<string, PermissionItem[]>;
  readOnly?: boolean;
  roleMode?: boolean;
  overrides?: Record<string, OverrideMode>;
  onRoleToggle?: (slug: string, granted: boolean) => void;
  onOverrideChange?: (slug: string, mode: OverrideMode) => void;
  onResetOverride?: (slug: string) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {Object.entries(grouped).map(([group, items]) => (
        <div key={group}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#9C8E7E', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 8px' }}>
            {group}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {items.map((p) => {
              const overrideMode = overrides?.[p.slug];
              const isModified = overrideMode !== undefined;
              const effectiveGranted = roleMode
                ? (p.granted)
                : overrideMode === 'allow'
                  ? true
                  : overrideMode === 'deny'
                    ? false
                    : p.granted;

              return (
                <div
                  key={p.slug}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: isModified ? '#FFF8F3' : 'transparent',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14, color: '#1C1408' }}>{p.name}</span>
                      {!roleMode && (
                        <>
                          <Badge variant={p.source === 'override' || isModified ? 'brand' : 'neutral'} className="text-[10px]">
                            {isModified ? 'modified' : p.source}
                          </Badge>
                          <Badge variant={effectiveGranted ? 'success' : 'neutral'} className="text-[10px]">
                            {effectiveGranted ? 'allowed' : 'denied'}
                          </Badge>
                          {p.role_default !== undefined && (
                            <span style={{ fontSize: 11, color: '#9C8E7E' }}>
                              role default: {p.role_default ? 'allow' : 'deny'}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                    <span style={{ fontSize: 11, color: '#9C8E7E' }}>{p.slug}</span>
                  </div>

                  {readOnly ? (
                    <Badge variant="success">Always allowed</Badge>
                  ) : roleMode ? (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={p.granted}
                        onChange={(e) => onRoleToggle?.(p.slug, e.target.checked)}
                      />
                    </label>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <select
                        value={overrideMode ?? 'inherit'}
                        onChange={(e) => onOverrideChange?.(p.slug, e.target.value as OverrideMode)}
                        style={{
                          height: 32,
                          borderRadius: 8,
                          border: '1.5px solid #E8E0D8',
                          background: '#fff',
                          padding: '0 8px',
                          fontSize: 12,
                          fontFamily: 'inherit',
                        }}
                      >
                        <option value="inherit">Inherit from role</option>
                        <option value="allow">Force allow</option>
                        <option value="deny">Force deny</option>
                      </select>
                      {isModified && (
                        <button
                          type="button"
                          onClick={() => onResetOverride?.(p.slug)}
                          style={{ fontSize: 11, color: '#9C8E7E', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit' }}
                        >
                          reset
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export function PermissionsSettings() {
  const { success, error } = useToast();
  const [tab, setTab] = useState<Tab>('roles');
  const [selectedRole, setSelectedRole] = useState('manager');
  const [rolePerms, setRolePerms] = useState<PermissionItem[]>([]);
  const [roleChanges, setRoleChanges] = useState<Record<string, boolean>>({});
  const [loadingRolePerms, setLoadingRolePerms] = useState(false);
  const [savingRole, setSavingRole] = useState(false);

  const [staff, setStaff] = useState<{ id: number; name: string; role: string }[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [selectedUserRole, setSelectedUserRole] = useState('');
  const [userPerms, setUserPerms] = useState<PermissionItem[]>([]);
  const [userOverrides, setUserOverrides] = useState<Record<string, OverrideMode>>({});
  const [loadingUserPerms, setLoadingUserPerms] = useState(false);
  const [savingUser, setSavingUser] = useState(false);

  useEffect(() => {
    fetchStaff()
      .then(({ staff: s }) => setStaff(
        s.filter((u) => u.role !== 'owner').map((u) => ({ id: u.id, name: u.name, role: u.role ?? 'staff' })),
      ))
      .catch(() => error('Failed to load staff'));
  }, []);

  useEffect(() => {
    if (tab !== 'roles') return;
    setLoadingRolePerms(true);
    getRolePermissions(selectedRole)
      .then(({ permissions }) => { setRolePerms(permissions); setRoleChanges({}); })
      .catch(() => error('Failed to load role permissions'))
      .finally(() => setLoadingRolePerms(false));
  }, [tab, selectedRole]);

  useEffect(() => {
    if (tab !== 'users' || !selectedUserId) return;
    setLoadingUserPerms(true);
    getUserPermissions(selectedUserId)
      .then(({ permissions, role }) => {
        setUserPerms(permissions);
        setSelectedUserRole(role);
        setUserOverrides({});
      })
      .catch(() => error('Failed to load user permissions'))
      .finally(() => setLoadingUserPerms(false));
  }, [tab, selectedUserId]);

  const roleGrouped = rolePerms.reduce<Record<string, PermissionItem[]>>((acc, p) => {
    const granted = roleChanges[p.slug] ?? p.granted;
    (acc[p.group] ??= []).push({ ...p, granted });
    return acc;
  }, {});

  const userGrouped = userPerms.reduce<Record<string, PermissionItem[]>>((acc, p) => {
    (acc[p.group] ??= []).push(p);
    return acc;
  }, {});

  const handleSaveRole = async () => {
    if (selectedRole === 'owner') return;
    setSavingRole(true);
    try {
      const payload: Record<string, boolean> = {};
      rolePerms.forEach((p) => {
        const next = roleChanges[p.slug] ?? p.granted;
        if (next !== p.granted) payload[p.slug] = next;
      });
      if (Object.keys(payload).length === 0) {
        success('No changes to save');
        return;
      }
      const merged: Record<string, boolean> = {};
      rolePerms.forEach((p) => { merged[p.slug] = roleChanges[p.slug] ?? p.granted; });
      await updateRolePermissions(selectedRole, merged);
      success('Role permissions saved');
      const { permissions } = await getRolePermissions(selectedRole);
      setRolePerms(permissions);
      setRoleChanges({});
    } catch {
      error('Failed to save role permissions');
    } finally {
      setSavingRole(false);
    }
  };

  const handleSaveUser = async () => {
    if (!selectedUserId) return;
    setSavingUser(true);
    try {
      const payload: Record<string, boolean | null> = {};
      Object.entries(userOverrides).forEach(([slug, mode]) => {
        if (mode === 'inherit') payload[slug] = null;
        else payload[slug] = mode === 'allow';
      });
      if (Object.keys(payload).length === 0) {
        success('No changes to save');
        return;
      }
      await updateUserPermissions(selectedUserId, payload);
      success('User overrides saved');
      const { permissions } = await getUserPermissions(selectedUserId);
      setUserPerms(permissions);
      setUserOverrides({});
    } catch {
      error('Failed to save user permissions');
    } finally {
      setSavingUser(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 820 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button variant={tab === 'roles' ? 'primary' : 'ghost'} size="sm" icon={<Shield size={14} />} onClick={() => setTab('roles')}>
          Role permissions
        </Button>
        <Button variant={tab === 'users' ? 'primary' : 'ghost'} size="sm" icon={<Users size={14} />} onClick={() => setTab('users')}>
          User overrides
        </Button>
      </div>

      {tab === 'roles' && (
        <>
          <Card>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#1C1408' }}>Select role</label>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                style={{ height: 36, borderRadius: 10, border: '1.5px solid #E8E0D8', background: '#fff', padding: '0 12px', fontSize: 14, fontFamily: 'inherit', color: '#1C1408', outline: 'none', cursor: 'pointer' }}
              >
                {ROLE_OPTIONS.map((r) => <option key={r.slug} value={r.slug}>{r.label}</option>)}
              </select>
              {selectedRole === 'owner' && (
                <p style={{ margin: 0, fontSize: 13, color: '#6B5E4E', lineHeight: 1.5 }}>
                  Owners always have full access. Permission checks are bypassed for the owner role — these toggles are shown for reference only and cannot be changed.
                </p>
              )}
            </div>
          </Card>

          <Card>
            {loadingRolePerms ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="skeleton" style={{ height: 36, borderRadius: 8 }} />
                ))}
              </div>
            ) : (
              <>
                <PermissionGroupList
                  grouped={roleGrouped}
                  readOnly={selectedRole === 'owner'}
                  roleMode
                  onRoleToggle={(slug, granted) => setRoleChanges((c) => ({ ...c, [slug]: granted }))}
                />
                {selectedRole !== 'owner' && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, marginTop: 12, borderTop: '1px solid #E8E0D8' }}>
                    <Button variant="ghost" size="sm" icon={<RefreshCw size={14} />} onClick={() => setRoleChanges({})}>
                      Reset changes
                    </Button>
                    <Button variant="primary" size="sm" icon={<Save size={14} />} onClick={handleSaveRole} loading={savingRole}>
                      Save role defaults
                    </Button>
                  </div>
                )}
              </>
            )}
          </Card>
        </>
      )}

      {tab === 'users' && (
        <>
          <Card>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#1C1408' }}>Select staff member</label>
              <select
                value={selectedUserId ?? ''}
                onChange={(e) => setSelectedUserId(Number(e.target.value) || null)}
                style={{ height: 36, borderRadius: 10, border: '1.5px solid #E8E0D8', background: '#fff', padding: '0 12px', fontSize: 14, fontFamily: 'inherit', color: '#1C1408', outline: 'none', cursor: 'pointer' }}
              >
                <option value="">— Choose staff member —</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.role})</option>)}
              </select>
              {selectedUserId && selectedUserRole && (
                <p style={{ margin: 0, fontSize: 13, color: '#6B5E4E' }}>
                  Role: <strong>{selectedUserRole}</strong>. Use inherit / force allow / force deny to override role defaults for this person.
                </p>
              )}
            </div>
          </Card>

          {selectedUserId && (
            <Card>
              {loadingUserPerms ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="skeleton" style={{ height: 36, borderRadius: 8 }} />
                  ))}
                </div>
              ) : (
                <>
                  <PermissionGroupList
                    grouped={userGrouped}
                    overrides={userOverrides}
                    onOverrideChange={(slug, mode) => setUserOverrides((o) => ({ ...o, [slug]: mode }))}
                    onResetOverride={(slug) => setUserOverrides((o) => {
                      const next = { ...o };
                      delete next[slug];
                      return next;
                    })}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, marginTop: 12, borderTop: '1px solid #E8E0D8' }}>
                    <Button variant="ghost" size="sm" icon={<RefreshCw size={14} />} onClick={() => setUserOverrides({})}>
                      Reset all changes
                    </Button>
                    <Button variant="primary" size="sm" icon={<Save size={14} />} onClick={handleSaveUser} loading={savingUser}>
                      Save user overrides
                    </Button>
                  </div>
                </>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
