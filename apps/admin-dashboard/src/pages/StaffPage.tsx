import { useEffect, useState } from 'react';
import {
  fetchStaff, createStaff, updateStaff, resetStaffPin, deleteStaff,
  getUserPermissions, updateUserPermissions,
  getStaffNotificationPrefs, updateStaffNotificationPrefs,
  type StaffMember, type StaffRole, type PermissionItem, type StaffNotificationPref,
} from '../api';
import { SchedulesTab } from './StaffPage/SchedulesTab';
import { Badge, Btn, ConfirmDialog, EmptyState, ErrorMsg, Input, Modal, ModalActions, PageHeader, Spinner, TableCard, TD, TH, useConfirmDialog } from '../components/Layout';
import { Toggle, useToast } from '../components/ui';
import { usePageTitle } from '../hooks/usePageTitle';
import { useCurrentUserPermissions } from '../hooks/usePermissions';

// ── helpers ──────────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6B5D4F', marginBottom: 4 }}>{label}</label>
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
      style={{ width: '100%', border: '1px solid #E8E0D8', borderRadius: 9, padding: '9px 12px', fontSize: 14 }}
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
  const map: Record<string, string> = { owner: 'purple', manager: 'teal', staff: 'yellow' };
  return map[slug ?? ''] ?? 'gray';
}

