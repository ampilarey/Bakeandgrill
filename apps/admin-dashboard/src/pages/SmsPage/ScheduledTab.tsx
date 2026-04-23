import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Pause, Play, Clock, RefreshCw } from 'lucide-react';
import {
  fetchSmsScheduled, createSmsScheduled, updateSmsScheduled, cancelSmsScheduled,
  pauseSmsScheduled, resumeSmsScheduled,
  fetchSmsContacts, fetchSmsContactGroups, fetchSmsTemplates,
  type SmsScheduledMessage, type SmsContact, type SmsContactGroup, type SmsTemplate,
} from '../../api';
import { Badge, Btn, EmptyState, Input, Modal, ModalActions, Spinner, TableCard, TD, TH } from '../../components/Layout';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABEL: Record<string, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

type ScheduleForm = {
  name: string;
  to_type: 'contact' | 'group' | 'phone';
  to_contact_id: string;
  to_group_id: string;
  to_phone: string;
  template_id: string;
  body: string;
  is_recurring: boolean;
  recurrence_type: 'daily' | 'weekly' | 'monthly' | '';
  recurrence_days: string[];
  recurrence_time: string;
  recurrence_day_of_month: string;
  send_at: string;
};

const EMPTY_FORM: ScheduleForm = {
  name: '', to_type: 'phone', to_contact_id: '', to_group_id: '', to_phone: '',
  template_id: '', body: '', is_recurring: false, recurrence_type: '',
  recurrence_days: [], recurrence_time: '', recurrence_day_of_month: '', send_at: '',
};

const STATUS_COLOR: Record<string, string> = { active: 'green', paused: 'orange', completed: 'gray', cancelled: 'red' };

function formatRecurrence(m: SmsScheduledMessage): string {
  if (!m.is_recurring) return m.send_at ? `Once: ${new Date(m.send_at).toLocaleString()}` : '—';
  const parts = [];
  if (m.recurrence_type === 'daily') parts.push('Daily');
  if (m.recurrence_type === 'weekly') {
    const days = (m.recurrence_days ?? []).map(d => DAY_LABEL[d]).join(', ');
    parts.push(`Weekly (${days || 'any day'})`);
  }
  if (m.recurrence_type === 'monthly') parts.push(`Monthly (day ${m.recurrence_day_of_month ?? '?'})`);
  if (m.recurrence_time) parts.push(`at ${m.recurrence_time}`);
  return parts.join(' ') || '—';
}

