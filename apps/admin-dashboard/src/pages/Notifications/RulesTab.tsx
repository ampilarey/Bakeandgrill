import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ShieldOff } from 'lucide-react';
import {
  updateSmsBudget,
  updateSmsDeliveryRules,
  updateSmsGlobalKillSwitch,
  type SmsDeliveryRules,
} from '../../api';
import { fetchTelegram, updateTelegramSettings } from '../../api/telegram';
import { Btn, Modal, Switch } from '../../components/SharedUI';
import { useCurrentUserPermissions } from '../../hooks/usePermissions';
import {
  DEFAULT_RULES, KILL_SWITCH_WARNING, errorBox, fieldLabel, fieldsetStyle, inputStyle, legendStyle,
  panelLead, panelNote, panelStyle, sectionTitle, useControlCenter,
} from './shared';

/*
 * Notifications → Rules: what applies to every message at once
 * (notifications audit, 2026-10-10). Stop all SMS, Telegram alerts on or
 * off (it was on the Telegram page), the monthly spending limit, quiet
 * hours, limits, the hourly email limit and how long the log is kept. The
 * three "email copies" switches are gone (re-audit): a message's Email
 * switch on Messages is its only one.
 */

export function RulesTab() {
  const { can, user } = useCurrentUserPermissions();
  const canManage = can('sms.settings.manage');
  const canView = canManage || can('sms.logs.view');
  const canTelegram = can('telegram.manage');
  const isOwner = user?.role === 'owner';

  const { data, setData, loading, error, setError } = useControlCenter(canView);
  const [killModalOpen, setKillModalOpen] = useState(false);
  const [killPending, setKillPending] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState({ monthly: '', campaign: '' });
  const [budgetSaving, setBudgetSaving] = useState(false);
  const [rulesDraft, setRulesDraft] = useState<SmsDeliveryRules>(DEFAULT_RULES);
  const [rulesSaving, setRulesSaving] = useState(false);
  const [tgOn, setTgOn] = useState<boolean | null>(null);
  const [tgBots, setTgBots] = useState<number | null>(null);
  const [tgBusy, setTgBusy] = useState(false);
  const [tgError, setTgError] = useState('');

  useEffect(() => {
    if (!data) return;
    setRulesDraft(data.delivery_rules ?? DEFAULT_RULES);
    setBudgetDraft({
      monthly: data.budget?.monthly_segment_ceiling != null ? String(data.budget.monthly_segment_ceiling) : '',
      campaign: data.budget?.per_campaign_segment_ceiling != null ? String(data.budget.per_campaign_segment_ceiling) : '',
    });
  }, [data]);

  useEffect(() => {
    if (!canTelegram) return;
    fetchTelegram()
      .then((d) => { setTgOn(d.settings.alerts_enabled); setTgBots(d.bots.filter((b) => b.is_enabled).length); })
      .catch((e: unknown) => setTgError((e as Error).message || 'Could not load Telegram.'));
  }, [canTelegram]);

  const rules = data?.delivery_rules ?? DEFAULT_RULES;
  const budget = data?.budget;
  const queue = data?.campaign_queue;
  const killSwitch = !!data?.global_kill_switch;
  const quietNow = !!data?.quiet_now;
  const deferredCount = data?.deferred_count ?? 0;
  // Read-only for anyone without telegram.manage: the list says it, Telegram's own page changes it.
  const telegramOn = tgOn ?? data?.telegram_alerts_on ?? null;

  const confirmKillSwitch = async () => {
    if (!isOwner || !canManage) return;
    setKillPending(true);
    try {
      const res = await updateSmsGlobalKillSwitch(!killSwitch);
      setData((prev) => (prev ? { ...prev, global_kill_switch: res.global_kill_switch } : prev));
      setKillModalOpen(false);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setKillPending(false);
    }
  };

  const saveBudget = async () => {
    if (!canManage) return;
    setBudgetSaving(true);
    setError('');
    try {
      const res = await updateSmsBudget({
        monthly_segment_ceiling: budgetDraft.monthly.trim() === '' ? null : Number(budgetDraft.monthly),
        per_campaign_segment_ceiling: budgetDraft.campaign.trim() === '' ? null : Number(budgetDraft.campaign),
      });
      setData((prev) => (prev ? { ...prev, budget: res.budget } : prev));
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setBudgetSaving(false);
    }
  };

  const saveRules = async () => {
    if (!canManage) return;
    setRulesSaving(true);
    setError('');
    try {
      const res = await updateSmsDeliveryRules(rulesDraft);
      setData((prev) => (prev ? { ...prev, delivery_rules: res.delivery_rules, quiet_now: res.quiet_now } : prev));
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setRulesSaving(false);
    }
  };

  const toggleTelegram = async () => {
    if (!canTelegram || tgOn === null) return;
    setTgBusy(true);
    setTgError('');
    try {
      const res = await updateTelegramSettings({ alerts_enabled: !tgOn });
      setTgOn(res.settings.alerts_enabled);
      setData((prev) => (prev ? { ...prev, telegram_alerts_on: res.settings.alerts_enabled } : prev));
    } catch (e: unknown) {
      setTgError((e as Error).message || 'Could not save.');
    } finally {
      setTgBusy(false);
    }
  };

  if (loading) return <p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>;

  return (
    <>
      {error && <p role="alert" style={errorBox}>{error}</p>}

      {canView && (
        <section style={panelStyle} data-testid="stop-all-sms">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 260px', minWidth: 0 }}>
              <h3 style={sectionTitle}>Stop all SMS</h3>
              <p style={{ ...panelLead, marginBottom: 0 }}>
                {killSwitch
                  ? 'On: no texts go out, login codes included. Emails and Telegram still go.'
                  : 'Off: texts go out as each message\'s switches say.'}
                {!isOwner && ' Only the owner can change this.'}
              </p>
            </div>
            {isOwner && (
              <Btn
                variant={killSwitch ? 'danger' : 'secondary'}
                onClick={() => setKillModalOpen(true)}
                disabled={!canManage}
              >
                <ShieldOff size={14} style={{ marginRight: 6 }} />
                {killSwitch ? 'Stop all SMS is ON' : 'Stop all SMS'}
              </Btn>
            )}
          </div>
          {killSwitch && (
            <div style={{
              display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', marginTop: 12,
              borderRadius: 8, background: 'var(--color-danger-bg)', border: '1px solid var(--color-danger)',
              color: 'var(--color-danger-strong)', fontSize: 13,
            }}>
              <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>{KILL_SWITCH_WARNING}</div>
            </div>
          )}
        </section>
      )}

      {(canTelegram || telegramOn !== null) && (
        <section style={panelStyle} data-testid="telegram-alerts-rule">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <h3 style={sectionTitle}>Telegram alerts</h3>
              <p style={{ ...panelLead, marginBottom: 0 }}>
                Staff and owner alerts, and discount approval codes, also go to each person's Telegram when they have linked it
                and the message's Telegram switch is on. Off here, nothing goes to Telegram.
                {canTelegram && tgBots === 0 && <> No bot is set up yet: <Link to="/telegram" style={{ color: 'var(--color-primary)', fontWeight: 600 }}>set one up in Telegram</Link>.</>}
                {!canTelegram && ' Changed by whoever manages Telegram.'}
              </p>
            </div>
            {telegramOn !== null && (
              <Switch
                checked={telegramOn}
                onChange={() => void toggleTelegram()}
                disabled={!canTelegram || tgBusy || tgOn === null}
                aria-label="Telegram alerts"
              />
            )}
          </div>
          {tgError && <p role="alert" style={{ ...errorBox, margin: '10px 0 0' }}>{tgError}</p>}
        </section>
      )}

      {canView && budget && (
        <section style={panelStyle}>
          <h3 style={sectionTitle}>Spending limit</h3>
          <p style={panelLead}>
            This month: {budget.period_segments_used} segments · MVR {budget.period_cost_mvr.toFixed(2)}
            {budget.monthly_segment_ceiling != null && (
              <> · Limit {budget.monthly_segment_ceiling} ({budget.monthly_remaining ?? 0} left)</>
            )}
            {budget.monthly_exhausted && (
              <span style={{ color: 'var(--color-danger-strong)', fontWeight: 600 }}> · Limit reached</span>
            )}
            {budget.period_blocked_count > 0 && <> · {budget.period_blocked_count} blocked</>}
          </p>
          <p style={panelNote}>
            A segment is one 160-character text (70 for Dhivehi). Login codes are never blocked by the limit, but still count.
          </p>
          {canManage && (
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
                {budgetSaving ? 'Saving…' : 'Save limits'}
              </Btn>
            </div>
          )}
        </section>
      )}

      {canView && (
        <section style={panelStyle} data-testid="delivery-rules">
          <h3 style={sectionTitle}>Delivery rules</h3>
          <p style={panelLead}>
            {rules.quiet_hours_enabled
              ? `Quiet hours ${rules.quiet_hours_start}–${rules.quiet_hours_end}: marketing texts${rules.quiet_hours_alerts ? ' and staff and owner alerts (except a till waiting for approval and shift reminders)' : ''} wait until the window ends.`
              : 'Quiet hours off: texts go out whenever they are triggered.'}
            {quietNow && <span style={{ color: 'var(--color-warning-strong)', fontWeight: 600 }}> · Quiet now</span>}
            {deferredCount > 0 && <> · {deferredCount} waiting</>}
            {' · '}Marketing limit: {rules.marketing_daily_cap === 0 ? 'off' : `${rules.marketing_daily_cap} a day per number`}
            {' · '}Campaign limit: {!rules.bulk_daily_recipient_cap ? 'off' : `${rules.bulk_daily_recipient_cap.toLocaleString()} recipients a day`}
            {' · '}Emails: {(rules.email_copy_hourly_cap ?? 300) > 0 ? `up to ${(rules.email_copy_hourly_cap ?? 300).toLocaleString()} an hour` : 'no hourly limit'}
          </p>
          <p style={panelNote}>
            Login and approval codes, and order and payment texts to customers, are never held. The marketing limit counts every marketing text to one number in a rolling day, whatever sends it.
          </p>
          {canManage && (
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
                    Hold staff and owner alerts too, order alerts included (a till waiting for approval and shift reminders still go)
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
                    Campaign recipients per day, all campaigns (0 = no limit)
                    <input type="number" min={0} max={1000000} value={rulesDraft.bulk_daily_recipient_cap ?? 5000} onChange={(e) => setRulesDraft((d) => ({ ...d, bulk_daily_recipient_cap: Math.max(0, Math.min(1000000, Number(e.target.value) || 0)) }))} style={inputStyle} />
                  </label>
                  <label style={{ ...fieldLabel, flex: '1 1 220px' }}>
                    Unsubscribe line on marketing texts ({'{url}'} = the short link)
                    <input value={rulesDraft.marketing_opt_out_line ?? ''} maxLength={80} onChange={(e) => setRulesDraft((d) => ({ ...d, marketing_opt_out_line: e.target.value }))} placeholder="Empty = no line" style={inputStyle} />
                  </label>
                </div>
              </fieldset>
              <fieldset style={fieldsetStyle} data-testid="email-copy-rules">
                <legend style={legendStyle}>Emails</legend>
                <p style={{ ...panelNote, margin: '0 0 10px' }}>
                  Whether a message goes by email is its own Email switch on Messages, and nothing else. Email is free to send; this
                  hourly limit protects the mail server, and promotions use at most half of it.
                </p>
                <div className="sms-cc-fields">
                  <label style={fieldLabel}>
                    Emails per hour, all together (0 = no limit)
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

      {canView && queue && (
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
              Stalled sends usually mean the queue worker is down; check <Link to="/system-health" style={{ color: 'inherit', fontWeight: 600 }}>System Health</Link>.
            </p>
          )}
          {queue.campaigns.length > 0 && (
            <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--color-text-secondary)' }}>
              {queue.campaigns.map((c) => (
                <li key={c.id}>#{c.id} {c.name}: pending {c.pending}/{c.total}, failed {c.failed}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      {killModalOpen && (
        <Modal
          onClose={() => !killPending && setKillModalOpen(false)}
          title={killSwitch ? 'Let texts go out again?' : 'Stop all SMS?'}
        >
          <p style={{ margin: '0 0 16px', fontSize: 14, color: 'var(--color-text)', lineHeight: 1.5 }}>{KILL_SWITCH_WARNING}</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <Btn variant="secondary" onClick={() => setKillModalOpen(false)} disabled={killPending}>Cancel</Btn>
            <Btn variant="danger" onClick={() => void confirmKillSwitch()} disabled={killPending}>
              {killPending ? 'Saving…' : killSwitch ? 'Turn it off' : 'Stop all SMS'}
            </Btn>
          </div>
        </Modal>
      )}
    </>
  );
}

export default RulesTab;
