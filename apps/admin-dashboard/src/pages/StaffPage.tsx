import { useEffect, useState } from 'react';
import {
  fetchStaff, createStaff, updateStaff, resetStaffPin, deleteStaff,
  type StaffMember, type StaffRole,
} from '../api';
import { Badge, Btn, EmptyState, ErrorMsg, Input, Modal, ModalActions, PageHeader, Spinner, TableCard, TD, TH } from '../components/Layout';
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

// ── Main page ─────────────────────────────────────────────────────────────────

export function StaffPage() {
    usePageTitle('Staff');
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [roles, setRoles] = useState<StaffRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [changingPin, setChangingPin] = useState<StaffMember | null>(null);

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

  return (
    <>
      <PageHeader
        title="Staff Management"
        subtitle="Manage staff accounts and PINs"
        action={<Btn onClick={() => setCreating(true)}>+ Add Staff</Btn>}
      />

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
    </>
  );
}
