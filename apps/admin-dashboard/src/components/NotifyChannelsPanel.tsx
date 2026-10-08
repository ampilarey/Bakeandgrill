import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, Check } from 'lucide-react';
import {
  getNotifyChannels,
  updateNotifyPerson,
  updateNotifyRoles,
  type NotifyChannel,
  type NotifyPerson,
  type NotifyRole,
} from '../api';
import { InlineIcon } from './SharedUI';

/**
 * Admin → SMS Control Center → "Who gets alerts, and how" (owner,
 * 2026-10-07: "admin is the one who controls everything, for example admin
 * decides in which channel notifications goes to a specific role or
 * person"). Channels per role, and a person's own choice over their role's.
 */

const CHANNELS: NotifyChannel[] = ['sms', 'email', 'telegram'];
const LABEL: Record<NotifyChannel, string> = { sms: 'SMS', email: 'Email', telegram: 'Telegram' };

function ordered(list: NotifyChannel[]): NotifyChannel[] {
  return CHANNELS.filter((c) => list.includes(c));
}

function toggle(list: NotifyChannel[], c: NotifyChannel): NotifyChannel[] {
  return ordered(list.includes(c) ? list.filter((x) => x !== c) : [...list, c]);
}

/** Which of the person's channels can actually reach them. */
export function reachable(p: Pick<NotifyPerson, 'phone' | 'email' | 'telegram_linked'>, channels: NotifyChannel[]): NotifyChannel[] {
  return channels.filter((c) => (c === 'sms' ? !!p.phone : c === 'email' ? !!p.email : p.telegram_linked));
}

/** One line on what this person actually gets, and a tone for it. */
export function reachNote(p: NotifyPerson, channels: NotifyChannel[]): { tone: 'ok' | 'warn' | 'danger'; text: string } {
  const reach = reachable(p, channels);
  if (reach.length === 0) {
    return p.phone
      ? { tone: 'warn', text: channels.length === 0 ? 'No channels: the SMS goes, so nothing is missed.' : 'None of these can reach them, so the SMS goes instead.' }
      : { tone: 'danger', text: 'Gets no alerts: add a phone or email, or link Telegram.' };
  }
  const missing = channels.filter((c) => !reach.includes(c));
  const gets = `Gets ${reach.map((c) => LABEL[c]).join(', ')}.`;
  if (missing.length === 0) return { tone: 'ok', text: gets };
  const why = missing.map((c) => (c === 'sms' ? 'no phone' : c === 'email' ? 'no email' : 'Telegram not linked')).join(', ');

  return { tone: 'warn', text: `${gets} (${why})` };
}

function Pills({ value, onChange, disabled, label }: {
  value: NotifyChannel[];
  onChange: (next: NotifyChannel[]) => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <div className="nc-pills" role="group" aria-label={label}>
      {CHANNELS.map((c) => {
        const on = value.includes(c);
        return (
          <button
            key={c}
            type="button"
            className={`nc-pill${on ? ' is-on' : ''}`}
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onChange(toggle(value, c))}
          >
            {on && <InlineIcon icon={Check} size={12} />}{LABEL[c]}
          </button>
        );
      })}
    </div>
  );
}

