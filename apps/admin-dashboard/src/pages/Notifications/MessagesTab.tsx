import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { updateSmsType, type SmsControlCenterType } from '../../api';
import { useCurrentUserPermissions } from '../../hooks/usePermissions';
import { useIsMobile } from '../../hooks/useIsMobile';
import { MessageRow } from './MessageRow';
import {
  CATEGORY_HELP, CATEGORY_LABELS, CATEGORY_ORDER, Chip, Tile, audienceSummary, errorBox, isTelegramOnly, rowIsOn, rowLine, tileLink,
  useControlCenter, type Category,
} from './shared';

/*
 * Notifications → Messages: every text, email and Telegram alert the
 * system sends, one row each with its own SMS, Email and Telegram
 * switches (notifications audit, 2026-10-10). Those switches are the only
 * ones. Each staff or owner alert says who gets it (groups, people,
 * exceptions, numbers) and opens to change it. The three alerts that exist
 * only on Telegram are rows too, under "Telegram only".
 *
 * On a phone the list is short: compact rows, groups folded until tapped,
 * one select instead of a row of chips, the overview tucked away.
 */

type StatusFilter = 'all' | 'on' | 'off';
type Group = Category | 'telegram';

const GROUP_ORDER: Group[] = [...CATEGORY_ORDER, 'telegram'];
const GROUP_LABEL: Record<Group, string> = { ...CATEGORY_LABELS, telegram: 'Telegram only' };
const GROUP_HELP: Record<Group, string> = { ...CATEGORY_HELP, telegram: 'Alerts with no SMS or email version, to people who have linked Telegram.' };

function groupOf(t: SmsControlCenterType): Group {
  return isTelegramOnly(t) ? 'telegram' : t.category;
}

