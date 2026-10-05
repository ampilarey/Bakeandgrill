import { useCallback, useEffect, useState } from 'react';
import {
  fetchCreditRepayments,
  exportCreditRepayments,
  type CreditRepaymentMethod,
  type CreditRepaymentsResponse,
} from '../../api';
import { Badge, Btn, DateInput, EmptyState, ErrorMsg, TableCard, TableSkeleton, TD, TH } from '../SharedUI';
import { useIsMobile } from '../../hooks/useIsMobile';
// Days in Male time, whatever clock the device keeps: the server counts the
// day in Indian/Maldives, so "today" here must be the same day.
const SHOP_TZ = 'Indian/Maldives';
const shopDate = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: SHOP_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const today = () => shopDate(new Date());
const daysAgo = (n: number) => shopDate(new Date(Date.now() - n * 86400000));

/*
 * Every credit repayment in a date range (owner, 2026-10-06: "Add" — a daily
 * list of repayments by card and transfer to match against the bank). Cash
 * already shows in the shift's close; card, transfer and online money touched
 * no drawer and appeared only on each customer's own history.
 */

const METHOD_CHIPS: { id: CreditRepaymentMethod; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'cash', label: 'Cash' },
  { id: 'card', label: 'Card (machine)' },
  { id: 'bank_transfer', label: 'Bank transfer' },
  { id: 'online', label: 'Online (BML)' },
];

const METHOD_COLOR: Record<string, string> = { cash: 'green', card: 'blue', bank_transfer: 'orange', online: 'purple' };

const RANGES: { id: string; label: string; from: () => string; to: () => string }[] = [
  { id: 'today', label: 'Today', from: today, to: today },
  { id: 'yesterday', label: 'Yesterday', from: () => daysAgo(1), to: () => daysAgo(1) },
  { id: '7d', label: 'Last 7 days', from: () => daysAgo(6), to: today },
  { id: '30d', label: 'Last 30 days', from: () => daysAgo(29), to: today },
];

