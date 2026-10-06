import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Search, ShieldOff } from 'lucide-react';
import {
  getSmsControlCenter,
  updateSmsGlobalKillSwitch,
  updateSmsType,
  updateSmsBudget,
  updateSmsDeliveryRules,
  previewSmsType,
  testSmsType,
  type SmsBudgetSnapshot,
  type SmsCampaignQueueHealth,
  type SmsControlCenterType,
  type SmsDeliveryRules,
  type SmsRecipientMode,
  type SmsStaffOption,
} from '../api';
import { usePageTitle } from '../hooks/usePageTitle';
import { useCurrentUserPermissions } from '../hooks/usePermissions';
import { PageHeader, PageShell, Btn, Modal } from '../components/SharedUI';
import { nonGsm7Characters, smsCharCount } from '../utils/smsCharCount';

/**
 * SMS Control Center: every text the system can send, in one place.
 *
 * SMS settings audit, 2026-10-03 ("make it user friendly and mobile
 * friendly"): this was one long page of ninety rows under three settings
 * panels, with no search, three lines of small grey text per row, a
 * twelve-point "Edit" link and a toggle too small for a thumb. It now opens
 * with what the owner asks first (is sending on, which phones get the owner
 * alerts, what has it cost this month), a search box and category chips
 * stay pinned while the list scrolls, every row says plainly who gets it
 * and what else it needs, the controls are thumb-sized, and any row can
 * text its wording to the owner's own phone as a test.
 */

const CATEGORY_ORDER = ['auth', 'transactional', 'staff', 'marketing', 'system'] as const;
type Category = (typeof CATEGORY_ORDER)[number];
const CATEGORY_LABELS: Record<Category, string> = {
  auth: 'Auth',
  transactional: 'Transactional',
  staff: 'Staff',
  marketing: 'Marketing',
  system: 'System',
};
const CATEGORY_HELP: Record<Category, string> = {
  auth: 'Login codes. Always on; only the kill switch stops them.',
  transactional: 'Texts to a customer about their own order, booking, refund or card.',
  staff: 'Texts to staff and the owner: new orders, alerts, digests.',
  marketing: 'Campaigns, promotions and reminders. Quiet hours and the daily cap apply.',
  system: 'One-time codes for staff actions.',
};

const RECIPIENT_MODE_LABELS: Record<SmsRecipientMode, string> = {
  owners_managers: 'Owners & managers',
  owner_only: 'Owner only',
  business_phone: 'Business phone',
  staff: 'Named staff',
  custom: 'Typed numbers',
};

const DEFAULT_RULES: SmsDeliveryRules = {
  quiet_hours_enabled: false,
  quiet_hours_start: '22:00',
  quiet_hours_end: '08:00',
  quiet_hours_alerts: false,
  marketing_daily_cap: 1,
  bulk_daily_recipient_cap: 5000,
  log_retention_days: 365,
  marketing_opt_out_line: 'Stop: {url}',
  email_copy_customers: true,
  email_copy_staff: true,
  email_copy_marketing: true,
  email_copy_hourly_cap: 300,
};

/** "customers, staff and promotions · up to 300 an hour" for the rules summary line. */
function emailCopySummary(r: SmsDeliveryRules): string {
  const on = [
    (r.email_copy_customers ?? true) && 'customers',
    (r.email_copy_staff ?? true) && 'staff',
    (r.email_copy_marketing ?? true) && 'promotions',
  ].filter(Boolean) as string[];
  if (on.length === 0) return 'off';
  const list = on.length === 1 ? on[0] : `${on.slice(0, -1).join(', ')} and ${on[on.length - 1]}`;
  const cap = r.email_copy_hourly_cap ?? 300;
  return `${list}${cap > 0 ? ` · up to ${cap.toLocaleString()} an hour` : ''}`;
}

const KILL_SWITCH_WARNING =
  'This halts ALL outbound SMS, including login OTP codes — customers and staff will not be able to receive verification codes by SMS while this is on. Emails keep going: anyone with an email on file still gets their codes and messages by email.';

