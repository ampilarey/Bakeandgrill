import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Phone, Bell, Settings, AlertCircle, Plus, Pencil, Trash2, Search } from 'lucide-react';
import {
  fetchStaff, updateStaff,
  getStaffNotificationPrefs, updateStaffNotificationPrefs,
  fetchSmsContacts, createSmsContact, updateSmsContact, deleteSmsContact,
  getNotifyChannels, updateNotifyPerson, updateNotifyRoles, updateSmsType,
  type NotifyChannel, type NotifyPerson, type NotifyRole,
  type SmsControlCenterType,
  type SmsStaffOption,
  type StaffMember,
  type StaffNotificationPref,
  type SmsContact,
} from '../../api';
import {
  Badge, Btn, EmptyState, Input, Modal, ModalActions, Spinner, TableCard, TD, TH, Switch,
} from '../../components/SharedUI';
import { NotifyChannelsPanel, LABEL, Pills, reachNote, ordered } from '../../components/NotifyChannelsPanel';
import { useCurrentUserPermissions } from '../../hooks/usePermissions';
import { audienceSummary, errorBox, sectionHeading, useControlCenter } from './shared';

/*
 * Notifications → People (re-audit, 2026-10-10): one card per person with
 * everything about their alerts in one place: how they get them (SMS,
 * email, Telegram), whether they get order alerts while on shift and for
 * which orders, and "Alerts…" to see every staff and owner alert that
 * reaches them, mute one or add one. Then the roles, and extra numbers
 * that are not staff.
 *
 * Staff without a phone get order alerts by email or Telegram (owner said
 * yes), so their switch is no longer locked behind "Add phone".
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

type Person = NotifyPerson & { prefs?: StaffNotificationPref; is_active?: boolean };

export function PeopleTab() {
  const { can } = useCurrentUserPermissions();
  const canChannels = can('sms.settings.manage');
  const canStaff = can('staff.update');
  const canContacts = can('sms.contacts.manage');
  const [error, setError] = useState('');
  const { data, setData, loading: ccLoading } = useControlCenter(canChannels);

  const [roles, setRoles] = useState<NotifyRole[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [prefsModal, setPrefsModal] = useState<Person | null>(null);
  const [phoneModal, setPhoneModal] = useState<Person | null>(null);
  const [alertsModal, setAlertsModal] = useState<Person | null>(null);

  const load = useCallback(async () => {
    if (!canChannels && !canStaff) { setLoading(false); return; }
    setLoading(true);
    try {
      let list: Person[] = [];
      if (canChannels) {
        const res = await getNotifyChannels();
        setRoles(res.roles);
        list = res.people;
      } else {
        const res = await fetchStaff();
        list = res.staff.filter((m: StaffMember) => m.is_active).map((m: StaffMember) => ({
          id: m.id, name: m.name, role: m.role ?? null, role_label: m.role_name ?? m.role ?? null, phone: m.phone ?? null,
          email: m.email ?? null, telegram_linked: false, own_channels: null, channels: [],
        }));
      }
      if (canStaff) {
        list = await Promise.all(list.map(async (p) => {
          try {
            const { prefs } = await getStaffNotificationPrefs(p.id);
            return { ...p, prefs };
          } catch {
            return p;
          }
        }));
      }
      setPeople(list);
    } catch (e) {
      setError((e as Error).message || 'Could not load the people.');
    } finally {
      setLoading(false);
    }
  }, [canChannels, canStaff]);

  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(() => (data?.types ?? []).filter((t) => t.audience_configurable), [data]);
  const alertsByRole = useMemo(() => {
    const out: Record<string, number> = {};
    for (const r of roles) {
      const ids = new Set(people.filter((p) => p.role === r.key).map((p) => p.id));
      out[r.key] = rows.filter((t) => t.audience?.groups.includes(`role:${r.key}`) || (t.audience_people?.people ?? []).some((p) => ids.has(p.id))).length;
    }
    return out;
  }, [roles, people, rows]);
  const alertsFor = (p: Person) => rows.filter((t) => (t.audience_people?.people ?? []).some((x) => x.id === p.id)).length;

  const saveRole = async (key: string, channels: NotifyChannel[]) => {
    setBusy(`role:${key}`);
    try {
      const res = await updateNotifyRoles({ [key]: channels });
      setRoles((prev) => prev.map((r) => ({ ...r, channels: ordered(res.roles[r.key] ?? r.channels) })));
      setPeople((prev) => prev.map((p) => (p.own_channels === null && p.role === key ? { ...p, channels: ordered(res.roles[key] ?? channels) } : p)));
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const savePerson = async (p: Person, channels: NotifyChannel[] | null) => {
    setBusy(`person:${p.id}`);
    try {
      const res = await updateNotifyPerson(p.id, channels);
      setPeople((prev) => prev.map((x) => (x.id === p.id ? { ...x, ...res.person } : x)));
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const toggleOrderAlerts = async (p: Person) => {
    if (!p.prefs) return;
    setBusy(`orders:${p.id}`);
    try {
      const { prefs } = await updateStaffNotificationPrefs(p.id, { notifications_enabled: !p.prefs.notifications_enabled });
      setPeople((prev) => prev.map((x) => (x.id === p.id ? { ...x, prefs } : x)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const patchRow = (key: string, patch: Partial<SmsControlCenterType>) => {
    setData((prev) => (prev ? { ...prev, types: prev.types.map((t) => (t.key === key ? { ...t, ...patch } : t)) } : prev));
  };

  const roleChannels = useMemo(() => Object.fromEntries(roles.map((r) => [r.key, r.channels])) as Record<string, NotifyChannel[]>, [roles]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q === '' ? people : people.filter((p) => `${p.name} ${p.role_label ?? ''} ${p.phone ?? ''} ${p.email ?? ''}`.toLowerCase().includes(q));
  }, [people, query]);
  const unreachable = canChannels ? people.filter((p) => reachNote(p, p.channels).tone === 'danger').length : 0;
  const onOrders = people.filter((p) => p.prefs?.notifications_enabled).length;

  return (
    <>
      {error && <p role="alert" style={errorBox}>{error}</p>}

      {(canChannels || canStaff) && (
        <section className="nc" data-testid="people-list" aria-labelledby="people-title">
          <div className="nc-people-head">
            <h2 id="people-title" style={{ ...sectionHeading, margin: 0 }}>People</h2>
            {people.length > 6 && (
              <label className="nc-search">
                <Search size={15} aria-hidden />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find someone" aria-label="Find someone" />
              </label>
            )}
          </div>
          <p className="nc-lead">
            Each person, and everything about their alerts: how they get them, whether they get order alerts while on shift, and which
            staff and owner alerts reach them. Customers are not affected.
          </p>
          {unreachable > 0 && (
            <p className="nc-banner is-danger">{unreachable} {unreachable === 1 ? 'person gets' : 'people get'} no alerts at all. See below.</p>
          )}
          {loading ? <Spinner /> : people.length === 0 ? (
            <EmptyState message="No staff yet. Add them under Staff first." />
          ) : shown.length === 0 ? <p className="nc-muted">Nobody matches.</p> : (
            <>
              {canStaff && (
                <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--color-text-muted)' }}>
                  {onOrders} of {people.length} get order alerts while on shift
                  {' · '}<Link to="/notifications/messages?open=staff_new_order" style={{ color: 'var(--color-primary)' }}>the order alerts</Link>
                </p>
              )}
              <ul className="nc-people">
                {shown.map((p) => {
                  const own = p.own_channels !== null;
                  const note = canChannels ? reachNote(p, p.channels) : null;
                  const prefs = p.prefs;
                  const orderTypes = prefs?.order_types;
                  return (
                    <li key={p.id} className="nc-person" data-testid={`nc-person-${p.id}`}>
                      <div className="nc-person-who">
                        <div className="nc-person-name">{p.name} <span className="nc-muted">· {p.role_label ?? 'No role'}</span></div>
                        <div className="nc-contacts">
                          <span className={p.phone ? '' : 'is-missing'}>{p.phone ?? 'No phone: email or Telegram'}</span>
                          <span className={p.email ? '' : 'is-missing'}>{p.email ?? 'No email'}</span>
                          {canChannels && <span className={p.telegram_linked ? '' : 'is-missing'}>{p.telegram_linked ? 'Telegram linked' : 'Telegram not linked'}</span>}
                        </div>
                        {note && <div className={`nc-note is-${note.tone}`}>{note.text}</div>}
                        {canChannels && !ccLoading && (
                          <div className="nc-muted" style={{ fontSize: 12, marginTop: 4 }}>
                            {alertsFor(p)} staff and owner {alertsFor(p) === 1 ? 'alert reaches' : 'alerts reach'} them
                            {prefs?.is_fallback ? ' · fallback for order alerts' : ''}
                          </div>
                        )}
                      </div>
                      <div className="nc-person-set">
                        {canChannels && (
                          <div className="nc-person-row">
                            <select
                              className="nc-select"
                              value={own ? 'own' : 'role'}
                              disabled={busy !== null}
                              aria-label={`Channels for ${p.name}`}
                              onChange={(e) => void savePerson(p, e.target.value === 'own' ? p.channels : null)}
                            >
                              <option value="role">Same as role{p.role && roleChannels[p.role] ? ` (${roleChannels[p.role].map((c) => LABEL[c]).join(', ') || 'none'})` : ''}</option>
                              <option value="own">Own choice</option>
                            </select>
                            {own && (
                              <Pills
                                value={p.channels}
                                disabled={busy !== null}
                                label={`Own channels for ${p.name}`}
                                onChange={(next) => void savePerson(p, next)}
                              />
                            )}
                          </div>
                        )}
                        {canStaff && (
                          <div className="nc-person-row">
                            <label className="nc-person-orders">
                              <Switch
                                checked={prefs?.notifications_enabled ?? false}
                                onChange={() => void toggleOrderAlerts(p)}
                                disabled={busy !== null || !prefs}
                                aria-label={`Order alerts for ${p.name}`}
                              />
                              <span>
                                Order alerts on shift
                                {prefs?.notifications_enabled && (orderTypes === null
                                  ? <span className="nc-muted"> · all orders</span>
                                  : orderTypes && orderTypes.length > 0
                                    ? <span className="nc-muted"> · {orderTypes.map((t) => ORDER_TYPES.find((o) => o.value === t)?.label ?? t).join(', ')}</span>
                                    : null)}
                              </span>
                            </label>
                            <Btn small variant="ghost" onClick={() => setPrefsModal(p)} disabled={!prefs} aria-label={`Order alert settings for ${p.name}`}>
                              <Settings size={12} style={{ marginRight: 3 }} /> Which orders
                            </Btn>
                            {!p.phone && (
                              <Btn small variant="secondary" onClick={() => setPhoneModal(p)} aria-label={`Add a phone for ${p.name}`}>
                                <Phone size={12} />
                              </Btn>
                            )}
                          </div>
                        )}
                        {canChannels && (
                          <div className="nc-person-row">
                            <Btn small variant="secondary" onClick={() => setAlertsModal(p)} disabled={ccLoading} aria-label={`Alerts for ${p.name}`}>
                              <Bell size={12} style={{ marginRight: 4 }} /> Alerts…
                            </Btn>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
      )}

      {canChannels && (
        <section className="nc" aria-label="By role">
          <NotifyChannelsPanel canManage={canChannels} roles={roles} loading={loading} busy={busy !== null} alertsByRole={alertsByRole} onSaveRole={(k, c) => void saveRole(k, c)} />
        </section>
      )}

      {canContacts && <ExtraNumbers />}
      {!canStaff && !canChannels && !canContacts && (
        <p style={{ color: 'var(--color-text-muted)' }}>You need Manage SMS settings, Update staff or Manage SMS contacts to see this.</p>
      )}

      {prefsModal && <StaffPrefsModal member={prefsModal} onClose={() => setPrefsModal(null)} onUpdated={load} />}
      {phoneModal && <PhoneModal member={phoneModal} onClose={() => setPhoneModal(null)} onSaved={load} />}
      {alertsModal && (
        <PersonAlertsModal
          person={alertsModal}
          rows={rows}
          staff={data?.staff_options ?? []}
          onClose={() => setAlertsModal(null)}
          onPatched={patchRow}
          onError={setError}
        />
      )}
    </>
  );
}

// ── Every alert that reaches one person ─────────────────────────────────────

/**
 * Per person, per alert (owner, 2026-10-10: "each staff separately"): what
 * reaches them and why, with Mute (never this one), Add (always this one)
 * and the way back. Saved on the alert's row, so Messages shows the same.
 */
