import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Search } from 'lucide-react';
import { updateSmsType, type SmsControlCenterType } from '../../api';
import { fetchTelegram, updateTelegramSettings, type TelegramSettings } from '../../api/telegram';
import { Switch } from '../../components/SharedUI';
import { useCurrentUserPermissions } from '../../hooks/usePermissions';
import { MessageRow } from './MessageRow';
import {
  CATEGORY_HELP, CATEGORY_LABELS, CATEGORY_ORDER, Chip, Tile, badgeStyle, errorBox, inputStyle, rowIsOn, rowLine, tileLink,
  useControlCenter, type Category,
} from './shared';

/*
 * Notifications → Messages: every text, email and Telegram alert the
 * system sends, one row each with its own SMS, Email and Telegram
 * switches (notifications audit, 2026-10-10). Those switches are the only
 * ones: the second switches on Purchasing, Delivery, the Complaint box,
 * the Social Hub and TV Signage are gone, and "when it sends" numbers sit
 * in the row under Edit. The three alerts that exist only on Telegram are
 * rows here too, under "Telegram only".
 */

type StatusFilter = 'all' | 'on' | 'off';
type Group = Category | 'telegram';

/** Telegram-only alerts (2026-10-07): no SMS or email version exists. */
const TELEGRAM_ONLY: Array<{ key: keyof TelegramSettings; label: string; goesTo: string; what: string }> = [
  {
    key: 'day_report',
    label: 'Owner: day report when the last shift closes',
    goesTo: 'Linked owners, and linked managers who can see reports',
    what: 'Sales, payments, best sellers, each shift\'s drawer and refunds still owed, once a day.',
  },
  {
    key: 'alert_voids',
    label: 'Owner: order cancelled at the till',
    goesTo: 'Linked owners, and linked managers who can see reports',
    what: 'Who cancelled it, the total, the reason, and whether money had been paid.',
  },
  {
    key: 'alert_cash',
    label: 'Owner: cash taken out of a drawer',
    goesTo: 'Linked owners, and linked managers who can see reports',
    what: 'Cash out and paid out, with who, how much and why; and when one is struck through.',
  },
];

