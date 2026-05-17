import { useState, useEffect } from 'react';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  PageHeader, TableCard, TH, TD, Badge, Btn, Modal, ModalActions, EmptyState, StatCard,
} from '../components/SharedUI';
import {
  fetchDevices, fetchPendingDevices, registerDevice, enableDevice, disableDevice, approveDevice, rejectDevice,
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
  const [pending, setPending] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'pos' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [newToken, setNewToken] = useState<string | null>(null);

  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [copyToast, setCopyToast] = useState('');

  // Approve modal state
  const [approveTarget, setApproveTarget] = useState<Device | null>(null);
  const [approveName, setApproveName] = useState('');
  const [approving, setApproving] = useState(false);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const devRes = await fetchDevices();
      setDevices(devRes.data ?? []);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
    // Load pending separately so a failure doesn't break the main table
    try {
      const pendRes = await fetchPendingDevices();
      setPending(pendRes.devices ?? []);
    } catch { /* silent */ }
  };

  useEffect(() => { void load(); }, []);

  // Auto-refresh pending every 8 seconds
  useEffect(() => {
    const t = setInterval(async () => {
      try { const r = await fetchPendingDevices(); setPending(r.devices ?? []); } catch { /* ignore */ }
    }, 8000);
    return () => clearInterval(t);
  }, []);

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
    setError('');
    try {
      if (device.is_active) {
        await disableDevice(device.id);
      } else {
        await enableDevice(device.id);
      }
      await load();
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      // eslint-disable-next-line no-alert
      window.alert('Device action failed: ' + msg);
    } finally {
      setActionLoading(null);
    }
  };

  const openApproveModal = (device: Device) => {
    setApproveTarget(device);
    setApproveName(device.name ?? '');
  };

  const confirmApprove = async () => {
    if (!approveTarget) return;
    setApproving(true);
    try {
      await approveDevice(approveTarget.id, approveName.trim() || undefined);
      setApproveTarget(null);
      void load();
    } catch (e) { setError((e as Error).message); }
    finally { setApproving(false); }
  };

  const handleReject = async (device: Device) => {
    setActionLoading(device.id);
    try { await rejectDevice(device.id); void load(); }
    catch (e) { setError((e as Error).message); }
    finally { setActionLoading(null); }
  };

  // Exclude pending/rejected from the main table — show approved + legacy null-status (including disabled)
  const approved = devices.filter(d => d.status !== 'pending' && d.status !== 'rejected');
  const active   = devices.filter(d => d.is_active).length;
  const disabled = devices.filter(d => !d.is_active && d.status !== 'pending').length;

  return (
    <div>
      <PageHeader title="Device Management" action={<Btn onClick={() => { setModal(true); setFormError(''); setNewToken(null); }}>+ Register Device</Btn>} />

      {error && <p style={{ color: '#ef4444', marginBottom: 16 }}>{error}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16, marginBottom: 24 }}>
        <StatCard label="Total Devices" value={String(devices.length)} accent="#D4813A" />
        <StatCard label="Active" value={String(active)} accent="#16a34a" />
        <StatCard label="Disabled" value={String(disabled)} accent="#9C8E7E" />
        <StatCard label="Pending Approval" value={String(pending.length)} accent="#f59e0b" />
      </div>

      {/* ── Pending Approval Section ── */}
      {pending.length > 0 && (
        <div style={{ background: '#fffbeb', border: '1.5px solid #fcd34d', borderRadius: 14, padding: '16px 20px', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <span style={{ fontSize: 20 }}>🔔</span>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: '#92400e' }}>
              {pending.length} device{pending.length > 1 ? 's' : ''} waiting for approval
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pending.map(d => (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', borderRadius: 10, padding: '12px 16px', border: '1px solid #fde68a', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: '#1C1408' }}>{d.name}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: '#9C8E7E' }}>
                    {d.type?.toUpperCase()} · {d.identifier ?? '—'} · {d.last_seen_at ? new Date(d.last_seen_at).toLocaleString() : 'Just now'}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Btn small onClick={() => openApproveModal(d)} disabled={actionLoading === d.id}>
                    {actionLoading === d.id ? '…' : '✓ Approve'}
                  </Btn>
                  <Btn small variant="secondary" onClick={() => handleReject(d)} disabled={actionLoading === d.id}>
                    {actionLoading === d.id ? '…' : '✕ Reject'}
                  </Btn>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Registered Devices Table ── */}
      <TableCard>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Name', 'Type', 'Status', 'Last Seen', 'Actions'].map(h => (
                <th key={h} style={TH}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: 40, color: '#9C8E7E' }}>Loading…</td></tr>
            ) : approved.length === 0 ? (
              <tr><td colSpan={5}><EmptyState message="No approved devices yet." /></td></tr>
            ) : approved.map(d => (
              <tr key={d.id}>
                <td style={{ ...TD, fontWeight: 600 }}>{d.name}</td>
                <td style={TD}><Badge color="blue">{d.type?.toUpperCase()}</Badge></td>
                <td style={TD}><Badge color={d.is_active ? 'green' : 'gray'}>{d.is_active ? 'Active' : 'Disabled'}</Badge></td>
                <td style={{ ...TD, color: '#9C8E7E', fontSize: 12 }}>
                  {d.last_seen_at ? new Date(d.last_seen_at).toLocaleString() : 'Never'}
                </td>
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
              {copyToast && <p style={{ color: '#15803d', fontSize: 13, marginBottom: 8 }}>{copyToast}</p>}
              <div style={{ display: 'flex', gap: 8 }}>
                <Btn onClick={() => {
                  navigator.clipboard.writeText(newToken)
                    .then(() => { setCopyToast('Copied!'); setTimeout(() => setCopyToast(''), 2000); })
                    .catch(() => { setCopyToast('Copy failed — select the token and copy manually.'); });
                }}>Copy Token</Btn>
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

      {/* ── Approve Modal ── */}
      {approveTarget && (
        <Modal title="Approve Device" onClose={() => setApproveTarget(null)} maxWidth={400}>
          <p style={{ margin: '0 0 16px', fontSize: 14, color: '#6B5D4F', lineHeight: 1.5 }}>
            Give this device a friendly name so you can identify it later.
          </p>
          <div style={{ background: '#FEF3E8', borderRadius: 10, padding: '10px 14px', marginBottom: 16 }}>
            <p style={{ margin: 0, fontSize: 11, color: '#8B7355', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Device ID</p>
            <p style={{ margin: '3px 0 0', fontSize: 13, fontFamily: 'monospace', color: '#D4813A', fontWeight: 700 }}>{approveTarget.identifier ?? '—'}</p>
          </div>
          <label>
            <span style={S.label}>Device Name *</span>
            <input
              type="text"
              placeholder="e.g. Front Counter, Kitchen Screen, Drive Thru…"
              value={approveName}
              onChange={e => setApproveName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && confirmApprove()}
              autoFocus
              style={S.input}
            />
          </label>
          <ModalActions>
            <Btn variant="secondary" onClick={() => setApproveTarget(null)}>Cancel</Btn>
            <Btn onClick={confirmApprove} disabled={approving || !approveName.trim()}>
              {approving ? 'Approving…' : '✓ Approve Device'}
            </Btn>
          </ModalActions>
        </Modal>
      )}
    </div>
  );
}
