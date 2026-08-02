import { useEffect, useState } from 'react';
import { fetchSchedules, createSchedule, updateSchedule, deleteSchedule, type StaffMember, type StaffSchedule } from '../../api';
import { Btn, ConfirmDialog, EmptyState, ErrorMsg, Modal, ModalActions, Spinner, TableCard, useConfirmDialog } from '../../components/Layout';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Monday of the week containing `from` (local), shifted by `offsetWeeks`. */
function weekStartFrom(from: Date = new Date(), offsetWeeks = 0): string {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const toMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + toMonday + offsetWeeks * 7);
  return toLocalDateStr(d);
}

function shiftWeek(weekStart: string, deltaWeeks: number): string {
  const d = new Date(weekStart + 'T00:00:00');
  d.setDate(d.getDate() + deltaWeeks * 7);
  return toLocalDateStr(d);
}

const FS: React.CSSProperties = { width: '100%', padding: '8px 12px', border: '1.5px solid var(--color-border)', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box', minHeight: 44 };
const LS: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 };
const TH: React.CSSProperties = { padding: '10px 12px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: 'var(--color-text-muted)', borderBottom: '2px solid var(--color-border-light)', whiteSpace: 'nowrap' };
const TD: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid var(--color-border-light)' };

export function SchedulesTab({ staff }: { staff: StaffMember[] }) {
  const { state: dlg, ask: askConfirm, close: closeDlg } = useConfirmDialog();
  const [weekStart, setWeekStart] = useState(() => weekStartFrom());
  const [schedules, setSchedules] = useState<StaffSchedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(false);
  const [editSched, setEditSched] = useState<StaffSchedule | null>(null);
  const [form, setForm] = useState({ staff_id: '', date: '', start_time: '', end_time: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const activeStaff = staff.filter((s) => s.is_active);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchSchedules({ week: weekStart });
      setSchedules(res.data ?? []);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [weekStart]);

  const openModal = (sched?: StaffSchedule) => {
    setEditSched(sched ?? null);
    setForm(sched ? {
      staff_id: String(sched.staff_id),
      date: sched.date,
      start_time: sched.start_time.slice(0, 5),
      end_time: sched.end_time.slice(0, 5),
      notes: sched.notes ?? '',
    } : { staff_id: '', date: weekStart, start_time: '09:00', end_time: '17:00', notes: '' });
    setFormError('');
    setModal(true);
  };

  const handleSave = async () => {
    if (!form.staff_id || !form.date || !form.start_time || !form.end_time) {
      setFormError('Staff, date, start and end times are required.'); return;
    }
    if (form.end_time <= form.start_time) {
      setFormError('End time must be after start time. Overnight shifts are not supported.'); return;
    }
    const staffIdNum = Number(form.staff_id);
    if (isNaN(staffIdNum) || staffIdNum <= 0) { setFormError('Invalid staff member selected.'); return; }
    setSaving(true); setFormError('');
    try {
      const data = {
        staff_id: staffIdNum,
        date: form.date,
        start_time: form.start_time,
        end_time: form.end_time,
        notes: form.notes || undefined,
      };
      if (editSched) { await updateSchedule(editSched.id, data); }
      else { await createSchedule(data); }
      setModal(false);
      void load();
    } catch (e) { setFormError((e as Error).message); }
    finally { setSaving(false); }
  };

  const handleDelete = (id: number) => {
    askConfirm({
      title: 'Remove Shift',
      message: 'Remove this schedule entry?',
      confirmLabel: 'Remove',
      danger: true,
      onConfirm: async () => {
        try { await deleteSchedule(id); void load(); }
        catch (e) { setError((e as Error).message); }
      },
    });
  };

  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart + 'T00:00:00');
    d.setDate(d.getDate() + i);
    return toLocalDateStr(d);
  });

  return (
    <div>
      <ConfirmDialog state={dlg} close={closeDlg} />
      {error && <ErrorMsg message={error} />}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <Btn small variant="ghost" onClick={() => setWeekStart((w) => shiftWeek(w, -1))}>← Prev</Btn>
        <span style={{ fontWeight: 700, fontSize: 15 }}>
          Week of {new Date(weekStart + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
        <Btn small variant="ghost" onClick={() => setWeekStart((w) => shiftWeek(w, 1))}>Next →</Btn>
        <Btn small variant="ghost" onClick={() => setWeekStart(weekStartFrom())}>This Week</Btn>
        <div style={{ marginLeft: 'auto' }}>
          <Btn small onClick={() => openModal()} disabled={activeStaff.length === 0}>+ Add Shift</Btn>
        </div>
      </div>

      {loading ? (
        <Spinner />
      ) : activeStaff.length === 0 ? (
        <TableCard><EmptyState message="No active staff to schedule. Add or enable staff first." /></TableCard>
      ) : (
        <div className="table-scroll" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 480 }}>
            <thead>
              <tr>
                <th style={{ ...TH, minWidth: 120 }}>Day</th>
                {activeStaff.map((s) => (
                  <th key={s.id} style={{ ...TH, minWidth: 140 }}>{s.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weekDates.map((date, di) => {
                const daySchedules = schedules.filter((sc) => sc.date === date);
                return (
                  <tr key={date} style={{ background: di % 2 === 0 ? '#FAFAF9' : 'var(--color-surface)' }}>
                    <td style={{ ...TD, fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {DAYS[di]}<br />
                      <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 400 }}>
                        {new Date(date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                    </td>
                    {activeStaff.map((s) => {
                      const shift = daySchedules.find((sc) => sc.staff_id === s.id);
                      return (
                        <td key={s.id} style={{ ...TD, verticalAlign: 'top', padding: 8 }}>
                          {shift ? (
                            <div style={{ background: '#FEF3E8', border: '1px solid var(--color-primary)', borderRadius: 8, padding: '8px 10px' }}>
                              <div style={{ fontWeight: 700, color: 'var(--color-primary)', fontSize: 12 }}>
                                {shift.start_time.slice(0, 5)} – {shift.end_time.slice(0, 5)}
                              </div>
                              {shift.notes && <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>{shift.notes}</div>}
                              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                <Btn small variant="ghost" onClick={() => openModal(shift)}>Edit</Btn>
                                <Btn small variant="danger" onClick={() => handleDelete(shift.id)}>Remove</Btn>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setForm({ staff_id: String(s.id), date, start_time: '09:00', end_time: '17:00', notes: '' });
                                setEditSched(null);
                                setFormError('');
                                setModal(true);
                              }}
                              style={{
                                fontSize: 12, color: 'var(--color-text-muted)', background: 'none', border: '1px dashed var(--color-border)',
                                borderRadius: 8, cursor: 'pointer', padding: '10px 8px', width: '100%', minHeight: 44,
                              }}
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

      {modal && (
        <Modal title={editSched ? 'Edit Shift' : 'Add Shift'} onClose={() => setModal(false)}>
          {formError && <ErrorMsg message={formError} />}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <label>
              <span style={LS}>Staff Member *</span>
              <select value={form.staff_id} onChange={(e) => setForm((f) => ({ ...f, staff_id: e.target.value }))} style={{ ...FS, border: '1px solid var(--color-border)', borderRadius: 8 }}>
                <option value="">Select staff…</option>
                {activeStaff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label>
              <span style={LS}>Date *</span>
              <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} style={FS} />
            </label>
            <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label>
                <span style={LS}>Start Time *</span>
                <input type="time" value={form.start_time} onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))} style={FS} />
              </label>
              <label>
                <span style={LS}>End Time *</span>
                <input type="time" value={form.end_time} onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))} style={FS} />
              </label>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-muted)' }}>Overnight shifts (end before start) are not supported.</p>
            <label>
              <span style={LS}>Notes</span>
              <input type="text" placeholder="Optional note…" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} style={FS} />
            </label>
          </div>
          <ModalActions>
            <Btn variant="ghost" onClick={() => setModal(false)}>Cancel</Btn>
            <Btn onClick={() => void handleSave()} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Btn>
          </ModalActions>
        </Modal>
      )}
    </div>
  );
}
