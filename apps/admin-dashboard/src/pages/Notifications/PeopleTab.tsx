import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Phone, Bell, Settings, AlertCircle, Plus, Pencil, Trash2 } from 'lucide-react';
import {
  fetchStaff, updateStaff,
  getStaffNotificationPrefs, updateStaffNotificationPrefs,
  fetchSmsContacts, createSmsContact, updateSmsContact, deleteSmsContact,
  type StaffMember,
  type StaffNotificationPref,
  type SmsContact,
} from '../../api';
import {
  Badge, Btn, EmptyState, Input, Modal, ModalActions, Spinner, TableCard, TD, TH, Switch,
} from '../../components/SharedUI';
import { NotifyChannelsPanel } from '../../components/NotifyChannelsPanel';
import { useCurrentUserPermissions } from '../../hooks/usePermissions';
import { errorBox, sectionHeading, useControlCenter } from './shared';

/*
 * Notifications → People (notifications audit, 2026-10-10): who gets the
 * order alerts, how each person gets their alerts (SMS, email, Telegram),
 * and extra numbers that are not staff. These were the SMS page's
 * Recipients tab and the Control Center's "Who gets alerts, and how".
 *
 * Staff without a phone get order alerts by email or Telegram now (owner
 * said yes), so their switch is no longer locked behind "Add phone".
 */

const ORDER_TYPES = [
  { value: 'online_pickup', label: 'Online pickup' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'dine_in', label: 'Dine-in' },
];

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABEL: Record<string, string> = {
  mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun',
};

const chipStyle = (on: boolean): React.CSSProperties => ({
  padding: '5px 12px', fontSize: 12, borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', border: 'none',
  background: on ? 'var(--color-primary)' : 'var(--color-border-light)',
  color: on ? 'var(--color-on-primary)' : 'var(--color-text-secondary)',
});

export function PeopleTab() {
  const { can } = useCurrentUserPermissions();
  const canChannels = can('sms.settings.manage');
  const canStaff = can('staff.update');
  const canContacts = can('sms.contacts.manage');
  const [error, setError] = useState('');
  // Rules → Email copies: off for staff means nobody gets alerts by email.
  const { data } = useControlCenter(canChannels);

  return (
    <>
      {error && <p role="alert" style={errorBox}>{error}</p>}
      {canStaff && <OrderAlertPeople />}
      {canChannels && (
        <NotifyChannelsPanel canManage={canChannels} emailToStaffOn={data?.delivery_rules?.email_copy_staff ?? true} onError={setError} />
      )}
      {canContacts && <ExtraNumbers />}
      {!canStaff && !canChannels && !canContacts && (
        <p style={{ color: 'var(--color-text-muted)' }}>You need Manage SMS settings, Update staff or Manage SMS contacts to see this.</p>
      )}
    </>
  );
}

// ── Who gets order alerts ────────────────────────────────────────────────────

type StaffWithPrefs = StaffMember & { prefs?: StaffNotificationPref };

