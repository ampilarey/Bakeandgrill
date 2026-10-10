import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import {
  updateSmsType,
  previewSmsType,
  testSmsType,
  getOpsAlertsSettings,
  updateOpsAlertsSettings,
  getComplaintAlertSettings,
  updateComplaintAlertSettings,
  getGstSettings,
  updateGstSettings,
  getSiteSettings,
  updateSiteSettings,
  type AlertAudience,
  type AudienceGroupOption,
  type OpsAlertsSettings,
  type SmsControlCenterType,
  type SmsExtraTemplate,
  type SmsStaffOption,
} from '../../api';
import { fetchTelegram, updateTelegramSettings } from '../../api/telegram';
import { Switch } from '../../components/SharedUI';
import { useCurrentUserPermissions } from '../../hooks/usePermissions';
import { nonGsm7Characters, smsCharCount } from '../../utils/smsCharCount';
import {
  CHANNEL_LABEL, audienceSummary, badgeStyle, fieldLabel, groupLabel, inputStyle, primaryBtn, rowChannelList, rowChannels, rowLine, secondaryBtn, subHeading,
} from './shared';

/*
 * One message: who gets it, its SMS / Email / Telegram switches (the only
 * switches it has, notifications audit 2026-10-10), and under Edit who
 * gets it (groups, people, exceptions, numbers), when it goes, who may
 * send it by hand and its wording.
 */

type OpsField = keyof OpsAlertsSettings;

type TimingDef =
  | { kind: 'ops'; field: OpsField; label: string; min: number; max: number; note?: string }
  | { kind: 'complaints'; label: string; min: number; max: number }
  | { kind: 'gst'; label: string; min: number; max: number; note?: string }
  | { kind: 'site'; key: string; label: string; min: number; max: number; fallback: string; note?: string; zeroMeans?: string }
  | { kind: 'telegram'; label: string; min: number; max: number; zeroMeans?: string };

/**
 * The numbers that say when an alert goes. They lived beside a second
 * switch on Settings, Shifts, the Complaint box, Credit accounts, GST and
 * the Telegram page; "0 = off" was that switch, so 0 is refused where it
 * meant off and off is the row's switches.
 */
export const TIMING: Record<string, TimingDef> = {
  owner_shift_left_open: { kind: 'ops', field: 'shift_open_alert_hours', label: 'When a shift has been open for (hours)', min: 1, max: 72 },
  owner_shift_variance: {
    kind: 'ops', field: 'shift_variance_alert_mvr', label: 'When the cash at close is off by at least (MVR)', min: 1, max: 1000000,
    note: 'The same amount sends "opening float differs from the last close".',
  },
  owner_shift_float_mismatch: {
    kind: 'ops', field: 'shift_variance_alert_mvr', label: 'When the opening float is off by at least (MVR)', min: 1, max: 1000000,
    note: 'The same amount sends "shift closed with a cash variance".',
  },
  owner_order_unstarted: { kind: 'ops', field: 'unstarted_order_alert_minutes', label: 'When a paid order is still not started after (minutes)', min: 1, max: 120 },
  owner_complaint_stale: { kind: 'complaints', label: 'When a complaint is still unread after (days)', min: 1, max: 30 },
  owner_gst_filing_due: { kind: 'gst', label: 'Days before the filing date', min: 1, max: 14, note: 'Then on the day and the day after, while the period is still open.' },
  credit_payment_reminder: {
    kind: 'site', key: 'credit_overdue_reminder_every_days', label: 'After day three, remind again every (days)', min: 0, max: 90, fallback: '7',
    note: 'Every open invoice is texted three days before it is due, on the day, and three days after.', zeroMeans: 'no repeats after day three',
  },
  trade_report_reminder_shop: {
    kind: 'site', key: 'trade_unreconciled_nudge_days', label: 'When a shop has not reported sales after (days)', min: 1, max: 60, fallback: '3',
    note: 'Or as soon as the delivery is past its expected return. Once per delivery.',
  },
  owner_trade_unreconciled: {
    kind: 'site', key: 'trade_unreconciled_alert_days', label: 'When stock is still unreconciled after (days)', min: 1, max: 90, fallback: '7',
    note: 'Once per delivery.',
  },
  owner_cash_out: { kind: 'telegram', label: 'Only when the amount is at least (MVR)', min: 0, max: 100000, zeroMeans: 'every cash out' },
};

