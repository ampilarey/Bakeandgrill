import { useEffect, useState } from 'react';
import { fetchSchedules, createSchedule, updateSchedule, deleteSchedule, type StaffMember, type StaffSchedule } from '../../api';
import { Btn, ConfirmDialog, ErrorMsg, Modal, ModalActions, useConfirmDialog } from '../../components/Layout';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function getWeekStart(offset = 0): string {
  const d = new Date();
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1 - day) + offset * 7;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

const FS: React.CSSProperties = { width: '100%', padding: '8px 12px', border: '1.5px solid #E8E0D8', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' };
const LS: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, color: '#6B5D4F', marginBottom: 4 };
const TH: React.CSSProperties = { padding: '10px 12px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#9C8E7E', borderBottom: '2px solid #F0EBE5', whiteSpace: 'nowrap' };
const TD: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid #F0EBE5' };

export function SchedulesTab({ staff }: { staff: StaffMember[] }) {
  const { state: dlg, ask: askConfirm, close: closeDlg } = useConfirmDialog();
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
    const staffIdNum = Number(form.staff_id);
    if (isNaN(staffIdNum) || staffIdNum <= 0) { setFormError('Invalid staff member selected.'); return; }
    setSaving(true); setFormError('');
    try {
      const data = { staff_id: staffIdNum, date: form.date, start_time: form.start_time, end_time: form.end_time, notes: form.notes || undefined };
      if (editSched) { await updateSchedule(editSched.id, data); }
      else           { await createSchedule(data); }
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
    return d.toISOString().slice(0, 10);
  });

  return (
    <div>
      <ConfirmDialog state={dlg} close={closeDlg} />
      {error && <p style={{ color: '#ef4444', marginBottom: 16 }}>{error}</p>}

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