function OrderAlertPeople() {
  const [staff, setStaff] = useState<StaffWithPrefs[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [prefsModal, setPrefsModal] = useState<StaffMember | null>(null);
  const [phoneModal, setPhoneModal] = useState<StaffMember | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const staffRes = await fetchStaff();
      // Each person's switch, in parallel (best effort).
      const withPrefs = await Promise.all(
        staffRes.staff.map(async (m) => {
          try {
            const { prefs } = await getStaffNotificationPrefs(m.id);
            return { ...m, prefs };
          } catch {
            return m;
          }
        }),
      );
      setStaff(withPrefs);
    } catch (e) {
      setLoadError((e as Error).message || 'Could not load staff.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const toggle = async (member: StaffWithPrefs) => {
    if (!member.prefs) return;
    const current = member.prefs.notifications_enabled;
    setTogglingId(member.id);
    try {
      const { prefs } = await updateStaffNotificationPrefs(member.id, { notifications_enabled: !current });
      setStaff((prev) => prev.map((m) => (m.id === member.id ? { ...m, prefs } : m)));
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setTogglingId(null);
    }
  };

  const on = staff.filter((m) => m.prefs?.notifications_enabled).length;
  const fallback = staff.filter((m) => m.prefs?.is_fallback).length;

  return (
    <section style={{ marginBottom: 28 }} data-testid="order-alert-people" aria-labelledby="oap-title">
      <h2 id="oap-title" style={sectionHeading}>Who gets order alerts</h2>
      <p style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.5, color: 'var(--color-text-secondary)', maxWidth: 760 }}>
        New order, order confirmed, ready and out for delivery go to the staff on shift whose switch is on here, and to the extra
        numbers below; when nobody matches, to the fallback staff. Each message's own switches are on Messages.
        Someone without a phone gets them by email or Telegram, as their channels below allow.
      </p>
      {loadError && <p role="alert" style={errorBox}>{loadError}</p>}
      {loading ? <Spinner /> : staff.length === 0 ? (
        <EmptyState message="No staff yet. Add them under Staff first." />
      ) : (
        <>
          <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--color-text-muted)' }}>
            {on} of {staff.length} on · {fallback} fallback
          </p>
          <TableCard>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {['Name', 'Phone', 'Gets order alerts', 'Orders', 'Fallback', ''].map((h) => <th key={h} style={TH}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {staff.map((m) => {
                  const enabled = m.prefs?.notifications_enabled ?? false;
                  const orderTypes = m.prefs?.order_types;
                  const isFallback = m.prefs?.is_fallback ?? false;
                  return (
                    <tr key={m.id} style={{ opacity: m.is_active ? 1 : 0.5 }}>
                      <td style={{ ...TD, fontWeight: 600 }}>
                        {m.name}
                        <div style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>{m.role_name ?? m.role ?? '—'}</div>
                      </td>
                      <td style={{ ...TD, fontFamily: m.phone ? 'monospace' : undefined }}>
                        {m.phone ? (
                          <span style={{ color: 'var(--color-text)' }}>{m.phone}</span>
                        ) : (
                          <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>No phone: email or Telegram</span>
                        )}
                      </td>
                      <td style={{ ...TD, textAlign: 'center' }}>
                        <Switch
                          checked={enabled}
                          onChange={() => void toggle(m)}
                          disabled={togglingId === m.id || !m.prefs}
                          aria-label={`Order alerts for ${m.name}`}
                        />
                      </td>
                      <td style={TD}>
                        {orderTypes === null ? (
                          <Badge label="All orders" color="green" />
                        ) : orderTypes && orderTypes.length > 0 ? (
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {orderTypes.map((t) => <Badge key={t} label={ORDER_TYPES.find((o) => o.value === t)?.label ?? t} color="brown" />)}
                          </div>
                        ) : (
                          <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>—</span>
                        )}
                      </td>
                      <td style={{ ...TD, textAlign: 'center' }}>
                        {isFallback ? <Badge label={`Fallback${m.prefs?.fallback_priority ? ` (#${m.prefs.fallback_priority})` : ''}`} color="orange" /> : '—'}
                      </td>
                      <td style={{ ...TD, textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          {!m.phone && (
                            <Btn small variant="secondary" onClick={() => setPhoneModal(m)} aria-label={`Add a phone for ${m.name}`}>
                              <Phone size={12} />
                            </Btn>
                          )}
                          <Btn small variant="ghost" onClick={() => setPrefsModal(m)}>
                            <Settings size={12} style={{ marginRight: 3 }} /> Choose
                          </Btn>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableCard>
        </>
      )}
      {prefsModal && <StaffPrefsModal member={prefsModal} onClose={() => setPrefsModal(null)} onUpdated={load} />}
      {phoneModal && <PhoneModal member={phoneModal} onClose={() => setPhoneModal(null)} onSaved={load} />}
    </section>
  );
}

function StaffPrefsModal({ member, onClose, onUpdated }: { member: StaffMember; onClose: () => void; onUpdated: () => void }) {
  const [prefs, setPrefs] = useState<StaffNotificationPref | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getStaffNotificationPrefs(member.id)
      .then((res) => { setPrefs(res.prefs); setLoading(false); })
      .catch((e) => { setError((e as Error).message); setLoading(false); });
  }, [member.id]);

  const toggleOrderType = (v: string) => {
    if (!prefs) return;
    const current = prefs.order_types ?? [];
    const next = current.includes(v) ? current.filter((t) => t !== v) : [...current, v];
    setPrefs((p) => (p ? { ...p, order_types: next.length ? next : null } : p));
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

  if (loading) return <Modal title={`Order alerts: ${member.name}`} onClose={onClose}><Spinner /></Modal>;

  return (
    <Modal title={`Order alerts: ${member.name}`} onClose={onClose}>
      {error && <div style={{ ...errorBox, marginBottom: 12 }}>{error}</div>}
      {prefs && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!member.phone && (
            <div style={{ background: 'var(--color-warning-bg)', border: '1px solid var(--color-warning)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--color-warning-strong)', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <AlertCircle size={14} style={{ marginTop: 1, flexShrink: 0 }} />
              <span>No phone number: order alerts go by email or Telegram instead, as their channels allow. A phone can be added under <Link to="/staff" style={{ color: 'inherit', fontWeight: 600 }}>Staff</Link>.</span>
            </div>
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
            <input type="checkbox" checked={prefs.notifications_enabled}
              onChange={(e) => setPrefs((p) => (p ? { ...p, notifications_enabled: e.target.checked } : p))} />
            <span><strong>Gets order alerts</strong> while on shift</span>
          </label>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
              For these orders:
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {ORDER_TYPES.map((ot) => {
                const explicit = prefs.order_types !== null;
                const active = (prefs.order_types ?? []).includes(ot.value) || !explicit;
                return <button key={ot.value} type="button" onClick={() => toggleOrderType(ot.value)} style={chipStyle(active)}>{ot.label}</button>;
              })}
              <button type="button" onClick={() => setPrefs((p) => (p ? { ...p, order_types: null } : p))} style={chipStyle(prefs.order_types === null)}>All</button>
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
            <input type="checkbox" checked={prefs.is_fallback}
              onChange={(e) => setPrefs((p) => (p ? { ...p, is_fallback: e.target.checked } : p))} />
            <span><strong>Fallback</strong>: gets them when nobody else matches, on shift or not</span>
          </label>
          {prefs.is_fallback && (
            <div>
              <label htmlFor="fallback-priority" style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>
                Fallback order (higher goes first)
              </label>
              <Input id="fallback-priority" type="number" value={String(prefs.fallback_priority ?? 0)}
                onChange={(v) => setPrefs((p) => (p ? { ...p, fallback_priority: parseInt(v) || 0 } : p))} />
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
    <Modal title={`Phone for ${member.name}`} onClose={onClose}>
      {error && <div style={{ ...errorBox, marginBottom: 12 }}>{error}</div>}
      <div style={{ marginBottom: 16 }}>
        <label htmlFor="staff-phone" style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 6 }}>Mobile phone number</label>
        <Input id="staff-phone" placeholder="e.g. 7972434" value={phone} onChange={setPhone} />
        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>Maldivian 7-digit local number.</div>
      </div>
      <ModalActions>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save phone'}</Btn>
      </ModalActions>
    </Modal>
  );
}

// ── Extra numbers (not staff) ────────────────────────────────────────────────

type ContactForm = {
  name: string; phone: string; is_enabled: boolean; notes: string;
  active_days: string[] | null; active_from: string; active_until: string;
};

const EMPTY_CONTACT: ContactForm = {
  name: '', phone: '', is_enabled: true, notes: '',
  active_days: null, active_from: '', active_until: '',
};

function ExtraNumbers() {
  const [contacts, setContacts] = useState<SmsContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [modal, setModal] = useState<SmsContact | 'new' | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetchSmsContacts();
      setContacts((res.contacts ?? []).filter((c: SmsContact) => c.type === 'external'));
    } catch (e) {
      setLoadError((e as Error).message || 'Could not load the numbers.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const remove = async (id: number) => {
    if (!confirm('Remove this number?')) return;
    setDeletingId(id);
    try {
      await deleteSmsContact(id);
      setContacts((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section data-testid="extra-numbers" aria-labelledby="extra-title">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 8 }}>
        <div style={{ flex: '1 1 240px', minWidth: 0 }}>
          <h2 id="extra-title" style={{ ...sectionHeading, margin: '0 0 2px' }}>Extra numbers</h2>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-muted)' }}>
            Phones that are not staff (an on-call manager, the owner's own phone) and get the order alerts too, on the days and hours set.
          </p>
        </div>
        <Btn onClick={() => setModal('new')} style={{ whiteSpace: 'nowrap' }}>
          <Plus size={14} aria-hidden /> Add a number
        </Btn>
      </div>
      {loadError && <p role="alert" style={errorBox}>{loadError}</p>}
      {loading ? <Spinner /> : contacts.length === 0 ? (
        <div style={{ background: 'var(--color-bg)', border: '1px dashed var(--color-border)', borderRadius: 10, padding: '20px 24px', textAlign: 'center' }}>
          <Bell size={22} style={{ color: 'var(--color-text-muted)', marginBottom: 8 }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-secondary)' }}>No extra numbers</div>
        </div>
      ) : (
        <TableCard>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>{['Name', 'Phone', 'Days', 'Hours', 'Status', ''].map((h) => <th key={h} style={TH}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id}>
                  <td style={{ ...TD, fontWeight: 600 }}>{c.name}</td>
                  <td style={{ ...TD, fontFamily: 'monospace' }}>{c.phone}</td>
                  <td style={TD}>
                    {c.active_days ? (
                      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                        {c.active_days.map((d) => <Badge key={d} label={DAY_LABEL[d] ?? d} color="brown" />)}
                      </div>
                    ) : <span style={{ color: 'var(--color-text-muted)' }}>Every day</span>}
                  </td>
                  <td style={{ ...TD, fontFamily: 'monospace', fontSize: 12, whiteSpace: 'nowrap' }}>
                    {c.active_from || c.active_until
                      ? `${c.active_from ?? '—'} – ${c.active_until ?? '—'}`
                      : <span style={{ color: 'var(--color-text-muted)' }}>All hours</span>}
                  </td>
                  <td style={TD}><Badge label={c.is_enabled ? 'On' : 'Off'} color={c.is_enabled ? 'green' : 'gray'} /></td>
                  <td style={{ ...TD, textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <Btn small variant="ghost" onClick={() => setModal(c)} aria-label={`Edit ${c.name}`}><Pencil size={12} /></Btn>
                      <Btn small variant="danger-outline" aria-label={`Remove ${c.name}`} disabled={deletingId === c.id} onClick={() => void remove(c.id)}>
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
      {modal && (
        <ExtraNumberModal
          contact={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => { void load(); setModal(null); }}
        />
      )}
    </section>
  );
}

function ExtraNumberModal({ contact, onClose, onSaved }: { contact: SmsContact | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<ContactForm>(contact ? {
    name: contact.name, phone: contact.phone, is_enabled: contact.is_enabled,
    notes: contact.notes ?? '', active_days: contact.active_days,
    active_from: contact.active_from ?? '', active_until: contact.active_until ?? '',
  } : EMPTY_CONTACT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k: keyof ContactForm, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const toggleDay = (d: string) => {
    const current = form.active_days ?? [];
    const next = current.includes(d) ? current.filter((x) => x !== d) : [...current, d];
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
    <Modal title={contact ? 'Edit number' : 'Add a number'} onClose={onClose}>
      {error && <div style={{ ...errorBox, marginBottom: 12 }}>{error}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12 }}>
          <div>
            <label htmlFor="extra-name" style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Name *</label>
            <Input id="extra-name" placeholder="e.g. Manager on call" value={form.name} onChange={(v) => set('name', v)} />
          </div>
          <div>
            <label htmlFor="extra-phone" style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Phone *</label>
            <Input id="extra-phone" placeholder="7972434" value={form.phone} onChange={(v) => set('phone', v)} />
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={form.is_enabled} onChange={(e) => set('is_enabled', e.target.checked)} />
          On (gets the order alerts)
        </label>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Days (none picked = every day)</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {DAYS.map((d) => {
              const on = !form.active_days || form.active_days.includes(d);
              return <button key={d} type="button" onClick={() => toggleDay(d)} style={chipStyle(on)}>{DAY_LABEL[d]}</button>;
            })}
            <button type="button" onClick={() => set('active_days', null)} style={chipStyle(!form.active_days)}>Every day</button>
          </div>
        </div>
        <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12 }}>
          <div>
            <label htmlFor="extra-from" style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>From</label>
            <Input id="extra-from" type="time" value={form.active_from} onChange={(v) => set('active_from', v)} />
          </div>
          <div>
            <label htmlFor="extra-until" style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Until</label>
            <Input id="extra-until" type="time" value={form.active_until} onChange={(v) => set('active_until', v)} />
          </div>
        </div>
        <div>
          <label htmlFor="extra-notes" style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Notes</label>
          <Input id="extra-notes" placeholder="e.g. Owner's own phone, evenings only" value={form.notes} onChange={(v) => set('notes', v)} />
        </div>
      </div>
      <ModalActions>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={save} disabled={saving}>{saving ? 'Saving…' : contact ? 'Save' : 'Add'}</Btn>
      </ModalActions>
    </Modal>
  );
}

export default PeopleTab;
