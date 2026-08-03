import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MoreHorizontal } from 'lucide-react';
import {
  fetchStaff, createStaff, updateStaff, resetStaffPin, deleteStaff,
  getUserPermissions, updateUserPermissions,
  getStaffNotificationPrefs, updateStaffNotificationPrefs,
  type StaffMember, type StaffRole, type PermissionItem, type StaffNotificationPref,
} from '../api';
import { SchedulesTab } from './StaffPage/SchedulesTab';
import { Badge, Btn, ConfirmDialog, EmptyState, ErrorMsg, Input, Modal, ModalActions, PageHeader, PageShell, Spinner, TableCard, TD, TH, useConfirmDialog } from '../components/Layout';
import { Toggle, useToast } from '../components/ui';
import { usePageTitle } from '../hooks/usePageTitle';
import { useCurrentUserPermissions } from '../hooks/usePermissions';

// ── helpers ──────────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

function RoleSelect({ value, onChange, roles }: {
  value: string; onChange: (v: string) => void; roles: StaffRole[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ width: '100%', border: '1px solid var(--color-border)', borderRadius: 9, padding: '9px 12px', fontSize: 14, minHeight: 44 }}
    >
      <option value="">— Select role —</option>
      {roles.map((r) => <option key={r.id} value={String(r.id)}>{r.name}</option>)}
    </select>
  );
}

function PinInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Input
      value={value}
      onChange={(v) => { if (/^\d{0,8}$/.test(v)) onChange(v); }}
      type="password"
      placeholder="4–8 digit PIN"
    />
  );
}

function roleColor(slug: string | null): string {
  const map: Record<string, string> = {
    owner: 'purple',
    manager: 'teal',
    staff: 'yellow',
    kitchen_staff: 'orange',
  };
  return map[slug ?? ''] ?? 'gray';
}

function roleDisplayLabel(slug: string | null, name: string | null): string {
  const labels: Record<string, string> = {
    owner: 'Admin',
    manager: 'Manager',
    staff: 'Cashier',
    kitchen_staff: 'Kitchen Staff',
  };
  if (slug && labels[slug]) return labels[slug];
  return name ?? slug ?? '—';
}

function timeAgo(iso: string | null) {
  if (!iso) return 'Never';
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return new Date(iso).toLocaleDateString();
}

type MenuItem = {
  label: string;
  onClick: () => void;
  danger?: boolean;
};

function RowActionMenu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <Btn small variant="secondary" onClick={() => setOpen((v) => !v)} aria-label="More actions">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <MoreHorizontal size={16} /> More
        </span>
      </Btn>
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 20,
          minWidth: 180, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(28,20,8,0.12)', padding: 4,
        }}>
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => { setOpen(false); item.onClick(); }}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px',
                border: 'none', background: 'none', cursor: 'pointer', borderRadius: 8,
                fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                color: item.danger ? 'var(--color-danger-strong)' : 'var(--color-text)', minHeight: 44,
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Create staff modal ────────────────────────────────────────────────────────