export function MessagesTab() {
  const { can, user } = useCurrentUserPermissions();
  const canManage = can('sms.settings.manage');
  const canEditTemplates = can('sms.templates.edit') || canManage;
  const canView = canManage || can('sms.logs.view');
  const isOwner = user?.role === 'owner';
  const isMobile = useIsMobile();

  const { data, setData, loading, error, setError } = useControlCenter(canView);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  // ?q=complaint from another page's "Alerts" opens the list already narrowed.
  const [query, setQuery] = useState(() => searchParams.get('q') ?? '');
  const [group, setGroup] = useState<Group | 'all'>(() => {
    const g = searchParams.get('group');
    return (GROUP_ORDER as readonly string[]).includes(g ?? '') ? (g as Group) : 'all';
  });
  const [status, setStatus] = useState<StatusFilter>('all');
  // ?to=role:manager or ?to=user:12 (from People): the alerts that reach them.
  const [to, setTo] = useState(() => searchParams.get('to') ?? '');
  const [folded, setFolded] = useState<Record<string, boolean>>({});

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
  const staff = data?.staff_options ?? [];
  const groupOptions = data?.audience_groups ?? [];
  const patchRow = (key: string, patch: Partial<SmsControlCenterType>) => {
    setData((prev) => (prev ? { ...prev, types: prev.types.map((t) => (t.key === key ? { ...t, ...patch } : t)) } : prev));
  };

  const toggle = async (row: SmsControlCenterType, channel: 'sms' | 'email' | 'telegram') => {
    if (!canManage) return;
    if (row.always_on && channel !== 'telegram') return;
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

  const toLabel = useMemo(() => {
    if (!to) return '';
    if (to.startsWith('user:')) return staff.find((s) => s.id === Number(to.slice(5)))?.name ?? 'this person';
    return groupOptions.find((g) => g.key === to)?.label.replace(/ \(.*\)$/, '') ?? to.replace(/^role:/, '');
  }, [to, staff, groupOptions]);

  const reaches = (t: SmsControlCenterType): boolean => {
    if (!to) return true;
    if (!t.audience) return false;
    if (to.startsWith('user:')) {
      const id = Number(to.slice(5));
      return (t.audience_people?.people ?? []).some((p) => p.id === id);
    }
    if (t.audience.groups.includes(to)) return true;
    const slug = to.startsWith('role:') ? to.slice(5) : null;
    if (!slug) return false;
    const ids = new Set(staff.filter((s) => s.role_slug === slug).map((s) => s.id));
    return (t.audience_people?.people ?? []).some((p) => ids.has(p.id));
  };

  const q = query.trim().toLowerCase();
  const matches = (t: SmsControlCenterType) => {
    if (group !== 'all' && groupOf(t) !== group) return false;
    if (status === 'on' && !rowIsOn(t)) return false;
    if (status === 'off' && rowIsOn(t)) return false;
    if (!reaches(t)) return false;
    if (!q) return true;
    const people = (t.audience_people?.people ?? []).map((p) => p.name).join(' ');
    return [t.label, t.key, t.recipients, t.send_permission_label, audienceSummary(t, staff, groupOptions), people].some((s) => (s ?? '').toLowerCase().includes(q));
  };

  const grouped = useMemo(() => GROUP_ORDER.map((g) => {
    const all = types.filter((t) => groupOf(t) === g);
    return {
      group: g,
      label: GROUP_LABEL[g],
      help: GROUP_HELP[g],
      total: all.length,
      on: all.filter(rowIsOn).length,
      rows: all.filter(matches),
    };
  }).filter((g) => g.total > 0), [types, group, status, q, to]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtering = q !== '' || group !== 'all' || status !== 'all' || to !== '';
  const shown = grouped.reduce((n, g) => n + g.rows.length, 0);
  const offCount = types.filter((t) => !rowIsOn(t)).length;
  const telegramRowsExist = types.some((t) => t.telegram_applies);
  const isFolded = (g: Group) => folded[g] ?? (isMobile && !filtering && !expandedKey);

  const killSwitch = !!data?.global_kill_switch;
  const quietNow = !!data?.quiet_now;
  const sendingLabel = killSwitch ? 'Stopped' : data?.demo_mode ? 'Demo mode' : quietNow ? 'On · quiet hours now' : 'On';
  const sendingTone = killSwitch ? 'danger' : data?.demo_mode || quietNow ? 'warning' : 'success';
  const budget = data?.budget;
  const ownerPhones = data?.owner_phones ?? [];
  const deferredCount = data?.deferred_count ?? 0;

  const overview = canView && !loading && data && (
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
  );

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

      {overview && (isMobile ? (
        <details className="sms-cc-glance">
          <summary>At a glance · Sending: {sendingLabel}{data?.business_phone ? ` · Shop ${data.business_phone}` : ' · No business phone'}</summary>
          {overview}
        </details>
      ) : overview)}

      {canView && data && telegramRowsExist && (data.telegram_alerts_on === false || data.telegram_bot_ready === false) && (
        <p className="nc-banner is-warn" data-testid="telegram-off-banner">
          {data.telegram_alerts_on === false
            ? <>Telegram alerts are switched off, so the Telegram switches below send nothing. <Link to="/notifications/rules" style={{ color: 'inherit' }}>Switch them on in Rules</Link>.</>
            : <>No Telegram bot is set up yet, so the Telegram switches below send nothing. <Link to="/telegram" style={{ color: 'inherit' }}>Set one up in Telegram</Link>.</>}
        </p>
      )}

      {to && (
        <p className="nc-banner is-warn" data-testid="to-filter" style={{ background: 'var(--color-tone-rust-bg)', color: 'var(--color-tone-rust-text)' }}>
          Alerts that reach {toLabel}.{' '}
          <button type="button" onClick={() => setTo('')} style={{ background: 'none', border: 'none', color: 'inherit', textDecoration: 'underline', cursor: 'pointer', font: 'inherit', padding: 0 }}>Show every message</button>
        </p>
      )}

      {!loading && (
        <div className="sms-cc-toolbar" data-testid="sms-toolbar">
          <label className="sms-cc-search">
            <Search size={15} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search, e.g. refund, shift, stock, Ali"
              aria-label="Search messages"
            />
          </label>
          <div className="sms-cc-chips" role="group" aria-label="Category">
            {isMobile ? (
              <select value={group} onChange={(e) => setGroup(e.target.value as Group | 'all')} aria-label="Group" className="sms-cc-status" style={{ marginLeft: 0, flex: 1 }}>
                <option value="all">All groups ({types.length})</option>
                {GROUP_ORDER.filter((g) => types.some((t) => groupOf(t) === g)).map((g) => (
                  <option key={g} value={g}>{GROUP_LABEL[g]} ({types.filter((t) => groupOf(t) === g).length})</option>
                ))}
              </select>
            ) : (
              <>
                <Chip on={group === 'all'} onClick={() => setGroup('all')}>All <small>{types.length}</small></Chip>
                {GROUP_ORDER.filter((g) => types.some((t) => groupOf(t) === g)).map((g) => (
                  <Chip key={g} on={group === g} onClick={() => setGroup(g)}>
                    {GROUP_LABEL[g]} <small>{types.filter((t) => groupOf(t) === g).length}</small>
                  </Chip>
                ))}
              </>
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

      {loading ? (
        <p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
      ) : shown === 0 ? (
        <p style={{ color: 'var(--color-text-muted)', padding: '20px 0' }}>Nothing matches. Clear the search or pick another group.</p>
      ) : (
        grouped.filter((g) => g.rows.length > 0).map((g) => {
          const closed = isFolded(g.group);
          return (
            <section key={g.group} className="sms-cc-group" aria-labelledby={`sms-cat-${g.group}`} data-testid={`group-${g.group}`}>
              <div className="sms-cc-group-head">
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                    <h2 id={`sms-cat-${g.group}`} style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--color-text)' }}>
                      {g.label}
                    </h2>
                    <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                      {g.on} of {g.total} on{g.rows.length !== g.total ? ` · showing ${g.rows.length}` : ''}
                    </span>
                  </div>
                  {!closed && <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>{g.help}</p>}
                </div>
                <button
                  type="button"
                  className="sms-cc-fold"
                  aria-expanded={!closed}
                  aria-label={`${closed ? 'Show' : 'Hide'} ${g.label}`}
                  onClick={() => setFolded((f) => ({ ...f, [g.group]: !closed }))}
                >
                  {closed ? <ChevronDown size={16} aria-hidden /> : <ChevronUp size={16} aria-hidden />}
                </button>
              </div>
              {!closed && (
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
                      staffOptions={staff}
                      groupOptions={groupOptions}
                      onUpdated={(patch) => patchRow(row.key, patch)}
                      onError={setError}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })
      )}

      {!canView && (
        <p style={{ color: 'var(--color-text-muted)' }}>You need the SMS log or settings permission to see this.</p>
      )}
      {!isOwner && canView && !canManage && (
        <p style={{ ...rowLine, color: 'var(--color-text-muted)' }}>You can see these, but changing them needs Manage SMS settings.</p>
      )}
    </>
  );
}

export default MessagesTab;
