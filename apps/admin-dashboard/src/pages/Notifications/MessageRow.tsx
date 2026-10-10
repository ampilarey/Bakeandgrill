import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  updateSmsType,
  previewSmsType,
  testSmsType,
  getOpsAlertsSettings,
  updateOpsAlertsSettings,
  getComplaintAlertSettings,
  updateComplaintAlertSettings,
  type OpsAlertsSettings,
  type SmsControlCenterType,
  type SmsExtraTemplate,
  type SmsRecipientMode,
  type SmsStaffOption,
} from '../../api';
import { Switch } from '../../components/SharedUI';
import { useCurrentUserPermissions } from '../../hooks/usePermissions';
import { nonGsm7Characters, smsCharCount } from '../../utils/smsCharCount';
import {
  RECIPIENT_MODE_LABELS, badgeStyle, fieldLabel, inputStyle, primaryBtn, rowChannels, rowLine, secondaryBtn,
} from './shared';

/*
 * One message: who gets it, its SMS / Email / Telegram switches (the only
 * switches it has, notifications audit 2026-10-10), and under Edit who
 * receives it, when it goes, who may send it by hand and its wording.
 */

type OpsField = keyof OpsAlertsSettings;

type TimingDef =
  | { kind: 'ops'; field: OpsField; label: string; min: number; max: number; note?: string }
  | { kind: 'complaints'; label: string; min: number; max: number }
  | { kind: 'gst'; label: string };