function timeAgo(iso: string | null) {
  if (!iso) return 'Never';
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return new Date(iso).toLocaleDateString();
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
        <Btn onClick={handleSave} disabled={loading}>{loading ? 'Creating…' : 'Create Staff'}</Btn>
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
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Active (can log in)
        </label>
      </div>
      <ModalActions>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={handleSave} disabled={loading}>{loading ? 'Saving…' : 'Save Changes'}</Btn>
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
    getStaffNotificationPrefs(member.id).then(res => {
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
    }).catch(e => { setError((e as Error).message); setLoading(false); });
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
    const current = prefs.order_types ?? [];
    const next = current.includes(v) ? current.filter(t => t !== v) : [...current, v];
    setPrefs(p => p ? { ...p, order_types: next.length ? next : null } : p);
  };

  if (loading) return <Modal title={`SMS Prefs — ${member.name}`} onClose={onClose}><Spinner /></Modal>;

  return (
    <Modal title={`SMS Notifications — ${member.name}`} onClose={onClose}>
      {error && <ErrorMsg message={error} />}
      {prefs && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!member.phone && (
            <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#92400e' }}>
              ⚠ No phone number set for this staff member. Add a phone number in Edit to enable SMS notifications.
            </div>
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
            <input type="checkbox" checked={prefs.notifications_enabled}
              onChange={e => setPrefs(p => p ? { ...p, notifications_enabled: e.target.checked } : p)} />
            <span><strong>Enable SMS Notifications</strong> for this staff member</span>
          </label>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#6B5D4F', marginBottom: 8 }}>
              Receive notifications for (blank = all types):
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {ORDER_TYPES.map(ot => {
                const active = (prefs.order_types ?? []).includes(ot.value) || prefs.order_types === null;
                const explicit = prefs.order_types !== null;
                return (
                  <button key={ot.value} onClick={() => toggleOrderType(ot.value)} style={{
                    padding: '5px 12px', fontSize: 12, borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
                    background: (!explicit || active) ? '#D4813A' : '#F5F0EA',
                    color: (!explicit || active) ? '#fff' : '#6B5D4F', border: 'none',
                  }}>
                    {ot.label}
                  </button>
                );
              })}
              <button onClick={() => setPrefs(p => p ? { ...p, order_types: null } : p)} style={{
                padding: '5px 12px', fontSize: 12, borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
                background: prefs.order_types === null ? '#22c55e' : '#F5F0EA',
                color: prefs.order_types === null ? '#fff' : '#6B5D4F', border: 'none',
              }}>All Types</button>
            </div>
          </div>
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
              <input type="checkbox" checked={prefs.is_fallback}
                onChange={e => setPrefs(p => p ? { ...p, is_fallback: e.target.checked } : p)} />
              <span><strong>Fallback recipient</strong> — receive alerts when no matching staff is on shift</span>
            </label>
          </div>
          {prefs.is_fallback && (
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#6B5D4F', display: 'block', marginBottom: 4 }}>Fallback Priority (higher = notified first)</label>
              <Input type="number" value={String(prefs.fallback_priority)}
                onChange={v => setPrefs(p => p ? { ...p, fallback_priority: parseInt(v) || 0 } : p)} />
            </div>
          )}
        </div>
      )}
      <ModalActions>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={save} disabled={saving || !prefs}>{saving ? 'Saving…' : 'Save Prefs'}</Btn>
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
        <Btn onClick={handleSave} disabled={loading}>{loading ? 'Saving…' : 'Update PIN'}</Btn>
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
    setOverrides((prev) => {
      const next = { ...prev };
      next[slug] = null;
      return next;
    });
  };

  const resetAll = () => setOverrides({});

  const save = async () => {
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
    <Modal title={`Permissions — ${member.name}`} onClose={onClose}>
      {loading ? (
        <Spinner />
      ) : (
        <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: 4 }}>
          {Object.entries(groups).map(([category, items]) => (
            <div key={category} style={{ marginBottom: 20 }}>
              <div style={{
                fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
                color: '#9C8E7E', textTransform: 'uppercase', marginBottom: 8,
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
                    padding: '6px 0', borderBottom: '1px solid #faf8f6',
                  }}>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 14, color: '#1C1408', fontWeight: 500 }}>{p.name}</span>
                      {' '}
                      <span style={{
                        fontSize: 11, padding: '1px 6px', borderRadius: 99,
                        background: modified ? '#fef3c7' : '#f1ece6',
                        color: modified ? '#92400e' : '#9C8E7E',
                        fontWeight: 600,
                      }}>
                        {modified ? 'override' : p.source}
                      </span>
                    </div>
                    {modified && (
                      <button
                        onClick={() => reset(p.slug)}
                        style={{
                          fontSize: 11, color: '#B45309', background: 'none',
                          border: 'none', cursor: 'pointer', padding: '2px 4px',
                          textDecoration: 'underline',
                        }}
                      >
                        reset
                      </button>
                    )}
                    <Toggle
                      checked={granted}
                      onChange={() => toggle(p.slug)}
                    />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
      <ModalActions>
        {hasChanges && (
          <Btn variant="ghost" onClick={resetAll} style={{ marginRight: 'auto' }}>
            Reset all changes
          </Btn>
        )}
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={save} disabled={saving || loading}>
          {saving ? 'Saving…' : 'Save Permissions'}
        </Btn>
      </ModalActions>
    </Modal>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function StaffPage() {
    usePageTitle('Staff');
  const { can } = useCurrentUserPermissions();
  // Schedules tab calls /admin/schedules which is gated on staff.manage
  // server-side. Surfacing the tab to viewers who only have staff.view
  // led to a confusing UI where every action returned a 403; now the
  // tab is hidden entirely from users who can't actually use it.
  const canManageStaff = can('staff.manage');
  const { state: dlg, ask: askConfirm, close: closeDlg } = useConfirmDialog();
  const [activeTab, setActiveTab] = useState<'staff' | 'schedules'>('staff');
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [roles, setRoles] = useState<StaffRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [changingPin, setChangingPin] = useState<StaffMember | null>(null);
  const [permissionsUser, setPermissionsUser] = useState<StaffMember | null>(null);
  const [notifPrefsUser, setNotifPrefsUser] = useState<StaffMember | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchStaff();
      setStaff(res.staff ?? []);
      setRoles(res.roles);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const handleCreate = async (data: { name: string; email: string; phone?: string; role_id: number; pin: string }) => {
    try {
      await createStaff(data);
      setCreating(false);
      await load();
    } catch (e) { setError((e as Error).message); }
  };

  const handleUpdate = async (data: { name: string; email: string; phone?: string | null; role_id: number; is_active: boolean }) => {
    if (!editing) return;
    try {
      await updateStaff(editing.id, data);
      setEditing(null);
      await load();
    } catch (e) { setError((e as Error).message); }
  };

  const handlePinChange = async (pin: string) => {
    if (!changingPin) return;
    try {
      await resetStaffPin(changingPin.id, pin);
      setChangingPin(null);
      await load();
    } catch (e) { setError((e as Error).message); }
  };

  const handleDelete = (member: StaffMember) => {
    askConfirm({
      title: 'Remove Staff Member',
      message: `Remove ${member.name}? This cannot be undone.`,
      confirmLabel: 'Remove',
      danger: true,
      onConfirm: async () => {
        try { await deleteStaff(member.id); await load(); }
        catch (e) { setError((e as Error).message); }
      },
    });
  };

  const handleToggleActive = async (member: StaffMember) => {
    try {
      await updateStaff(member.id, { is_active: !member.is_active });
      await load();
    } catch (e) { setError((e as Error).message); }
  };

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 20px', border: 'none', borderRadius: 8, cursor: 'pointer',
    fontWeight: 600, fontSize: 14, fontFamily: 'inherit',
    background: active ? '#D4813A' : 'transparent',
    color: active ? '#fff' : '#6B5D4F',
  });

  return (
    <>
      <ConfirmDialog state={dlg} close={closeDlg} />
      <PageHeader
        title="Staff Management"
        subtitle="Manage staff accounts and PINs"
        action={activeTab === 'staff' && canManageStaff ? <Btn onClick={() => setCreating(true)}>+ Add Staff</Btn> : undefined}
      />

      {/* Tab switcher — schedules tab hidden when user can't manage staff */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, background: '#F5F0EB', borderRadius: 10, padding: 4, width: 'fit-content' }}>
        <button style={tabStyle(activeTab === 'staff')} onClick={() => setActiveTab('staff')}>Staff</button>
        {canManageStaff && (
          <button style={tabStyle(activeTab === 'schedules')} onClick={() => setActiveTab('schedules')}>Schedules</button>
        )}
      </div>

      {activeTab === 'schedules' && canManageStaff && <SchedulesTab staff={staff} />}

      {activeTab === 'staff' && (
        <>
      {error && <ErrorMsg message={error} />}

      {loading && staff.length === 0 ? <Spinner /> :
      staff.length === 0 ? (
        <TableCard><EmptyState message="No staff members found." /></TableCard>
      ) : (
        <TableCard>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr>
                {['Name', 'Email', 'Phone', 'Role', 'PIN', 'Status', 'Last Login', ''].map((h) => (
                  <th key={h} style={TH}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {staff.map((m) => (
                <tr key={m.id} style={{ opacity: m.is_active ? 1 : 0.55 }}>
                  <td style={{ ...TD, fontWeight: 700, color: '#1C1408' }}>{m.name}</td>
                  <td style={{ ...TD, color: '#6B5D4F' }}>{m.email}</td>
                  <td style={{ ...TD, color: '#6B5D4F', fontFamily: 'monospace', fontSize: 12 }}>
                    {m.phone ?? <span style={{ color: '#d1d5db' }}>—</span>}
                  </td>
                  <td style={TD}>
                    <Badge label={m.role_name ?? m.role ?? '—'} color={roleColor(m.role)} />
                  </td>
                  <td style={TD}>
                    {m.has_pin
                      ? <span style={{ color: '#22c55e', fontSize: 13, fontWeight: 700 }}>Set ✓</span>
                      : <span style={{ color: '#f59e0b', fontSize: 13, fontWeight: 700 }}>Not set</span>
                    }
                  </td>
                  <td style={TD}>
                    <Badge label={m.is_active ? 'Active' : 'Inactive'} color={m.is_active ? 'green' : 'gray'} />
                  </td>
                  <td style={{ ...TD, color: '#9C8E7E', fontSize: 12, whiteSpace: 'nowrap' }}>
                    {timeAgo(m.last_login_at)}
                  </td>
                  <td style={TD}>
                    {/* Row-action permissions: every mutation button only renders
                        for users who can actually perform it. Viewers see a
                        read-only row instead of a wall of buttons that all 403. */}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {canManageStaff && (
                        <Btn small variant="secondary" onClick={() => setEditing(m)}>Edit</Btn>
                      )}
                      {canManageStaff && (
                        <Btn small variant="ghost" onClick={() => setChangingPin(m)}>PIN</Btn>
                      )}
                      {canManageStaff && (
                        <Btn small variant="ghost" onClick={() => handleToggleActive(m)}>
                          {m.is_active ? 'Disable' : 'Enable'}
                        </Btn>
                      )}
                      {m.role !== 'owner' && can('roles_permissions.manage') && (
                        <Btn small variant="ghost" onClick={() => setPermissionsUser(m)}>Permissions</Btn>
                      )}
                      {canManageStaff && (
                        <Btn small variant="ghost" onClick={() => setNotifPrefsUser(m)}>SMS Prefs</Btn>
                      )}
                      {canManageStaff && (
                        <Btn small variant="danger" onClick={() => handleDelete(m)}>Remove</Btn>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
  );
}