export function ScheduledTab() {
  const [messages, setMessages] = useState<SmsScheduledMessage[]>([]);
  const [contacts, setContacts] = useState<SmsContact[]>([]);
  const [groups, setGroups] = useState<SmsContactGroup[]>([]);
  const [templates, setTemplates] = useState<SmsTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editMsg, setEditMsg] = useState<SmsScheduledMessage | null>(null);
  const [form, setForm] = useState<ScheduleForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [msgs, cs, gs, ts] = await Promise.all([
        fetchSmsScheduled(), fetchSmsContacts(), fetchSmsContactGroups(), fetchSmsTemplates(),
      ]);
      setMessages(msgs.data);
      setContacts(cs.contacts);
      setGroups(gs.groups);
      setTemplates(ts.templates.filter(t => t.body));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const openModal = (m?: SmsScheduledMessage) => {
    setEditMsg(m ?? null);
    setForm(m ? {
      name: m.name, to_type: m.to_type,
      to_contact_id: m.to_contact_id?.toString() ?? '',
      to_group_id: m.to_group_id?.toString() ?? '',
      to_phone: m.to_phone ?? '',
      template_id: m.template_id?.toString() ?? '',
      body: m.body ?? '',
      is_recurring: m.is_recurring,
      recurrence_type: m.recurrence_type ?? '',
      recurrence_days: m.recurrence_days ?? [],
      recurrence_time: m.recurrence_time ?? '',
      recurrence_day_of_month: m.recurrence_day_of_month?.toString() ?? '',
      send_at: m.send_at ? m.send_at.slice(0, 16) : '',
    } : EMPTY_FORM);
    setError('');
    setModal(true);
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: form.name,
        to_type: form.to_type,
        to_contact_id: form.to_contact_id ? Number(form.to_contact_id) : null,
        to_group_id: form.to_group_id ? Number(form.to_group_id) : null,
        to_phone: form.to_phone || null,
        template_id: form.template_id ? Number(form.template_id) : null,
        body: form.body || null,
        is_recurring: form.is_recurring,
        recurrence_type: (form.recurrence_type || null) as 'daily' | 'weekly' | 'monthly' | null,
        recurrence_days: form.recurrence_days.length ? form.recurrence_days : null,
        recurrence_time: form.recurrence_time || null,
        recurrence_day_of_month: form.recurrence_day_of_month ? Number(form.recurrence_day_of_month) : null,
        send_at: form.send_at || null,
      };
      if (editMsg) {
        await updateSmsScheduled(editMsg.id, payload);
      } else {
        await createSmsScheduled(payload);
      }
      setModal(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const toggleDay = (day: string) => {
    const next = form.recurrence_days.includes(day)
      ? form.recurrence_days.filter(d => d !== day)
      : [...form.recurrence_days, day];
    setForm(f => ({ ...f, recurrence_days: next }));
  };

  if (loading) return <Spinner />;

  return (
    <>
      <Btn onClick={() => openModal()} style={{ marginBottom: 16 }}>
        <Plus size={14} style={{ marginRight: 5, verticalAlign: 'middle' }} />Schedule SMS
      </Btn>

      {messages.length === 0 ? (
        <TableCard><EmptyState message="No scheduled messages yet. Create one-time or recurring SMS schedules." /></TableCard>
      ) : (
        <TableCard>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr>{['Name', 'Recipient', 'Template / Body', 'Schedule', 'Next Send', 'Status', ''].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
            <tbody>
              {messages.map(m => (
                <tr key={m.id}>
                  <td style={{ ...TD, fontWeight: 600 }}>{m.name}</td>
                  <td style={{ ...TD, color: '#6B5D4F' }}>
                    {m.to_type === 'contact' && m.to_contact_name}
                    {m.to_type === 'group' && m.to_group_name}
                    {m.to_type === 'phone' && <span style={{ fontFamily: 'monospace' }}>{m.to_phone}</span>}
                  </td>
                  <td style={{ ...TD, maxWidth: 180, color: '#6B5D4F', fontSize: 11 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.template_name ?? m.body ?? '—'}
                    </div>
                  </td>
                  <td style={{ ...TD, color: '#6B5D4F', fontSize: 11 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {m.is_recurring ? <RefreshCw size={10} /> : <Clock size={10} />}
                      {formatRecurrence(m)}
                    </div>
                  </td>
                  <td style={{ ...TD, color: '#6B5D4F', fontSize: 11, whiteSpace: 'nowrap' }}>
                    {m.next_send_at ? new Date(m.next_send_at).toLocaleString() : '—'}
                  </td>
                  <td style={TD}><Badge label={m.status} color={STATUS_COLOR[m.status] ?? 'gray'} /></td>
                  <td style={TD}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {m.status === 'active' && (
                        <Btn variant="ghost" title="Pause" onClick={async () => { await pauseSmsScheduled(m.id); await load(); }}><Pause size={13} /></Btn>
                      )}
                      {m.status === 'paused' && (
                        <Btn variant="ghost" title="Resume" onClick={async () => { await resumeSmsScheduled(m.id); await load(); }}><Play size={13} /></Btn>
                      )}
                      <Btn variant="ghost" onClick={() => openModal(m)}><Pencil size={13} /></Btn>
                      <Btn variant="ghost" onClick={async () => { if (confirm('Cancel this scheduled message?')) { await cancelSmsScheduled(m.id); await load(); } }}>
                        <Trash2 size={13} />
                      </Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}

      {modal && (
        <Modal title={editMsg ? 'Edit Scheduled Message' : 'New Scheduled Message'} onClose={() => setModal(false)}>
          <div style={{ display: 'grid', gap: 12 }}>
            {error && <div style={{ background: '#fee2e2', color: '#991b1b', padding: '8px 12px', borderRadius: 8, fontSize: 13 }}>{error}</div>}

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#6B5D4F', display: 'block', marginBottom: 4 }}>Name *</label>
              <Input value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="e.g. Sunday Schedule Reminder" />
            </div>

            {/* Recipient */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#6B5D4F', display: 'block', marginBottom: 6 }}>Send To</label>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                {(['phone', 'contact', 'group'] as const).map(t => (
                  <button key={t} onClick={() => setForm(f => ({ ...f, to_type: t }))} style={{
                    padding: '5px 12px', fontSize: 12, borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
                    background: form.to_type === t ? '#D4813A' : '#F5F0EA',
                    color: form.to_type === t ? '#fff' : '#6B5D4F', border: 'none',
                  }}>
                    {t === 'phone' ? 'Raw Phone' : t === 'contact' ? 'Contact' : 'Group'}
                  </button>
                ))}
              </div>
              {form.to_type === 'phone' && <Input value={form.to_phone} onChange={v => setForm(f => ({ ...f, to_phone: v }))} placeholder="+9607xxxxxx" />}
              {form.to_type === 'contact' && (
                <select value={form.to_contact_id} onChange={e => setForm(f => ({ ...f, to_contact_id: e.target.value }))}
                  style={{ width: '100%', border: '1px solid #E8E0D8', borderRadius: 8, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit' }}>
                  <option value="">— Select contact —</option>
                  {contacts.map(c => <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>)}
                </select>
              )}
              {form.to_type === 'group' && (
                <select value={form.to_group_id} onChange={e => setForm(f => ({ ...f, to_group_id: e.target.value }))}
                  style={{ width: '100%', border: '1px solid #E8E0D8', borderRadius: 8, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit' }}>
                  <option value="">— Select group —</option>
                  {groups.map(g => <option key={g.id} value={g.id}>{g.name} ({g.contacts_count} members)</option>)}
                </select>
              )}
            </div>

            {/* Template or Body */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#6B5D4F', display: 'block', marginBottom: 4 }}>Template (optional)</label>
              <select value={form.template_id} onChange={e => setForm(f => ({ ...f, template_id: e.target.value }))}
                style={{ width: '100%', border: '1px solid #E8E0D8', borderRadius: 8, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit' }}>
                <option value="">— Use custom message below —</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            {!form.template_id && (
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#6B5D4F', display: 'block', marginBottom: 4 }}>Custom Message *</label>
                <textarea value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} rows={3}
                  placeholder="Type your SMS message…"
                  style={{ width: '100%', border: '1px solid #E8E0D8', borderRadius: 8, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
            )}

            {/* One-time / Recurring toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" id="is_recurring" checked={form.is_recurring}
                onChange={e => setForm(f => ({ ...f, is_recurring: e.target.checked }))} />
              <label htmlFor="is_recurring" style={{ fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>Recurring message</label>
            </div>

            {!form.is_recurring && (
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#6B5D4F', display: 'block', marginBottom: 4 }}>Send At *</label>
                <Input type="datetime-local" value={form.send_at} onChange={v => setForm(f => ({ ...f, send_at: v }))} />
              </div>
            )}

            {form.is_recurring && (
              <>
                <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#6B5D4F', display: 'block', marginBottom: 4 }}>Repeat *</label>
                    <select value={form.recurrence_type} onChange={e => setForm(f => ({ ...f, recurrence_type: e.target.value as ScheduleForm['recurrence_type'] }))}
                      style={{ width: '100%', border: '1px solid #E8E0D8', borderRadius: 8, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit' }}>
                      <option value="">— Select —</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#6B5D4F', display: 'block', marginBottom: 4 }}>Time *</label>
                    <Input type="time" value={form.recurrence_time} onChange={v => setForm(f => ({ ...f, recurrence_time: v }))} />
                  </div>
                </div>
                {form.recurrence_type === 'weekly' && (
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#6B5D4F', display: 'block', marginBottom: 6 }}>Days</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {DAYS.map(d => (
                        <button key={d} onClick={() => toggleDay(d)} style={{
                          padding: '4px 10px', fontSize: 12, borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
                          background: form.recurrence_days.includes(d) ? '#D4813A' : '#F5F0EA',
                          color: form.recurrence_days.includes(d) ? '#fff' : '#6B5D4F', border: 'none',
                        }}>{DAY_LABEL[d]}</button>
                      ))}
                    </div>
                  </div>
                )}
                {form.recurrence_type === 'monthly' && (
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#6B5D4F', display: 'block', marginBottom: 4 }}>Day of Month (1–28)</label>
                    <Input type="number" value={form.recurrence_day_of_month} onChange={v => setForm(f => ({ ...f, recurrence_day_of_month: v }))} placeholder="e.g. 1" />
                  </div>
                )}
              </>
            )}
          </div>
          <ModalActions>
            <Btn variant="secondary" onClick={() => setModal(false)}>Cancel</Btn>
            <Btn onClick={save} disabled={saving || !form.name}>{saving ? 'Saving…' : editMsg ? 'Save Changes' : 'Schedule'}</Btn>
          </ModalActions>
        </Modal>
      )}
    </>
  );
}
