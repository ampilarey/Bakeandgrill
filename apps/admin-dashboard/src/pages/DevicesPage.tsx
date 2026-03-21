import { useState, useEffect } from 'react';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  PageHeader, TableCard, TH, TD, Badge, Btn, Modal, ModalActions, EmptyState, StatCard,
} from '../components/SharedUI';
import {
  fetchDevices, registerDevice, enableDevice, disableDevice,
  type Device,
} from '../api';

const S = {
  input: { width: '100%', padding: '8px 12px', border: '1.5px solid #E8E0D8', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' as const },
  select: { width: '100%', padding: '8px 12px', border: '1px solid #E8E0D8', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' },
  label: { display: 'block' as const, fontSize: 13, fontWeight: 600 as const, color: '#6B5D4F', marginBottom: 4 },
};

const DEVICE_TYPES = ['pos', 'kds', 'display', 'other'];

export default function DevicesPage() {
  usePageTitle('Device Management');

  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'pos' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [newToken, setNewToken] = useState<string | null>(null);

  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetchDevices();
      setDevices(res.data);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const handleRegister = async () => {
    if (!form.name.trim()) { setFormError('Device name is required.'); return; }
    setSaving(true); setFormError('');
    try {
      const res = await registerDevice({ name: form.name.trim(), type: form.type });
      setNewToken(res.token ?? null);
      setForm({ name: '', type: 'pos' });
      void load();
    } catch (e) { setFormError((e as Error).message); }
    finally { setSaving(false); }
  };

  const handleToggle = async (device: Device) => {
    setActionLoading(device.id);
    try {
      if (device.is_active) { await disableDevice(device.id); }
      else                  { await enableDevice(device.id); }
      void load();
    } catch (e) { setError((e as Error).message); }
    finally { setActionLoading(null); }
  };

  const active  = devices.filter(d => d.is_active).length;
  const offline = devices.filter(d => !d.is_active).length;

  return (
    <div>
      <PageHeader title="Device Management" action={<Btn onClick={() => { setModal(true); setFormError(''); setNewToken(null); }}>+ Register Device</Btn>} />

      {error && <p style={{ color: '#ef4444', marginBottom: 16 }}>{error}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16, marginBottom: 24 }}>
        <StatCard label="Total Devices" value={String(devices.length)} accent="#D4813A" />
        <StatCard label="Active" value={String(active)} accent="#16a34a" />
        <StatCard label="Disabled" value={String(offline)} accent="#9C8E7E" />
      </div>

      <TableCard>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Name', 'Type', 'Status', 'Last Seen', 'Registered By', 'Actions'].map(h => (
                <th key={h} style={TH}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#9C8E7E' }}>Loading…</td></tr>
            ) : devices.length === 0 ? (
              <tr><td colSpan={6}><EmptyState message="No devices registered yet." /></td></tr>
            ) : devices.map(d => (
              <tr key={d.id}>
                <td style={{ ...TD, fontWeight: 600 }}>{d.name}</td>
                <td style={TD}><Badge color="blue">{d.type.toUpperCase()}</Badge></td>
                <td style={TD}><Badge color={d.is_active ? 'green' : 'gray'}>{d.is_active ? 'Active' : 'Disabled'}</Badge></td>
                <td style={{ ...TD, color: '#9C8E7E', fontSize: 12 }}>
                  {d.last_seen_at ? new Date(d.last_seen_at).toLocaleString() : 'Never'}
                </td>
                <td style={{ ...TD, color: '#9C8E7E', fontSize: 12 }}>{d.registered_by ?? '—'}</td>
                <td style={TD}>
                  <Btn
                    small
                    variant={d.is_active ? 'secondary' : 'primary'}
                    onClick={() => handleToggle(d)}
                    disabled={actionLoading === d.id}
                  >
                    {actionLoading === d.id ? '…' : d.is_active ? 'Disable' : 'Enable'}
                  </Btn>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>

      {/* ── Register Modal ── */}
      {modal && (
        <Modal title="Register New Device" onClose={() => { setModal(false); setNewToken(null); }} maxWidth={420}>
          {newToken ? (
            <>
              <div style={{ background: '#dcfce7', border: '1px solid #16a34a', borderRadius: 10, padding: 16, marginBottom: 16 }}>
                <p style={{ margin: '0 0 8px', fontWeight: 700, color: '#15803d', fontSize: 14 }}>Device Registered!</p>
                <p style={{ margin: '0 0 8px', fontSize: 13, color: '#15803d' }}>Copy this token now — it will not be shown again:</p>
                <code style={{ display: 'block', wordBreak: 'break-all', fontSize: 12, background: '#f0fdf4', padding: 10, borderRadius: 6, color: '#1C1408' }}>
                  {newToken}
                </code>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Btn onClick={() => { void navigator.clipboard.writeText(newToken); }}>Copy Token</Btn>
                <Btn variant="secondary" onClick={() => { setModal(false); setNewToken(null); }}>Done</Btn>
              </div>
            </>
          ) : (
            <>
              {formError && <p style={{ color: '#ef4444', marginBottom: 12 }}>{formError}</p>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <label>
                  <span style={S.label}>Device Name *</span>
                  <input type="text" placeholder="e.g. Front Desk POS, Kitchen Screen…" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={S.input} />
                </label>
                <label>
                  <span style={S.label}>Device Type</span>
                  <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} style={S.select}>
                    {DEVICE_TYPES.map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
                  </select>
                </label>
              </div>
              <ModalActions>
                <Btn variant="secondary" onClick={() => setModal(false)}>Cancel</Btn>
                <Btn onClick={handleRegister} disabled={saving}>{saving ? 'Registering…' : 'Register'}</Btn>
              </ModalActions>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
