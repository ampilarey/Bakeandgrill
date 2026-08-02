import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ShieldOff } from 'lucide-react';
import {
  getSmsControlCenter,
  updateSmsGlobalKillSwitch,
  updateSmsType,
  updateSmsBudget,
  previewSmsType,
  type SmsBudgetSnapshot,
  type SmsCampaignQueueHealth,
  type SmsControlCenterType,
} from '../api';
import { usePageTitle } from '../hooks/usePageTitle';
import { useCurrentUserPermissions } from '../hooks/usePermissions';
import { PageHeader, PageShell, Btn, Modal } from '../components/SharedUI';
import { smsCharCount } from '../utils/smsCharCount';

const CATEGORY_ORDER = ['auth', 'transactional', 'staff', 'marketing', 'system'] as const;
const CATEGORY_LABELS: Record<string, string> = {
  auth: 'Auth',
  transactional: 'Transactional',
  staff: 'Staff',
  marketing: 'Marketing',
  system: 'System',
};

const KILL_SWITCH_WARNING =
  'This halts ALL outbound SMS, including login OTP codes — customers and staff will not be able to receive verification codes while this is on.';

export function SmsControlCenterPage() {
  usePageTitle('SMS Control Center');
  const { can, user } = useCurrentUserPermissions();
  const canManageSettings = can('sms.settings.manage') || can('integrations.sms');
  const canEditTemplates = can('sms.templates.edit') || can('integrations.sms') || canManageSettings;
  const canView = canManageSettings || can('sms.logs.view') || can('integrations.sms');
  const isOwner = user?.role === 'owner';

  const [types, setTypes] = useState<SmsControlCenterType[]>([]);
  const [killSwitch, setKillSwitch] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [budget, setBudget] = useState<SmsBudgetSnapshot | null>(null);
  const [queue, setQueue] = useState<SmsCampaignQueueHealth | null>(null);
  const [permissionOptions, setPermissionOptions] = useState<Array<{ slug: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [killModalOpen, setKillModalOpen] = useState(false);
  const [killPending, setKillPending] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState({ monthly: '', campaign: '' });
  const [budgetSaving, setBudgetSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getSmsControlCenter();
      setTypes(res.types);
      setKillSwitch(res.global_kill_switch);
      setDemoMode(res.demo_mode);
      setBudget(res.budget);
      setQueue(res.campaign_queue);
      setPermissionOptions(res.permission_options ?? []);
      setBudgetDraft({
        monthly: res.budget?.monthly_segment_ceiling != null ? String(res.budget.monthly_segment_ceiling) : '',
        campaign: res.budget?.per_campaign_segment_ceiling != null ? String(res.budget.per_campaign_segment_ceiling) : '',
      });
    } catch (e: unknown) {
      setError((e as Error).message || 'Failed to load Control Center');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleToggle = async (row: SmsControlCenterType) => {
    if (!canManageSettings || row.always_on) return;
    setSavingKey(row.key);
    try {
      const res = await updateSmsType(row.key, { enabled: !row.enabled });
      setTypes((prev) => prev.map((t) => (t.key === row.key ? { ...t, enabled: !!res.enabled } : t)));
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setSavingKey(null);
    }
  };

  const confirmKillSwitch = async () => {
    if (!isOwner || !canManageSettings) return;
    setKillPending(true);
    try {
      const res = await updateSmsGlobalKillSwitch(!killSwitch);
      setKillSwitch(res.global_kill_switch);
      setKillModalOpen(false);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setKillPending(false);
    }
  };

  const saveBudget = async () => {
    if (!canManageSettings) return;
    setBudgetSaving(true);
    setError('');
    try {
      const res = await updateSmsBudget({
        monthly_segment_ceiling: budgetDraft.monthly.trim() === '' ? null : Number(budgetDraft.monthly),
        per_campaign_segment_ceiling: budgetDraft.campaign.trim() === '' ? null : Number(budgetDraft.campaign),
      });
      setBudget(res.budget);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setBudgetSaving(false);
    }
  };

  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    label: CATEGORY_LABELS[cat],
    rows: types.filter((t) => t.category === cat),
  })).filter((g) => g.rows.length > 0);

  if (!canView) {
    return (
      <PageShell>
        <PageHeader title="SMS Control Center" section="Customers & Marketing" />
        <p style={{ color: 'var(--color-text-muted)' }}>You need SMS log or settings permission to view this page.</p>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title="SMS Control Center"
        section="Customers & Marketing"
        action={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {demoMode && (
              <span style={badgeStyle('var(--color-warning-bg)', 'var(--color-warning-strong)')}>Demo mode</span>
            )}
            {isOwner && (
              <Btn
                variant={killSwitch ? 'danger' : 'secondary'}
                onClick={() => setKillModalOpen(true)}
                disabled={!canManageSettings}
              >
                <ShieldOff size={14} style={{ marginRight: 6 }} />
                {killSwitch ? 'Kill switch ON' : 'Global kill switch'}
              </Btn>
            )}
          </div>
        }
      />

      {killSwitch && (
        <div style={{
          display: 'flex',
          gap: 10,
          alignItems: 'flex-start',
          padding: '12px 14px',
          marginBottom: 16,
          borderRadius: 10,
          background: 'var(--color-danger-bg)',
          border: '1px solid #FECACA',
          color: 'var(--color-danger-strong)',
          fontSize: 13,
        }}>
          <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <strong>All outbound SMS halted.</strong> {KILL_SWITCH_WARNING}
          </div>
        </div>
      )}

      {error && (
        <p style={{ color: 'var(--color-danger-strong)', marginBottom: 12 }}>{error}</p>
      )}

      {!loading && budget && (
        <section style={panelStyle}>
          <h2 style={sectionTitle}>Spend ceiling</h2>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: '#6B5A4E' }}>
            This month: {budget.period_segments_used} segments · MVR {budget.period_cost_mvr.toFixed(2)}
            {budget.monthly_segment_ceiling != null && (
              <> · Cap {budget.monthly_segment_ceiling} ({budget.monthly_remaining ?? 0} left)</>
            )}
            {budget.monthly_exhausted && (
              <span style={{ color: 'var(--color-danger-strong)', fontWeight: 600 }}> · Cap reached</span>
            )}
            {budget.period_blocked_count > 0 && (
              <> · {budget.period_blocked_count} blocked</>
            )}
          </p>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--color-text-muted)' }}>
            OTP / always-on auth types are never blocked by budget, but still count toward usage.
          </p>
          {canManageSettings && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <label style={fieldLabel}>
                Monthly segments
                <input
                  type="number"
                  min={0}
                  value={budgetDraft.monthly}
                  onChange={(e) => setBudgetDraft((d) => ({ ...d, monthly: e.target.value }))}
                  placeholder="Unlimited"
                  style={inputStyle}
                />
              </label>
              <label style={fieldLabel}>
                Per-campaign segments
                <input
                  type="number"
                  min={0}
                  value={budgetDraft.campaign}
                  onChange={(e) => setBudgetDraft((d) => ({ ...d, campaign: e.target.value }))}
                  placeholder="Unlimited"
                  style={inputStyle}
                />
              </label>
              <Btn variant="secondary" onClick={() => void saveBudget()} disabled={budgetSaving}>
                {budgetSaving ? 'Saving…' : 'Save ceilings'}
              </Btn>
            </div>
          )}
        </section>
      )}

      {!loading && queue && (
        <section style={panelStyle}>
          <h2 style={sectionTitle}>Campaign queue health</h2>
          <p style={{ margin: '0 0 8px', fontSize: 13, color: '#6B5A4E' }}>
            Running: {queue.running_campaigns}
            {' · '}Pending recipients: {queue.pending_recipients}
            {' · '}Failed recipients (24h): {queue.failed_recipients_24h}
            {' · '}Failed queue jobs (24h): {queue.failed_queue_jobs}
          </p>
          {(queue.pending_recipients > 0 || queue.failed_queue_jobs > 0) && (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--color-warning-strong)' }}>
              Stalled sends usually mean the Redis/database queue worker is down — check System Health.
            </p>
          )}
          {queue.campaigns.length > 0 && (
            <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 12, color: '#6B5A4E' }}>
              {queue.campaigns.map((c) => (
                <li key={c.id}>
                  #{c.id} {c.name} — pending {c.pending}/{c.total}, failed {c.failed}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {loading ? (
        <p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
      ) : (
        grouped.map((group) => (
          <section key={group.category} style={{ marginBottom: 28 }}>
            <h2 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: '#3D2B1F' }}>
              {group.label}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {group.rows.map((row) => (
                <TypeRow
                  key={row.key}
                  row={row}
                  expanded={expandedKey === row.key}
                  onExpand={() => setExpandedKey((k) => (k === row.key ? null : row.key))}
                  onToggle={() => void handleToggle(row)}
                  saving={savingKey === row.key}
                  canToggle={canManageSettings && !row.always_on}
                  canEdit={canEditTemplates && canManageSettings}
                  permissionOptions={permissionOptions}
                  onUpdated={(patch) => {
                    setTypes((prev) => prev.map((t) => (t.key === row.key ? { ...t, ...patch } : t)));
                  }}
                  onError={setError}
                />
              ))}
            </div>
          </section>
        ))
      )}

      {killModalOpen && (
        <Modal
          onClose={() => !killPending && setKillModalOpen(false)}
          title={killSwitch ? 'Turn off global kill switch?' : 'Enable global kill switch?'}
        >
          <p style={{ margin: '0 0 16px', fontSize: 14, color: '#3D2B1F', lineHeight: 1.5 }}>
            {KILL_SWITCH_WARNING}
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Btn variant="secondary" onClick={() => setKillModalOpen(false)} disabled={killPending}>
              Cancel
            </Btn>
            <Btn
              variant="danger"
              onClick={() => void confirmKillSwitch()}
              disabled={killPending}
            >
              {killPending ? 'Saving…' : killSwitch ? 'Turn off' : 'Enable kill switch'}
            </Btn>
          </div>
        </Modal>
      )}
    </PageShell>
  );
}

