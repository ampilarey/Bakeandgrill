import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import {
  getSmsControlCenter,
  type AudienceGroupOption,
  type NotifyChannelKey,
  type SmsControlCenterResponse,
  type SmsControlCenterType,
  type SmsDeliveryRules,
  type SmsStaffOption,
} from '../../api';

/*
 * Pieces the Notifications tabs share (notifications audit, 2026-10-10).
 * Messages, People, Rules and Log were the SMS Control Center, the SMS
 * page's Recipients, Automations and Audit Logs tabs, Settings →
 * Notifications and Telegram's Alerts card; they are one page now.
 */

export const CATEGORY_ORDER = ['auth', 'transactional', 'staff', 'marketing', 'system'] as const;
export type Category = (typeof CATEGORY_ORDER)[number];

/** The same names on Messages and in the Log. */
export const CATEGORY_LABELS: Record<Category, string> = {
  auth: 'Sign-in codes',
  transactional: 'To customers',
  staff: 'Staff & owner alerts',
  marketing: 'Marketing',
  system: 'Approval codes',
};

export const CATEGORY_HELP: Record<Category, string> = {
  auth: 'Login codes. Always on; only Stop all SMS stops them.',
  transactional: 'Messages to a customer about their own order, booking, refund or account.',
  staff: 'Order alerts, shift reminders, owner alerts and digests. Each row says who gets it.',
  marketing: 'Campaigns, promotions and reminders. Quiet hours and the daily limit apply.',
  system: 'One-time codes that let a manager approve a discount or a refund.',
};

export const CHANNEL_LABEL: Record<NotifyChannelKey, string> = { sms: 'SMS', email: 'Email', telegram: 'Telegram' };

export const DEFAULT_RULES: SmsDeliveryRules = {
  quiet_hours_enabled: false,
  quiet_hours_start: '22:00',
  quiet_hours_end: '08:00',
  quiet_hours_alerts: false,
  marketing_daily_cap: 1,
  bulk_daily_recipient_cap: 5000,
  log_retention_days: 365,
  marketing_opt_out_line: 'Stop: {url}',
  email_copy_hourly_cap: 300,
};

export const KILL_SWITCH_WARNING =
  'This stops ALL outbound SMS, including login codes: customers and staff will not get verification codes by SMS while it is on. Emails keep going: anyone with an email on file still gets their codes and messages by email.';

/** The channels a row can go by; an older server sent none (SMS and email, Telegram for staff alerts). */
export function rowChannelList(row: SmsControlCenterType): NotifyChannelKey[] {
  if (row.channels && row.channels.length > 0) return row.channels;
  return row.telegram_applies ? ['sms', 'email', 'telegram'] : ['sms', 'email'];
}

/** The three alerts that exist only on Telegram: one switch, no SMS or email. */
export function isTelegramOnly(row: SmsControlCenterType): boolean {
  const c = rowChannelList(row);
  return c.length === 1 && c[0] === 'telegram';
}

/** Each channel: whether the row can go that way and the switch is on. */
export function rowChannels(row: SmsControlCenterType): { sms: boolean; email: boolean; telegram: boolean } {
  const has = rowChannelList(row);
  return {
    sms: has.includes('sms') && (row.always_on || row.enabled),
    // A sign-in code's email is always on; every other email follows its switch,
    // a message's own email (order confirmed, gift card, catering) included.
    email: has.includes('email') && (row.always_on || (row.email_enabled ?? true)),
    telegram: has.includes('telegram') && (row.telegram_enabled ?? true),
  };
}

/** A row is on when any of its channels is. */
export function rowIsOn(row: SmsControlCenterType): boolean {
  const c = rowChannels(row);
  return c.sms || c.email || c.telegram;
}

/** A group's name as Admin shows it. */
export function groupLabel(key: string, options: AudienceGroupOption[] = []): string {
  const found = options.find((o) => o.key === key);
  if (found) return found.label.replace(/ \(.*\)$/, '');
  if (key === 'on_shift') return 'Staff on shift';
  if (key === 'business_phone') return 'Business phone';
  if (key === 'catering_team') return 'The person handling the request';
  return key.replace(/^(role|perm):/, '').replace(/_/g, ' ');
}

/**
 * One line on who gets a staff or owner alert: "Owners, Managers · also Ali
 * · not Hassan · 7771234". A row that decides its recipient in code shows
 * what the code says ("The ordering customer").
 */