export function MessageRow({
  row, expanded, onExpand, onToggle, onEmailToggle, onTelegramToggle, saving, canToggle, canEdit, canTest, myPhone, permissionOptions, staffOptions, groupOptions, onUpdated, onError,
}: {
  row: SmsControlCenterType;
  expanded: boolean;
  onExpand: () => void;
  onToggle: () => void;
  onEmailToggle: () => void;
  onTelegramToggle: () => void;
  saving: boolean;
  /** May change the switches (Manage SMS settings). */
  canToggle: boolean;
  canEdit: boolean;
  canTest: boolean;
  myPhone: string | null;
  permissionOptions: Array<{ slug: string; name: string }>;
  staffOptions: SmsStaffOption[];
  groupOptions: AudienceGroupOption[];
  onUpdated: (patch: Partial<SmsControlCenterType>) => void;
  onError: (msg: string) => void;
}) {
  const systemOnly = row.send_permission == null;
  const has = rowChannelList(row);
  const ch = rowChannels(row);
  const off = !ch.sms && !ch.email && !ch.telegram;
  const onlyOn = (['sms', 'email', 'telegram'] as const).filter((c) => has.includes(c) && ch[c]);
  const partly = !off && !has.every((c) => ch[c]);
  const to = audienceSummary(row, staffOptions, groupOptions);
  const unreachable = (row.audience_people?.people ?? []).filter((p) => p.reach.length === 0).length;

  return (
    <div className={`sms-cc-row${off ? ' is-off' : ''}${expanded ? ' is-open' : ''}`} data-testid={`sms-type-${row.key}`}>
      <div className="sms-cc-row-main">
        <div className="sms-cc-row-text">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <p className="sms-cc-row-title">{row.label}</p>
            {row.always_on
              ? <span style={badgeStyle('var(--color-tone-rust-bg)', 'var(--color-tone-rust-text)')}>Always on</span>
              : off
                ? <span style={badgeStyle('var(--color-border-light)', 'var(--color-text-muted)')}>Off</span>
                : partly && has.length > 1
                  ? <span style={badgeStyle('var(--color-tone-rust-bg)', 'var(--color-tone-rust-text)')} data-testid={`email-only-${row.key}`}>{onlyOn.map((c) => CHANNEL_LABEL[c]).join(' + ')} only</span>
                  : null}
            {row.audience_custom && <span style={badgeStyle('var(--color-tone-brown-bg)', 'var(--color-tone-brown-text)')} title="Who gets it was changed from the default">Chosen</span>}
          </div>
          <p className="sms-cc-row-to" style={rowLine}>
            To: {to || '—'}
            {unreachable > 0 && <span style={{ color: 'var(--color-warning-strong)', fontWeight: 600 }}> · {unreachable} cannot be reached</span>}
          </p>
          {expanded && (
            <p style={{ ...rowLine, color: 'var(--color-text-muted)' }}>
              Who can send: {row.send_permission_label}
              {!systemOnly && row.roles_with_permission.length > 0 && <> · {row.roles_with_permission.join(', ')}</>}
              {' · '}
              <Link to="/settings/permissions" style={{ color: 'var(--color-primary)' }}>Roles & permissions</Link>
              {' · '}Last 30 days: {row.last_30_days.count} · MVR {row.last_30_days.cost_mvr.toFixed(2)}
            </p>
          )}
        </div>
        <div className="sms-cc-row-actions">
          {!expanded && (
            <span className="sms-cc-count" title="Sent in the last 30 days">
              {row.last_30_days.count} / 30d
            </span>
          )}
          {has.includes('sms') && (
            <div className="sms-cc-channel">
              <span className="sms-cc-channel-label">SMS</span>
              {row.always_on ? (
                <span style={badgeStyle('var(--color-border-light)', 'var(--color-text-muted)')}>Always on</span>
              ) : (
                <Switch
                  checked={row.enabled}
                  onChange={() => onToggle()}
                  disabled={!canToggle || saving}
                  aria-label={`Toggle ${row.label}`}
                />
              )}
            </div>
          )}
          {has.includes('email') && (
            <div className="sms-cc-channel">
              <span className="sms-cc-channel-label">Email</span>
              {row.always_on ? (
                <span style={badgeStyle('var(--color-border-light)', 'var(--color-text-muted)')}>Always on</span>
              ) : (
                <Switch
                  checked={ch.email}
                  onChange={() => onEmailToggle()}
                  disabled={!canToggle || saving}
                  aria-label={`Toggle email for ${row.label}`}
                  title={row.has_own_email ? 'Its own email, not a copy of the text' : undefined}
                />
              )}
            </div>
          )}
          {has.includes('telegram') && (
            <div className="sms-cc-channel">
              <span className="sms-cc-channel-label">Telegram</span>
              <Switch
                checked={ch.telegram}
                onChange={() => onTelegramToggle()}
                disabled={!canToggle || saving}
                aria-label={`Toggle Telegram for ${row.label}`}
              />
            </div>
          )}
          <button type="button" onClick={onExpand} className="sms-cc-edit" aria-expanded={expanded}>
            {expanded ? 'Hide controls' : 'Edit'}
          </button>
        </div>
      </div>

      {expanded && (
        <MessageEditor
          row={row}
          disabled={!canEdit}
          canTest={canTest}
          myPhone={myPhone}
          permissionOptions={permissionOptions}
          staffOptions={staffOptions}
          groupOptions={groupOptions}
          onUpdated={onUpdated}
          onError={onError}
        />
      )}
    </div>
  );
}

