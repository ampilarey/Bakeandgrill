import { useEffect, useState } from 'react';
import {
  getReservations, updateReservationStatus, seatReservation, createAdminReservation,
  getReservationSettings, updateReservationSettings,
  type AdminReservation, type ReservationSettings,
} from '../api';
import {
  Badge, Btn, DateInput, EmptyState, ErrorMsg, Modal, ModalActions, PageHeader, PageShell, Pagination, Spinner, TableCard, TD,
} from '../components/SharedUI';
import { SortFilterHead, useSortFilter } from '../components/TableControls';
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
  border: '1.5px solid var(--color-border)',
  borderRadius: 10,
  fontSize: 13,
  fontFamily: 'inherit',
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--color-text-secondary)',
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
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 16,
  padding: '24px',
  marginBottom: 20,
};

// ── Reservations list tab ──────────────────────────────────────────────────────

function ReservationsList() {
  const [reservations, setReservations] = useState<AdminReservation[]>([]);
  const reservationCtl = useSortFilter(reservations, [
    { key: 'id', label: '#', kind: 'number', get: (r) => r.id },
    { key: 'guest', label: 'Guest', get: (r) => [r.customer_name, r.customer_phone, r.notes].filter(Boolean).join(' ') },
    { key: 'party', label: 'Party', kind: 'number', get: (r) => r.party_size },
    { key: 'date', label: 'Date', get: (r) => r.date },
    { key: 'time', label: 'Time', get: (r) => r.time_slot },
    { key: 'table', label: 'Table', get: (r) => r.table?.name },
    { key: 'status', label: 'Status', kind: 'select', get: (r) => (r.status ?? '').split('_').join(' ') },
    { key: 'actions', label: 'Actions' },
  ], 'reservations');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [confirmAction, setConfirmAction] = useState<{ id: number; status: string } | null>(null);

  // Staff booking by phone (ops audit, 2026-09-25): before this, a caller's booking had to be typed into the public form.
  const [newOpen, setNewOpen] = useState(false);
  const [newForm, setNewForm] = useState({ customer_name: '', customer_phone: '', party_size: '2', date: '', time_slot: '19:00', notes: '' });
  const [newSaving, setNewSaving] = useState(false);
  const [newError, setNewError] = useState('');
  const [newDone, setNewDone] = useState('');

  const submitNew = async () => {
    const party = Number(newForm.party_size);
    if (!newForm.customer_name.trim() || !newForm.customer_phone.trim() || !newForm.date || !newForm.time_slot || !party || party < 1) {
      setNewError('Name, phone, party size, date and time are all needed.');
      return;
    }
    setNewSaving(true);
    setNewError('');
    try {
      const res = await createAdminReservation({
        customer_name: newForm.customer_name.trim(),
        customer_phone: newForm.customer_phone.trim(),
        party_size: party,
        date: newForm.date,
        time_slot: newForm.time_slot,
        ...(newForm.notes.trim() ? { notes: newForm.notes.trim() } : {}),
        confirmed: true,
      });
      setNewOpen(false);
      setNewForm({ customer_name: '', customer_phone: '', party_size: '2', date: '', time_slot: '19:00', notes: '' });
      setNewDone(`Booked ${res.reservation.customer_name}, ${res.reservation.party_size} on ${res.reservation.date} at ${res.reservation.time_slot}${res.reservation.table ? ` (${res.reservation.table.name})` : ''}. The guest has been texted.`);
      window.setTimeout(() => setNewDone(''), 6000);
      void load();
    } catch (e) {
      setNewError((e as Error).message);
    } finally {
      setNewSaving(false);
    }
  };

  const load = async () => {
    setLoading(true); setError('');
    try {
      const res = await getReservations({ date: dateFilter || undefined, status: statusFilter || undefined, page });
      setReservations(res.data ?? []);
      setLastPage(res.meta?.last_page ?? 1);
      setTotal(res.meta?.total ?? 0);
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
      // Seating goes through the seat endpoint so prepaid dine-in bookings
      // claim their held table for the paid order (plain status PATCH would
      // mark seated without linking the bill to the seat).
      const res = status === 'seated'
        ? await seatReservation(id)
        : await updateReservationStatus(id, status);
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
        <div style={{ background: 'var(--color-danger-bg)', border: '1.5px solid var(--color-danger)', borderRadius: 10, padding: '14px 18px', marginBottom: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-danger-strong)', marginBottom: 10 }}>
            Mark reservation as <strong>{confirmAction.status.split('_').join(' ')}</strong>? This cannot be reversed.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn small variant="danger" onClick={() => void confirmAndExecute()}>Confirm</Btn>
            <Btn small variant="secondary" onClick={() => setConfirmAction(null)}>Cancel</Btn>
          </div>
        </div>
      )}

      {newDone && <div role="status" data-testid="booking-done" style={{ background: 'var(--color-success-bg)', color: 'var(--color-success-strong)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>{newDone}</div>}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20, alignItems: 'flex-end' }}>
        <Btn onClick={() => { setNewError(''); setNewOpen(true); }}>+ New booking</Btn>
        <DateInput value={dateFilter} onChange={(v) => { setDateFilter(v); setPage(1); }} label="Date" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={labelStyle}>Status</label>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            style={{ height: 36, padding: '0 10px', border: '1.5px solid var(--color-border)', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', background: 'var(--color-surface)', color: 'var(--color-text)', outline: 'none', cursor: 'pointer' }}
          >
            <option value="">All Statuses</option>
            {['pending', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show'].map((s) => (
              <option key={s} value={s}>{s.split('_').join(' ').replace(/\b\w/g, (c) => c.toUpperCase())}</option>
            ))}
          </select>
        </div>
        {(dateFilter || statusFilter) && (
          <Btn variant="secondary" small onClick={() => { setDateFilter(''); setStatusFilter(''); setPage(1); }}>
            Clear
          </Btn>
        )}
        <div style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--color-text-muted)', alignSelf: 'center' }}>
          {total} reservation{total !== 1 ? 's' : ''}
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner /></div>
      ) : reservations.length === 0 ? (
        <TableCard><EmptyState message="No reservations found." /></TableCard>
      ) : (
        <TableCard>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <SortFilterHead controls={reservationCtl} allRows={reservations} />
            <tbody>
              {reservationCtl.rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ ...TD, color: 'var(--color-text-muted)', fontSize: 12 }}>{r.id}</td>
                  <td style={TD}>
                    <div style={{ fontWeight: 600, color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      {r.customer_name}
                      {r.order_id != null && (
                        <span
                          title={`Prepaid dine-in — order ${r.order_number ?? `#${r.order_id}`} already paid online`}
                          style={{
                            fontSize: 10, fontWeight: 800, letterSpacing: 0.3,
                            color: 'var(--color-primary)', background: 'var(--color-surface-alt)',
                            border: '1px solid var(--color-border)', borderRadius: 999,
                            padding: '1px 7px',
                          }}
                        >
                          PREPAID{r.order_number ? ` · ${r.order_number}` : ''}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{r.customer_phone}</div>
                    {r.notes && (
                      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                        {r.notes}
                      </div>
                    )}
                  </td>
                  <td style={{ ...TD, textAlign: 'center', fontWeight: 700 }}>{r.party_size}</td>
                  <td style={{ ...TD, whiteSpace: 'nowrap' }}>{r.date}</td>
                  <td style={{ ...TD, whiteSpace: 'nowrap' }}>{r.time_slot}</td>
                  <td style={TD}>{r.table?.name ?? '—'}</td>
                  <td style={TD}>
                    <Badge label={(r.status ?? '').split('_').join(' ')} color={STATUS_COLOR[r.status ?? ''] ?? 'gray'} />
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
                          {ns.split('_').join(' ')}
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

      {newOpen && (
        <Modal title="New booking (by phone)" onClose={() => setNewOpen(false)} maxWidth={480}>
          {newError && <p style={{ color: 'var(--color-danger)', marginBottom: 12, fontSize: 13 }}>{newError}</p>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={{ gridColumn: '1 / -1' }}>
              <span style={labelStyle}>Guest name</span>
              <input aria-label="Guest name" value={newForm.customer_name} onChange={(e) => setNewForm((f) => ({ ...f, customer_name: e.target.value }))} style={inputStyle} />
            </label>
            <label>
              <span style={labelStyle}>Phone</span>
              <input aria-label="Guest phone" inputMode="tel" placeholder="7XXXXXX" value={newForm.customer_phone} onChange={(e) => setNewForm((f) => ({ ...f, customer_phone: e.target.value }))} style={inputStyle} />
            </label>
            <label>
              <span style={labelStyle}>Party size</span>
              <input aria-label="Party size" type="number" min={1} max={200} value={newForm.party_size} onChange={(e) => setNewForm((f) => ({ ...f, party_size: e.target.value }))} style={inputStyle} />
            </label>
            <label>
              <span style={labelStyle}>Date</span>
              <input aria-label="Booking date" type="date" value={newForm.date} onChange={(e) => setNewForm((f) => ({ ...f, date: e.target.value }))} style={inputStyle} />
            </label>
            <label>
              <span style={labelStyle}>Time</span>
              <input aria-label="Booking time" type="time" value={newForm.time_slot} onChange={(e) => setNewForm((f) => ({ ...f, time_slot: e.target.value }))} style={inputStyle} />
            </label>
            <label style={{ gridColumn: '1 / -1' }}>
              <span style={labelStyle}>Notes</span>
              <input aria-label="Booking notes" value={newForm.notes} onChange={(e) => setNewForm((f) => ({ ...f, notes: e.target.value }))} style={inputStyle} placeholder="Birthday, high chair, window seat…" />
            </label>
          </div>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '10px 0 0' }}>
            Confirmed on the spot and texted to the guest. Same table capacity check as the website; linked to the customer record when the number is known.
          </p>
          <ModalActions>
            <Btn variant="secondary" onClick={() => setNewOpen(false)}>Cancel</Btn>
            <Btn onClick={() => void submitNew()} disabled={newSaving}>{newSaving ? 'Booking…' : 'Book table'}</Btn>
          </ModalActions>
        </Modal>
      )}
    </>
  );
}

// ── Settings tab (real backend fields only) ───────────────────────────────────

const DEFAULT_SETTINGS: ReservationSettings = {
  id: 0,
  slot_duration_minutes: 60,
  max_party_size: 10,
  advance_booking_days: 30,
  buffer_minutes_between: 15,
  auto_cancel_minutes: 15,
  opening_time: '09:00',
  closing_time: '22:00',
};

function ReservationSettingsTab() {
  const [form, setForm] = useState<ReservationSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  useEffect(() => {
    getReservationSettings()
      .then(({ settings }) => setForm({
        ...DEFAULT_SETTINGS,
        ...settings,
        opening_time: (settings.opening_time ?? '09:00').slice(0, 5),
        closing_time: (settings.closing_time ?? '22:00').slice(0, 5),
      }))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const handleSave = async () => {
    const numFields: (keyof ReservationSettings)[] = [
      'max_party_size', 'advance_booking_days', 'slot_duration_minutes',
      'buffer_minutes_between', 'auto_cancel_minutes',
    ];
    for (const f of numFields) {
      const v = form[f] as number;
      if (typeof v === 'number' && Number.isNaN(v)) {
        setError(`Invalid value for ${f.replace(/_/g, ' ')}.`);
        return;
      }
    }
    if (form.closing_time <= form.opening_time) {
      setError('Closing time must be after opening time.');
      return;
    }
    setSaving(true); setError('');
    try {
      const { settings } = await updateReservationSettings({
        slot_duration_minutes: form.slot_duration_minutes,
        max_party_size: form.max_party_size,
        advance_booking_days: form.advance_booking_days,
        buffer_minutes_between: form.buffer_minutes_between,
        auto_cancel_minutes: form.auto_cancel_minutes,
        opening_time: form.opening_time.slice(0, 5),
        closing_time: form.closing_time.slice(0, 5),
      });
      setForm({
        ...DEFAULT_SETTINGS,
        ...settings,
        opening_time: (settings.opening_time ?? form.opening_time).slice(0, 5),
        closing_time: (settings.closing_time ?? form.closing_time).slice(0, 5),
      });
      showToast('Settings saved.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const set = <K extends keyof ReservationSettings>(key: K, value: ReservationSettings[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <>
      {error && <ErrorMsg message={error} />}
      {toast && (
        <div style={{ background: 'var(--color-success-bg)', color: 'var(--color-success-strong)', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          {toast}
        </div>
      )}

      {loading ? <Spinner /> : null}

      <div style={cardStyle}>
        <h3 style={{ margin: '0 0 18px', fontSize: 15, fontWeight: 700, color: 'var(--color-text)' }}>Booking Rules</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }} data-responsive-grid>
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
            <label style={labelStyle}>Advance Booking (days ahead)</label>
            <input
              type="number" min={1} max={365}
              style={inputStyle}
              value={form.advance_booking_days}
              onChange={(e) => set('advance_booking_days', Number(e.target.value))}
            />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Auto No-Show (minutes after slot)</label>
            <input
              type="number" min={5} max={120}
              style={inputStyle}
              value={form.auto_cancel_minutes}
              onChange={(e) => set('auto_cancel_minutes', Number(e.target.value))}
            />
          </div>
        </div>
      </div>

      <div style={cardStyle}>
        <h3 style={{ margin: '0 0 18px', fontSize: 15, fontWeight: 700, color: 'var(--color-text)' }}>Time Slots</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }} data-responsive-grid>
          <div style={fieldStyle}>
            <label style={labelStyle}>Opening Time</label>
            <input
              type="time"
              style={inputStyle}
              value={form.opening_time}
              onChange={(e) => set('opening_time', e.target.value)}
            />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Closing Time</label>
            <input
              type="time"
              style={inputStyle}
              value={form.closing_time}
              onChange={(e) => set('closing_time', e.target.value)}
            />
          </div>
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
            <label style={labelStyle}>Buffer Between Slots (minutes)</label>
            <input
              type="number" min={0} max={120}
              style={inputStyle}
              value={form.buffer_minutes_between}
              onChange={(e) => set('buffer_minutes_between', Number(e.target.value))}
            />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Btn onClick={() => void handleSave()} disabled={saving || loading}>
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
    color: active ? '#D4783A' : 'var(--color-text-secondary)',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'color 0.15s',
  });

  return (
    <PageShell>
    <>
      <PageHeader section="Monitor" title="Reservations" />

      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--color-border)', marginBottom: 24 }}>
        <button style={tabBtnStyle(tab === 'list')}     onClick={() => setTab('list')}>Reservations</button>
        <button style={tabBtnStyle(tab === 'settings')} onClick={() => setTab('settings')}>Settings</button>
      </div>

      {tab === 'list'     && <ReservationsList />}
      {tab === 'settings' && <ReservationSettingsTab />}
    </>

    </PageShell>
  );
}

export default ReservationsPage;
