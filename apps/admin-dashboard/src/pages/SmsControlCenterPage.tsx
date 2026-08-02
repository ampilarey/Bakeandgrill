import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ShieldOff } from 'lucide-react';
import {
  getSmsControlCenter,
  updateSmsGlobalKillSwitch,
  updateSmsType,
  updateSmsTemplate,
  previewSmsTemplateById,
  type SmsControlCenterType,
  type SmsTemplate,
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
  const canEditTemplates = can('sms.templates.edit') || can('integrations.sms');
  const canView = canManageSettings || can('sms.logs.view') || can('integrations.sms');
  const isOwner = user?.role === 'owner';

  const [types, setTypes] = useState<SmsControlCenterType[]>([]);
  const [killSwitch, setKillSwitch] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [killModalOpen, setKillModalOpen] = useState(false);
  const [killPending, setKillPending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getSmsControlCenter();
      setTypes(res.types);
      setKillSwitch(res.global_kill_switch);
      setDemoMode(res.demo_mode);
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
      const res = await updateSmsType(row.key, !row.enabled);
      setTypes((prev) => prev.map((t) => (t.key === row.key ? { ...t, enabled: res.enabled } : t)));
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
                  canEditTemplate={canEditTemplates}
                  onTemplateSaved={(tpl) => {
                    setTypes((prev) => prev.map((t) => {
                      if (t.key !== row.key || !t.template) return t;
                      return {
                        ...t,
                        template: {
                          ...t.template,
                          body: tpl.body,
                          variables: (tpl.variables ?? t.template.variables) as { name: string; description?: string }[],
                        },
                      };
                    }));
                  }}
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
  canEditTemplate,
  onTemplateSaved,
}: {
  row: SmsControlCenterType;
  expanded: boolean;
  onExpand: () => void;
  onToggle: () => void;
  saving: boolean;
  canToggle: boolean;
  canEditTemplate: boolean;
  onTemplateSaved: (tpl: SmsTemplate) => void;
}) {
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
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>
            Who can send: {row.send_permission_label}
            {row.roles_with_permission.length > 0 && (
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
          {row.template && (
            <button type="button" onClick={onExpand} style={linkBtn}>
              {expanded ? 'Hide wording' : 'Edit wording'}
            </button>
          )}
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

      {expanded && row.template && (
        <InlineTemplateEditor
          template={row.template}
          disabled={!canEditTemplate}
          onSaved={onTemplateSaved}
        />
      )}
    </div>
  );
}

function InlineTemplateEditor({
  template,
  disabled,
  onSaved,
}: {
  template: NonNullable<SmsControlCenterType['template']>;
  disabled: boolean;
  onSaved: (tpl: SmsTemplate) => void;
}) {
  const [body, setBody] = useState(template.body ?? '');
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    setBody(template.body ?? '');
    setPreview(null);
  }, [template.id, template.body]);

  const displayBody = body || template.body || '';
  const count = smsCharCount(displayBody);
  const variables = template.variables ?? [];

  const save = async () => {
    if (disabled) return;
    setSaving(true);
    setErr('');
    try {
      const res = await updateSmsTemplate(template.id, { body: displayBody });
      onSaved(res.template);
      setBody(res.template.body);
    } catch (e: unknown) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const doPreview = async () => {
    try {
      const res = await previewSmsTemplateById(template.id);
      setPreview(res.preview);
    } catch {
      setPreview(displayBody);
    }
  };

  return (
    <div style={{ borderTop: '1px solid #F3EDE6', marginTop: 12, paddingTop: 12 }}>
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
          {count.encoding} · {count.chars} chars · {count.segments} segment{count.segments === 1 ? '' : 's'}
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => void doPreview()} style={secondaryBtn}>Preview</button>
          <button type="button" onClick={() => void save()} disabled={disabled || saving} style={primaryBtn}>
            {saving ? 'Saving…' : 'Save message'}
          </button>
        </div>
      </div>
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
