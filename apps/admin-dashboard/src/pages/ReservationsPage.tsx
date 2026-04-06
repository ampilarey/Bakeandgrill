import { useEffect, useState } from 'react';
import {
  getReservations, updateReservationStatus,
  getReservationSettings, updateReservationSettings,
  type AdminReservation, type ReservationSettings,
} from '../api';
import { Badge, Btn, DateInput, EmptyState, ErrorMsg, PageHeader, Pagination, Spinner, TableCard, TD, TH } from '../components/Layout';
import { usePageTitle } from '../hooks/usePageTitle';

const STATUS_COLOR: Record<string, string> = {
  pending:   'yellow',
  confirmed: 'green',
  seated:    'blue',
  completed: 'gray',
  cancelled: 'red',
  no_show:   'gray',
};

const NEXT_STATUSES: Record<string, string[]> = {
  pending:   ['confirmed', 'cancelled'],
  confirmed: ['seated', 'no_show', 'cancelled'],
  seated:    ['completed'],
  completed: [],
  cancelled: [],
  no_show:   [],
};

const inputStyle: React.CSSProperties = {
  height: 36,
  padding: '0 10px',
  border: '1.5px solid #E8E0D8',
  borderRadius: 10,
  fontSize: 13,
  fontFamily: 'inherit',
  background: '#fff',
  color: '#1C1408',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: '#6B5D4F',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: 4,
  display: 'block',
};

const fieldStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 0,
};

const cardStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #E8E0D8',
  borderRadius: 16,
  padding: '24px',
  marginBottom: 20,
};

// ── Reservations list tab ──────────────────────────────────────────────────────