function MessageEditor({
  row, disabled, canTest, myPhone, permissionOptions, staffOptions, groupOptions, onUpdated, onError,
}: {
  row: SmsControlCenterType;
  disabled: boolean;
  canTest: boolean;
  myPhone: string | null;
  permissionOptions: Array<{ slug: string; name: string }>;
  staffOptions: SmsStaffOption[];
  groupOptions: AudienceGroupOption[];
  onUpdated: (patch: Partial<SmsControlCenterType>) => void;
  onError: (msg: string) => void;
}) {
  const [body, setBody] = useState(row.template?.body ?? '');
  const [perm, setPerm] = useState(row.send_permission ?? '__system__');
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<{ encoding: string; segments: number; cost_mvr: number } | null>(null);
  const [err, setErr] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    setBody(row.template?.body ?? '');
    setPerm(row.send_permission ?? '__system__');
    setPreview(null);
    setEstimate(null);
    setTestResult(null);
  }, [row.key, row.template?.body, row.send_permission]);

  const count = smsCharCount(body || ' ');
  const unicodeOffenders = count.isUnicode ? nonGsm7Characters(body) : [];
  const variables = row.template?.variables ?? [];
  const hasTemplate = !!row.template;
  const bodyDirty = hasTemplate && body !== (row.template?.body ?? '');
  const timing = TIMING[row.key];
  const telegramOnly = rowChannelList(row).length === 1 && rowChannelList(row)[0] === 'telegram';

  const saveWording = async () => {
    if (disabled || !hasTemplate) return;
    setSaving(true);
    setErr('');
    try {
      const res = await updateSmsType(row.key, { body });
      if (res.template) {
        onUpdated({ template: res.template });
        setBody(res.template.body);
      }
      if (res.estimate) setEstimate(res.estimate);
    } catch (e: unknown) {
      const msg = (e as Error).message;
      setErr(msg);
      onError(msg);
    } finally {
      setSaving(false);
    }
  };

  const savePermission = async (next: string) => {
    if (disabled) return;
    setPerm(next);
    setSaving(true);
    setErr('');
    try {
      const res = await updateSmsType(row.key, { send_permission: next });
      onUpdated({
        send_permission: res.send_permission ?? null,
        send_permission_label: res.send_permission_label
          ?? (res.send_permission == null ? 'System-initiated — no manual sending' : res.send_permission),
        roles_with_permission: res.send_permission == null ? ['System'] : row.roles_with_permission,
      });
    } catch (e: unknown) {
      const msg = (e as Error).message;
      setErr(msg);
      onError(msg);
    } finally {
      setSaving(false);
    }
  };

  const doPreview = async () => {
    try {
      const res = await previewSmsType(row.key, body);
      setPreview(res.preview);
      setEstimate(res.estimate);
    } catch {
      setPreview(body);
      setEstimate(null);
    }
  };

  const sendTest = async () => {
    if (!canTest) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testSmsType(row.key, bodyDirty ? { body } : {});
      setTestResult({ ok: res.ok, message: res.message });
    } catch (e: unknown) {
      setTestResult({ ok: false, message: (e as Error).message || 'Could not send the test.' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="sms-cc-editor" style={{ borderTop: '1px solid var(--color-border-light)', marginTop: 12, paddingTop: 12 }}>
      {row.audience_configurable && (
        <AudienceEditor row={row} disabled={disabled} staffOptions={staffOptions} groupOptions={groupOptions} onUpdated={onUpdated} onError={onError} />
      )}
      {timing && <TimingEditor typeKey={row.key} def={timing} onError={onError} />}
      {!telegramOnly && (
        <label style={{ ...fieldLabel, marginBottom: 12 }}>
          Who can send
          <select value={perm} disabled={disabled || saving} onChange={(e) => void savePermission(e.target.value)} style={inputStyle}>
            {permissionOptions.map((p) => (
              <option key={p.slug} value={p.slug}>{p.slug === '__system__' ? p.name : `${p.name} (${p.slug})`}</option>
            ))}
          </select>
        </label>
      )}

      {hasTemplate ? (
        <>
          <label style={{ ...fieldLabel, marginBottom: 0 }}>
            Wording
            <textarea
              value={body}
              aria-label={`${row.label} wording`}
              onChange={(e) => { setBody(e.target.value); setPreview(null); }}
              disabled={disabled}
              rows={4}
              style={{
                width: '100%', boxSizing: 'border-box', border: '1px solid var(--color-border)', borderRadius: 8,
                padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', resize: 'vertical', opacity: disabled ? 0.65 : 1,
                background: 'var(--color-surface)', color: 'var(--color-text)',
              }}
            />
          </label>
          {row.code_fallback_note && body.trim() === '' && (
            <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--color-warning-strong)' }}>{row.code_fallback_note}</p>
          )}
          {unicodeOffenders.length > 0 && (
            <p role="status" style={{
              margin: '8px 0 0', fontSize: 12, lineHeight: 1.45, color: 'var(--color-warning-strong)',
              background: 'var(--color-warning-bg)', border: '1px solid var(--color-warning)', borderRadius: 8, padding: '8px 10px',
            }}>
              Unicode encoding (UCS-2): non-GSM-7 characters cut each segment from 160 to 70 chars and roughly double SMS cost.
              {' '}Offending character{unicodeOffenders.length === 1 ? '' : 's'}: {unicodeOffenders.map((o) => o.label).join(', ')}.
              {' '}Dhivehi and other Unicode text is allowed when needed — just be aware of the cost.
            </p>
          )}
          {variables.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {variables.map((v) => (
                <span key={v.name} title={v.description} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: 'var(--color-border-light)', color: 'var(--color-text-secondary)', fontFamily: 'monospace' }}>
                  {`{{${v.name}}}`}
                </span>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
              {estimate
                ? `${estimate.encoding} · ${estimate.segments} segment${estimate.segments === 1 ? '' : 's'} · MVR ${estimate.cost_mvr.toFixed(2)}`
                : `${count.encoding} · ${count.chars} chars · ${count.segments} segment${count.segments === 1 ? '' : 's'} · ~MVR ${(count.segments * 0.25).toFixed(2)}`}
            </span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => void doPreview()} style={secondaryBtn}>Preview</button>
              {canTest && (
                <button type="button" onClick={() => void sendTest()} disabled={testing} style={secondaryBtn} title={myPhone ? `Sends to ${myPhone}` : 'Your staff account needs a phone number'}>
                  {testing ? 'Sending…' : 'Send me a test'}
                </button>
              )}
              <button type="button" onClick={() => void saveWording()} disabled={disabled || saving} style={primaryBtn}>
                {saving ? 'Saving…' : 'Save message'}
              </button>
            </div>
          </div>
        </>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-muted)' }}>
            {(row.extra_templates ?? []).length > 0
              ? 'Its wordings are below; which one goes depends on the case.'
              : telegramOnly ? 'The report or card is written by the system when it happens.'
                : row.user_initiated ? 'The message is written when it is sent.' : 'The system writes this message when it happens.'}
          </p>
          {canTest && !telegramOnly && (
            <button type="button" onClick={() => void sendTest()} disabled={testing} style={secondaryBtn} title={myPhone ? `Sends to ${myPhone}` : 'Your staff account needs a phone number'}>
              {testing ? 'Sending…' : 'Send me a test'}
            </button>
          )}
        </div>
      )}

      {(row.extra_templates ?? []).map((x) => (
        <ExtraWording
          key={x.slug}
          row={row}
          wording={x}
          disabled={disabled}
          onSaved={(saved) => onUpdated({
            extra_templates: (row.extra_templates ?? []).map((t) => (t.slug === saved.slug ? saved : t)),
          })}
          onError={onError}
        />
      ))}

      {testResult && (
        <p role="status" data-testid={`test-result-${row.key}`} style={{
          margin: '8px 0 0', fontSize: 12, padding: '8px 10px', borderRadius: 8,
          background: testResult.ok ? 'var(--color-success-bg)' : 'var(--color-danger-bg)',
          color: testResult.ok ? 'var(--color-success-strong)' : 'var(--color-danger-strong)',
        }}>
          {testResult.message}
        </p>
      )}
      {err && <p style={{ color: 'var(--color-danger-strong)', fontSize: 12, margin: '8px 0 0' }}>{err}</p>}
      {preview && (
        <div style={{ marginTop: 10, padding: 10, background: 'var(--color-bg)', borderRadius: 8, fontSize: 13, whiteSpace: 'pre-wrap' }}>
          {preview}
        </div>
      )}
    </div>
  );
}

