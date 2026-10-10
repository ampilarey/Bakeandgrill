import { Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { NotifyChannel, NotifyPerson, NotifyRole } from '../api';
import { InlineIcon } from './SharedUI';

/**
 * Admin → Notifications → People → "By role" (owner, 2026-10-07: "admin is
 * the one who controls everything, for example admin decides in which
 * channel notifications goes to a specific role or person"). Channels per
 * role, and how many alerts name each role. A person's own choice over
 * their role's is on their card (PeopleTab), beside everything else about
 * them (re-audit, 2026-10-10).
 */

export const CHANNELS: NotifyChannel[] = ['sms', 'email', 'telegram'];
export const LABEL: Record<NotifyChannel, string> = { sms: 'SMS', email: 'Email', telegram: 'Telegram' };

export function ordered(list: NotifyChannel[]): NotifyChannel[] {
  return CHANNELS.filter((c) => list.includes(c));
}

export function toggle(list: NotifyChannel[], c: NotifyChannel): NotifyChannel[] {
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

export function Pills({ value, onChange, disabled, label }: {
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

export function NotifyChannelsPanel({ canManage, roles, loading, busy, alertsByRole, onSaveRole }: {
  canManage: boolean;
  roles: NotifyRole[];
  loading: boolean;
  busy: boolean;
  /** How many staff and owner alerts name each role (Messages → ?to=role:…). */
  alertsByRole: Record<string, number>;
  onSaveRole: (key: string, channels: NotifyChannel[]) => void;
}) {
  return (
    <div className="nc-card" data-testid="notify-channels">
      <h3 className="nc-h3">By role</h3>
      <p className="nc-muted" style={{ margin: '0 0 10px', fontSize: 12 }}>
        How everyone in a role gets their alerts, unless a person has their own choice. Which alerts a role gets is set on each alert; the count opens them.
      </p>
      {loading ? <p className="nc-muted">Loading…</p> : (
        <div className="nc-roles">
          {roles.map((r) => (
            <div key={r.key} className="nc-role" data-testid={`nc-role-${r.key}`}>
              <div className="nc-role-name">
                {r.label}
                <Link to={`/notifications/messages?to=role:${encodeURIComponent(r.key)}`} className="nc-role-alerts" aria-label={`Alerts that reach ${r.label}`}>
                  {alertsByRole[r.key] ?? 0} {alertsByRole[r.key] === 1 ? 'alert' : 'alerts'}
                </Link>
              </div>
              <Pills
                value={r.channels}
                disabled={!canManage || busy}
                label={`Channels for ${r.label}`}
                onChange={(next) => onSaveRole(r.key, next)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default NotifyChannelsPanel;
