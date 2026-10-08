import { useCallback, useEffect, useState } from 'react';
import {
  fetchCreditAccounts,
  sendCreditReminder,
  sendCreditPayLink,
  updateCustomerCredit,
  type CreditAccountFilter,
  type CreditAccountRow,
  type CreditAccountsTotals,
} from '../api';
import {
  Badge, Btn, ErrorMsg, EmptyState, Modal, ModalActions, PageHeader, PageShell,
  Pagination, StatCard, TableCard, TableSkeleton, TabScrollRow, TD, TH,
} from '../components/SharedUI';
import { CustomerCreditSection } from '../components/CustomerCreditSection';
import { useCurrentUserPermissions } from '../hooks/usePermissions';
import { useIsMobile } from '../hooks/useIsMobile';
import { enteredOn } from '../utils/dateHelpers';
import { CreditRepaymentsView } from '../components/credit/CreditRepaymentsView';

/*
 * Customers → Credit accounts (owner, 2026-10-05: "Is there any place to
 * manage credit accounts" — "Yes build. Including sms option payment links
 * etc"). Every account on one page: status, limit, balance, terms, how
 * overdue, when they last paid. Per account: open it (approve, limit, terms,
 * hold, block, repayment, write-off — the same section the Directory shows),
 * put it on hold or reactivate it in one tap, text a reminder of what is
 * owed, or text a link that lets them pay the oldest invoice online by card.
 */

const FILTERS: { id: CreditAccountFilter; label: string; count: (t: CreditAccountsTotals) => number }[] = [
  { id: 'all', label: 'All', count: (t) => t.accounts },
  { id: 'with_balance', label: 'Owing', count: (t) => t.with_balance },
  { id: 'overdue', label: 'Overdue', count: (t) => t.overdue },
  { id: 'active', label: 'Active', count: (t) => t.active },
  { id: 'on_hold', label: 'On hold', count: (t) => t.on_hold },
  { id: 'blocked', label: 'Blocked', count: (t) => t.blocked },
];

const STATUS: Record<CreditAccountRow['status'], { label: string; color: string }> = {
  active: { label: 'Active', color: 'green' },
  on_hold: { label: 'On hold', color: 'orange' },
  blocked: { label: 'Blocked', color: 'red' },
};