/**
 * One of a message's other wordings (2026-10-10): the delivery version of
 * "order ready", the urgent complaint alert, each credit reminder. They were
 * only on SMS campaigns → Templates (or Settings → Notifications); they sit
 * on the message's row now, saved with the same permission as its wording.
 */
function ExtraWording({ row, wording, disabled, onSaved, onError }: {
  row: SmsControlCenterType;
  wording: SmsExtraTemplate;
  disabled: boolean;
  onSaved: (saved: SmsExtraTemplate) => void;
  onError: (msg: string) => void;
}) {
  const [body, setBody] = useState(wording.body);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => { setBody(wording.body); setPreview(null); }, [wording.slug, wording.body]);

  const count = smsCharCount(body || ' ');
  const dirty = body !== wording.body;

  const save = async () => {
    if (disabled || !dirty) return;
    setSaving(true);
    try {
      const res = await updateSmsType(row.key, { extra_templates: { [wording.slug]: body } });
      const saved = res.extra_templates?.find((t) => t.slug === wording.slug);
      if (saved) onSaved(saved);
    } catch (e: unknown) {
      onError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const doPreview = async () => {
    try {
      setPreview((await previewSmsType(row.key, body)).preview);
    } catch {
      setPreview(body);
    }
  };

  return (
    <div style={{ marginTop: 14 }} data-testid={`extra-wording-${wording.slug}`}>
      <label style={{ ...fieldLabel, marginBottom: 0 }}>
        Wording: {wording.label}
        <textarea
          value={body}
          aria-label={`${row.label} wording: ${wording.label}`}
          onChange={(e) => { setBody(e.target.value); setPreview(null); }}
          disabled={disabled}
          rows={3}
          style={{
            width: '100%', boxSizing: 'border-box', border: '1px solid var(--color-border)', borderRadius: 8,
            padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', resize: 'vertical', opacity: disabled ? 0.65 : 1,
            background: 'var(--color-surface)', color: 'var(--color-text)',
          }}
        />
      </label>
      {wording.variables.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {wording.variables.map((v) => (
            <span key={v.name} title={v.description} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: 'var(--color-border-light)', color: 'var(--color-text-secondary)', fontFamily: 'monospace' }}>
              {`{{${v.name}}}`}
            </span>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
          {count.encoding} · {count.chars} chars · {count.segments} segment{count.segments === 1 ? '' : 's'}
        </span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => void doPreview()} style={secondaryBtn}>Preview</button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={disabled || saving || !dirty}
            style={{ ...primaryBtn, ...(disabled || saving || !dirty ? { opacity: 0.45, cursor: 'default' } : {}) }}
          >
            {saving ? 'Saving…' : 'Save wording'}
          </button>
        </div>
      </div>
      {preview && (
        <div style={{ marginTop: 10, padding: 10, background: 'var(--color-bg)', borderRadius: 8, fontSize: 13, whiteSpace: 'pre-wrap' }}>
          {preview}
        </div>
      )}
    </div>
  );
}

/**
 * "When it sends" (2026-10-10): the number that used to sit beside a
 * second switch on another page. It is saved through that page's own
 * endpoint, so it needs the same permission it always did; without it the
 * row says so rather than showing a value it could not have read.
 */
function TimingEditor({ typeKey, def, onError }: { typeKey: string; def: TimingDef; onError: (msg: string) => void }) {
  const { can, user } = useCurrentUserPermissions();
  const allowed = def.kind === 'ops' || def.kind === 'site'
    ? can('settings.update')
    : def.kind === 'complaints'
      ? can('complaints.manage')
      : def.kind === 'gst'
        ? user?.role === 'owner' || can('settings.manage') || can('settings.update') || can('reports.financial')
        : can('telegram.manage');
  const [value, setValue] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [failed, setFailed] = useState('');

  useEffect(() => {
    if (!allowed) return;
    let live = true;
    const read: Promise<unknown> = def.kind === 'ops'
      ? getOpsAlertsSettings().then((r) => r.settings[def.field])
      : def.kind === 'complaints'
        ? getComplaintAlertSettings().then((r) => r.settings.stale_days)
        : def.kind === 'gst'
          ? getGstSettings().then((r) => r.settings.filing_reminder_days ?? 3)
          : def.kind === 'site'
            ? getSiteSettings().then((r) => {
              let found: string | null = null;
              Object.values(r.settings ?? {}).forEach((group) => {
                (group as { key: string; value: string | null }[]).forEach((s) => { if (s.key === def.key && s.value !== null) found = s.value; });
              });
              return found ?? def.fallback;
            })
            : fetchTelegram().then((r) => r.settings.alert_cash_min ?? 0);
    read
      .then((v) => { if (live) { const s = v == null ? '' : String(v); setValue(s); setSaved(s); } })
      .catch((e: unknown) => { if (live) setFailed((e as Error).message || 'Could not load.'); });
    return () => { live = false; };
  }, [allowed, def]);

  const id = `timing-${typeKey}`;

  if (!allowed) {
    const who = def.kind === 'complaints' ? 'someone who manages complaints'
      : def.kind === 'gst' ? 'someone with Settings or finance access'
        : def.kind === 'telegram' ? 'whoever manages Telegram'
          : 'someone with Settings access';
    return (
      <p style={{ ...rowLine, margin: '0 0 12px', color: 'var(--color-text-muted)' }} data-testid={id}>
        When it sends: seen and changed by {who}.
      </p>
    );
  }

  const n = Number(value);
  const valid = value !== null && value.trim() !== '' && Number.isFinite(n) && n >= def.min && n <= def.max;
  const zeroMeans = 'zeroMeans' in def ? def.zeroMeans : undefined;

  const save = async () => {
    if (!valid || value === saved) return;
    setBusy(true);
    setNote('');
    try {
      let s: string;
      if (def.kind === 'ops') {
        const res = await updateOpsAlertsSettings({ [def.field]: n } as Partial<OpsAlertsSettings>);
        s = String(res.settings[def.field] ?? n);
      } else if (def.kind === 'complaints') {
        const res = await updateComplaintAlertSettings({ stale_days: n });
        s = String(res.settings.stale_days);
      } else if (def.kind === 'gst') {
        const res = await updateGstSettings({ filing_reminder_days: n });
        s = String(res.settings.filing_reminder_days ?? n);
      } else if (def.kind === 'site') {
        await updateSiteSettings({ [def.key]: String(n) });
        s = String(n);
      } else {
        const res = await updateTelegramSettings({ alert_cash_min: n });
        s = String(res.settings.alert_cash_min ?? n);
      }
      setValue(s); setSaved(s);
      setNote('Saved.');
    } catch (e: unknown) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ marginBottom: 12 }} data-testid={id}>
      <p style={subHeading}>When it sends</p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <label style={{ ...fieldLabel, flex: '1 1 220px' }} htmlFor={`${id}-input`}>
          {def.label}
          <input
            id={`${id}-input`}
            type="number"
            min={def.min}
            max={def.max}
            value={value ?? ''}
            disabled={value === null || busy}
            onChange={(e) => { setValue(e.target.value); setNote(''); }}
            style={inputStyle}
          />
        </label>
        <button type="button" onClick={() => void save()} disabled={!valid || value === saved || busy} style={secondaryBtn}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
      {failed && <p style={{ ...rowLine, color: 'var(--color-danger-strong)' }}>{failed}</p>}
      {value !== null && !valid && (
        <p style={{ ...rowLine, color: 'var(--color-warning-strong)' }}>
          From {def.min} to {def.max.toLocaleString()}.{def.min > 0 ? ' To stop it, switch the row off.' : ''}
        </p>
      )}
      {zeroMeans && <p style={{ ...rowLine, color: 'var(--color-text-muted)' }}>0 = {zeroMeans}.</p>}
      {'note' in def && def.note && <p style={{ ...rowLine, color: 'var(--color-text-muted)' }}>{def.note}</p>}
      {note && <p role="status" style={{ ...rowLine, color: 'var(--color-success-strong)' }}>{note}</p>}
    </div>
  );
}