/**
 * The numbers that say when an alert goes. They lived beside a second
 * switch on Settings, Shifts and the Complaint box; "0 = off" was that
 * switch, so 0 is refused now and off is the row's switches.
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
  owner_gst_filing_due: { kind: 'gst', label: 'Days before the filing date' },
};

export function MessageRow({
  row, expanded, onExpand, onToggle, onEmailToggle, onTelegramToggle, saving, canToggle, canEdit, canTest, myPhone, permissionOptions, staffOptions, onUpdated, onError,
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
  onUpdated: (patch: Partial<SmsControlCenterType>) => void;
  onError: (msg: string) => void;
}) {
  const systemOnly = row.send_permission == null;
  const ch = rowChannels(row);
  const smsOff = !ch.sms;
  const off = smsOff && !ch.email && !ch.telegram;

  return (
    <div className={`sms-cc-row${off ? ' is-off' : ''}`} data-testid={`sms-type-${row.key}`}>
      <div className="sms-cc-row-main">
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: 'var(--color-text)' }}>{row.label}</p>
            {row.always_on
              ? <span style={badgeStyle('var(--color-tone-rust-bg)', 'var(--color-tone-rust-text)')}>Always on</span>
              : off
                ? <span style={badgeStyle('var(--color-border-light)', 'var(--color-text-muted)')}>Off</span>
                : smsOff
                  ? <span style={badgeStyle('var(--color-tone-rust-bg)', 'var(--color-tone-rust-text)')} data-testid={`email-only-${row.key}`}>{[ch.email && 'Email', ch.telegram && 'Telegram'].filter(Boolean).join(' + ')} only</span>
                  : null}
          </div>
          <p style={rowLine}>
            Goes to: {row.recipients || '—'}
            {row.recipients_configurable && row.recipients_config && (
              <> · now: {RECIPIENT_MODE_LABELS[row.recipients_config.mode]}{row.recipients_resolved && row.recipients_resolved.length > 0 ? ` (${row.recipients_resolved.join(', ')})` : ''}</>
            )}
          </p>
          <p style={{ ...rowLine, color: 'var(--color-text-muted)' }}>
            Who can send: {row.send_permission_label}
            {!systemOnly && row.roles_with_permission.length > 0 && <> · {row.roles_with_permission.join(', ')}</>}
            {expanded && (
              <>
                {' · '}
                <Link to="/settings/permissions" style={{ color: 'var(--color-primary)' }}>Roles & permissions</Link>
              </>
            )}
          </p>
          {expanded && (
            <p style={rowLine}>Last 30 days: {row.last_30_days.count} · MVR {row.last_30_days.cost_mvr.toFixed(2)}</p>
          )}
        </div>
        <div className="sms-cc-row-actions">
          {!expanded && (
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }} title="Sent in the last 30 days">
              {row.last_30_days.count} / 30d
            </span>
          )}
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
          <div className="sms-cc-channel">
            <span className="sms-cc-channel-label">Email</span>
            {row.has_own_email ? (
              <span style={badgeStyle('var(--color-border-light)', 'var(--color-text-muted)')} title="Sends its own email, separate from the SMS">Own email</span>
            ) : (
              <Switch
                checked={ch.email}
                onChange={() => onEmailToggle()}
                disabled={!canToggle || saving}
                aria-label={`Toggle email for ${row.label}`}
              />
            )}
          </div>
          {row.telegram_applies && (
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
          onUpdated={onUpdated}
          onError={onError}
        />
      )}
    </div>
  );
}

function MessageEditor({
  row, disabled, canTest, myPhone, permissionOptions, staffOptions, onUpdated, onError,
}: {
  row: SmsControlCenterType;
  disabled: boolean;
  canTest: boolean;
  myPhone: string | null;
  permissionOptions: Array<{ slug: string; name: string }>;
  staffOptions: SmsStaffOption[];
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
    <div style={{ borderTop: '1px solid var(--color-border-light)', marginTop: 12, paddingTop: 12 }}>
      {row.recipients_configurable && (
        <RecipientsEditor row={row} disabled={disabled} staffOptions={staffOptions} onUpdated={onUpdated} onError={onError} />
      )}
      {timing && <TimingEditor typeKey={row.key} def={timing} onError={onError} />}
      <label style={{ ...fieldLabel, marginBottom: 12 }}>
        Who can send
        <select value={perm} disabled={disabled || saving} onChange={(e) => void savePermission(e.target.value)} style={inputStyle}>
          {permissionOptions.map((p) => (
            <option key={p.slug} value={p.slug}>{p.slug === '__system__' ? p.name : `${p.name} (${p.slug})`}</option>
          ))}
        </select>
      </label>

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
              : row.user_initiated ? 'The message is written when it is sent.' : 'The system writes this message when it happens.'}
          </p>
          {canTest && (
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
  const { can } = useCurrentUserPermissions();
  const allowed = def.kind === 'ops' ? can('settings.update') : def.kind === 'complaints' ? can('complaints.manage') : true;
  const [value, setValue] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [failed, setFailed] = useState('');

  useEffect(() => {
    if (!allowed || def.kind === 'gst') return;
    let live = true;
    const read = def.kind === 'ops'
      ? getOpsAlertsSettings().then((r) => r.settings[def.field])
      : getComplaintAlertSettings().then((r) => r.settings.stale_days);
    read
      .then((v) => { if (live) { const s = v == null ? '' : String(v); setValue(s); setSaved(s); } })
      .catch((e: unknown) => { if (live) setFailed((e as Error).message || 'Could not load.'); });
    return () => { live = false; };
  }, [allowed, def]);

  const id = `timing-${typeKey}`;

  if (def.kind === 'gst') {
    return (
      <p style={{ ...rowLine, margin: '0 0 12px' }} data-testid={id}>
        When it sends: a few days before the GST return is due, then on the day and the day after, while the period is open.
        {' '}<Link to="/finance/gst" style={{ color: 'var(--color-primary)', fontWeight: 600 }}>{def.label}: Finance → GST → Settings</Link>
      </p>
    );
  }

  if (!allowed) {
    return (
      <p style={{ ...rowLine, margin: '0 0 12px', color: 'var(--color-text-muted)' }} data-testid={id}>
        When it sends: {def.kind === 'ops' ? 'seen and changed by someone with Settings access.' : 'seen and changed by someone who manages complaints.'}
      </p>
    );
  }

  const n = Number(value);
  const valid = value !== null && value.trim() !== '' && Number.isFinite(n) && n >= def.min && n <= def.max;

  const save = async () => {
    if (!valid || value === saved) return;
    setBusy(true);
    setNote('');
    try {
      if (def.kind === 'ops') {
        const res = await updateOpsAlertsSettings({ [def.field]: n } as Partial<OpsAlertsSettings>);
        const s = String(res.settings[def.field] ?? n);
        setValue(s); setSaved(s);
      } else {
        const res = await updateComplaintAlertSettings({ stale_days: n });
        const s = String(res.settings.stale_days);
        setValue(s); setSaved(s);
      }
      setNote('Saved.');
    } catch (e: unknown) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ marginBottom: 12 }} data-testid={id}>
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
      {value !== null && !valid && <p style={{ ...rowLine, color: 'var(--color-warning-strong)' }}>From {def.min} to {def.max.toLocaleString()}. To stop it, switch the row off.</p>}
      {def.kind === 'ops' && def.note && <p style={{ ...rowLine, color: 'var(--color-text-muted)' }}>{def.note}</p>}
      {note && <p role="status" style={{ ...rowLine, color: 'var(--color-success-strong)' }}>{note}</p>}
    </div>
  );
}

/**
 * Who an owner alert goes to (SMS audit, 2026-09-24). Saved on change;
 * the resolved numbers show so the owner can see who will actually get it.
 */