function CreateModal({ roles, onSave, onClose }: {
  roles: StaffRole[];
  onSave: (data: { name: string; email: string; phone?: string; role_id: number; pin: string }) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [roleId, setRoleId] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required.'); return; }
    if (!email.trim()) { setError('Email is required.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim().toLowerCase())) { setError('Please enter a valid email address.'); return; }
    if (!roleId) { setError('Select a role.'); return; }
    const roleIdNum = parseInt(roleId, 10);
    if (isNaN(roleIdNum)) { setError('Invalid role selected.'); return; }
    if (pin.length < 4) { setError('PIN must be at least 4 digits.'); return; }
    if (pin !== confirmPin) { setError('PINs do not match.'); return; }
    setError(''); setLoading(true);
    try { await onSave({ name: name.trim(), email: email.trim(), phone: phone.trim() || undefined, role_id: roleIdNum, pin }); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  return (
    <Modal title="Add Staff Member" onClose={onClose}>
      {error && <ErrorMsg message={error} />}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Full Name">
          <Input value={name} onChange={setName} placeholder="e.g. Ahmed Ali" />
        </Field>
        <Field label="Email">
          <Input value={email} onChange={setEmail} placeholder="ahmed@bakegrill.mv" />
        </Field>
        <Field label="Phone (for SMS notifications)">
          <Input value={phone} onChange={setPhone} placeholder="+9607xxxxxx" />
        </Field>
        <Field label="Role">
          <RoleSelect value={roleId} onChange={setRoleId} roles={roles} />
        </Field>
        <Field label="PIN">
          <PinInput value={pin} onChange={setPin} />
        </Field>
        <Field label="Confirm PIN">
          <PinInput value={confirmPin} onChange={setConfirmPin} />
        </Field>
      </div>
      <ModalActions>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={() => void handleSave()} disabled={loading}>{loading ? 'Creating…' : 'Create Staff'}</Btn>
      </ModalActions>
    </Modal>
  );
}

// ── Edit staff modal ──────────────────────────────────────────────────────────

function EditModal({ member, roles, onSave, onClose }: {
  member: StaffMember;
  roles: StaffRole[];
  onSave: (data: { name: string; email: string; phone?: string | null; role_id: number; is_active: boolean }) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(member.name);
  const [email, setEmail] = useState(member.email);
  const [phone, setPhone] = useState(member.phone ?? '');
  const [roleId, setRoleId] = useState(member.role_id != null ? String(member.role_id) : '');
  const [isActive, setIsActive] = useState(member.is_active);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required.'); return; }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim().toLowerCase())) { setError('Please enter a valid email address.'); return; }
    if (!roleId) { setError('Select a role.'); return; }
    const roleIdNum = parseInt(roleId, 10);
    if (isNaN(roleIdNum)) { setError('Invalid role selected.'); return; }
    setError(''); setLoading(true);
    try { await onSave({ name: name.trim(), email: email.trim(), phone: phone.trim() || null, role_id: roleIdNum, is_active: isActive }); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  return (
    <Modal title={`Edit: ${member.name}`} onClose={onClose}>
      {error && <ErrorMsg message={error} />}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Full Name">
          <Input value={name} onChange={setName} placeholder="Full name" />
        </Field>
        <Field label="Email">
          <Input value={email} onChange={setEmail} placeholder="email@example.com" />
        </Field>
        <Field label="Phone (for SMS notifications)">
          <Input value={phone} onChange={setPhone} placeholder="+9607xxxxxx" />
        </Field>
        <Field label="Role">
          <RoleSelect value={roleId} onChange={setRoleId} roles={roles} />
        </Field>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer', minHeight: 44 }}>
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Active (can log in)
        </label>
      </div>
      <ModalActions>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={() => void handleSave()} disabled={loading}>{loading ? 'Saving…' : 'Save Changes'}</Btn>
      </ModalActions>
    </Modal>
  );
}

// ── Notification Prefs modal ──────────────────────────────────────────────────

const ORDER_TYPES = [
  { value: 'dine_in', label: 'Dine-in' },
  { value: 'takeaway', label: 'Takeaway' },
  { value: 'online_pickup', label: 'Online Pickup' },
  { value: 'delivery', label: 'Delivery' },
];

function NotificationPrefsModal({ member, onClose }: { member: StaffMember; onClose: () => void }) {
  const [prefs, setPrefs] = useState<StaffNotificationPref | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getStaffNotificationPrefs(member.id).then((res) => {
      setPrefs(res.prefs ?? {
        user_id: member.id,
        notifications_enabled: true,
        order_types: null,
        menu_group_ids: null,
        category_ids: null,
        is_fallback: false,
        fallback_priority: 0,
      });
      setLoading(false);
    }).catch((e) => { setError((e as Error).message); setLoading(false); });
  }, [member.id]);

  const save = async () => {
    if (!prefs) return;
    setSaving(true);
    setError('');
    try {
      await updateStaffNotificationPrefs(member.id, prefs);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const toggleOrderType = (v: string) => {
    if (!prefs) return;
    // null means "all types" — first chip click starts from the full set.
    const current = prefs.order_types ?? ORDER_TYPES.map((ot) => ot.value);
    const next = current.includes(v) ? current.filter((t) => t !== v) : [...current, v];
    const allValues = ORDER_TYPES.map((ot) => ot.value);
    const isAll = next.length === 0 || (next.length === allValues.length && allValues.every((x) => next.includes(x)));
    setPrefs((p) => (p ? { ...p, order_types: isAll ? null : next } : p));
  };

  if (loading) return <Modal title={`SMS Prefs — ${member.name}`} onClose={onClose}><Spinner /></Modal>;

  return (
    <Modal title={`SMS Notifications — ${member.name}`} onClose={onClose}>
      {error && <ErrorMsg message={error} />}
      {prefs && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!member.phone && (
            <div style={{ background: 'var(--color-warning-bg)', border: '1px solid var(--color-warning)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--color-warning-strong)' }}>
              No phone number set. Add a phone in Edit to enable SMS notifications.
            </div>
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
            <input type="checkbox" checked={prefs.notifications_enabled}
              onChange={(e) => setPrefs((p) => (p ? { ...p, notifications_enabled: e.target.checked } : p))} />
            <span><strong>Enable SMS Notifications</strong> for this staff member</span>
          </label>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
              Receive notifications for:
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => setPrefs((p) => (p ? { ...p, order_types: null } : p))} style={{
                padding: '8px 12px', fontSize: 12, borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', minHeight: 40,
                background: prefs.order_types === null ? 'var(--color-success)' : '#F5F0EA',
                color: prefs.order_types === null ? '#fff' : 'var(--color-text-secondary)', border: 'none',
              }}>All Types</button>
              {ORDER_TYPES.map((ot) => {
                const active = prefs.order_types === null || prefs.order_types.includes(ot.value);
                return (
                  <button key={ot.value} type="button" onClick={() => toggleOrderType(ot.value)} style={{
                    padding: '8px 12px', fontSize: 12, borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', minHeight: 40,
                    background: active ? 'var(--color-primary)' : '#F5F0EA',
                    color: active ? '#fff' : 'var(--color-text-secondary)', border: 'none',
                  }}>
                    {ot.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
              <input type="checkbox" checked={prefs.is_fallback}
                onChange={(e) => setPrefs((p) => (p ? { ...p, is_fallback: e.target.checked } : p))} />
              <span><strong>Fallback recipient</strong> — receive alerts when no matching staff is on shift</span>
            </label>
          </div>
          {prefs.is_fallback && (
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>Fallback Priority (higher = notified first)</label>
              <Input type="number" value={String(prefs.fallback_priority)}
                onChange={(v) => setPrefs((p) => (p ? { ...p, fallback_priority: parseInt(v) || 0 } : p))} />
            </div>
          )}
        </div>
      )}
      <ModalActions>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={() => void save()} disabled={saving || !prefs}>{saving ? 'Saving…' : 'Save Prefs'}</Btn>
      </ModalActions>
    </Modal>
  );
}

// ── Change PIN modal ──────────────────────────────────────────────────────────

function PinModal({ member, onSave, onClose }: {
  member: StaffMember;
  onSave: (pin: string) => Promise<void>;
  onClose: () => void;
}) {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (pin.length < 4) { setError('PIN must be at least 4 digits.'); return; }
    if (pin !== confirmPin) { setError('PINs do not match.'); return; }
    setError(''); setLoading(true);
    try { await onSave(pin); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  return (
    <Modal title={`Change PIN — ${member.name}`} onClose={onClose}>
      {error && <ErrorMsg message={error} />}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="New PIN">
          <PinInput value={pin} onChange={setPin} />
        </Field>
        <Field label="Confirm New PIN">
          <PinInput value={confirmPin} onChange={setConfirmPin} />
        </Field>
      </div>
      <ModalActions>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={() => void handleSave()} disabled={loading}>{loading ? 'Saving…' : 'Update PIN'}</Btn>
      </ModalActions>
    </Modal>
  );
}

// ── Permissions modal ─────────────────────────────────────────────────────────

function groupPermissions(perms: PermissionItem[]): Record<string, PermissionItem[]> {
  const groups: Record<string, PermissionItem[]> = {};
  for (const p of perms) {
    const label = p.group
      ? p.group.charAt(0).toUpperCase() + p.group.slice(1).replace(/_/g, ' ')
      : 'Other';
    (groups[label] ??= []).push(p);
  }
  return groups;
}

function PermissionsModal({ member, onClose }: { member: StaffMember; onClose: () => void }) {
  const toast = useToast();
  const navigate = useNavigate();
  const { state: permDlg, ask: askPermConfirm, close: closePermDlg } = useConfirmDialog();
  const [perms, setPerms] = useState<PermissionItem[]>([]);
  const [overrides, setOverrides] = useState<Record<string, boolean | null>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getUserPermissions(member.id)
      .then((res) => {
        setPerms(res.permissions);
        const initial: Record<string, boolean | null> = {};
        for (const p of res.permissions) {
          if (p.source === 'override') initial[p.slug] = p.granted;
        }
        setOverrides(initial);
      })
      .catch(() => toast.error('Failed to load permissions.'))
      .finally(() => setLoading(false));
  }, [member.id]);

  const toggle = (slug: string) => {
    setOverrides((prev) => {
      const perm = perms.find((p) => p.slug === slug);
      if (!perm) return prev;
      const current = prev[slug] !== undefined && prev[slug] !== null ? prev[slug] : perm.granted;
      return { ...prev, [slug]: !current };
    });
  };

  const reset = (slug: string) => {
    setOverrides((prev) => ({ ...prev, [slug]: null }));
  };

  const resetAll = () => setOverrides({});

  const save = async () => {
    const changedCount = Object.keys(overrides).length;
    if (changedCount === 0) {
      onClose();
      return;
    }
    askPermConfirm({
      title: 'Save permission changes',
      message: `Apply ${changedCount} permission override(s) for ${member.name}? They take effect immediately.`,
      confirmLabel: 'Save changes',
      danger: true,
      onConfirm: () => void doSave(),
    });
  };

  const doSave = async () => {
    setSaving(true);
    try {
      await updateUserPermissions(member.id, overrides);
      toast.success('Permissions saved.');
      onClose();
    } catch {
      toast.error('Failed to save permissions.');
    } finally {
      setSaving(false);
    }
  };

  const effectiveGranted = (p: PermissionItem): boolean => {
    const ov = overrides[p.slug];
    if (ov === null || ov === undefined) return p.granted;
    return ov;
  };

  const isModified = (p: PermissionItem): boolean => {
    const ov = overrides[p.slug];
    return ov !== null && ov !== undefined;
  };

  const groups = groupPermissions(perms);
  const hasChanges = Object.values(overrides).some((v) => v !== null && v !== undefined);

  return (
    <>
      <Modal title={`Permissions — ${member.name}`} onClose={onClose} maxWidth={720}>
        {loading ? (
          <Spinner />
        ) : (
          <>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--color-text-secondary)' }}>
              Toggle overrides for this person. Role defaults still apply unless overridden.{' '}
              <button
                type="button"
                onClick={() => navigate(`/settings/permissions?user=${member.id}`)}
                style={{ background: 'none', border: 'none', color: 'var(--color-primary)', fontWeight: 700, cursor: 'pointer', padding: 0, fontFamily: 'inherit', fontSize: 13 }}
              >
                Open full permissions editor →
              </button>
            </p>
            <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: 4 }}>
              {Object.entries(groups).map(([category, items]) => (
                <div key={category} style={{ marginBottom: 20 }}>
                  <div style={{
                    fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
                    color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: 8,
                    paddingBottom: 4, borderBottom: '1px solid #f1ece6',
                  }}>
                    {category}
                  </div>
                  {items.map((p) => {
                    const granted = effectiveGranted(p);
                    const modified = isModified(p);
                    return (
                      <div key={p.slug} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 0', borderBottom: '1px solid #faf8f6', minHeight: 44,
                      }}>
                        <div style={{ flex: 1 }}>
                          <span style={{ fontSize: 14, color: 'var(--color-text)', fontWeight: 500 }}>{p.name}</span>
                          {' '}
                          <span style={{
                            fontSize: 11, padding: '1px 6px', borderRadius: 99,
                            background: modified ? 'var(--color-warning-bg)' : '#f1ece6',
                            color: modified ? 'var(--color-warning-strong)' : 'var(--color-text-muted)',
                            fontWeight: 600,
                          }}>
                            {modified ? 'override' : p.source}
                          </span>
                        </div>
                        {modified && (
                          <button
                            type="button"
                            onClick={() => reset(p.slug)}
                            style={{
                              fontSize: 12, color: 'var(--color-warning-strong)', background: 'none',
                              border: 'none', cursor: 'pointer', padding: '6px 8px',
                              textDecoration: 'underline', minHeight: 36,
                            }}
                          >
                            reset
                          </button>
                        )}
                        <Toggle checked={granted} onChange={() => toggle(p.slug)} />
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </>
        )}
        <ModalActions>
          {hasChanges && (
            <Btn variant="ghost" onClick={resetAll} style={{ marginRight: 'auto' }}>
              Reset all changes
            </Btn>
          )}
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn onClick={() => void save()} disabled={saving || loading}>
            {saving ? 'Saving…' : 'Save Permissions'}
          </Btn>
        </ModalActions>
      </Modal>
      <ConfirmDialog state={permDlg} close={closePermDlg} />
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function StaffPage() {
  usePageTitle('Staff');
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const toast = useToast();
  const { can } = useCurrentUserPermissions();
  const canCreateStaff = can('staff.create');
  const canUpdateStaff = can('staff.update');
  const canDeleteStaff = can('staff.delete');
  const canSchedule = can('staff.schedule');
  const canManagePerms = can('roles_permissions.manage');
  const { state: dlg, ask: askConfirm, close: closeDlg } = useConfirmDialog();

  const [activeTab, setActiveTab] = useState<'staff' | 'schedules'>(() => (
    searchParams.get('tab') === 'schedules' && canSchedule ? 'schedules' : 'staff'
  ));
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [roles, setRoles] = useState<StaffRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [changingPin, setChangingPin] = useState<StaffMember | null>(null);
  const [permissionsUser, setPermissionsUser] = useState<StaffMember | null>(null);
  const [notifPrefsUser, setNotifPrefsUser] = useState<StaffMember | null>(null);

  const switchTab = (tab: 'staff' | 'schedules') => {
    setActiveTab(tab);
    if (tab === 'schedules') {
      setSearchParams({ tab: 'schedules' }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchStaff();
      setStaff(res.staff ?? []);
      setRoles(res.roles);
      setError('');
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'schedules' && canSchedule) setActiveTab('schedules');
    else if (tab !== 'schedules') setActiveTab('staff');
  }, [searchParams, canSchedule]);

  // Deep-link: /staff?staff=<id> opens that member's edit modal once per id.
  const openedStaffId = useRef<string | null>(null);
  useEffect(() => {
    const raw = searchParams.get('staff');
    if (!raw || loading || staff.length === 0) return;
    if (openedStaffId.current === raw) return;
    const id = Number(raw);
    if (!Number.isFinite(id)) return;
    const member = staff.find((m) => m.id === id);
    if (!member) return;
    openedStaffId.current = raw;
    setActiveTab('staff');
    setEditing(member);
  }, [searchParams, staff, loading]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return staff.filter((m) => {
      if (statusFilter === 'active' && !m.is_active) return false;
      if (statusFilter === 'inactive' && m.is_active) return false;
      if (roleFilter !== 'all' && m.role !== roleFilter) return false;
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q)
        || m.email.toLowerCase().includes(q)
        || (m.phone ?? '').toLowerCase().includes(q)
        || roleDisplayLabel(m.role, m.role_name).toLowerCase().includes(q)
      );
    });
  }, [staff, search, roleFilter, statusFilter]);

  const handleCreate = async (data: { name: string; email: string; phone?: string; role_id: number; pin: string }) => {
    await createStaff(data);
    setCreating(false);
    toast.success('Staff member created.');
    await load();
  };

  const handleUpdate = async (data: { name: string; email: string; phone?: string | null; role_id: number; is_active: boolean }) => {
    if (!editing) return;
    await updateStaff(editing.id, data);
    setEditing(null);
    toast.success('Staff updated.');
    await load();
  };

  const handlePinChange = async (pin: string) => {
    if (!changingPin) return;
    await resetStaffPin(changingPin.id, pin);
    setChangingPin(null);
    toast.success('PIN updated.');
    await load();
  };

  const handleDelete = (member: StaffMember) => {
    askConfirm({
      title: 'Remove Staff Member',
      message: `Remove ${member.name}? This cannot be undone.`,
      confirmLabel: 'Remove',
      danger: true,
      onConfirm: async () => {
        try {
          await deleteStaff(member.id);
          toast.success('Staff removed.');
          await load();
        } catch (e) { setError((e as Error).message); }
      },
    });
  };

  const handleToggleActive = (member: StaffMember) => {
    const next = !member.is_active;
    askConfirm({
      title: next ? 'Enable Staff' : 'Disable Staff',
      message: next
        ? `Enable ${member.name} so they can log in again?`
        : `Disable ${member.name}? They will not be able to log in.`,
      confirmLabel: next ? 'Enable' : 'Disable',
      danger: !next,
      onConfirm: async () => {
        try {
          await updateStaff(member.id, { is_active: next });
          toast.success(next ? 'Staff enabled.' : 'Staff disabled.');
          await load();
        } catch (e) { setError((e as Error).message); }
      },
    });
  };

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 20px', border: 'none', borderRadius: 8, cursor: 'pointer',
    fontWeight: 600, fontSize: 14, fontFamily: 'inherit', minHeight: 40,
    background: active ? 'var(--color-primary)' : 'transparent',
    color: active ? '#fff' : 'var(--color-text-secondary)',
  });

  const filterStyle: React.CSSProperties = {
    padding: '8px 12px', border: '1.5px solid var(--color-border)', borderRadius: 10,
    fontSize: 13, fontFamily: 'inherit', background: 'var(--color-surface)', minHeight: 40,
  };

  return (
    <PageShell>
    <>
      <ConfirmDialog state={dlg} close={closeDlg} />
      <PageHeader section="Team"
        title="Staff Management"
        subtitle="Accounts, PINs, permissions, SMS prefs, and weekly schedules"
        action={activeTab === 'staff' && canCreateStaff ? <Btn onClick={() => setCreating(true)}>+ Add Staff</Btn> : undefined}
      />

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, background: '#F5F0EB', borderRadius: 10, padding: 4, width: 'fit-content', flexWrap: 'wrap' }}>
        <button type="button" style={tabStyle(activeTab === 'staff')} onClick={() => switchTab('staff')}>Staff</button>
        {canSchedule && (
          <button type="button" style={tabStyle(activeTab === 'schedules')} onClick={() => switchTab('schedules')}>Schedules</button>
        )}
      </div>

      {activeTab === 'schedules' && canSchedule && <SchedulesTab staff={staff} />}

      {activeTab === 'staff' && (
        <>
          {error && <ErrorMsg message={error} />}

          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, phone…"
              style={{ ...filterStyle, flex: '1 1 220px', maxWidth: 320 }}
            />
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} style={filterStyle}>
              <option value="all">All roles</option>
              {roles.map((r) => (
                <option key={r.id} value={r.slug}>{roleDisplayLabel(r.slug, r.name)}</option>
              ))}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} style={filterStyle}>
              <option value="all">All status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
              {filtered.length} of {staff.length}
            </span>
            <Btn small variant="ghost" onClick={() => navigate('/time-clock')}>Time Clock →</Btn>
          </div>

          {loading && staff.length === 0 ? <Spinner /> :
          filtered.length === 0 ? (
            <TableCard>
              <EmptyState message={staff.length === 0 ? 'No staff members found.' : 'No staff match these filters.'} />
            </TableCard>
          ) : (
            <TableCard>
              <div className="table-scroll" style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 720 }}>
                  <thead>
                    <tr>
                      {['Name', 'Contact', 'Role', 'PIN', 'Status', 'Last Login', ''].map((h) => (
                        <th key={h || 'actions'} style={TH}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((m) => {
                      const menuItems: MenuItem[] = [];
                      if (canUpdateStaff) {
                        menuItems.push({ label: 'Change PIN', onClick: () => setChangingPin(m) });
                        menuItems.push({
                          label: m.is_active ? 'Disable login' : 'Enable login',
                          onClick: () => handleToggleActive(m),
                          danger: m.is_active,
                        });
                        menuItems.push({ label: 'SMS prefs', onClick: () => setNotifPrefsUser(m) });
                      }
                      if (m.role !== 'owner' && canManagePerms) {
                        menuItems.push({ label: 'Permissions', onClick: () => setPermissionsUser(m) });
                      }
                      if (canDeleteStaff) {
                        menuItems.push({ label: 'Remove', onClick: () => handleDelete(m), danger: true });
                      }

                      return (
                        <tr key={m.id} style={{ opacity: m.is_active ? 1 : 0.55 }}>
                          <td style={{ ...TD, fontWeight: 700, color: 'var(--color-text)' }}>{m.name}</td>
                          <td style={{ ...TD, color: 'var(--color-text-secondary)' }}>
                            <div>{m.email}</div>
                            <div style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--color-text-muted)' }}>
                              {m.phone ?? '—'}
                            </div>
                          </td>
                          <td style={TD}>
                            <Badge label={roleDisplayLabel(m.role, m.role_name)} color={roleColor(m.role)} />
                          </td>
                          <td style={TD}>
                            {m.has_pin
                              ? <span style={{ color: 'var(--color-success)', fontSize: 13, fontWeight: 700 }}>Set</span>
                              : <span style={{ color: 'var(--color-warning)', fontSize: 13, fontWeight: 700 }}>Not set</span>
                            }
                          </td>
                          <td style={TD}>
                            <Badge label={m.is_active ? 'Active' : 'Inactive'} color={m.is_active ? 'green' : 'gray'} />
                          </td>
                          <td style={{ ...TD, color: 'var(--color-text-muted)', fontSize: 12, whiteSpace: 'nowrap' }}>
                            {timeAgo(m.last_login_at)}
                          </td>
                          <td style={TD}>
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                              {canUpdateStaff && (
                                <Btn small variant="secondary" onClick={() => setEditing(m)}>Edit</Btn>
                              )}
                              <RowActionMenu items={menuItems} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </TableCard>
          )}

          {creating && (
            <CreateModal roles={roles} onSave={handleCreate} onClose={() => setCreating(false)} />
          )}
          {editing && (
            <EditModal member={editing} roles={roles} onSave={handleUpdate} onClose={() => setEditing(null)} />
          )}
          {changingPin && (
            <PinModal member={changingPin} onSave={handlePinChange} onClose={() => setChangingPin(null)} />
          )}
          {permissionsUser && (
            <PermissionsModal member={permissionsUser} onClose={() => setPermissionsUser(null)} />
          )}
          {notifPrefsUser && (
            <NotificationPrefsModal member={notifPrefsUser} onClose={() => setNotifPrefsUser(null)} />
          )}
        </>
      )}
    </>

    </PageShell>
  );
}