function ReservationsList() {
  const [reservations, setReservations] = useState<AdminReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [confirmAction, setConfirmAction] = useState<{ id: number; status: string } | null>(null);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const res = await getReservations({ date: dateFilter || undefined, status: statusFilter || undefined, page });
      setReservations(res.data);
      setLastPage(res.meta.last_page);
      setTotal(res.meta.total);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [dateFilter, statusFilter, page]);

  const handleStatus = async (id: number, status: string) => {
    if (status === 'cancelled' || status === 'no_show') {
      setConfirmAction({ id, status });
      return;
    }
    try {
      const res = await updateReservationStatus(id, status);
      setReservations((prev) => prev.map((r) => r.id === id ? res.reservation : r));
    } catch (e) { setError((e as Error).message); }
  };

  const confirmAndExecute = async () => {
    if (!confirmAction) return;
    const { id, status } = confirmAction;
    setConfirmAction(null);
    try {
      const res = await updateReservationStatus(id, status);
      setReservations((prev) => prev.map((r) => r.id === id ? res.reservation : r));
    } catch (e) { setError((e as Error).message); }
  };

  return (
    <>
      {error && <ErrorMsg message={error} />}

      {confirmAction && (
        <div style={{ background: '#FEF2F2', border: '1.5px solid #ef4444', borderRadius: 10, padding: '14px 18px', marginBottom: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#dc2626', marginBottom: 10 }}>
            Mark reservation as <strong>{confirmAction.status.replace('_', ' ')}</strong>? This cannot be reversed.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn small variant="danger" onClick={() => void confirmAndExecute()}>Confirm</Btn>
            <Btn small variant="secondary" onClick={() => setConfirmAction(null)}>Cancel</Btn>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20, alignItems: 'flex-end' }}>
        <DateInput value={dateFilter} onChange={(v) => { setDateFilter(v); setPage(1); }} label="Date" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={labelStyle}>Status</label>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            style={{ height: 36, padding: '0 10px', border: '1.5px solid #E8E0D8', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', background: '#fff', color: '#1C1408', outline: 'none', cursor: 'pointer' }}
          >
            <option value="">All Statuses</option>
            {['pending', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show'].map((s) => (
              <option key={s} value={s}>{s.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</option>
            ))}
          </select>
        </div>
        {(dateFilter || statusFilter) && (
          <Btn variant="secondary" small onClick={() => { setDateFilter(''); setStatusFilter(''); setPage(1); }}>
            Clear
          </Btn>
        )}
        <div style={{ marginLeft: 'auto', fontSize: 13, color: '#9C8E7E', alignSelf: 'center' }}>
          {total} reservation{total !== 1 ? 's' : ''}
        </div>
      </div>

      {loading ? <Spinner /> : reservations.length === 0 ? (
        <TableCard><EmptyState message="No reservations found." /></TableCard>
      ) : (
        <TableCard>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr>
                {['#', 'Guest', 'Party', 'Date', 'Time', 'Table', 'Status', 'Actions'].map((h) => (
                  <th key={h} style={TH}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reservations.map((r) => (
                <tr key={r.id}>
                  <td style={{ ...TD, color: '#9C8E7E', fontSize: 12 }}>{r.id}</td>
                  <td style={TD}>
                    <div style={{ fontWeight: 600, color: '#1C1408' }}>{r.customer_name}</div>
                    <div style={{ fontSize: 12, color: '#9C8E7E' }}>{r.customer_phone}</div>
                    {r.notes && (
                      <div style={{ fontSize: 11, color: '#9C8E7E', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                        {r.notes}
                      </div>
                    )}
                  </td>
                  <td style={{ ...TD, textAlign: 'center', fontWeight: 700 }}>{r.party_size}</td>
                  <td style={{ ...TD, whiteSpace: 'nowrap' }}>{r.date}</td>
                  <td style={{ ...TD, whiteSpace: 'nowrap' }}>{r.time_slot}</td>
                  <td style={TD}>{r.table?.name ?? '—'}</td>
                  <td style={TD}>
                    <Badge label={r.status.replace('_', ' ')} color={STATUS_COLOR[r.status] ?? 'gray'} />
                  </td>
                  <td style={TD}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {NEXT_STATUSES[r.status]?.map((ns) => (
                        <Btn
                          key={ns}
                          small
                          variant={ns === 'cancelled' || ns === 'no_show' ? 'danger' : 'secondary'}
                          onClick={() => handleStatus(r.id, ns)}
                        >
                          {ns.replace('_', ' ')}
                        </Btn>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} totalPages={lastPage} onChange={setPage} />
        </TableCard>
      )}
    </>
  );
}

// ── Settings tab ──────────────────────────────────────────────────────────────

function ReservationSettingsTab() {
  const [form, setForm] = useState<ReservationSettings>({
    max_party_size: 8,
    booking_window_days: 30,
    slot_duration_minutes: 30,
    slots_per_interval: 4,
    advance_notice_hours: 2,
    auto_confirm: false,
    confirmation_sms: true,
    reminder_sms: true,
    reminder_hours_before: 2,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  useEffect(() => {
    getReservationSettings()
      .then(({ settings }) => setForm(settings))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      await updateReservationSettings(form);
      showToast('Settings saved.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const set = <K extends keyof ReservationSettings>(key: K, value: ReservationSettings[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  if (loading) return <Spinner />;

  return (
    <>
      {error && <ErrorMsg message={error} />}
      {toast && (
        <div style={{ background: '#DCFCE7', color: '#166534', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          {toast}
        </div>
      )}

      {/* Booking rules */}
      <div style={cardStyle}>
        <h3 style={{ margin: '0 0 18px', fontSize: 15, fontWeight: 700, color: '#1C1408' }}>Booking Rules</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          <div style={fieldStyle}>
            <label style={labelStyle}>Max Party Size</label>
            <input
              type="number" min={1} max={50}
              style={inputStyle}
              value={form.max_party_size}
              onChange={(e) => set('max_party_size', Number(e.target.value))}
            />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Booking Window (days ahead)</label>
            <input
              type="number" min={1} max={365}
              style={inputStyle}
              value={form.booking_window_days}
              onChange={(e) => set('booking_window_days', Number(e.target.value))}
            />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Advance Notice Required (hours)</label>
            <input
              type="number" min={0} max={72}
              style={inputStyle}
              value={form.advance_notice_hours}
              onChange={(e) => set('advance_notice_hours', Number(e.target.value))}
            />
          </div>
        </div>
      </div>

      {/* Slot settings */}
      <div style={cardStyle}>
        <h3 style={{ margin: '0 0 18px', fontSize: 15, fontWeight: 700, color: '#1C1408' }}>Time Slots</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          <div style={fieldStyle}>
            <label style={labelStyle}>Slot Duration (minutes)</label>
            <select
              style={{ ...inputStyle, cursor: 'pointer' }}
              value={form.slot_duration_minutes}
              onChange={(e) => set('slot_duration_minutes', Number(e.target.value))}
            >
              {[15, 30, 45, 60, 90, 120].map((m) => (
                <option key={m} value={m}>{m} min</option>
              ))}
            </select>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Max Concurrent Bookings per Slot</label>
            <input
              type="number" min={1} max={20}
              style={inputStyle}
              value={form.slots_per_interval}
              onChange={(e) => set('slots_per_interval', Number(e.target.value))}
            />
          </div>
        </div>
      </div>

      {/* Confirmations & SMS */}
      <div style={cardStyle}>
        <h3 style={{ margin: '0 0 18px', fontSize: 15, fontWeight: 700, color: '#1C1408' }}>Confirmations & SMS</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {(
            [
              { key: 'auto_confirm', label: 'Auto-confirm bookings', desc: 'Automatically confirm new reservations without manual review' },
              { key: 'confirmation_sms', label: 'Send confirmation SMS', desc: 'SMS customer when a reservation is confirmed' },
              { key: 'reminder_sms', label: 'Send reminder SMS', desc: 'SMS customer ahead of their reservation time' },
            ] as { key: keyof ReservationSettings; label: string; desc: string }[]
          ).map(({ key, label, desc }) => (
            <label key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form[key] as boolean}
                onChange={(e) => set(key, e.target.checked as ReservationSettings[typeof key])}
                style={{ marginTop: 3, width: 16, height: 16, cursor: 'pointer', accentColor: '#D4783A' }}
              />
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#1C1408' }}>{label}</div>
                <div style={{ fontSize: 12, color: '#9C8E7E', marginTop: 2 }}>{desc}</div>
              </div>
            </label>
          ))}

          {form.reminder_sms && (
            <div style={{ ...fieldStyle, marginLeft: 28, maxWidth: 240 }}>
              <label style={labelStyle}>Reminder — hours before reservation</label>
              <input
                type="number" min={1} max={48}
                style={inputStyle}
                value={form.reminder_hours_before}
                onChange={(e) => set('reminder_hours_before', Number(e.target.value))}
              />
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Btn onClick={() => void handleSave()} disabled={saving}>
          {saving ? 'Saving…' : 'Save Settings'}
        </Btn>
      </div>
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function ReservationsPage() {
  usePageTitle('Reservations');
  const [tab, setTab] = useState<'list' | 'settings'>('list');

  const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 18px',
    border: 'none',
    borderBottom: active ? '2px solid #D4783A' : '2px solid transparent',
    background: 'transparent',
    fontSize: 14,
    fontWeight: active ? 700 : 500,
    color: active ? '#D4783A' : '#6B5D4F',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'color 0.15s',
  });

  return (
    <>
      <PageHeader title="Reservations" />

      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #E8E0D8', marginBottom: 24 }}>
        <button style={tabBtnStyle(tab === 'list')}     onClick={() => setTab('list')}>Reservations</button>
        <button style={tabBtnStyle(tab === 'settings')} onClick={() => setTab('settings')}>Settings</button>
      </div>

      {tab === 'list'     && <ReservationsList />}
      {tab === 'settings' && <ReservationSettingsTab />}
    </>
  );
}

export default ReservationsPage;