type StatusFilter = 'all' | 'on' | 'off';

/** Where a "needs X in Y" note points. */
function linkForAlsoNeeds(note: string): { to: string; label: string } | null {
  const n = note.toLowerCase();
  if (n.includes('gst')) return { to: '/gst', label: 'GST page' };
  if (n.includes('signage') || n.includes('tv')) return { to: '/signage', label: 'Signage' };
  if (n.includes('social')) return { to: '/social', label: 'Social Hub' };
  if (n.includes('settings')) return { to: '/settings/notifications', label: 'Settings → Notifications' };
  if (n.includes('their own') || n.includes('customer')) return null;
  return null;
}

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
  const [businessPhone, setBusinessPhone] = useState<string | null>(null);
  const [ownerPhones, setOwnerPhones] = useState<Array<{ name: string; phone: string }>>([]);
  const [myPhone, setMyPhone] = useState<string | null>(null);
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
  const [rules, setRules] = useState<SmsDeliveryRules>(DEFAULT_RULES);
  const [rulesDraft, setRulesDraft] = useState<SmsDeliveryRules>(DEFAULT_RULES);
  const [rulesSaving, setRulesSaving] = useState(false);
  const [quietNow, setQuietNow] = useState(false);
  const [deferredCount, setDeferredCount] = useState(0);
  const [staffOptions, setStaffOptions] = useState<SmsStaffOption[]>([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [status, setStatus] = useState<StatusFilter>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getSmsControlCenter();
      setTypes(res.types);
      setKillSwitch(res.global_kill_switch);
      setDemoMode(res.demo_mode);
      setBusinessPhone(res.business_phone ?? null);
      setOwnerPhones(res.owner_phones ?? []);
      setMyPhone(res.my_phone ?? null);
      setBudget(res.budget);
      setQueue(res.campaign_queue);
      setPermissionOptions(res.permission_options ?? []);
      setRules(res.delivery_rules ?? DEFAULT_RULES);
      setRulesDraft(res.delivery_rules ?? DEFAULT_RULES);
      setQuietNow(!!res.quiet_now);
      setDeferredCount(res.deferred_count ?? 0);
      setStaffOptions(res.staff_options ?? []);
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

  const handleEmailToggle = async (row: SmsControlCenterType) => {
    if (!canManageSettings || row.has_own_email) return;
    setSavingKey(row.key);
    try {
      const next = !(row.email_enabled ?? true);
      const res = await updateSmsType(row.key, { email_enabled: next });
      setTypes((prev) => prev.map((t) => (t.key === row.key ? { ...t, email_enabled: res.email_enabled ?? next } : t)));
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

  const saveRules = async () => {
    if (!canManageSettings) return;
    setRulesSaving(true);
    setError('');
    try {
      const res = await updateSmsDeliveryRules(rulesDraft);
      setRules(res.delivery_rules);
      setRulesDraft(res.delivery_rules);
      setQuietNow(res.quiet_now);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setRulesSaving(false);
    }
  };

  const q = query.trim().toLowerCase();
  const matches = (t: SmsControlCenterType) => {
    if (category !== 'all' && t.category !== category) return false;
    if (status === 'on' && !t.enabled) return false;
    if (status === 'off' && (t.enabled || t.always_on)) return false;
    if (!q) return true;
    return [t.label, t.key, t.recipients, t.also_needs ?? '', t.send_permission_label]
      .some((s) => s.toLowerCase().includes(q));
  };

  const grouped = useMemo(() => CATEGORY_ORDER.map((cat) => {
    const all = types.filter((t) => t.category === cat);
    return {
      category: cat,
      label: CATEGORY_LABELS[cat],
      help: CATEGORY_HELP[cat],
      total: all.length,
      on: all.filter((t) => t.enabled).length,
      rows: all.filter(matches),
    };
  }).filter((g) => g.total > 0), [types, category, status, q]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = grouped.reduce((n, g) => n + g.rows.length, 0);
  const offCount = types.filter((t) => !t.enabled && !t.always_on).length;

  if (!canView) {
    return (
      <PageShell>
        <PageHeader title="SMS Control Center" section="Customers & Marketing" />
        <p style={{ color: 'var(--color-text-muted)' }}>You need SMS log or settings permission to view this page.</p>
      </PageShell>
    );
  }

  const sendingLabel = killSwitch ? 'Halted' : demoMode ? 'Demo mode' : quietNow ? 'On · quiet hours now' : 'On';
  const sendingTone = killSwitch ? 'danger' : demoMode || quietNow ? 'warning' : 'success';

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
          display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 14px', marginBottom: 16,
          borderRadius: 10, background: 'var(--color-danger-bg)', border: '1px solid var(--color-danger)',
          color: 'var(--color-danger-strong)', fontSize: 13,
        }}>
          <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
          <div><strong>All outbound SMS halted.</strong> {KILL_SWITCH_WARNING}</div>
        </div>
      )}

      {error && <p role="alert" style={{ color: 'var(--color-danger-strong)', marginBottom: 12 }}>{error}</p>}

      {!loading && (
        <section className="sms-cc-overview" data-testid="sms-overview" aria-label="At a glance">
          <Tile label="Sending" tone={sendingTone}>
            {sendingLabel}
            {deferredCount > 0 && <span style={{ display: 'block', fontSize: 12, fontWeight: 500 }}>{deferredCount} waiting for quiet hours to end</span>}
          </Tile>
          <Tile label="Business phone" tone={businessPhone ? 'neutral' : 'warning'}>
            {businessPhone ?? 'Not set'}
            <Link to="/business-details" style={tileLink}>{businessPhone ? 'Change' : 'Set it in Business details'}</Link>
          </Tile>
          <Tile label={ownerPhones.length === 1 ? 'Owner phone' : 'Owner phones'} tone={ownerPhones.length ? 'neutral' : 'warning'}>
            {ownerPhones.length === 0
              ? 'No owner has a phone on file'
              : ownerPhones.map((o) => <span key={o.phone} style={{ display: 'block' }}>{o.name}: {o.phone}</span>)}
            {ownerPhones.length === 0 && <Link to="/staff" style={tileLink}>Add one under Staff</Link>}
          </Tile>
          {budget && (
            <Tile label="This month" tone={budget.monthly_exhausted ? 'danger' : 'neutral'}>
              {budget.period_segments_used} segments · MVR {budget.period_cost_mvr.toFixed(2)}
              <span style={{ display: 'block', fontSize: 12, fontWeight: 500 }}>
                {budget.monthly_segment_ceiling != null
                  ? `Limit ${budget.monthly_segment_ceiling}${budget.monthly_exhausted ? ' · reached' : ` · ${budget.monthly_remaining ?? 0} left`}`
                  : 'No monthly limit'}
                {' · '}<a href="#sms-rules" style={{ color: 'var(--color-primary)' }}>Rules &amp; limits</a>
              </span>
            </Tile>
          )}
        </section>
      )}

      {!loading && (
        <div className="sms-cc-toolbar" data-testid="sms-toolbar">
          <label className="sms-cc-search">
            <Search size={15} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search texts, e.g. refund, device, owner"
              aria-label="Search SMS types"
            />
          </label>
          <div className="sms-cc-chips" role="group" aria-label="Category">
            <Chip on={category === 'all'} onClick={() => setCategory('all')}>All <small>{types.length}</small></Chip>
            {CATEGORY_ORDER.filter((c) => types.some((t) => t.category === c)).map((c) => (
              <Chip key={c} on={category === c} onClick={() => setCategory(c)}>
                {CATEGORY_LABELS[c]} <small>{types.filter((t) => t.category === c).length}</small>
              </Chip>
            ))}
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusFilter)}
              aria-label="Show"
              className="sms-cc-status"
            >
              <option value="all">On and off</option>
              <option value="on">Switched on</option>
              <option value="off">Switched off{offCount ? ` (${offCount})` : ''}</option>
            </select>
          </div>
        </div>
      )}

      {loading ? (
        <p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
      ) : shown === 0 ? (
        <p style={{ color: 'var(--color-text-muted)', padding: '20px 0' }}>Nothing matches. Clear the search or pick another category.</p>
      ) : (
        grouped.filter((g) => g.rows.length > 0).map((group) => (
          <section key={group.category} style={{ marginBottom: 28 }} aria-labelledby={`sms-cat-${group.category}`}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', margin: '0 0 4px' }}>
              <h2 id={`sms-cat-${group.category}`} style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--color-text)' }}>
                {group.label}
              </h2>
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                {group.on} of {group.total} on{group.rows.length !== group.total ? ` · showing ${group.rows.length}` : ''}
              </span>
            </div>
            <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--color-text-muted)' }}>{group.help}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {group.rows.map((row) => (
                <TypeRow
                  key={row.key}
                  row={row}
                  expanded={expandedKey === row.key}
                  onExpand={() => setExpandedKey((k) => (k === row.key ? null : row.key))}
                  onToggle={() => void handleToggle(row)}
                  onEmailToggle={() => void handleEmailToggle(row)}
                  saving={savingKey === row.key}
                  canToggle={canManageSettings && !row.always_on}
                  canToggleEmail={canManageSettings}
                  canEdit={canEditTemplates && canManageSettings}
                  canTest={canManageSettings}
                  myPhone={myPhone}
                  permissionOptions={permissionOptions}
                  staffOptions={staffOptions}
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

      {!loading && (
        <h2 id="sms-rules" style={{ margin: '8px 0 12px', fontSize: 16, fontWeight: 700, color: 'var(--color-text)' }}>
          Rules &amp; limits
        </h2>
      )}

      {!loading && budget && (
        <section style={panelStyle}>
          <h3 style={sectionTitle}>Spend ceiling</h3>
          <p style={panelLead}>
            This month: {budget.period_segments_used} segments · MVR {budget.period_cost_mvr.toFixed(2)}
            {budget.monthly_segment_ceiling != null && (
              <> · Cap {budget.monthly_segment_ceiling} ({budget.monthly_remaining ?? 0} left)</>
            )}
            {budget.monthly_exhausted && (
              <span style={{ color: 'var(--color-danger-strong)', fontWeight: 600 }}> · Cap reached</span>
            )}
            {budget.period_blocked_count > 0 && <> · {budget.period_blocked_count} blocked</>}
          </p>
          <p style={panelNote}>
            A segment is one 160-character text (70 for Dhivehi). Login codes are never blocked by the cap, but still count.
          </p>
          {canManageSettings && (
            <div className="sms-cc-fields">
              <label style={fieldLabel}>
                Monthly segments
                <input type="number" min={0} value={budgetDraft.monthly} onChange={(e) => setBudgetDraft((d) => ({ ...d, monthly: e.target.value }))} placeholder="Unlimited" style={inputStyle} />
              </label>
              <label style={fieldLabel}>
                Per-campaign segments
                <input type="number" min={0} value={budgetDraft.campaign} onChange={(e) => setBudgetDraft((d) => ({ ...d, campaign: e.target.value }))} placeholder="Unlimited" style={inputStyle} />
              </label>
              <Btn variant="secondary" onClick={() => void saveBudget()} disabled={budgetSaving}>
                {budgetSaving ? 'Saving…' : 'Save ceilings'}
              </Btn>
            </div>
          )}
        </section>
      )}

      {!loading && (
        <section style={panelStyle} data-testid="delivery-rules">
          <h3 style={sectionTitle}>Delivery rules</h3>
          <p style={panelLead}>
            {rules.quiet_hours_enabled
              ? `Quiet hours ${rules.quiet_hours_start}–${rules.quiet_hours_end}: marketing texts${rules.quiet_hours_alerts ? ' and owner alerts' : ''} wait until the window ends.`
              : 'Quiet hours off: texts go out whenever they are triggered.'}
            {quietNow && <span style={{ color: 'var(--color-warning-strong)', fontWeight: 600 }}> · Quiet now</span>}
            {deferredCount > 0 && <> · {deferredCount} waiting</>}
            {' · '}Marketing cap: {rules.marketing_daily_cap === 0 ? 'off' : `${rules.marketing_daily_cap} a day per number`}
            {' · '}Bulk cap: {!rules.bulk_daily_recipient_cap ? 'off' : `${rules.bulk_daily_recipient_cap.toLocaleString()} campaign recipients a day`}
            {' · '}Email copies: {emailCopySummary(rules)}
          </p>
          <p style={panelNote}>
            Login codes, order and payment texts are never held. The cap counts every marketing text to one number in a rolling day, whatever sends it.
          </p>
          {canManageSettings && (
            <div style={{ display: 'grid', gap: 14 }}>
              <fieldset style={fieldsetStyle}>
                <legend style={legendStyle}>Quiet hours</legend>
                <div className="sms-cc-fields">
                  <label style={{ ...fieldLabel, flexDirection: 'row', alignItems: 'center', minWidth: 0 }}>
                    <input type="checkbox" checked={rulesDraft.quiet_hours_enabled} onChange={(e) => setRulesDraft((d) => ({ ...d, quiet_hours_enabled: e.target.checked }))} />
                    Quiet hours
                  </label>
                  <label style={fieldLabel}>
                    From
                    <input type="time" value={rulesDraft.quiet_hours_start} onChange={(e) => setRulesDraft((d) => ({ ...d, quiet_hours_start: e.target.value }))} style={inputStyle} />
                  </label>
                  <label style={fieldLabel}>
                    Until
                    <input type="time" value={rulesDraft.quiet_hours_end} onChange={(e) => setRulesDraft((d) => ({ ...d, quiet_hours_end: e.target.value }))} style={inputStyle} />
                  </label>
                  <label style={{ ...fieldLabel, flexDirection: 'row', alignItems: 'center', minWidth: 0 }}>
                    <input type="checkbox" checked={rulesDraft.quiet_hours_alerts} onChange={(e) => setRulesDraft((d) => ({ ...d, quiet_hours_alerts: e.target.checked }))} />
                    Hold owner alerts too
                  </label>
                </div>
              </fieldset>
              <fieldset style={fieldsetStyle}>
                <legend style={legendStyle}>Limits</legend>
                <div className="sms-cc-fields">
                  <label style={fieldLabel}>
                    Marketing texts per number per day
                    <input type="number" min={0} max={50} value={rulesDraft.marketing_daily_cap} onChange={(e) => setRulesDraft((d) => ({ ...d, marketing_daily_cap: Math.max(0, Math.min(50, Number(e.target.value) || 0)) }))} style={inputStyle} />
                  </label>
                  <label style={fieldLabel}>
                    Campaign recipients per day, all campaigns (0 = no cap)
                    <input type="number" min={0} max={1000000} value={rulesDraft.bulk_daily_recipient_cap ?? 5000} onChange={(e) => setRulesDraft((d) => ({ ...d, bulk_daily_recipient_cap: Math.max(0, Math.min(1000000, Number(e.target.value) || 0)) }))} style={inputStyle} />
                  </label>
                  <label style={{ ...fieldLabel, flex: '1 1 220px' }}>
                    Unsubscribe line on marketing texts ({'{url}'} = the short link)
                    <input value={rulesDraft.marketing_opt_out_line ?? ''} maxLength={80} onChange={(e) => setRulesDraft((d) => ({ ...d, marketing_opt_out_line: e.target.value }))} placeholder="Empty = no line" style={inputStyle} />
                  </label>
                </div>
              </fieldset>
              <fieldset style={fieldsetStyle} data-testid="email-copy-rules">
                <legend style={legendStyle}>Email copies</legend>
                <p style={{ ...panelNote, margin: '0 0 10px' }}>
                  Every text that goes out also goes by email to the person's saved address: the customer account for customers,
                  the staff account for staff and owner alerts. Free to send; the hourly cap protects the mail server, and promotions use at most half of it.
                </p>
                <div className="sms-cc-fields">
                  <label style={{ ...fieldLabel, flexDirection: 'row', alignItems: 'center', minWidth: 0 }}>
                    <input type="checkbox" checked={rulesDraft.email_copy_customers ?? true} onChange={(e) => setRulesDraft((d) => ({ ...d, email_copy_customers: e.target.checked }))} />
                    Customers
                  </label>
                  <label style={{ ...fieldLabel, flexDirection: 'row', alignItems: 'center', minWidth: 0 }}>
                    <input type="checkbox" checked={rulesDraft.email_copy_staff ?? true} onChange={(e) => setRulesDraft((d) => ({ ...d, email_copy_staff: e.target.checked }))} />
                    Staff and owner alerts
                  </label>
                  <label style={{ ...fieldLabel, flexDirection: 'row', alignItems: 'center', minWidth: 0 }}>
                    <input type="checkbox" checked={rulesDraft.email_copy_marketing ?? true} onChange={(e) => setRulesDraft((d) => ({ ...d, email_copy_marketing: e.target.checked }))} />
                    Promotions (with unsubscribe link)
                  </label>
                  <label style={fieldLabel}>
                    Emails per hour, all together (0 = no cap)
                    <input type="number" min={0} max={100000} value={rulesDraft.email_copy_hourly_cap ?? 300} onChange={(e) => setRulesDraft((d) => ({ ...d, email_copy_hourly_cap: Math.max(0, Math.min(100000, Number(e.target.value) || 0)) }))} style={inputStyle} />
                  </label>
                </div>
              </fieldset>
              <fieldset style={fieldsetStyle}>
                <legend style={legendStyle}>Log</legend>
                <div className="sms-cc-fields">
                  <label style={fieldLabel}>
                    Keep the log for (days, 0 = forever)
                    <input type="number" min={0} max={3650} value={rulesDraft.log_retention_days ?? 365} onChange={(e) => setRulesDraft((d) => ({ ...d, log_retention_days: Math.max(0, Math.min(3650, Number(e.target.value) || 0)) }))} style={inputStyle} />
                  </label>
                </div>
              </fieldset>
              <div>
                <Btn variant="secondary" onClick={() => void saveRules()} disabled={rulesSaving}>
                  {rulesSaving ? 'Saving…' : 'Save rules'}
                </Btn>
              </div>
            </div>
          )}
        </section>
      )}

      {!loading && queue && (
        <section style={panelStyle}>
          <h3 style={sectionTitle}>Campaign queue health</h3>
          <p style={{ ...panelLead, marginBottom: 8 }}>
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
            <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--color-text-secondary)' }}>
              {queue.campaigns.map((c) => (
                <li key={c.id}>#{c.id} {c.name} — pending {c.pending}/{c.total}, failed {c.failed}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      {killModalOpen && (
        <Modal
          onClose={() => !killPending && setKillModalOpen(false)}
          title={killSwitch ? 'Turn off global kill switch?' : 'Enable global kill switch?'}
        >
          <p style={{ margin: '0 0 16px', fontSize: 14, color: 'var(--color-text)', lineHeight: 1.5 }}>{KILL_SWITCH_WARNING}</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Btn variant="secondary" onClick={() => setKillModalOpen(false)} disabled={killPending}>Cancel</Btn>
            <Btn variant="danger" onClick={() => void confirmKillSwitch()} disabled={killPending}>
              {killPending ? 'Saving…' : killSwitch ? 'Turn off' : 'Enable kill switch'}
            </Btn>
          </div>
        </Modal>
      )}
    </PageShell>
  );
}

function Tile({ label, tone, children }: { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger'; children: React.ReactNode }) {
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

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className={`sms-cc-chip${on ? ' is-on' : ''}`}>
      {children}
    </button>
  );
}

function TypeRow({
  row, expanded, onExpand, onToggle, onEmailToggle, saving, canToggle, canToggleEmail, canEdit, canTest, myPhone, permissionOptions, staffOptions, onUpdated, onError,
}: {
  row: SmsControlCenterType;
  expanded: boolean;
  onExpand: () => void;
  onToggle: () => void;
  onEmailToggle: () => void;
  saving: boolean;
  canToggle: boolean;
  canToggleEmail: boolean;
  canEdit: boolean;
  canTest: boolean;
  myPhone: string | null;
  permissionOptions: Array<{ slug: string; name: string }>;
  staffOptions: SmsStaffOption[];
  onUpdated: (patch: Partial<SmsControlCenterType>) => void;
  onError: (msg: string) => void;
}) {
  const systemOnly = row.send_permission == null;
  const smsOff = !row.enabled && !row.always_on;
  // A type with its own fuller email (sign-in code, order confirmed…) keeps
  // that email whatever the switches say; a copy follows the Email switch.
  const emailOn = row.has_own_email ? true : (row.email_enabled ?? true);
  const off = smsOff && !emailOn;
  const alsoLink = row.also_needs ? linkForAlsoNeeds(row.also_needs) : null;

  return (
    <div className={`sms-cc-row${off ? ' is-off' : ''}`} data-testid={`sms-type-${row.key}`}>
      <div className="sms-cc-row-main">
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: 'var(--color-text)' }}>{row.label}</p>
            {row.always_on
              ? <span style={badgeStyle('var(--color-border-light)', 'var(--color-info)')}>Always on</span>
              : off
                ? <span style={badgeStyle('var(--color-border-light)', 'var(--color-text-muted)')}>Off</span>
                : smsOff
                  ? <span style={badgeStyle('var(--color-border-light)', 'var(--color-info)')} data-testid={`email-only-${row.key}`}>Email only</span>
                  : null}
          </div>
          <p style={rowLine}>
            Recipients: {row.recipients || '—'}
            {row.recipients_configurable && row.recipients_config && (
              <> · now: {RECIPIENT_MODE_LABELS[row.recipients_config.mode]}{row.recipients_resolved && row.recipients_resolved.length > 0 ? ` (${row.recipients_resolved.join(', ')})` : ''}</>
            )}
          </p>
          {row.also_needs && (
            <p style={{ ...rowLine, color: 'var(--color-warning-strong)' }} data-testid={`also-needs-${row.key}`}>
              Also needs: {row.also_needs}
              {alsoLink && <> · <Link to={alsoLink.to} style={{ color: 'var(--color-primary)' }}>Open {alsoLink.label}</Link></>}
            </p>
          )}
          <p style={{ ...rowLine, color: 'var(--color-text-muted)' }}>
            Who can send: {row.send_permission_label}
            {!systemOnly && row.roles_with_permission.length > 0 && <> · {row.roles_with_permission.join(', ')}</>}
            {expanded && (
              <>
                {' · '}
                <Link to="/settings/permissions" style={{ color: 'var(--color-primary)' }}>Roles & Permissions</Link>
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
              <button
                type="button"
                onClick={onToggle}
                disabled={!canToggle || saving}
                aria-label={`Toggle ${row.label}`}
                aria-pressed={row.enabled}
                className={`sms-cc-switch${row.enabled ? ' is-on' : ''}`}
                style={{ cursor: !canToggle || saving ? 'not-allowed' : 'pointer', opacity: !canToggle ? 0.55 : 1 }}
              >
                <span className="sms-cc-switch-knob" />
              </button>
            )}
          </div>
          <div className="sms-cc-channel">
            <span className="sms-cc-channel-label">Email</span>
            {row.has_own_email ? (
              <span style={badgeStyle('var(--color-border-light)', 'var(--color-text-muted)')} title="Sends its own email, separate from the SMS">Own email</span>
            ) : (
              <button
                type="button"
                onClick={onEmailToggle}
                disabled={!canToggleEmail || saving}
                aria-label={`Toggle email for ${row.label}`}
                aria-pressed={emailOn}
                className={`sms-cc-switch${emailOn ? ' is-on' : ''}`}
                style={{ cursor: !canToggleEmail || saving ? 'not-allowed' : 'pointer', opacity: !canToggleEmail ? 0.55 : 1 }}
              >
                <span className="sms-cc-switch-knob" />
              </button>
            )}
          </div>
          <button type="button" onClick={onExpand} className="sms-cc-edit" aria-expanded={expanded}>
            {expanded ? 'Hide controls' : 'Edit'}
          </button>
        </div>
      </div>

      {expanded && (
        <TypeEditor
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

function TypeEditor({
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

  const displayBody = body;
  const count = smsCharCount(displayBody || ' ');
  const unicodeOffenders = count.isUnicode ? nonGsm7Characters(displayBody) : [];
  const variables = row.template?.variables ?? [];
  const hasTemplate = !!row.template;
  const bodyDirty = hasTemplate && displayBody !== (row.template?.body ?? '');

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
      const res = await updateSmsType(row.key, { send_permission: next === '__system__' ? '__system__' : next });
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

  const sendTest = async () => {
    if (!canTest) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testSmsType(row.key, bodyDirty ? { body: displayBody } : {});
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
              value={displayBody}
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
          {row.code_fallback_note && displayBody.trim() === '' && (
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
            {row.user_initiated ? 'The message is written when it is sent.' : 'The system writes this message when it happens.'}
          </p>
          {canTest && (
            <button type="button" onClick={() => void sendTest()} disabled={testing} style={secondaryBtn} title={myPhone ? `Sends to ${myPhone}` : 'Your staff account needs a phone number'}>
              {testing ? 'Sending…' : 'Send me a test'}
            </button>
          )}
        </div>
      )}

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

function badgeStyle(bg: string, color: string): CSSProperties {
  return { fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 999, background: bg, color };
}

const panelStyle: CSSProperties = {
  background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '14px 16px', marginBottom: 18,
};
const sectionTitle: CSSProperties = { margin: '0 0 8px', fontSize: 14, fontWeight: 700, color: 'var(--color-text)' };
const panelLead: CSSProperties = { margin: '0 0 12px', fontSize: 13, color: 'var(--color-text-secondary)' };
const panelNote: CSSProperties = { margin: '0 0 12px', fontSize: 12, color: 'var(--color-text-muted)' };
const rowLine: CSSProperties = { margin: '4px 0 0', fontSize: 12, color: 'var(--color-text-secondary)' };
const tileLink: CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--color-primary)', marginTop: 2 };
const fieldsetStyle: CSSProperties = { border: '1px solid var(--color-border-light)', borderRadius: 8, padding: '8px 12px 12px', margin: 0, minWidth: 0 };
const legendStyle: CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--color-text)', padding: '0 4px' };
const fieldLabel: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--color-text-secondary)', minWidth: 160 };
const inputStyle: CSSProperties = { minHeight: 44, border: '1px solid var(--color-border)', borderRadius: 8, padding: '8px 10px', fontSize: 14, fontFamily: 'inherit' };
const secondaryBtn: CSSProperties = {
  minHeight: 40, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-surface)',
  fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--color-text)',
};
const primaryBtn: CSSProperties = {
  ...secondaryBtn, background: 'var(--color-primary)', borderColor: 'var(--color-primary)',
  color: '#fff', // on-primary text; not a surface token
  fontWeight: 600,
};

export default SmsControlCenterPage;