const money = (v: number) => `MVR ${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function CreditRepaymentsView() {
  const isMobile = useIsMobile();
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [method, setMethod] = useState<CreditRepaymentMethod>('all');
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [data, setData] = useState<CreditRepaymentsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    if (!from || !to) return;
    setLoading(true);
    setError('');
    try {
      setData(await fetchCreditRepayments({ from, to: to < from ? from : to, method, q: debouncedQ }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load repayments');
    } finally {
      setLoading(false);
    }
  }, [from, to, method, debouncedQ]);

  useEffect(() => { void load(); }, [load]);

  const download = async () => {
    setExporting(true);
    try {
      const blob = await exportCreditRepayments({ from, to: to < from ? from : to, method, q: debouncedQ });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `credit-repayments-${from}${to !== from ? `-to-${to}` : ''}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not download');
    } finally {
      setExporting(false);
    }
  };

  const chip = (active: boolean): React.CSSProperties => ({
    padding: '6px 12px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer',
    border: `1px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
    background: active ? 'var(--color-primary)' : 'var(--color-surface)',
    color: active ? '#fff' : 'var(--color-text-secondary)',
    whiteSpace: 'nowrap',
  });

  const activeRange = RANGES.find((r) => r.from() === from && r.to() === to)?.id;
  const totals = data?.totals;
  const byMethod = Object.fromEntries((totals?.by_method ?? []).map((m) => [m.method, m]));

  return (
    <div data-testid="credit-repayments">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {RANGES.map((r) => (
            <button key={r.id} type="button" style={chip(activeRange === r.id)} onClick={() => { setFrom(r.from()); setTo(r.to()); }}>{r.label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <DateInput label="From" value={from} max={today()} onChange={(v) => { setFrom(v); if (v > to) setTo(v); }} />
          <DateInput label="To" value={to} max={today()} onChange={setTo} />
        </div>
        <Btn variant="secondary" onClick={() => void download()} disabled={exporting || !data || data.rows.length === 0} style={{ marginLeft: isMobile ? 0 : 'auto' }}>
          {exporting ? 'Preparing…' : 'Download CSV'}
        </Btn>
      </div>

      {totals && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(5, minmax(0, 1fr))', gap: 10, marginBottom: 12 }}>
          {[
            { label: 'Total received', value: money(totals.total_mvr), sub: `${totals.count} repayment${totals.count === 1 ? '' : 's'}`, strong: true },
            { label: 'Not cash: match to bank', value: money(totals.not_cash_mvr), sub: 'Card, transfer and online', strong: true },
            { label: 'Cash', value: money(byMethod.cash?.total_mvr ?? 0), sub: 'In the shift drawers' },
            { label: 'Card + transfer', value: money((byMethod.card?.total_mvr ?? 0) + (byMethod.bank_transfer?.total_mvr ?? 0)), sub: `${(byMethod.card?.count ?? 0) + (byMethod.bank_transfer?.count ?? 0)} at the counter` },
            { label: 'Online (BML)', value: money(byMethod.online?.total_mvr ?? 0), sub: `${byMethod.online?.count ?? 0} by pay link` },
          ].map((t) => (
            <div key={t.label} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, padding: '10px 12px', gridColumn: isMobile && t.strong ? 'span 1' : undefined }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-muted)' }}>{t.label}</div>
              <div style={{ fontSize: t.strong ? 18 : 16, fontWeight: 800, color: 'var(--color-text)', marginTop: 2 }}>{t.value}</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{t.sub}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2, flex: '1 1 320px' }} role="tablist" aria-label="Filter repayments by method">
          {METHOD_CHIPS.map((m) => {
            const count = m.id === 'all' ? totals?.count : byMethod[m.id]?.count;
            return (
              <button key={m.id} type="button" role="tab" aria-selected={method === m.id} style={chip(method === m.id)} onClick={() => setMethod(m.id)}>
                {m.label}{count !== undefined ? ` ${count}` : ''}
              </button>
            );
          })}
        </div>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name or phone"
          aria-label="Search repayments"
          style={{ flex: '1 1 200px', maxWidth: 320, padding: '8px 12px', borderRadius: 10, border: '1px solid var(--color-border)', fontSize: 14, background: 'var(--color-surface)', color: 'var(--color-text)' }}
        />
      </div>

      {error && <ErrorMsg message={error} />}

      {loading && !data ? (
        <TableCard><TableSkeleton rows={4} cols={6} /></TableCard>
      ) : !data || data.rows.length === 0 ? (
        <TableCard><EmptyState message="No repayments in this range." /></TableCard>
      ) : isMobile ? (
        <div style={{ display: 'grid', gap: 10 }}>
          {data.rows.map((r) => (
            <div key={r.id} data-testid="credit-repayment-card" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 14, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>{r.customer}{r.channel === 'wholesale' ? ' · wholesale' : ''}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{r.at}{r.phone ? ` · ${r.phone}` : ''}</div>
                </div>
                <div style={{ fontWeight: 800, whiteSpace: 'nowrap' }}>{money(r.amount_mvr)}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, flexWrap: 'wrap', fontSize: 12, color: 'var(--color-text-secondary)' }}>
                <Badge color={METHOD_COLOR[r.method] ?? 'gray'} label={r.method_label} />
                {r.reference && <span>Ref {r.reference}</span>}
                {r.invoices.length > 0 && <span>{r.invoices.join(', ')}</span>}
                {r.recorded_by && <span>by {r.recorded_by}</span>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <TableCard stickyHead>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={TH}>When</th>
                <th style={TH}>Customer</th>
                <th style={TH}>Method</th>
                <th style={{ ...TH, textAlign: 'right' }}>Amount</th>
                <th style={TH}>Reference</th>
                <th style={TH}>Invoices</th>
                <th style={TH}>Recorded by</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id} data-testid="credit-repayment-row">
                  <td style={{ ...TD, whiteSpace: 'nowrap' }}>{r.at}</td>
                  <td style={TD}>
                    <div style={{ fontWeight: 700 }}>{r.customer}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{r.phone ?? ''}{r.channel === 'wholesale' ? ' · wholesale' : ''}</div>
                  </td>
                  <td style={TD}><Badge color={METHOD_COLOR[r.method] ?? 'gray'} label={r.method_label} /></td>
                  <td style={{ ...TD, textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>{money(r.amount_mvr)}</td>
                  <td style={TD}>{r.reference ?? <span style={{ color: 'var(--color-text-muted)' }}>—</span>}</td>
                  <td style={{ ...TD, fontSize: 13 }}>{r.invoices.length > 0 ? r.invoices.join(', ') : <span style={{ color: 'var(--color-text-muted)' }}>—</span>}</td>
                  <td style={{ ...TD, fontSize: 13 }}>
                    {r.recorded_by ?? '—'}
                    {r.shift_id && <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>shift #{r.shift_id}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}

      {data?.truncated && (
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 8 }}>Showing the newest 2,000. Download the CSV for the full range.</p>
      )}
    </div>
  );
}