export function NotifyChannelsPanel({ canManage, emailToStaffOn, onError }: {
  canManage: boolean;
  /** Delivery rules → "Email copies: staff"; off means no staff email at all. */
  emailToStaffOn: boolean;
  onError: (msg: string) => void;
}) {
  const [roles, setRoles] = useState<NotifyRole[]>([]);
  const [people, setPeople] = useState<NotifyPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await getNotifyChannels();
      setRoles(res.roles);
      setPeople(res.people);
    } catch (e: unknown) {
      onError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => { void load(); }, [load]);

  const roleChannels = useMemo(() => Object.fromEntries(roles.map((r) => [r.key, r.channels])) as Record<string, NotifyChannel[]>, [roles]);

  const saveRole = async (key: string, channels: NotifyChannel[]) => {
    setBusy(`role:${key}`);
    try {
      const res = await updateNotifyRoles({ [key]: channels });
      setRoles((prev) => prev.map((r) => ({ ...r, channels: ordered(res.roles[r.key] ?? r.channels) })));
      // People following their role now get the new channels.
      setPeople((prev) => prev.map((p) => (p.own_channels === null && p.role === key ? { ...p, channels: ordered(res.roles[key] ?? channels) } : p)));
    } catch (e: unknown) {
      onError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const savePerson = async (p: NotifyPerson, channels: NotifyChannel[] | null) => {
    setBusy(`person:${p.id}`);
    try {
      const res = await updateNotifyPerson(p.id, channels);
      setPeople((prev) => prev.map((x) => (x.id === p.id ? res.person : x)));
    } catch (e: unknown) {
      onError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q === '' ? people : people.filter((p) => `${p.name} ${p.role_label ?? ''} ${p.phone ?? ''} ${p.email ?? ''}`.toLowerCase().includes(q));
  }, [people, query]);

  const unreachable = people.filter((p) => reachNote(p, p.channels).tone === 'danger').length;

  return (
    <section id="channels" className="nc" data-testid="notify-channels" aria-labelledby="nc-title">
      <h2 id="nc-title" className="nc-title">Who gets alerts, and how</h2>
      <p className="nc-lead">
        For staff and owner alerts. Each person gets an alert by the channels ticked for their role, or their own if you set one,
        when the alert itself has that channel on above. Customers are not affected. If none of a person's channels can reach them,
        the SMS goes, so nothing is missed.
      </p>
      {!emailToStaffOn && (
        <p className="nc-banner is-warn" data-testid="nc-email-off">Email to staff is switched off in Delivery rules → Email copies, so nobody gets alerts by email.</p>
      )}
      {unreachable > 0 && (
        <p className="nc-banner is-danger">{unreachable} {unreachable === 1 ? 'person gets' : 'people get'} no alerts at all. See below.</p>
      )}

      <div className="nc-card">
        <h3 className="nc-h3">By role</h3>
        {loading ? <p className="nc-muted">Loading…</p> : (
          <div className="nc-roles">
            {roles.map((r) => (
              <div key={r.key} className="nc-role" data-testid={`nc-role-${r.key}`}>
                <div className="nc-role-name">{r.label}</div>
                <Pills
                  value={r.channels}
                  disabled={!canManage || busy !== null}
                  label={`Channels for ${r.label}`}
                  onChange={(next) => void saveRole(r.key, next)}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="nc-card">
        <div className="nc-people-head">
          <h3 className="nc-h3">By person</h3>
          {people.length > 6 && (
            <label className="nc-search">
              <Search size={15} aria-hidden />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find someone" aria-label="Find someone" />
            </label>
          )}
        </div>
        {loading ? <p className="nc-muted">Loading…</p> : shown.length === 0 ? <p className="nc-muted">Nobody matches.</p> : (
          <ul className="nc-people">
            {shown.map((p) => {
              const own = p.own_channels !== null;
              const note = reachNote(p, p.channels);
              return (
                <li key={p.id} className="nc-person" data-testid={`nc-person-${p.id}`}>
                  <div className="nc-person-who">
                    <div className="nc-person-name">{p.name} <span className="nc-muted">· {p.role_label ?? 'No role'}</span></div>
                    <div className="nc-contacts">
                      <span className={p.phone ? '' : 'is-missing'}>{p.phone ?? 'No phone'}</span>
                      <span className={p.email ? '' : 'is-missing'}>{p.email ?? 'No email'}</span>
                      <span className={p.telegram_linked ? '' : 'is-missing'}>{p.telegram_linked ? 'Telegram linked' : 'Telegram not linked'}</span>
                    </div>
                    <div className={`nc-note is-${note.tone}`}>{note.text}</div>
                  </div>
                  <div className="nc-person-set">
                    <select
                      className="nc-select"
                      value={own ? 'own' : 'role'}
                      disabled={!canManage || busy !== null}
                      aria-label={`Channels for ${p.name}`}
                      onChange={(e) => void savePerson(p, e.target.value === 'own' ? p.channels : null)}
                    >
                      <option value="role">Same as role{p.role && roleChannels[p.role] ? ` (${roleChannels[p.role].map((c) => LABEL[c]).join(', ') || 'none'})` : ''}</option>
                      <option value="own">Own choice</option>
                    </select>
                    {own && (
                      <Pills
                        value={p.channels}
                        disabled={!canManage || busy !== null}
                        label={`Own channels for ${p.name}`}
                        onChange={(next) => void savePerson(p, next)}
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

export default NotifyChannelsPanel;