export function MessagesTab() {
  const { can, user } = useCurrentUserPermissions();
  const canManage = can('sms.settings.manage');
  const canEditTemplates = can('sms.templates.edit') || canManage;
  const canView = canManage || can('sms.logs.view');
  const canTelegram = can('telegram.manage');
  const isOwner = user?.role === 'owner';

  const { data, setData, loading, error, setError } = useControlCenter(canView);
  const [tg, setTg] = useState<TelegramSettings | null>(null);
  const [tgError, setTgError] = useState('');
  const [tgBusy, setTgBusy] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  // ?q=complaint from another page's "Alerts" opens the list already narrowed.
  const [query, setQuery] = useState(() => searchParams.get('q') ?? '');
  const [group, setGroup] = useState<Group | 'all'>(() => {
    const g = searchParams.get('group');
    return g === 'telegram' || (CATEGORY_ORDER as readonly string[]).includes(g ?? '') ? (g as Group) : 'all';
  });
  const [status, setStatus] = useState<StatusFilter>('all');

  useEffect(() => {
    if (!canTelegram) return;
    fetchTelegram()
      .then((d) => setTg(d.settings))
      .catch((e: unknown) => setTgError((e as Error).message || 'Could not load the Telegram alerts.'));
  }, [canTelegram]);

  // A link from another page (?open=owner_gst_filing_due) lands on that row, open.
  const openKey = searchParams.get('open');
  useEffect(() => {
    if (!openKey || !data) return;
    const row = data.types.find((t) => t.key === openKey);
    if (row) {
      setQuery(row.label);
      setExpandedKey(row.key);
    }
  }, [openKey, data]);

  const types = data?.types ?? [];
  const patchRow = (key: string, patch: Partial<SmsControlCenterType>) => {
    setData((prev) => (prev ? { ...prev, types: prev.types.map((t) => (t.key === key ? { ...t, ...patch } : t)) } : prev));
  };

  const toggle = async (row: SmsControlCenterType, channel: 'sms' | 'email' | 'telegram') => {
    if (!canManage) return;
    if (channel === 'sms' && row.always_on) return;
    if (channel === 'email' && row.has_own_email) return;
    if (channel === 'telegram' && !row.telegram_applies) return;
    setSavingKey(row.key);
    try {
      if (channel === 'sms') {
        const res = await updateSmsType(row.key, { enabled: !row.enabled });
        patchRow(row.key, { enabled: !!res.enabled });
      } else if (channel === 'email') {
        const next = !(row.email_enabled ?? true);
        const res = await updateSmsType(row.key, { email_enabled: next });
        patchRow(row.key, { email_enabled: res.email_enabled ?? next });
      } else {
        const next = !(row.telegram_enabled ?? true);
        const res = await updateSmsType(row.key, { telegram_enabled: next });
        patchRow(row.key, { telegram_enabled: res.telegram_enabled ?? next });
      }
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setSavingKey(null);
    }
  };

  const saveTelegram = async (key: string, patch: Partial<TelegramSettings>) => {
    setTgBusy(key);
    setTgError('');
    try {
      const res = await updateTelegramSettings(patch);
      setTg(res.settings);
    } catch (e: unknown) {
      setTgError((e as Error).message || 'Could not save.');
    } finally {
      setTgBusy(null);
    }
  };

  const q = query.trim().toLowerCase();
  const matches = (t: SmsControlCenterType) => {
    if (group !== 'all' && t.category !== group) return false;
    if (status === 'on' && !rowIsOn(t)) return false;
    if (status === 'off' && rowIsOn(t)) return false;
    if (!q) return true;
    return [t.label, t.key, t.recipients, t.send_permission_label].some((s) => s.toLowerCase().includes(q));
  };

  const grouped = useMemo(() => CATEGORY_ORDER.map((cat) => {
    const all = types.filter((t) => t.category === cat);
    return {
      category: cat,
      label: CATEGORY_LABELS[cat],
      help: CATEGORY_HELP[cat],
      total: all.length,
      on: all.filter(rowIsOn).length,
      rows: all.filter(matches),
    };
  }).filter((g) => g.total > 0), [types, group, status, q]); // eslint-disable-line react-hooks/exhaustive-deps

  const telegramRows = useMemo(() => {
    if (!tg) return [];
    return TELEGRAM_ONLY.filter((r) => {
      const on = tg[r.key] !== false;
      if (group !== 'all' && group !== 'telegram') return false;
      if (status === 'on' && !on) return false;
      if (status === 'off' && on) return false;
      return !q || `${r.label} ${r.goesTo} telegram`.toLowerCase().includes(q);
    });
  }, [tg, group, status, q]);

  const shown = grouped.reduce((n, g) => n + g.rows.length, 0) + telegramRows.length;
  const offCount = types.filter((t) => !rowIsOn(t)).length + (tg ? TELEGRAM_ONLY.filter((r) => tg[r.key] === false).length : 0);
  const totalCount = types.length + (tg ? TELEGRAM_ONLY.length : 0);
  const telegramRowsExist = types.some((t) => t.telegram_applies);

  const killSwitch = !!data?.global_kill_switch;
  const quietNow = !!data?.quiet_now;
  const sendingLabel = killSwitch ? 'Stopped' : data?.demo_mode ? 'Demo mode' : quietNow ? 'On · quiet hours now' : 'On';
  const sendingTone = killSwitch ? 'danger' : data?.demo_mode || quietNow ? 'warning' : 'success';
  const budget = data?.budget;
  const ownerPhones = data?.owner_phones ?? [];
  const deferredCount = data?.deferred_count ?? 0;

  return (
    <>
      {error && <p role="alert" style={errorBox}>{error}</p>}

      {killSwitch && (
        <div style={{
          display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 14px', marginBottom: 16,
          borderRadius: 10, background: 'var(--color-danger-bg)', border: '1px solid var(--color-danger)',
          color: 'var(--color-danger-strong)', fontSize: 13,
        }}>
          <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <strong>Stop all SMS is on.</strong> No texts go out, login codes included; emails and Telegram still do.
            {' '}<Link to="/notifications/rules" style={{ color: 'inherit', fontWeight: 700 }}>Rules</Link>
          </div>
        </div>
      )}

      {canView && !loading && data && (
        <section className="sms-cc-overview" data-testid="sms-overview" aria-label="At a glance">
          <Tile label="Sending" tone={sendingTone}>
            {sendingLabel}
            {deferredCount > 0 && <span style={{ display: 'block', fontSize: 12, fontWeight: 500 }}>{deferredCount} waiting for quiet hours to end</span>}
          </Tile>
          <Tile label="Business phone" tone={data.business_phone ? 'neutral' : 'warning'}>
            {data.business_phone ?? 'Not set'}
            <Link to="/settings/business" style={tileLink}>{data.business_phone ? 'Change' : 'Set it in Business details'}</Link>
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
                {' · '}<Link to="/notifications/rules" style={{ color: 'var(--color-primary)' }}>Rules</Link>
              </span>
            </Tile>
          )}
        </section>
      )}

      {canView && data && telegramRowsExist && (data.telegram_alerts_on === false || data.telegram_bot_ready === false) && (
        <p className="nc-banner is-warn" data-testid="telegram-off-banner">
          {data.telegram_alerts_on === false
            ? <>Telegram alerts are switched off, so the Telegram switches below send nothing. <Link to="/notifications/rules" style={{ color: 'inherit' }}>Switch them on in Rules</Link>.</>
            : <>No Telegram bot is set up yet, so the Telegram switches below send nothing. <Link to="/telegram" style={{ color: 'inherit' }}>Set one up in Telegram</Link>.</>}
        </p>
      )}

      {(!loading || tg) && (
        <div className="sms-cc-toolbar" data-testid="sms-toolbar">
          <label className="sms-cc-search">
            <Search size={15} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search, e.g. refund, shift, stock, owner"
              aria-label="Search messages"
            />
          </label>
          <div className="sms-cc-chips" role="group" aria-label="Category">
            <Chip on={group === 'all'} onClick={() => setGroup('all')}>All <small>{totalCount}</small></Chip>
            {CATEGORY_ORDER.filter((c) => types.some((t) => t.category === c)).map((c) => (
              <Chip key={c} on={group === c} onClick={() => setGroup(c)}>
                {CATEGORY_LABELS[c]} <small>{types.filter((t) => t.category === c).length}</small>
              </Chip>
            ))}
            {tg && (
              <Chip on={group === 'telegram'} onClick={() => setGroup('telegram')}>Telegram only <small>{TELEGRAM_ONLY.length}</small></Chip>
            )}
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

      {loading && !tg ? (
        <p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
      ) : shown === 0 ? (
        <p style={{ color: 'var(--color-text-muted)', padding: '20px 0' }}>Nothing matches. Clear the search or pick another group.</p>
      ) : (
        <>
          {grouped.filter((g) => g.rows.length > 0).map((g) => (
            <section key={g.category} style={{ marginBottom: 28 }} aria-labelledby={`sms-cat-${g.category}`}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', margin: '0 0 4px' }}>
                <h2 id={`sms-cat-${g.category}`} style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--color-text)' }}>
                  {g.label}
                </h2>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                  {g.on} of {g.total} on{g.rows.length !== g.total ? ` · showing ${g.rows.length}` : ''}
                </span>
              </div>
              <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--color-text-muted)' }}>{g.help}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {g.rows.map((row) => (
                  <MessageRow
                    key={row.key}
                    row={row}
                    expanded={expandedKey === row.key}
                    onExpand={() => setExpandedKey((k) => (k === row.key ? null : row.key))}
                    onToggle={() => void toggle(row, 'sms')}
                    onEmailToggle={() => void toggle(row, 'email')}
                    onTelegramToggle={() => void toggle(row, 'telegram')}
                    saving={savingKey === row.key}
                    canToggle={canManage}
                    canEdit={canEditTemplates && canManage}
                    canTest={canManage}
                    myPhone={data?.my_phone ?? null}
                    permissionOptions={data?.permission_options ?? []}
                    staffOptions={data?.staff_options ?? []}
                    onUpdated={(patch) => patchRow(row.key, patch)}
                    onError={setError}
                  />
                ))}
              </div>
            </section>
          ))}

          {telegramRows.length > 0 && tg && (
            <section style={{ marginBottom: 28 }} aria-labelledby="sms-cat-telegram" data-testid="telegram-only">
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', margin: '0 0 4px' }}>
                <h2 id="sms-cat-telegram" style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--color-text)' }}>Telegram only</h2>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                  {TELEGRAM_ONLY.filter((r) => tg[r.key] !== false).length} of {TELEGRAM_ONLY.length} on
                </span>
              </div>
              <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--color-text-muted)' }}>
                Alerts with no SMS or email version, to people who have linked Telegram.
                {tg.alerts_enabled === false && <strong style={{ color: 'var(--color-warning-strong)' }}> Telegram alerts are switched off in Rules, so these send nothing.</strong>}
              </p>
              {tgError && <p role="alert" style={errorBox}>{tgError}</p>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {telegramRows.map((r) => {
                  const on = tg[r.key] !== false;
                  return (
                    <div key={r.key} className={`sms-cc-row${on ? '' : ' is-off'}`} data-testid={`telegram-only-${r.key}`}>
                      <div className="sms-cc-row-main">
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: 'var(--color-text)' }}>{r.label}</p>
                            {!on && <span style={badgeStyle('var(--color-border-light)', 'var(--color-text-muted)')}>Off</span>}
                          </div>
                          <p style={rowLine}>Goes to: {r.goesTo}</p>
                          <p style={{ ...rowLine, color: 'var(--color-text-muted)' }}>{r.what}</p>
                          {r.key === 'alert_cash' && (
                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 12, color: 'var(--color-text-secondary)', flexWrap: 'wrap' }}>
                              From MVR
                              <input
                                type="number"
                                min={0}
                                step={1}
                                defaultValue={tg.alert_cash_min ?? 0}
                                disabled={tgBusy !== null || !on}
                                aria-label="Cash alert from amount"
                                style={{ ...inputStyle, width: 110 }}
                                onBlur={(e) => {
                                  const v = Math.max(0, Number(e.target.value) || 0);
                                  if (v !== (tg.alert_cash_min ?? 0)) void saveTelegram('cash-min', { alert_cash_min: v });
                                }}
                              />
                              <span style={{ color: 'var(--color-text-muted)' }}>0 = every one</span>
                            </label>
                          )}
                        </div>
                        <div className="sms-cc-row-actions">
                          <div className="sms-cc-channel">
                            <span className="sms-cc-channel-label">Telegram</span>
                            <Switch
                              checked={on}
                              onChange={() => void saveTelegram(r.key, { [r.key]: !on } as Partial<TelegramSettings>)}
                              disabled={tgBusy !== null}
                              aria-label={`Toggle Telegram for ${r.label}`}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}

      {!canView && !canTelegram && (
        <p style={{ color: 'var(--color-text-muted)' }}>You need the SMS log or settings permission to see this.</p>
      )}
      {!isOwner && canView && !canManage && (
        <p style={{ ...rowLine, color: 'var(--color-text-muted)' }}>You can see these, but changing them needs Manage SMS settings.</p>
      )}
    </>
  );
}

export default MessagesTab;