function RecipientsEditor({ row, disabled, staffOptions, onUpdated, onError }: {
  row: SmsControlCenterType;
  disabled: boolean;
  staffOptions: SmsStaffOption[];
  onUpdated: (patch: Partial<SmsControlCenterType>) => void;
  onError: (msg: string) => void;
}) {
  const initial = row.recipients_config ?? { mode: row.default_recipient_mode ?? 'owners_managers', user_ids: [], phones: [] };
  const [mode, setMode] = useState<SmsRecipientMode>(initial.mode);
  const [userIds, setUserIds] = useState<number[]>(initial.user_ids);
  const [phones, setPhones] = useState(initial.phones.join(', '));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    const cfg = row.recipients_config ?? { mode: row.default_recipient_mode ?? 'owners_managers', user_ids: [], phones: [] };
    setMode(cfg.mode);
    setUserIds(cfg.user_ids);
    setPhones(cfg.phones.join(', '));
  }, [row.key, row.recipients_config, row.default_recipient_mode]);

  const save = async (next: { mode: SmsRecipientMode; user_ids: number[]; phones: string[] }) => {
    if (disabled) return;
    setSaving(true);
    setErr('');
    try {
      const res = await updateSmsType(row.key, { recipients: next });
      onUpdated({ recipients_config: res.recipients_config, recipients_resolved: res.recipients_resolved });
    } catch (e: unknown) {
      const msg = (e as Error).message;
      setErr(msg);
      onError(msg);
    } finally {
      setSaving(false);
    }
  };

  const changeMode = (next: SmsRecipientMode) => {
    setMode(next);
    if (next !== 'staff' && next !== 'custom') void save({ mode: next, user_ids: [], phones: [] });
  };

  const toggleStaff = (id: number) => {
    const next = userIds.includes(id) ? userIds.filter((u) => u !== id) : [...userIds, id];
    setUserIds(next);
    if (next.length > 0) void save({ mode: 'staff', user_ids: next, phones: [] });
  };

  const savePhones = () => {
    const list = phones.split(/[,\s]+/).map((p) => p.trim()).filter(Boolean);
    if (list.length === 0) { setErr('Type at least one phone number.'); return; }
    void save({ mode: 'custom', user_ids: [], phones: list });
  };

  return (
    <div style={{ marginBottom: 12 }} data-testid={`recipients-${row.key}`}>
      <label style={fieldLabel}>
        Who receives it
        <select value={mode} disabled={disabled || saving} onChange={(e) => changeMode(e.target.value as SmsRecipientMode)} style={inputStyle}>
          {(Object.keys(RECIPIENT_MODE_LABELS) as SmsRecipientMode[]).map((m) => (
            <option key={m} value={m}>{RECIPIENT_MODE_LABELS[m]}{m === row.default_recipient_mode ? ' (default)' : ''}</option>
          ))}
        </select>
      </label>
      {mode === 'staff' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
          {staffOptions.length === 0 && <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>No staff with a phone number on file.</span>}
          {staffOptions.map((s) => (
            <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, minHeight: 32 }}>
              <input type="checkbox" checked={userIds.includes(s.id)} disabled={disabled || saving} onChange={() => toggleStaff(s.id)} />
              {s.name}{s.role ? ` (${s.role})` : ''}
            </label>
          ))}
        </div>
      )}
      {mode === 'custom' && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ ...fieldLabel, flex: '1 1 240px' }}>
            Numbers, separated by commas
            <input value={phones} disabled={disabled || saving} onChange={(e) => setPhones(e.target.value)} placeholder="7771234, 9601234" style={inputStyle} />
          </label>
          <button type="button" onClick={savePhones} disabled={disabled || saving} style={primaryBtn}>{saving ? 'Saving…' : 'Save numbers'}</button>
        </div>
      )}
      {row.recipients_resolved && row.recipients_resolved.length > 0 && (
        <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>Goes to: {row.recipients_resolved.join(', ')}</p>
      )}
      {err && <p style={{ color: 'var(--color-danger-strong)', fontSize: 12, margin: '6px 0 0' }}>{err}</p>}
    </div>
  );
}