function TypeRow({
  row,
  expanded,
  onExpand,
  onToggle,
  saving,
  canToggle,
  canEdit,
  permissionOptions,
  onUpdated,
  onError,
}: {
  row: SmsControlCenterType;
  expanded: boolean;
  onExpand: () => void;
  onToggle: () => void;
  saving: boolean;
  canToggle: boolean;
  canEdit: boolean;
  permissionOptions: Array<{ slug: string; name: string }>;
  onUpdated: (patch: Partial<SmsControlCenterType>) => void;
  onError: (msg: string) => void;
}) {
  const systemOnly = row.send_permission == null;

  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 10,
      padding: '12px 16px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: '#3D2B1F' }}>{row.label}</p>
            {row.always_on && <span style={badgeStyle('#EEF2FF', '#3730A3')}>Always on</span>}
          </div>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6B5A4E' }}>
            Recipients: {row.recipients || '—'}
          </p>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>
            Who can send: {row.send_permission_label}
            {!systemOnly && row.roles_with_permission.length > 0 && (
              <> · {row.roles_with_permission.join(', ')}</>
            )}
            {' · '}
            <Link to="/settings?tab=permissions" style={{ color: 'var(--color-primary)' }}>Roles & Permissions</Link>
          </p>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6B5A4E' }}>
            Last 30 days: {row.last_30_days.count} · MVR {row.last_30_days.cost_mvr.toFixed(2)}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button type="button" onClick={onExpand} style={linkBtn}>
            {expanded ? 'Hide controls' : 'Edit'}
          </button>
          {row.always_on ? (
            <span style={badgeStyle('#F3F4F6', '#6B7280')}>Always on</span>
          ) : (
            <button
              type="button"
              onClick={onToggle}
              disabled={!canToggle || saving}
              aria-label={`Toggle ${row.label}`}
              style={{
                width: 44,
                height: 24,
                borderRadius: 12,
                border: 'none',
                cursor: !canToggle || saving ? 'not-allowed' : 'pointer',
                background: row.enabled ? 'var(--color-primary)' : '#D1D5DB',
                position: 'relative',
                opacity: !canToggle ? 0.55 : 1,
              }}
            >
              <span style={{
                position: 'absolute',
                top: 2,
                left: row.enabled ? 22 : 2,
                width: 20,
                height: 20,
                borderRadius: '50%',
                background: 'var(--color-surface)',
                transition: 'left 0.15s',
              }} />
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <TypeEditor
          row={row}
          disabled={!canEdit}
          permissionOptions={permissionOptions}
          onUpdated={onUpdated}
          onError={onError}
        />
      )}
    </div>
  );
}

