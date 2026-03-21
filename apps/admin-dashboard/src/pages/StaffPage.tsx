import { useEffect, useState } from 'react';
import {
  fetchStaff, createStaff, updateStaff, resetStaffPin, deleteStaff,
  getUserPermissions, updateUserPermissions,
  fetchSchedules, createSchedule, updateSchedule, deleteSchedule,
  type StaffMember, type StaffRole, type PermissionItem, type StaffSchedule,
} from '../api';
import { Badge, Btn, EmptyState, ErrorMsg, Input, Modal, ModalActions, PageHeader, Spinner, TableCard, TD, TH } from '../components/Layout';
import { Toggle, useToast } from '../components/ui';
import { usePageTitle } from '../hooks/usePageTitle';

// ── helpers ──────────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>{label}</label>
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
      style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 9, padding: '9px 12px', fontSize: 14 }}
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
  onSave: (data: { name: string; email: string; role_id: number; pin: string }) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required.'); return; }
    if (!email.trim()) { setError('Email is required.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError('Please enter a valid email address.'); return; }
    if (!roleId) { setError('Select a role.'); return; }
    if (pin.length < 4) { setError('PIN must be at least 4 digits.'); return; }
    if (pin !== confirmPin) { setError('PINs do not match.'); return; }
    setError(''); setLoading(true);
    try { await onSave({ name: name.trim(), email: email.trim(), role_id: parseInt(roleId), pin }); }
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
  onSave: (data: { name: string; email: string; role_id: number; is_active: boolean }) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(member.name);
  const [email, setEmail] = useState(member.email);
  const [roleId, setRoleId] = useState(member.role_id != null ? String(member.role_id) : '');
  const [isActive, setIsActive] = useState(member.is_active);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required.'); return; }
    if (!roleId) { setError('Select a role.'); return; }
    setError(''); setLoading(true);
    try { await onSave({ name: name.trim(), email: email.trim(), role_id: parseInt(roleId), is_active: isActive }); }
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
      const perm = perms.find((p) => p.slug === slug)!;
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

// ── Schedules sub-section ─────────────────────────────────────────────────────

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function getWeekStart(offset = 0): string {
  const d = new Date();
  const day = d.getDay(); // 0=Sun
  const diff = (day === 0 ? -6 : 1 - day) + offset * 7;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function SchedulesTab({ staff }: { staff: StaffMember[] }) {
  const [weekStart, setWeekStart] = useState(getWeekStart());
  const [schedules, setSchedules] = useState<StaffSchedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(false);
  const [editSched, setEditSched] = useState<StaffSchedule | null>(null);
  const [form, setForm] = useState({ staff_id: '', date: '', start_time: '', end_time: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchSchedules({ week: weekStart });
      setSchedules(res.data);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [weekStart]);

  const openModal = (sched?: StaffSchedule) => {
    setEditSched(sched ?? null);
    setForm(sched ? {
      staff_id: String(sched.staff_id),
      date: sched.date,
      start_time: sched.start_time,
      end_time: sched.end_time,
      notes: sched.notes ?? '',
    } : { staff_id: '', date: weekStart, start_time: '09:00', end_time: '17:00', notes: '' });
    setFormError('');
    setModal(true);
  };

  const handleSave = async () => {
    if (!form.staff_id || !form.date || !form.start_time || !form.end_time) {
      setFormError('Staff, date, start and end times are required.'); return;
    }
    setSaving(true); setFormError('');
    try {
      const data = { staff_id: Number(form.staff_id), date: form.date, start_time: form.start_time, end_time: form.end_time, notes: form.notes || undefined };
      if (editSched) { await updateSchedule(editSched.id, data); }
      else           { await createSchedule(data); }
      setModal(false);
      void load();
    } catch (e) { setFormError((e as Error).message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Remove this schedule entry?')) return;
    try { await deleteSchedule(id); void load(); }
    catch (e) { setError((e as Error).message); }
  };

  // Build week dates
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart + 'T00:00:00');
    d.setDate(d.getDate() + i);
    return d.toISOString().slice(0, 10);
  });

  const FS: React.CSSProperties = { width: '100%', padding: '8px 12px', border: '1.5px solid #E8E0D8', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' };
  const LS: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, color: '#6B5D4F', marginBottom: 4 };

  return (
    <div>
      {error && <p style={{ color: '#ef4444', marginBottom: 16 }}>{error}</p>}

      {/* Week navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <Btn small variant="ghost" onClick={() => setWeekStart(getWeekStart(-1))}>← Prev</Btn>
        <span style={{ fontWeight: 700, fontSize: 15 }}>
          Week of {new Date(weekStart + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
        <Btn small variant="ghost" onClick={() => setWeekStart(getWeekStart(1))}>Next →</Btn>
        <Btn small variant="ghost" onClick={() => setWeekStart(getWeekStart())}>This Week</Btn>
        <div style={{ marginLeft: 'auto' }}>
          <Btn small onClick={() => openModal()}>+ Add Shift</Btn>
        </div>
      </div>

      {loading ? (
        <p style={{ textAlign: 'center', padding: 40, color: '#9C8E7E' }}>Loading…</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ ...TH, minWidth: 120 }}>Day</th>
                {staff.filter(s => s.is_active).map(s => (
                  <th key={s.id} style={{ ...TH, minWidth: 140 }}>{s.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weekDates.map((date, di) => {
                const daySchedules = schedules.filter(sc => sc.date === date);
                return (
                  <tr key={date} style={{ background: di % 2 === 0 ? '#FAFAF9' : '#fff' }}>
                    <td style={{ ...TD, fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {DAYS[di]}<br />
                      <span style={{ fontSize: 11, color: '#9C8E7E', fontWeight: 400 }}>
                        {new Date(date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                    </td>
                    {staff.filter(s => s.is_active).map(s => {
                      const shift = daySchedules.find(sc => sc.staff_id === s.id);
                      return (
                        <td key={s.id} style={{ ...TD, verticalAlign: 'top', padding: 8 }}>
                          {shift ? (
                            <div style={{ background: '#FEF3E8', border: '1px solid #D4813A', borderRadius: 8, padding: '6px 10px' }}>
                              <div style={{ fontWeight: 700, color: '#D4813A', fontSize: 12 }}>
                                {shift.start_time.slice(0, 5)} – {shift.end_time.slice(0, 5)}
                              </div>
                              {shift.notes && <div style={{ fontSize: 11, color: '#6B5D4F', marginTop: 2 }}>{shift.notes}</div>}
                              <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                                <button onClick={() => openModal(shift)} style={{ fontSize: 11, color: '#D4813A', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>edit</button>
                                <button onClick={() => handleDelete(shift.id)} style={{ fontSize: 11, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>remove</button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setForm({ staff_id: String(s.id), date, start_time: '09:00', end_time: '17:00', notes: '' }); setEditSched(null); setFormError(''); setModal(true); }}
                              style={{ fontSize: 11, color: '#C8BEB6', background: 'none', border: '1px dashed #E8E0D8', borderRadius: 6, cursor: 'pointer', padding: '4px 8px', width: '100%' }}
                            >
                              + Add
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {schedules.length === 0 && !loading && (
        <EmptyState message="No schedules this week. Click '+ Add Shift' to get started." />
      )}

      {modal && (
        <Modal title={editSched ? 'Edit Shift' : 'Add Shift'} onClose={() => setModal(false)}>
          {formError && <ErrorMsg message={formError} />}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <label>
              <span style={LS}>Staff Member *</span>
              <select value={form.staff_id} onChange={e => setForm(f => ({ ...f, staff_id: e.target.value }))} style={{ ...FS, border: '1px solid #E8E0D8', borderRadius: 8 }}>
                <option value="">Select staff…</option>
                {staff.filter(s => s.is_active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label>
              <span style={LS}>Date *</span>
              <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={FS} />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label>
                <span style={LS}>Start Time *</span>
                <input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} style={FS} />
              </label>
              <label>
                <span style={LS}>End Time *</span>
                <input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} style={FS} />
              </label>
            </div>
            <label>
              <span style={LS}>Notes</span>
              <input type="text" placeholder="Optional note…" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={FS} />
            </label>
          </div>
          <ModalActions>
            <Btn variant="ghost" onClick={() => setModal(false)}>Cancel</Btn>
            <Btn onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Btn>
          </ModalActions>
        </Modal>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function StaffPage() {
    usePageTitle('Staff');
  const [activeTab, setActiveTab] = useState<'staff' | 'schedules'>('staff');
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [roles, setRoles] = useState<StaffRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [changingPin, setChangingPin] = useState<StaffMember | null>(null);
  const [permissionsUser, setPermissionsUser] = useState<StaffMember | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchStaff();
      setStaff(res.staff);
      setRoles(res.roles);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const handleCreate = async (data: { name: string; email: string; role_id: number; pin: string }) => {
    await createStaff(data);
    setCreating(false);
    await load();
  };

  const handleUpdate = async (data: { name: string; email: string; role_id: number; is_active: boolean }) => {
    if (!editing) return;
    await updateStaff(editing.id, data);
    setEditing(null);
    await load();
  };

  const handlePinChange = async (pin: string) => {
    if (!changingPin) return;
    await resetStaffPin(changingPin.id, pin);
    setChangingPin(null);
  };

  const handleDelete = async (member: StaffMember) => {
    if (!confirm(`Remove ${member.name}? This cannot be undone.`)) return;
    try { await deleteStaff(member.id); await load(); }
    catch (e) { setError((e as Error).message); }
  };

  const handleToggleActive = async (member: StaffMember) => {
    await updateStaff(member.id, { is_active: !member.is_active });
    await load();
  };

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 20px', border: 'none', borderRadius: 8, cursor: 'pointer',
    fontWeight: 600, fontSize: 14, fontFamily: 'inherit',
    background: active ? '#D4813A' : 'transparent',
    color: active ? '#fff' : '#6B5D4F',
  });

  return (
    <>
      <PageHeader
        title="Staff Management"
        subtitle="Manage staff accounts and PINs"
        action={activeTab === 'staff' ? <Btn onClick={() => setCreating(true)}>+ Add Staff</Btn> : undefined}
      />

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, background: '#F5F0EB', borderRadius: 10, padding: 4, width: 'fit-content' }}>
        <button style={tabStyle(activeTab === 'staff')} onClick={() => setActiveTab('staff')}>Staff</button>
        <button style={tabStyle(activeTab === 'schedules')} onClick={() => setActiveTab('schedules')}>Schedules</button>
      </div>

      {activeTab === 'schedules' && <SchedulesTab staff={staff} />}

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
                {['Name', 'Email', 'Role', 'PIN', 'Status', 'Last Login', ''].map((h) => (
                  <th key={h} style={TH}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {staff.map((m) => (
                <tr key={m.id} style={{ opacity: m.is_active ? 1 : 0.55 }}>
                  <td style={{ ...TD, fontWeight: 700, color: '#1C1408' }}>{m.name}</td>
                  <td style={{ ...TD, color: '#6B5D4F' }}>{m.email}</td>
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
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <Btn small variant="secondary" onClick={() => setEditing(m)}>Edit</Btn>
                      <Btn small variant="ghost" onClick={() => setChangingPin(m)}>PIN</Btn>
                      <Btn small variant="ghost" onClick={() => handleToggleActive(m)}>
                        {m.is_active ? 'Disable' : 'Enable'}
                      </Btn>
                      {m.role !== 'owner' && (
                        <Btn small variant="ghost" onClick={() => setPermissionsUser(m)}>Permissions</Btn>
                      )}
                      <Btn small variant="danger" onClick={() => handleDelete(m)}>Remove</Btn>
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
        </>
      )}
    </>
  );
}