const EMPTY_AUDIENCE: AlertAudience = { groups: [], users: [], except: [], phones: [], emails: [] };

/** The groups a row offers as chips: the roles, the shop phone, and the special groups its default has. */
const SPECIAL_GROUPS = ['on_shift', 'catering_team'];

/**
 * Who gets a staff or owner alert (re-audit, 2026-10-10): groups as chips,
 * named people, people who never get it, typed numbers and emails. Saved on
 * each change; "Goes to now" shows the people it resolves to and how each
 * can be reached, so the owner sees who will actually get it.
 */
function AudienceEditor({ row, disabled, staffOptions, groupOptions, onUpdated, onError }: {
  row: SmsControlCenterType;
  disabled: boolean;
  staffOptions: SmsStaffOption[];
  groupOptions: AudienceGroupOption[];
  onUpdated: (patch: Partial<SmsControlCenterType>) => void;
  onError: (msg: string) => void;
}) {
  const audience = row.audience ?? row.audience_default ?? EMPTY_AUDIENCE;
  const defaultGroups = row.audience_default?.groups ?? [];
  const [saving, setSaving] = useState(false);
  const [phones, setPhones] = useState(audience.phones.join(', '));
  const [emails, setEmails] = useState(audience.emails.join(', '));
  const [err, setErr] = useState('');
  const [morePick, setMorePick] = useState('');

  useEffect(() => {
    setPhones((row.audience ?? row.audience_default ?? EMPTY_AUDIENCE).phones.join(', '));
    setEmails((row.audience ?? row.audience_default ?? EMPTY_AUDIENCE).emails.join(', '));
    setErr('');
  }, [row.key, row.audience, row.audience_default]);

  const save = async (next: Partial<AlertAudience> | null) => {
    if (disabled) return;
    setSaving(true);
    setErr('');
    try {
      const res = await updateSmsType(row.key, { audience: next === null ? null : { ...audience, ...next } });
      onUpdated({ audience: res.audience, audience_custom: res.audience_custom, audience_people: res.audience_people });
    } catch (e: unknown) {
      const msg = (e as Error).message;
      setErr(msg);
      onError(msg);
    } finally {
      setSaving(false);
    }
  };

  const toggleGroup = (key: string) => void save({ groups: audience.groups.includes(key) ? audience.groups.filter((g) => g !== key) : [...audience.groups, key] });
  const addUser = (id: number) => void save({ users: [...audience.users, id], except: audience.except.filter((x) => x !== id) });
  const removeUser = (id: number) => void save({ users: audience.users.filter((x) => x !== id) });
  const addExcept = (id: number) => void save({ except: [...audience.except, id], users: audience.users.filter((x) => x !== id) });
  const removeExcept = (id: number) => void save({ except: audience.except.filter((x) => x !== id) });
  const split = (s: string) => s.split(/[,\s;]+/).map((p) => p.trim()).filter(Boolean);
  const phonesDirty = split(phones).join(',') !== audience.phones.join(',');
  const emailsDirty = split(emails).join(',') !== audience.emails.join(',');

  const isOrderAlert = defaultGroups.includes('on_shift');
  const chipGroups = groupOptions.filter((g) => g.key.startsWith('role:') || g.key === 'business_phone'
    || (SPECIAL_GROUPS.includes(g.key) && (defaultGroups.includes(g.key) || audience.groups.includes(g.key)))
    || (g.key.startsWith('perm:') && audience.groups.includes(g.key)));
  const moreGroups = groupOptions.filter((g) => !chipGroups.some((c) => c.key === g.key) && !SPECIAL_GROUPS.includes(g.key));
  const name = (id: number) => staffOptions.find((s) => s.id === id)?.name ?? `#${id}`;
  const chosen = new Set([...audience.users, ...audience.except]);
  const people = row.audience_people;

  return (
    <div style={{ marginBottom: 14 }} data-testid={`audience-${row.key}`}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <p style={{ ...subHeading, margin: 0 }}>Who gets it</p>
        {row.audience_custom && (
          <button type="button" onClick={() => void save(null)} disabled={disabled || saving} style={{ ...secondaryBtn, minHeight: 28, padding: '2px 10px', fontSize: 12 }}>
            Back to the usual people
          </button>
        )}
      </div>

      <div className="aud-chips" role="group" aria-label="Groups">
        {chipGroups.map((g) => {
          const on = audience.groups.includes(g.key);
          return (
            <button
              key={g.key}
              type="button"
              className={`sms-cc-chip${on ? ' is-on' : ''}`}
              aria-pressed={on}
              disabled={disabled || saving}
              onClick={() => toggleGroup(g.key)}
              title={g.label}
            >
              {groupLabel(g.key, groupOptions)}{g.count !== null && g.count !== undefined ? <small> {g.count}</small> : null}
            </button>
          );
        })}
        {moreGroups.length > 0 && (
          <select
            aria-label="More groups"
            value={morePick}
            disabled={disabled || saving}
            onChange={(e) => { if (e.target.value) toggleGroup(e.target.value); setMorePick(''); }}
            className="sms-cc-status"
            style={{ marginLeft: 0 }}
          >
            <option value="">More groups…</option>
            {moreGroups.map((g) => <option key={g.key} value={g.key}>{g.label}{g.count !== null && g.count !== undefined ? ` (${g.count})` : ''}</option>)}
          </select>
        )}
      </div>

      <div className="aud-people">
        <div className="aud-people-col">
          <span style={{ ...fieldLabel, minWidth: 0 }}>Also these people, always</span>
          <div className="aud-tags">
            {audience.users.map((id) => (
              <span key={id} className="aud-tag">
                {name(id)}
                <button type="button" aria-label={`Remove ${name(id)}`} disabled={disabled || saving} onClick={() => removeUser(id)}><X size={12} aria-hidden /></button>
              </span>
            ))}
            <select aria-label="Add a person who always gets it" value="" disabled={disabled || saving} onChange={(e) => { if (e.target.value) addUser(Number(e.target.value)); }} className="sms-cc-status" style={{ marginLeft: 0 }}>
              <option value="">Add a person…</option>
              {staffOptions.filter((s) => !chosen.has(s.id)).map((s) => <option key={s.id} value={s.id}>{s.name}{s.role ? ` (${s.role})` : ''}{s.phone ? '' : ' · no phone'}</option>)}
            </select>
          </div>
        </div>
        <div className="aud-people-col">
          <span style={{ ...fieldLabel, minWidth: 0 }}>Never these people</span>
          <div className="aud-tags">
            {audience.except.map((id) => (
              <span key={id} className="aud-tag is-except">
                {name(id)}
                <button type="button" aria-label={`Allow ${name(id)} again`} disabled={disabled || saving} onClick={() => removeExcept(id)}><X size={12} aria-hidden /></button>
              </span>
            ))}
            <select aria-label="Add a person who never gets it" value="" disabled={disabled || saving} onChange={(e) => { if (e.target.value) addExcept(Number(e.target.value)); }} className="sms-cc-status" style={{ marginLeft: 0 }}>
              <option value="">Leave someone out…</option>
              {staffOptions.filter((s) => !chosen.has(s.id)).map((s) => <option key={s.id} value={s.id}>{s.name}{s.role ? ` (${s.role})` : ''}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="aud-typed">
        {isOrderAlert ? (
          <p style={{ ...rowLine, margin: 0 }}>
            Numbers that are not staff get order alerts as <Link to="/notifications/people#extra-numbers" style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Extra numbers</Link> (People), with their own days and hours.
          </p>
        ) : (
          <label style={{ ...fieldLabel, flex: '1 1 220px' }}>
            Numbers that are not staff
            <div style={{ display: 'flex', gap: 6 }}>
              <input value={phones} disabled={disabled || saving} onChange={(e) => setPhones(e.target.value)} placeholder="7771234, 9601234" aria-label={`Numbers for ${row.label}`} style={{ ...inputStyle, flex: 1, minWidth: 0 }} />
              <button type="button" onClick={() => void save({ phones: split(phones) })} disabled={disabled || saving || !phonesDirty} style={{ ...secondaryBtn, minHeight: 44 }}>Save</button>
            </div>
          </label>
        )}
        <label style={{ ...fieldLabel, flex: '1 1 220px' }}>
          Email addresses that are not staff
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={emails} disabled={disabled || saving} onChange={(e) => setEmails(e.target.value)} placeholder="events@example.com" aria-label={`Emails for ${row.label}`} style={{ ...inputStyle, flex: 1, minWidth: 0 }} />
            <button type="button" onClick={() => void save({ emails: split(emails) })} disabled={disabled || saving || !emailsDirty} style={{ ...secondaryBtn, minHeight: 44 }}>Save</button>
          </div>
        </label>
      </div>

      {people && (
        <p style={{ ...rowLine, marginTop: 8 }} data-testid={`goes-to-${row.key}`}>
          <strong style={{ color: 'var(--color-text)' }}>Goes to now:</strong>{' '}
          {people.people.length === 0 && people.extras.length === 0 && !people.note
            ? 'nobody yet; owners and managers get it until someone is chosen.'
            : [
              ...people.people.map((p) => `${p.name}${p.reach.length ? ` (${p.reach.map((c) => CHANNEL_LABEL[c]).join(', ')})` : ' (cannot be reached: no phone, email or Telegram)'}`),
              ...people.extras,
            ].join(' · ')}
          {people.note && <span style={{ color: 'var(--color-text-muted)' }}> {people.note}</span>}
        </p>
      )}
      {err && <p style={{ color: 'var(--color-danger-strong)', fontSize: 12, margin: '6px 0 0' }}>{err}</p>}
    </div>
  );
}
