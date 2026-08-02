import { useEffect, useState } from 'react';
import { Phone, Bell, Settings, AlertCircle, Plus, Pencil, Trash2 } from 'lucide-react';
import {
  fetchStaff, updateStaff,
  getStaffNotificationPrefs, updateStaffNotificationPrefs,
  fetchSmsContacts, createSmsContact, updateSmsContact, deleteSmsContact,
  type StaffMember,
  type StaffNotificationPref,
  type SmsContact,
} from '../../api';
import { Badge, Btn, EmptyState, Input, Modal, ModalActions, Spinner, TableCard, TD, TH } from '../../components/Layout';

const ORDER_TYPES = [
  { value: 'online_pickup', label: 'Online Pickup' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'dine_in', label: 'Dine-in' },
];

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABEL: Record<string, string> = {
  mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun',
};

// ── Staff prefs modal ─────────────────────────────────────────────────────────

function StaffPrefsModal({
  member,
  onClose,
  onUpdated,
}: {
  member: StaffMember;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [prefs, setPrefs] = useState<StaffNotificationPref | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getStaffNotificationPrefs(member.id)
      .then(res => { setPrefs(res.prefs); setLoading(false); })
      .catch(e => { setError((e as Error).message); setLoading(false); });
  }, [member.id]);

  const toggleOrderType = (v: string) => {
    if (!prefs) return;
    const current = prefs.order_types ?? [];
    const next = current.includes(v) ? current.filter(t => t !== v) : [...current, v];
    setPrefs(p => p ? { ...p, order_types: next.length ? next : null } : p);
  };

  const save = async () => {
    if (!prefs) return;
    setSaving(true); setError('');
    try {
      await updateStaffNotificationPrefs(member.id, prefs);
      onUpdated();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Modal title={`SMS Notifications — ${member.name}`} onClose={onClose}><Spinner /></Modal>;

  return (
    <Modal title={`SMS Notifications — ${member.name}`} onClose={onClose}>
      {error && <div style={{ background: 'var(--color-danger-bg)', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--color-danger-strong)', marginBottom: 12 }}>{error}</div>}
      {prefs && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!member.phone && (
            <div style={{ background: 'var(--color-warning-bg)', border: '1px solid var(--color-warning)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--color-warning-strong)', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <AlertCircle size={14} style={{ marginTop: 1, flexShrink: 0 }} />
              <span>No phone number set. Go to <strong>Staff</strong> page → Edit this member to add a phone number first.</span>
            </div>
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
            <input type="checkbox" checked={prefs.notifications_enabled}
              onChange={e => setPrefs(p => p ? { ...p, notifications_enabled: e.target.checked } : p)} />
            <span><strong>Enable SMS Notifications</strong> for this staff member</span>
          </label>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
              Receive notifications for (blank = all order types):
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {ORDER_TYPES.map(ot => {
                const explicit = prefs.order_types !== null;
                const active = (prefs.order_types ?? []).includes(ot.value) || !explicit;
                return (
                  <button key={ot.value} onClick={() => toggleOrderType(ot.value)} style={{
                    padding: '5px 12px', fontSize: 12, borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
                    background: active ? 'var(--color-primary)' : '#F5F0EA',
                    color: active ? '#fff' : 'var(--color-text-secondary)', border: 'none',
                  }}>{ot.label}</button>
                );
              })}
              <button onClick={() => setPrefs(p => p ? { ...p, order_types: null } : p)} style={{
                padding: '5px 12px', fontSize: 12, borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
                background: prefs.order_types === null ? 'var(--color-success)' : '#F5F0EA',
                color: prefs.order_types === null ? '#fff' : 'var(--color-text-secondary)', border: 'none',
              }}>All Types</button>
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
            <input type="checkbox" checked={prefs.is_fallback}
              onChange={e => setPrefs(p => p ? { ...p, is_fallback: e.target.checked } : p)} />
            <span><strong>Fallback recipient</strong> — gets alerts when no other matching staff is found</span>
          </label>
          {prefs.is_fallback && (
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>
                Fallback Priority (higher = notified first)
              </label>
              <Input type="number" value={String(prefs.fallback_priority ?? 0)}
                onChange={v => setPrefs(p => p ? { ...p, fallback_priority: parseInt(v) || 0 } : p)} />
            </div>
          )}
        </div>
      )}
      <ModalActions>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={save} disabled={saving || !prefs}>{saving ? 'Saving…' : 'Save'}</Btn>
      </ModalActions>
    </Modal>
  );
}

// ── Quick phone modal ─────────────────────────────────────────────────────────

function PhoneModal({ member, onClose, onSaved }: { member: StaffMember; onClose: () => void; onSaved: () => void }) {
  const [phone, setPhone] = useState(member.phone ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setSaving(true); setError('');
    try {
      await updateStaff(member.id, { phone } as Parameters<typeof updateStaff>[1]);
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={`Set Phone — ${member.name}`} onClose={onClose}>
      {error && <div style={{ background: 'var(--color-danger-bg)', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--color-danger-strong)', marginBottom: 12 }}>{error}</div>}
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 6 }}>Mobile Phone Number</label>
        <Input placeholder="e.g. 7972434" value={phone} onChange={setPhone} />
        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>Maldivian 7-digit local number. Used for SMS notifications.</div>
      </div>
      <ModalActions>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Phone'}</Btn>
      </ModalActions>
    </Modal>
  );
}

// ── External contact modal ────────────────────────────────────────────────────

type ContactForm = {
  name: string; phone: string; is_enabled: boolean; notes: string;
  active_days: string[] | null; active_from: string; active_until: string;
};

const EMPTY_CONTACT: ContactForm = {
  name: '', phone: '', is_enabled: true, notes: '',
  active_days: null, active_from: '', active_until: '',
};

function ExternalContactModal({
  contact, onClose, onSaved,
}: { contact: SmsContact | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<ContactForm>(contact ? {
    name: contact.name, phone: contact.phone, is_enabled: contact.is_enabled,
    notes: contact.notes ?? '', active_days: contact.active_days,
    active_from: contact.active_from ?? '', active_until: contact.active_until ?? '',
  } : EMPTY_CONTACT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k: keyof ContactForm, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  const toggleDay = (d: string) => {
    const current = form.active_days ?? [];
    const next = current.includes(d) ? current.filter(x => x !== d) : [...current, d];
    set('active_days', next.length ? next : null);
  };

  const save = async () => {
    if (!form.name.trim() || !form.phone.trim()) { setError('Name and phone are required.'); return; }
    setSaving(true); setError('');
    try {
      const payload = {
        name: form.name, phone: form.phone, type: 'external' as const,
        is_enabled: form.is_enabled, notes: form.notes || undefined,
        active_days: form.active_days, active_from: form.active_from || undefined,
        active_until: form.active_until || undefined,
      };
      if (contact) await updateSmsContact(contact.id, payload);
      else await createSmsContact(payload);
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={contact ? 'Edit External Contact' : 'Add External Contact'} onClose={onClose}>
      {error && <div style={{ background: 'var(--color-danger-bg)', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--color-danger-strong)', marginBottom: 12 }}>{error}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Name *</label>
            <Input placeholder="e.g. Manager On-Call" value={form.name} onChange={v => set('name', v)} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Phone *</label>
            <Input placeholder="7972434" value={form.phone} onChange={v => set('phone', v)} />
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={form.is_enabled} onChange={e => set('is_enabled', e.target.checked)} />
          Active (receives notifications)
        </label>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Active Days (blank = every day)</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {DAYS.map(d => {
              const on = !form.active_days || form.active_days.includes(d);
              return (
                <button key={d} onClick={() => toggleDay(d)} style={{
                  padding: '4px 10px', fontSize: 12, borderRadius: 6, cursor: 'pointer',
                  fontFamily: 'inherit', border: 'none',
                  background: on ? 'var(--color-primary)' : '#F5F0EA',
                  color: on ? '#fff' : 'var(--color-text-secondary)',
                }}>{DAY_LABEL[d]}</button>
              );
            })}
            <button onClick={() => set('active_days', null)} style={{
              padding: '4px 10px', fontSize: 12, borderRadius: 6, cursor: 'pointer',
              fontFamily: 'inherit', border: 'none',
              background: !form.active_days ? 'var(--color-success)' : '#F5F0EA',
              color: !form.active_days ? '#fff' : 'var(--color-text-secondary)',
            }}>Every day</button>
          </div>
        </div>
        <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Active From</label>
            <Input type="time" value={form.active_from} onChange={v => set('active_from', v)} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Active Until</label>
            <Input type="time" value={form.active_until} onChange={v => set('active_until', v)} />
          </div>
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Notes</label>
          <Input placeholder="e.g. Owner's personal phone — evenings only" value={form.notes} onChange={v => set('notes', v)} />
        </div>
      </div>
      <ModalActions>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={save} disabled={saving}>{saving ? 'Saving…' : contact ? 'Save Changes' : 'Add Contact'}</Btn>
      </ModalActions>
    </Modal>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────

type StaffWithPrefs = StaffMember & { prefs?: StaffNotificationPref };

export function RecipientsTab() {
  const [staff, setStaff] = useState<StaffWithPrefs[]>([]);
  const [externalContacts, setExternalContacts] = useState<SmsContact[]>([]);
  const [loading, setLoading] = useState(true);

  const [prefsModal, setPrefsModal] = useState<StaffMember | null>(null);
  const [phoneModal, setPhoneModal] = useState<StaffMember | null>(null);
  const [contactModal, setContactModal] = useState<SmsContact | 'new' | null>(null);
  const [deletingContactId, setDeletingContactId] = useState<number | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [staffRes, contactsRes] = await Promise.all([
        fetchStaff(),
        fetchSmsContacts(),
      ]);
      // Load prefs for each staff in parallel (best-effort)
      const staffWithPrefs = await Promise.all(
        staffRes.staff.map(async (m) => {
          try {
            const { prefs } = await getStaffNotificationPrefs(m.id);
            return { ...m, prefs };
          } catch {
            return m;
          }
        })
      );
      setStaff(staffWithPrefs);
      setExternalContacts((contactsRes.contacts ?? []).filter((c: SmsContact) => c.type === 'external'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const toggleStaffEnabled = async (member: StaffWithPrefs) => {
    const current = member.prefs?.notifications_enabled ?? false;
    setTogglingId(member.id);
    try {
      await updateStaffNotificationPrefs(member.id, { notifications_enabled: !current });
      setStaff(prev => prev.map(m =>
        m.id === member.id ? { ...m, prefs: { ...(m.prefs ?? { user_id: m.id, notifications_enabled: false, order_types: null, menu_group_ids: null, category_ids: null, is_fallback: false, fallback_priority: 0 }), notifications_enabled: !current } } : m
      ));
    } finally {
      setTogglingId(null);
    }
  };

  const handleDeleteContact = async (id: number) => {
    if (!confirm('Remove this external contact?')) return;
    setDeletingContactId(id);
    try {
      await deleteSmsContact(id);
      setExternalContacts(prev => prev.filter(c => c.id !== id));
    } finally {
      setDeletingContactId(null);
    }
  };

  if (loading) return <Spinner />;

  const enabledStaff = staff.filter(m => m.prefs?.notifications_enabled);
  const fallbackStaff = staff.filter(m => m.prefs?.is_fallback);

  return (
    <>
      {/* Summary banner */}
      <div style={{ background: '#F5F0EA', border: '1px solid var(--color-border)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13 }}>
          <strong style={{ fontSize: 15, color: 'var(--color-primary)' }}>{enabledStaff.length}</strong>
          <span style={{ color: 'var(--color-text-secondary)', marginLeft: 6 }}>staff with notifications on</span>
        </div>
        <div style={{ fontSize: 13 }}>
          <strong style={{ fontSize: 15, color: 'var(--color-primary)' }}>{fallbackStaff.length}</strong>
          <span style={{ color: 'var(--color-text-secondary)', marginLeft: 6 }}>fallback recipient{fallbackStaff.length !== 1 ? 's' : ''}</span>
        </div>
        <div style={{ fontSize: 13 }}>
          <strong style={{ fontSize: 15, color: 'var(--color-primary)' }}>{externalContacts.filter(c => c.is_enabled).length}</strong>
          <span style={{ color: 'var(--color-text-secondary)', marginLeft: 6 }}>active external contacts</span>
        </div>
      </div>

      {/* ── Staff recipients ── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>Staff Recipients</h3>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
              Toggle SMS on/off per staff. Use <strong>Configure</strong> to set which order types they receive and whether they're a fallback.
            </p>
          </div>
          <Btn variant="secondary" onClick={load}><span style={{ fontSize: 12 }}>Refresh</span></Btn>
        </div>

        {staff.length === 0 ? (
          <EmptyState message="No staff members found. Add staff in the Staff page first." />
        ) : (
          <TableCard>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {['Name', 'Phone', 'SMS On', 'Receives', 'Fallback', ''].map(h =>
                    <th key={h} style={TH}>{h}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {staff.map(m => {
                  const enabled = m.prefs?.notifications_enabled ?? false;
                  const orderTypes = m.prefs?.order_types;
                  const isFallback = m.prefs?.is_fallback ?? false;
                  return (
                    <tr key={m.id} style={{ opacity: m.is_active ? 1 : 0.5 }}>
                      <td style={{ ...TD, fontWeight: 600 }}>
                        {m.name}
                        <div style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>{m.role_name ?? m.role ?? '—'}</div>
                      </td>
                      <td style={{ ...TD, fontFamily: 'monospace' }}>
                        {m.phone ? (
                          <span style={{ color: '#1e293b' }}>{m.phone}</span>
                        ) : (
                          <button onClick={() => setPhoneModal(m)} style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            fontSize: 12, color: 'var(--color-danger)', background: 'var(--color-danger-bg)',
                            border: '1px solid #fca5a5', borderRadius: 6, padding: '2px 8px',
                            cursor: 'pointer', fontFamily: 'inherit',
                          }}>
                            <Phone size={11} /> Add phone
                          </button>
                        )}
                      </td>
                      <td style={{ ...TD, textAlign: 'center' }}>
                        <button
                          onClick={() => toggleStaffEnabled(m)}
                          disabled={togglingId === m.id || !m.phone}
                          title={!m.phone ? 'Add a phone number first' : enabled ? 'Click to disable' : 'Click to enable'}
                          style={{
                            width: 40, height: 22, borderRadius: 11, border: 'none',
                            cursor: m.phone ? 'pointer' : 'not-allowed',
                            background: !m.phone ? '#E5E7EB' : enabled ? 'var(--color-primary)' : '#D1D5DB',
                            position: 'relative', transition: 'background 0.2s',
                            opacity: togglingId === m.id ? 0.6 : 1,
                          }}
                        >
                          <span style={{
                            position: 'absolute', top: 2, left: enabled ? 20 : 2,
                            width: 18, height: 18, borderRadius: '50%',
                            background: 'var(--color-surface)', transition: 'left 0.2s',
                          }} />
                        </button>
                      </td>
                      <td style={TD}>
                        {orderTypes === null ? (
                          <Badge label="All orders" color="green" />
                        ) : orderTypes && orderTypes.length > 0 ? (
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {orderTypes.map(t => <Badge key={t} label={t.replace('online_pickup', 'Online Pickup').replace('dine_in', 'Dine-in').replace('delivery', 'Delivery')} color="blue" />)}
                          </div>
                        ) : (
                          <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>Not configured</span>
                        )}
                      </td>
                      <td style={{ ...TD, textAlign: 'center' }}>
                        {isFallback ? (
                          <Badge label={`Fallback ${m.prefs?.fallback_priority ? `(#${m.prefs.fallback_priority})` : ''}`} color="orange" />
                        ) : '—'}
                      </td>
                      <td style={{ ...TD, textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          {!m.phone && (
                            <Btn small variant="secondary" onClick={() => setPhoneModal(m)}>
                              <Phone size={12} />
                            </Btn>
                          )}
                          <Btn small variant="ghost" onClick={() => setPrefsModal(m)}>
                            <Settings size={12} style={{ marginRight: 3 }} /> Configure
                          </Btn>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableCard>
        )}
      </div>

      {/* ── External contacts ── */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>External Contacts</h3>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
              Non-staff phone numbers that receive fallback alerts (e.g. owner's personal phone, on-call manager). Supports day &amp; time windows.
            </p>
          </div>
          <Btn onClick={() => setContactModal('new')}>
            <Plus size={13} style={{ marginRight: 4 }} /> Add Contact
          </Btn>
        </div>

        {externalContacts.length === 0 ? (
          <div style={{ background: '#F5F0EA', border: '1px dashed #C4A882', borderRadius: 10, padding: '20px 24px', textAlign: 'center' }}>
            <Bell size={22} style={{ color: '#C4A882', marginBottom: 8 }} />
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>No external contacts yet</div>
            <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 12 }}>
              Add a phone number that should always receive fallback alerts, even if no staff is on shift.
            </div>
            <Btn onClick={() => setContactModal('new')}><Plus size={13} style={{ marginRight: 4 }} /> Add First Contact</Btn>
          </div>
        ) : (
          <TableCard>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {['Name', 'Phone', 'Active Days', 'Time Window', 'Status', ''].map(h => <th key={h} style={TH}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {externalContacts.map(c => (
                  <tr key={c.id}>
                    <td style={{ ...TD, fontWeight: 600 }}>{c.name}</td>
                    <td style={{ ...TD, fontFamily: 'monospace' }}>{c.phone}</td>
                    <td style={TD}>
                      {c.active_days ? (
                        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                          {c.active_days.map(d => <Badge key={d} label={DAY_LABEL[d] ?? d} color="blue" />)}
                        </div>
                      ) : <span style={{ color: 'var(--color-text-muted)' }}>Every day</span>}
                    </td>
                    <td style={{ ...TD, fontFamily: 'monospace', fontSize: 12 }}>
                      {c.active_from || c.active_until
                        ? `${c.active_from ?? '—'} – ${c.active_until ?? '—'}`
                        : <span style={{ color: 'var(--color-text-muted)' }}>All hours</span>
                      }
                    </td>
                    <td style={TD}>
                      <Badge label={c.is_enabled ? 'Active' : 'Disabled'} color={c.is_enabled ? 'green' : 'gray'} />
                    </td>
                    <td style={{ ...TD, textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <Btn small variant="ghost" onClick={() => setContactModal(c)}><Pencil size={12} /></Btn>
                        <Btn small variant="danger" disabled={deletingContactId === c.id} onClick={() => handleDeleteContact(c.id)}>
                          <Trash2 size={12} />
                        </Btn>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableCard>
        )}
      </div>

      {/* Modals */}
      {prefsModal && (
        <StaffPrefsModal
          member={prefsModal}
          onClose={() => setPrefsModal(null)}
          onUpdated={load}
        />
      )}
      {phoneModal && (
        <PhoneModal
          member={phoneModal}
          onClose={() => setPhoneModal(null)}
          onSaved={load}
        />
      )}
      {contactModal && (
        <ExternalContactModal
          contact={contactModal === 'new' ? null : contactModal}
          onClose={() => setContactModal(null)}
          onSaved={() => { void load(); setContactModal(null); }}
        />
      )}
    </>
  );
}
