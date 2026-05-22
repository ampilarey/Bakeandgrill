import { useState, useEffect } from 'react';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  PageHeader, TableCard, TH, TD, Badge, Btn, Modal, ModalActions, EmptyState, StatCard,
} from '../components/SharedUI';
import {
  fetchDevices, fetchPendingDevices, registerDevice, enableDevice, disableDevice, approveDevice, rejectDevice, deleteDevice,
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
  const [form, setForm] = useState({ name: '', type: 'pos', identifier: '' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  // The identifier the server actually persisted — same value the owner
  // needs to pass to the target device via ?device=… on first open.
  const [provisioned, setProvisioned] = useState<{ identifier: string; name: string; type: string } | null>(null);

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
    const id = form.identifier.trim();
    if (id && !/^[A-Za-z0-9\-_]+$/.test(id)) {
      setFormError('Identifier can only contain letters, numbers, hyphens and underscores.');
      return;
    }
    setSaving(true); setFormError('');
    try {
      const res = await registerDevice({
        name: form.name.trim(),
        type: form.type,
        ...(id ? { identifier: id } : {}),
      });
      setProvisioned({
        identifier: res.identifier ?? res.device.identifier,
        name: res.device.name,
        type: res.device.type,
      });
      setForm({ name: '', type: 'pos', identifier: '' });
      void load();
    } catch (e) { setFormError((e as Error).message); }
    finally { setSaving(false); }
  };

  const setupUrl = (identifier: string): string => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/pos?device=${encodeURIComponent(identifier)}`;
  };

  const handleToggle = async (device: Device) => {
    setActionLoading(device.id);
    setError('');
    try {
      const res = device.is_active
        ? await disableDevice(device.id)
        : await enableDevice(device.id);
      setDevices(prev => prev.map(d => d.id === device.id ? res.device : d));
    } catch (e) {
      setError((e as Error).message);
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

  const handleDelete = async (device: Device) => {
    if (!window.confirm(`Delete "${device.name}"? This cannot be undone.`)) return;
    setActionLoading(device.id);
    try {
      await deleteDevice(device.id);
      setDevices(prev => prev.filter(d => d.id !== device.id));
      setPending(prev => prev.filter(d => d.id !== device.id));
    }
    catch (e) { setError((e as Error).message); }
    finally { setActionLoading(null); }
  };

  // Exclude pending/rejected from the main table — show approved + legacy null-status (including disabled)
  const approved = devices.filter(d => d.status !== 'pending' && d.status !== 'rejected');
  const active   = devices.filter(d => d.is_active).length;
  const disabled = devices.filter(d => !d.is_active && d.status !== 'pending').length;

  return (
    <div>
      <PageHeader
        title="Device Management"
        action={
          <Btn onClick={() => { setModal(true); setFormError(''); setProvisioned(null); }}>
            + Pre-provision Device
          </Btn>
        }
      />

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
                  <Btn small variant="secondary" onClick={() => handleDelete(d)} disabled={actionLoading === d.id}>
                    🗑
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
              {['Name', 'Type', 'Status', 'Last Cashier', 'Open Shift', 'Last Seen', 'Actions'].map(h => (
                <th key={h} style={TH}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: '#9C8E7E' }}>Loading…</td></tr>
            ) : approved.length === 0 ? (
              <tr><td colSpan={7}><EmptyState message="No approved devices yet." /></td></tr>
            ) : approved.map(d => (
              <tr key={d.id}>
                <td style={{ ...TD, fontWeight: 600 }}>{d.name}</td>
                <td style={TD}><Badge color="blue">{d.type?.toUpperCase()}</Badge></td>
                <td style={TD}><Badge color={d.is_active ? 'green' : 'gray'}>{d.is_active ? 'Active' : 'Disabled'}</Badge></td>
                <td style={{ ...TD, fontSize: 12, color: '#6B5D4F' }}>{d.user?.name ?? d.registered_by ?? '—'}</td>
                <td style={TD}>
                  {d.open_shift_id ? (
                    <Badge color="green">Shift #{d.open_shift_id}</Badge>
                  ) : (
                    <span style={{ color: '#9C8E7E', fontSize: 12 }}>—</span>
                  )}
                </td>
                <td style={{ ...TD, color: '#9C8E7E', fontSize: 12 }}>
                  {d.last_seen_at ? new Date(d.last_seen_at).toLocaleString() : 'Never'}
                </td>
                <td style={TD}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Btn
                      small
                      variant={d.is_active ? 'secondary' : 'primary'}
                      onClick={() => handleToggle(d)}
                      disabled={actionLoading === d.id}
                    >
                      {actionLoading === d.id ? '…' : d.is_active ? 'Disable' : 'Enable'}
                    </Btn>
                    <Btn small variant="secondary" onClick={() => handleDelete(d)} disabled={actionLoading === d.id}>
                      🗑
                    </Btn>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>

      {/* ── Pre-provision Modal ── */}
      {modal && (
        <Modal title="Pre-provision Device" onClose={() => { setModal(false); setProvisioned(null); }} maxWidth={460}>
          {provisioned ? (
            <>
              <div style={{ background: '#dcfce7', border: '1px solid #16a34a', borderRadius: 10, padding: 16, marginBottom: 16 }}>
                <p style={{ margin: '0 0 6px', fontWeight: 700, color: '#15803d', fontSize: 14 }}>
                  {provisioned.name} is ready
                </p>
                <p style={{ margin: 0, fontSize: 13, color: '#15803d' }}>
                  Approved as <strong>{provisioned.type.toUpperCase()}</strong>. Open the setup link on the device once to bind it — no login or self-registration needed.
                </p>
              </div>

              <label style={{ display: 'block', marginBottom: 14 }}>
                <span style={S.label}>Device identifier</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <code style={{
                    flex: 1, display: 'block', padding: '10px 12px', borderRadius: 8,
                    background: '#F8FAFC', border: '1px solid #E2E8F0',
                    fontSize: 13, color: '#1C1408', wordBreak: 'break-all',
                  }}>
                    {provisioned.identifier}
                  </code>
                  <Btn variant="secondary" onClick={() => {
                    navigator.clipboard.writeText(provisioned.identifier)
                      .then(() => { setCopyToast('Identifier copied!'); setTimeout(() => setCopyToast(''), 2000); })
                      .catch(() => setCopyToast('Copy failed — select and copy manually.'));
                  }}>Copy</Btn>
                </div>
              </label>

              <label style={{ display: 'block', marginBottom: 8 }}>
                <span style={S.label}>One-tap setup link</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <code style={{
                    flex: 1, display: 'block', padding: '10px 12px', borderRadius: 8,
                    background: '#F8FAFC', border: '1px solid #E2E8F0',
                    fontSize: 12, color: '#1C1408', wordBreak: 'break-all',
                  }}>
                    {setupUrl(provisioned.identifier)}
                  </code>
                  <Btn variant="secondary" onClick={() => {
                    navigator.clipboard.writeText(setupUrl(provisioned.identifier))
                      .then(() => { setCopyToast('Link copied!'); setTimeout(() => setCopyToast(''), 2000); })
                      .catch(() => setCopyToast('Copy failed — select and copy manually.'));
                  }}>Copy</Btn>
                </div>
                <span style={{ fontSize: 12, color: '#6B5D4F', marginTop: 6, display: 'block' }}>
                  Open this URL once on the target device. The POS will store the identifier locally and load straight as <strong>{provisioned.name}</strong> on every visit afterwards.
                </span>
              </label>

              {copyToast && <p style={{ color: '#15803d', fontSize: 13, marginTop: 8, marginBottom: 0 }}>{copyToast}</p>}

              <ModalActions>
                <Btn onClick={() => { setModal(false); setProvisioned(null); }}>Done</Btn>
              </ModalActions>
            </>
          ) : (
            <>
              <p style={{ margin: '0 0 14px', fontSize: 13, color: '#6B5D4F' }}>
                Use this for headless devices (KDS screens, manager displays) where nobody logs in. For a normal cashier POS, just open the site on the device and approve it under <strong>Pending Approval</strong> above.
              </p>
              {formError && <p style={{ color: '#ef4444', marginBottom: 12 }}>{formError}</p>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <label>
                  <span style={S.label}>Device name *</span>
                  <input
                    type="text"
                    placeholder="e.g. Kitchen Screen, Manager Display…"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    style={S.input}
                  />
                </label>
                <label>
                  <span style={S.label}>Type</span>
                  <select
                    value={form.type}
                    onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                    style={S.select}
                  >
                    {DEVICE_TYPES.map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
                  </select>
                </label>
                <label>
                  <span style={S.label}>Identifier (optional)</span>
                  <input
                    type="text"
                    placeholder="Leave blank to auto-generate (e.g. KDS-7F3A9C2B)"
                    value={form.identifier}
                    onChange={e => setForm(f => ({ ...f, identifier: e.target.value }))}
                    style={{ ...S.input, fontFamily: 'monospace' }}
                  />
                  <span style={{ fontSize: 12, color: '#9C8E7E', marginTop: 4, display: 'block' }}>
                    Letters, numbers, hyphens and underscores only. Match an existing identifier to re-bind a lost device.
                  </span>
                </label>
              </div>
              <ModalActions>
                <Btn variant="secondary" onClick={() => setModal(false)}>Cancel</Btn>
                <Btn onClick={handleRegister} disabled={saving}>{saving ? 'Provisioning…' : 'Provision device'}</Btn>
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