export function audienceSummary(row: SmsControlCenterType, staff: SmsStaffOption[] = [], groups: AudienceGroupOption[] = []): string {
  const a = row.audience;
  if (!a) return row.recipients || '';
  const name = (id: number) => staff.find((s) => s.id === id)?.name ?? `#${id}`;
  const parts: string[] = [];
  const groupNames = row.audience_people?.groups?.length ? row.audience_people.groups : a.groups.map((g) => groupLabel(g, groups));
  if (groupNames.length) parts.push(groupNames.join(', '));
  if (a.users.length) parts.push(`also ${a.users.map(name).join(', ')}`);
  if (a.except.length) parts.push(`not ${a.except.map(name).join(', ')}`);
  const typed = [...a.phones, ...a.emails];
  if (typed.length) parts.push(typed.join(', '));
  return parts.length ? parts.join(' · ') : 'Nobody yet';
}

/**
 * The list every tab reads. Each tab loads it when it opens, so a change
 * on Messages is what Rules shows next.
 */
export function useControlCenter(enabled: boolean) {
  const [data, setData] = useState<SmsControlCenterResponse | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!enabled) { setLoading(false); return; }
    setLoading(true);
    setError('');
    try {
      setData(await getSmsControlCenter());
    } catch (e: unknown) {
      setError((e as Error).message || 'Could not load the messages.');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => { void load(); }, [load]);

  return { data, setData, loading, error, setError, reload: load };
}

export function Tile({ label, tone, children }: { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger'; children: ReactNode }) {
  const tones = {
    neutral: { bg: 'var(--color-surface)', fg: 'var(--color-text)', border: 'var(--color-border)' },
    success: { bg: 'var(--color-success-bg)', fg: 'var(--color-success-strong)', border: 'var(--color-success)' },
    warning: { bg: 'var(--color-warning-bg)', fg: 'var(--color-warning-strong)', border: 'var(--color-warning)' },
    danger: { bg: 'var(--color-danger-bg)', fg: 'var(--color-danger-strong)', border: 'var(--color-danger)' },
  }[tone];
  return (
    <div style={{ background: tones.bg, border: `1px solid ${tones.border}`, borderRadius: 10, padding: '10px 12px', minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: tones.fg, lineHeight: 1.4, overflowWrap: 'anywhere' }}>{children}</div>
    </div>
  );
}

export function Chip({ on, onClick, children, disabled, title }: { on: boolean; onClick: () => void; children: ReactNode; disabled?: boolean; title?: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} disabled={disabled} title={title} className={`sms-cc-chip${on ? ' is-on' : ''}`}>
      {children}
    </button>
  );
}

export function badgeStyle(bg: string, color: string): CSSProperties {
  return { fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 999, background: bg, color };
}

export const panelStyle: CSSProperties = {
  background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '14px 16px', marginBottom: 18,
};
export const sectionTitle: CSSProperties = { margin: '0 0 8px', fontSize: 14, fontWeight: 700, color: 'var(--color-text)' };
export const panelLead: CSSProperties = { margin: '0 0 12px', fontSize: 13, color: 'var(--color-text-secondary)' };
export const panelNote: CSSProperties = { margin: '0 0 12px', fontSize: 12, color: 'var(--color-text-muted)' };
export const rowLine: CSSProperties = { margin: '4px 0 0', fontSize: 12, color: 'var(--color-text-secondary)' };
export const tileLink: CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--color-primary)', marginTop: 2 };
export const fieldsetStyle: CSSProperties = { border: '1px solid var(--color-border-light)', borderRadius: 8, padding: '8px 12px 12px', margin: 0, minWidth: 0 };
export const legendStyle: CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--color-text)', padding: '0 4px' };
export const fieldLabel: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--color-text-secondary)', minWidth: 160 };
export const inputStyle: CSSProperties = { minHeight: 44, border: '1px solid var(--color-border)', borderRadius: 8, padding: '8px 10px', fontSize: 14, fontFamily: 'inherit', background: 'var(--color-surface)', color: 'var(--color-text)' };
export const secondaryBtn: CSSProperties = {
  minHeight: 32, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-surface)',
  fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--color-text)',
};
export const primaryBtn: CSSProperties = {
  ...secondaryBtn, background: 'var(--color-primary)', borderColor: 'var(--color-primary)',
  color: 'var(--color-on-primary)', fontWeight: 600,
};
export const errorBox: CSSProperties = {
  background: 'var(--color-danger-bg)', color: 'var(--color-danger-strong)', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13,
};
export const sectionHeading: CSSProperties = { margin: '8px 0 12px', fontSize: 16, fontWeight: 700, color: 'var(--color-text)' };
export const subHeading: CSSProperties = { margin: '0 0 6px', fontSize: 12, fontWeight: 700, color: 'var(--color-text)', textTransform: 'uppercase', letterSpacing: '0.04em' };