const money = (v: number) => `MVR ${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function daysOverdue(iso: string | null): number {
  if (!iso) return 0;
  const due = new Date(iso + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((today.getTime() - due.getTime()) / 86400000));
}

type Notice = { kind: 'ok' | 'error'; text: string } | null;

export function CreditAccountsPage() {
  const { can } = useCurrentUserPermissions();
  const canManage = can('customers.credit.manage');
  const canRepay = can('customers.credit.repay');
  const isMobile = useIsMobile();

  // Accounts, or every repayment in a range (owner, 2026-10-06).
  const [view, setView] = useState<'accounts' | 'repayments'>('accounts');
  const [filter, setFilter] = useState<CreditAccountFilter>('all');
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<CreditAccountRow[]>([]);
  const [total, setTotal] = useState(0);
  const [perPage, setPerPage] = useState(50);
  const [totals, setTotals] = useState<CreditAccountsTotals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<Notice>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [open, setOpen] = useState<CreditAccountRow | null>(null);
  const [remind, setRemind] = useState<CreditAccountRow | null>(null);
  const [remindText, setRemindText] = useState('');
  const [payLink, setPayLink] = useState<CreditAccountRow | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchCreditAccounts(filter, debouncedQ, page);
      setRows(res.data);
      setTotal(res.total);
      setPerPage(res.per_page);
      setTotals(res.totals);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load credit accounts');
    } finally {
      setLoading(false);
    }
  }, [filter, debouncedQ, page]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); }, [filter, debouncedQ]);

  const run = async (row: CreditAccountRow, work: () => Promise<{ message?: string } | unknown>, done: string) => {
    setBusyId(row.id);
    setNotice(null);
    try {
      const res = await work();
      const msg = res && typeof res === 'object' && 'message' in res && typeof (res as { message?: unknown }).message === 'string'
        ? (res as { message: string }).message
        : done;
      setNotice({ kind: 'ok', text: `${row.name}: ${msg}` });
      await load();
    } catch (e) {
      setNotice({ kind: 'error', text: `${row.name}: ${e instanceof Error ? e.message : 'Action failed'}` });
    } finally {
      setBusyId(null);
    }
  };

  const setStatus = (row: CreditAccountRow, status: 'active' | 'on_hold' | 'blocked') =>
    run(row, () => updateCustomerCredit(row.id, { action: 'set_status', credit_status: status }), `Account ${STATUS[status].label.toLowerCase()}.`);

  const sendReminder = async () => {
    if (!remind) return;
    const row = remind;
    setRemind(null);
    await run(row, () => sendCreditReminder(row.id, remindText), 'Reminder sent.');
    setRemindText('');
  };

  const sendLink = async () => {
    if (!payLink) return;
    const row = payLink;
    setPayLink(null);
    await run(row, () => sendCreditPayLink(row.id), 'Pay link sent.');
  };

  if (!canManage && !canRepay) {
    return (
      <PageShell>
        <EmptyState message="You do not have permission to manage credit accounts." />
      </PageShell>
    );
  }

  const chip = (active: boolean): React.CSSProperties => ({
    padding: '6px 12px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer',
    border: `1px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
    background: active ? 'var(--color-primary)' : 'var(--color-surface)',
    color: active ? '#fff' : 'var(--color-text-secondary)',
    whiteSpace: 'nowrap',
  });

  const canText = (row: CreditAccountRow) => !!row.phone && !row.sms_opt_out;
  const textTitle = (row: CreditAccountRow) => !row.phone ? 'No phone number' : row.sms_opt_out ? 'Customer has opted out of SMS' : '';

  const actions = (row: CreditAccountRow) => {
    const busy = busyId === row.id;
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: isMobile ? 'flex-start' : 'flex-end' }}>
        <Btn small variant="secondary" onClick={() => setOpen(row)} disabled={busy}>Open</Btn>
        {canManage && row.enabled && row.status === 'active' && (
          <Btn small variant="secondary" onClick={() => void setStatus(row, 'on_hold')} disabled={busy}>Hold</Btn>
        )}
        {canManage && row.enabled && row.status !== 'active' && (
          <Btn small variant="secondary" onClick={() => void setStatus(row, 'active')} disabled={busy}>Reactivate</Btn>
        )}
        {canManage && row.balance_mvr > 0 && (
          <>
            <Btn small variant="secondary" onClick={() => { setRemindText(''); setRemind(row); }} disabled={busy || !canText(row)} title={textTitle(row)}>Remind</Btn>
            <Btn small onClick={() => setPayLink(row)} disabled={busy || !canText(row) || row.open_invoices === 0} title={row.open_invoices === 0 ? 'No open invoice to pay' : textTitle(row)}>Pay link</Btn>
          </>
        )}
      </div>
    );
  };

  const overdueCell = (row: CreditAccountRow) => {
    if (row.overdue_invoices === 0) return <span style={{ color: 'var(--color-text-muted)' }}>—</span>;
    const days = daysOverdue(row.oldest_due_date);
    return (
      <span style={{ color: 'var(--color-danger)', fontWeight: 700 }}>
        <span style={{ whiteSpace: 'nowrap' }}>{money(row.overdue_mvr)}</span>
        <span style={{ fontWeight: 500, fontSize: 12, display: 'block' }}>{row.overdue_invoices} invoice{row.overdue_invoices === 1 ? '' : 's'}, {days} day{days === 1 ? '' : 's'} late</span>
      </span>
    );
  };

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  return (
    <PageShell>
      <PageHeader title="Credit accounts" subtitle="Every customer buying on account: what they owe, how late, and the texts to chase it" />

      <div role="tablist" aria-label="Credit view" style={{ display: 'inline-flex', gap: 4, padding: 4, marginBottom: 14, borderRadius: 12, background: 'var(--color-border-light)' }}>
        {([['accounts', 'Accounts'], ['repayments', 'Repayments']] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            onClick={() => setView(id)}
            style={{
              padding: '8px 16px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700,
              background: view === id ? 'var(--color-surface)' : 'transparent',
              color: view === id ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              boxShadow: view === id ? '0 1px 3px rgba(28,20,8,0.12)' : 'none',
            }}
          >{label}</button>
        ))}
      </div>

      {view === 'repayments' && <CreditRepaymentsView />}

      {view === 'accounts' && (
        <>
      {totals && isMobile && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', padding: '12px 14px', marginBottom: 12, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 14, fontSize: 13 }}>
          <div><span style={{ color: 'var(--color-text-muted)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>Owed to you</span><div style={{ fontWeight: 800, fontSize: 17 }}>{money(totals.balance_mvr)}</div></div>
          <div><span style={{ color: 'var(--color-text-muted)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>Overdue</span><div style={{ fontWeight: 800, fontSize: 17, color: totals.overdue > 0 ? 'var(--color-danger)' : undefined }}>{money(totals.overdue_mvr)}</div></div>
          <div style={{ gridColumn: '1 / -1', color: 'var(--color-text-secondary)' }}>{totals.accounts} account{totals.accounts === 1 ? '' : 's'} · {totals.active} active · {totals.on_hold} on hold · {totals.blocked} blocked</div>
        </div>
      )}
      {totals && !isMobile && (
        <div className="stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
          <StatCard label="Accounts" value={String(totals.accounts)} sub={`${totals.active} active`} />
          <StatCard label="Owed to you" value={money(totals.balance_mvr)} sub={`${totals.with_balance} owing`} />
          <StatCard label="Overdue" value={money(totals.overdue_mvr)} sub={`${totals.overdue} account${totals.overdue === 1 ? '' : 's'}`} accent={totals.overdue > 0 ? 'var(--color-danger)' : undefined} />
          <StatCard label="On hold / blocked" value={`${totals.on_hold} / ${totals.blocked}`} />
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        {/* The shared scrolling row: beside the search box on a tablet the
            last chips were cut off with no sign there were more. */}
        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
          <TabScrollRow style={{ gap: 6, paddingBottom: 2 }} role="tablist" aria-label="Filter accounts">
            {FILTERS.map((f) => (
              <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} style={chip(filter === f.id)} onClick={() => setFilter(f.id)}>
                {f.label}{totals ? ` ${f.count(totals)}` : ''}
              </button>
            ))}
          </TabScrollRow>
        </div>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name or phone"
          aria-label="Search credit accounts"
          style={{ flex: '1 1 200px', maxWidth: 320, padding: '8px 12px', borderRadius: 10, border: '1px solid var(--color-border)', fontSize: 14, background: 'var(--color-surface)', color: 'var(--color-text)' }}
        />
      </div>

      {error && <ErrorMsg message={error} />}
      {notice && (
        <div role="status" style={{
          marginBottom: 12, padding: '10px 14px', borderRadius: 10, fontSize: 14, fontWeight: 600,
          background: notice.kind === 'ok' ? 'var(--color-success-bg)' : 'var(--color-danger-bg, rgba(239,68,68,0.1))',
          color: notice.kind === 'ok' ? 'var(--color-success-strong)' : 'var(--color-danger)',
        }}>{notice.text}</div>
      )}

      {loading && rows.length === 0 ? (
        <TableCard><TableSkeleton rows={4} cols={6} /></TableCard>
      ) : rows.length === 0 ? (
        <TableCard>
          <EmptyState message={filter === 'all' && !debouncedQ
            ? 'No credit accounts yet. Approve a customer for credit from the Directory, or from the Open button once they appear here.'
            : 'No accounts match.'} />
        </TableCard>
      ) : isMobile ? (
        <div style={{ display: 'grid', gap: 10 }}>
          {rows.map((row) => (
            <div key={row.id} data-testid="credit-account-card" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 14, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{row.name}</div>
                  <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{row.phone ?? 'No phone'}{row.sms_opt_out ? ' · no SMS' : ''}</div>
                </div>
                <Badge color={STATUS[row.status].color} label={STATUS[row.status].label} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', marginTop: 10, fontSize: 13 }}>
                <div><span style={{ color: 'var(--color-text-muted)' }}>Balance</span><div style={{ fontWeight: 700, fontSize: 15 }}>{money(row.balance_mvr)}</div></div>
                <div><span style={{ color: 'var(--color-text-muted)' }}>Overdue</span><div>{overdueCell(row)}</div></div>
                <div><span style={{ color: 'var(--color-text-muted)' }}>Limit</span><div>{money(row.limit_mvr)} · {row.terms_days} days</div></div>
                <div><span style={{ color: 'var(--color-text-muted)' }}>Last paid</span><div>{row.last_paid_at ? enteredOn(row.last_paid_at) : 'Never'}</div></div>
              </div>
              <div style={{ marginTop: 12 }}>{actions(row)}</div>
            </div>
          ))}
        </div>
      ) : (
        <TableCard stickyHead>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={TH}>Customer</th>
                <th style={TH}>Status</th>
                <th style={{ ...TH, textAlign: 'right' }}>Balance</th>
                <th style={{ ...TH, textAlign: 'right' }}>Limit · terms</th>
                <th style={TH}>Overdue</th>
                <th style={TH}>Last paid</th>
                <th style={{ ...TH, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} data-testid="credit-account-row">
                  <td style={TD}>
                    <div style={{ fontWeight: 700 }}>{row.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{row.phone ?? 'No phone'}{row.sms_opt_out ? ' · no SMS' : ''}</div>
                  </td>
                  <td style={TD}><Badge color={STATUS[row.status].color} label={STATUS[row.status].label} /></td>
                  <td style={{ ...TD, textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {money(row.balance_mvr)}
                    {row.open_invoices > 0 && <div style={{ fontWeight: 500, fontSize: 12, color: 'var(--color-text-secondary)' }}>{row.open_invoices} open invoice{row.open_invoices === 1 ? '' : 's'}</div>}
                  </td>
                  <td style={{ ...TD, textAlign: 'right' }}>
                    <span style={{ whiteSpace: 'nowrap' }}>{money(row.limit_mvr)}</span>
                    <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{row.terms_days} days · <span style={{ whiteSpace: 'nowrap' }}>{money(row.available_mvr)} free</span></div>
                  </td>
                  <td style={TD}>{overdueCell(row)}</td>
                  <td style={TD}>
                    {row.last_paid_at ? <span style={{ whiteSpace: 'nowrap' }}>{enteredOn(row.last_paid_at)}</span> : <span style={{ color: 'var(--color-text-muted)' }}>Never</span>}
                    {row.last_charged_at && <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>charged {enteredOn(row.last_charged_at)}</div>}
                  </td>
                  <td style={{ ...TD, minWidth: 220 }}>{actions(row)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}

      <Pagination page={page} totalPages={totalPages} onChange={setPage} />

        </>
      )}

      {open && (
        <Modal title={open.name} onClose={() => { setOpen(null); void load(); }} maxWidth={560}>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--color-text-secondary)' }}>{open.phone ?? 'No phone'}</p>
          <CustomerCreditSection customerId={open.id} />
          <ModalActions>
            <Btn onClick={() => { setOpen(null); void load(); }}>Close</Btn>
          </ModalActions>
        </Modal>
      )}

      {remind && (
        <Modal title={`Remind ${remind.name}`} onClose={() => setRemind(null)}>
          <p style={{ margin: '0 0 10px', fontSize: 14 }}>
            Texts {remind.phone} that they owe <strong>{money(remind.balance_mvr)}</strong>
            {remind.open_invoices > 0 ? ', naming the oldest open invoice with a link to view it.' : '.'}
          </p>
          <label htmlFor="credit-remind-text" style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }}>Your own wording (optional)</label>
          <textarea
            id="credit-remind-text"
            value={remindText}
            onChange={(e) => setRemindText(e.target.value)}
            maxLength={500}
            rows={4}
            placeholder="Leave empty to send the standard reminder. You can use {{name}}, {{balance}}, {{invoice_number}}, {{amount}}, {{due_date}} and {{link}}."
            style={{ width: '100%', boxSizing: 'border-box', marginTop: 4, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--color-border)', fontSize: 14, resize: 'vertical', background: 'var(--color-surface)', color: 'var(--color-text)' }}
          />
          <ModalActions>
            <Btn variant="secondary" onClick={() => setRemind(null)}>Cancel</Btn>
            <Btn onClick={() => void sendReminder()}>Send reminder</Btn>
          </ModalActions>
        </Modal>
      )}

      {payLink && (
        <Modal title={`Send pay link to ${payLink.name}`} onClose={() => setPayLink(null)}>
          <p style={{ margin: '0 0 8px', fontSize: 14 }}>
            Texts {payLink.phone} a link to their oldest open credit invoice. The page has a <strong>Pay online</strong> button that takes a card payment through BML and clears the invoice from their balance when it goes through.
          </p>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)' }}>Balance {money(payLink.balance_mvr)} · {payLink.open_invoices} open invoice{payLink.open_invoices === 1 ? '' : 's'}</p>
          <ModalActions>
            <Btn variant="secondary" onClick={() => setPayLink(null)}>Cancel</Btn>
            <Btn onClick={() => void sendLink()}>Send pay link</Btn>
          </ModalActions>
        </Modal>
      )}
    </PageShell>
  );
}

export default CreditAccountsPage;