function TypeEditor({
  row,
  disabled,
  permissionOptions,
  onUpdated,
  onError,
}: {
  row: SmsControlCenterType;
  disabled: boolean;
  permissionOptions: Array<{ slug: string; name: string }>;
  onUpdated: (patch: Partial<SmsControlCenterType>) => void;
  onError: (msg: string) => void;
}) {
  const [body, setBody] = useState(row.template?.body ?? '');
  const [perm, setPerm] = useState(row.send_permission ?? '__system__');
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<{ encoding: string; segments: number; cost_mvr: number } | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    setBody(row.template?.body ?? '');
    setPerm(row.send_permission ?? '__system__');
    setPreview(null);
    setEstimate(null);
  }, [row.key, row.template?.body, row.send_permission]);

  const displayBody = body;
  const count = smsCharCount(displayBody || ' ');
  const variables = row.template?.variables ?? [];
  const hasTemplate = !!row.template;

  const saveWording = async () => {
    if (disabled || !hasTemplate) return;
    setSaving(true);
    setErr('');
    try {
      const res = await updateSmsType(row.key, { body: displayBody });
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
      const res = await updateSmsType(row.key, {
        send_permission: next === '__system__' ? '__system__' : next,
      });
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
      const res = await previewSmsType(row.key, displayBody);
      setPreview(res.preview);
      setEstimate(res.estimate);
    } catch {
      setPreview(displayBody);
      setEstimate(null);
    }
  };

  return (
    <div style={{ borderTop: '1px solid #F3EDE6', marginTop: 12, paddingTop: 12 }}>
      <label style={{ ...fieldLabel, marginBottom: 12 }}>
        Who can send
        <select
          value={perm}
          disabled={disabled || saving}
          onChange={(e) => void savePermission(e.target.value)}
          style={inputStyle}
        >
          <option value="__system__">System-initiated — no manual sending</option>
          {permissionOptions.map((p) => (
            <option key={p.slug} value={p.slug}>{p.name} ({p.slug})</option>
          ))}
        </select>
      </label>

      {hasTemplate ? (
        <>
          <textarea
            value={displayBody}
            onChange={(e) => {
              setBody(e.target.value);
              setPreview(null);
            }}
            disabled={disabled}
            rows={4}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              padding: '10px 12px',
              fontSize: 13,
              fontFamily: 'inherit',
              resize: 'vertical',
              opacity: disabled ? 0.65 : 1,
            }}
          />
          {row.code_fallback_note && displayBody.trim() === '' && (
            <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--color-warning-strong)' }}>{row.code_fallback_note}</p>
          )}
          {variables.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {variables.map((v) => (
                <span
                  key={v.name}
                  title={v.description}
                  style={{
                    fontSize: 11,
                    padding: '2px 8px',
                    borderRadius: 99,
                    background: '#F5F0EB',
                    color: '#6B5A4E',
                    fontFamily: 'monospace',
                  }}
                >
                  {`{{${v.name}}}`}
                </span>
              ))}
            </div>
          )}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 8,
            gap: 8,
            flexWrap: 'wrap',
          }}>
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
              {estimate
                ? `${estimate.encoding} · ${estimate.segments} segment${estimate.segments === 1 ? '' : 's'} · MVR ${estimate.cost_mvr.toFixed(2)}`
                : `${count.encoding} · ${count.chars} chars · ${count.segments} segment${count.segments === 1 ? '' : 's'} · ~MVR ${(count.segments * 0.25).toFixed(2)}`}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => void doPreview()} style={secondaryBtn}>Preview</button>
              <button type="button" onClick={() => void saveWording()} disabled={disabled || saving} style={primaryBtn}>
                {saving ? 'Saving…' : 'Save message'}
              </button>
            </div>
          </div>
        </>
      ) : (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-muted)' }}>
          Message body is set per campaign / send — no type-level template.
        </p>
      )}

      {err && <p style={{ color: 'var(--color-danger-strong)', fontSize: 12, margin: '8px 0 0' }}>{err}</p>}
      {preview && (
        <div style={{
          marginTop: 10,
          padding: 10,
          background: '#F9F6F2',
          borderRadius: 8,
          fontSize: 13,
          whiteSpace: 'pre-wrap',
        }}>
          {preview}
        </div>
      )}
    </div>
  );
}

function badgeStyle(bg: string, color: string): CSSProperties {
  return {
    fontSize: 11,
    fontWeight: 600,
    padding: '3px 8px',
    borderRadius: 999,
    background: bg,
    color,
  };
}

const panelStyle: CSSProperties = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 10,
  padding: '14px 16px',
  marginBottom: 18,
};

const sectionTitle: CSSProperties = {
  margin: '0 0 8px',
  fontSize: 14,
  fontWeight: 700,
  color: '#3D2B1F',
};

const fieldLabel: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  fontSize: 12,
  color: '#6B5A4E',
  minWidth: 160,
};

const inputStyle: CSSProperties = {
  minHeight: 44,
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  padding: '8px 10px',
  fontSize: 13,
  fontFamily: 'inherit',
};

const linkBtn: CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--color-primary)',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
  padding: 0,
};

const secondaryBtn: CSSProperties = {
  padding: '6px 12px',
  borderRadius: 8,
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
  fontSize: 12,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const primaryBtn: CSSProperties = {
  ...secondaryBtn,
  background: 'var(--color-primary)',
  borderColor: 'var(--color-primary)',
  color: '#fff',
  fontWeight: 600,
};

export default SmsControlCenterPage;