function PersonAlertsModal({ person, rows, staff, onClose, onPatched, onError }: {
  person: Person;
  rows: SmsControlCenterType[];
  staff: SmsStaffOption[];
  onClose: () => void;
  onPatched: (key: string, patch: Partial<SmsControlCenterType>) => void;
  onError: (msg: string) => void;
}) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const stateOf = (t: SmsControlCenterType): 'muted' | 'named' | 'group' | 'none' => {
    const a = t.audience;
    if (!a) return 'none';
    if (a.except.includes(person.id)) return 'muted';
    if (a.users.includes(person.id)) return 'named';
    return (t.audience_people?.people ?? []).some((p) => p.id === person.id) ? 'group' : 'none';
  };

  const save = async (t: SmsControlCenterType, next: { users?: number[]; except?: number[] }) => {
    if (!t.audience) return;
    setBusyKey(t.key);
    try {
      const res = await updateSmsType(t.key, { audience: { ...t.audience, ...next } });
      onPatched(t.key, { audience: res.audience, audience_custom: res.audience_custom, audience_people: res.audience_people });
    } catch (e: unknown) {
      onError((e as Error).message);
    } finally {
      setBusyKey(null);
    }
  };
  const mute = (t: SmsControlCenterType) => save(t, { except: [...(t.audience?.except ?? []), person.id], users: (t.audience?.users ?? []).filter((x) => x !== person.id) });
  const unmute = (t: SmsControlCenterType) => save(t, { except: (t.audience?.except ?? []).filter((x) => x !== person.id) });
  const add = (t: SmsControlCenterType) => save(t, { users: [...(t.audience?.users ?? []), person.id], except: (t.audience?.except ?? []).filter((x) => x !== person.id) });
  const remove = (t: SmsControlCenterType) => save(t, { users: (t.audience?.users ?? []).filter((x) => x !== person.id) });

  const list = rows.filter((t) => !q || t.label.toLowerCase().includes(q.toLowerCase()));
  const gets = list.filter((t) => ['named', 'group'].includes(stateOf(t)));
  const muted = list.filter((t) => stateOf(t) === 'muted');
  const others = list.filter((t) => stateOf(t) === 'none');

  const line = (t: SmsControlCenterType) => {
    const s = stateOf(t);
    return (
      <li key={t.key} className="pa-row" data-testid={`pa-${t.key}`}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>{t.label}</div>
          <div className="nc-muted" style={{ fontSize: 12 }}>
            {s === 'muted' ? 'Muted for them' : s === 'named' ? 'Named on the alert' : s === 'group' ? `Through: ${audienceSummary(t, staff)}` : `Goes to: ${audienceSummary(t, staff)}`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {s === 'muted' && <Btn small variant="secondary" disabled={busyKey === t.key} onClick={() => void unmute(t)} aria-label={`Unmute ${t.label}`}>Unmute</Btn>}
          {s === 'named' && <Btn small variant="danger-outline" disabled={busyKey === t.key} onClick={() => void remove(t)} aria-label={`Remove ${t.label}`}>Remove</Btn>}
          {s === 'group' && <Btn small variant="danger-outline" disabled={busyKey === t.key} onClick={() => void mute(t)} aria-label={`Mute ${t.label}`}>Mute</Btn>}
          {s === 'none' && <Btn small variant="secondary" disabled={busyKey === t.key} onClick={() => void add(t)} aria-label={`Add ${t.label}`}>Add</Btn>}
        </div>
      </li>
    );
  };

  return (
    <Modal title={`Alerts for ${person.name}`} onClose={onClose}>
      <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
        Every staff and owner alert, and whether it reaches {person.name}. Mute keeps one away from them whatever group they are in;
        Add sends it to them always. Each change is saved on the alert itself.
      </p>
      {rows.length > 10 && (
        <label className="nc-search" style={{ marginBottom: 10 }}>
          <Search size={15} aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find an alert" aria-label="Find an alert" />
        </label>
      )}
      {gets.length > 0 && (<><h4 className="pa-h">Gets ({gets.length})</h4><ul className="pa-list">{gets.map(line)}</ul></>)}
      {muted.length > 0 && (<><h4 className="pa-h">Muted ({muted.length})</h4><ul className="pa-list">{muted.map(line)}</ul></>)}
      {others.length > 0 && (<><h4 className="pa-h">Does not get ({others.length})</h4><ul className="pa-list">{others.map(line)}</ul></>)}
      {list.length === 0 && <p className="nc-muted">Nothing matches.</p>}
      <ModalActions>
        <Btn variant="ghost" onClick={onClose}>Done</Btn>
      </ModalActions>
    </Modal>
  );
}

// ── Order alerts per person ──────────────────────────────────────────────────

function StaffPrefsModal({ member, onClose, onUpdated }: { member: Person; onClose: () => void; onUpdated: () => void }) {
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

function PhoneModal({ member, onClose, onSaved }: { member: Person; onClose: () => void; onSaved: () => void }) {
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
    <section data-testid="extra-numbers" id="extra-numbers" aria-labelledby="extra-title" style={{ scrollMarginTop: 80 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 8 }}>
        <div style={{ flex: '1 1 240px', minWidth: 0 }}>
          <h2 id="extra-title" style={{ ...sectionHeading, margin: '0 0 2px' }}>Extra numbers</h2>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-muted)' }}>
            Phones that are not staff (an on-call manager, the owner's own phone) and get the order alerts too, on the days and hours set.
            A number for any other alert is typed on that alert's row in Messages.
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
