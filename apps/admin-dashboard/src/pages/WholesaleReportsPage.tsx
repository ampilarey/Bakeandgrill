import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  downloadTradeAgeingCsv,
  downloadTradeExceptionsCsv,
  downloadTradeMarginsCsv,
  downloadTradeSellThroughCsv,
  downloadTradeSuggestedQuantitiesCsv,
  downloadTradeWasteCsv,
  fetchTradeAgeing,
  fetchTradeExceptions,
  fetchTradeMargins,
  fetchTradeSellThrough,
  fetchTradeSuggestedQuantities,
  fetchTradeWaste,
  type TradeAgeingRow,
  type TradeExceptionLists,
  type TradeMarginRow,
  type TradeSellThroughRow,
  type TradeSuggestedQtyRow,
  type TradeWasteRow,
} from '../api/tradeReports';
import {
  Btn, EmptyState, ErrorMsg, PageHeader, PageShell, Spinner, TableCard,
} from '../components/SharedUI';
import { usePageTitle } from '../hooks/usePageTitle';
import { today, monthStart } from '../utils/dateHelpers';

type Tab = 'sell-through' | 'suggested' | 'waste' | 'margins' | 'ageing' | 'exceptions';

const TABS: { id: Tab; label: string }[] = [
  { id: 'sell-through', label: 'Sell-through' },
  { id: 'suggested', label: 'Suggested qty' },
  { id: 'waste', label: 'Waste cost' },
  { id: 'margins', label: 'Margin by shop' },
  { id: 'ageing', label: 'Ageing' },
  { id: 'exceptions', label: 'Leaks' },
];

function mvr(n: number): string {
  return `MVR ${Number(n ?? 0).toFixed(2)}`;
}

const th: React.CSSProperties = {
  textAlign: 'left', padding: '10px 12px', fontSize: 12, color: 'var(--color-text-muted)',
  borderBottom: '1px solid var(--color-border)', fontWeight: 600, whiteSpace: 'nowrap',
};
const td: React.CSSProperties = {
  padding: '10px 12px', fontSize: 13, color: 'var(--color-text)',
  borderBottom: '1px solid var(--color-border-light)',
};

export default function WholesaleReportsPage() {
  usePageTitle('Wholesale reports');
  const [tab, setTab] = useState<Tab>('sell-through');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [olderThanDays, setOlderThanDays] = useState(3);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  const [sellThrough, setSellThrough] = useState<TradeSellThroughRow[]>([]);
  const [suggested, setSuggested] = useState<TradeSuggestedQtyRow[]>([]);
  const [waste, setWaste] = useState<TradeWasteRow[]>([]);
  const [margins, setMargins] = useState<TradeMarginRow[]>([]);
  const [ageing, setAgeing] = useState<TradeAgeingRow[]>([]);
  const [exceptions, setExceptions] = useState<TradeExceptionLists | null>(null);

  const needsRange = tab === 'sell-through' || tab === 'waste' || tab === 'margins';

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      if (tab === 'sell-through') {
        const res = await fetchTradeSellThrough(from, to);
        setSellThrough(res.rows ?? []);
      } else if (tab === 'suggested') {
        const res = await fetchTradeSuggestedQuantities();
        setSuggested(res.rows ?? []);
      } else if (tab === 'waste') {
        const res = await fetchTradeWaste(from, to);
        setWaste(res.rows ?? []);
      } else if (tab === 'margins') {
        const res = await fetchTradeMargins(from, to);
        setMargins(res.rows ?? []);
      } else if (tab === 'ageing') {
        const res = await fetchTradeAgeing();
        setAgeing(res.rows ?? []);
      } else {
        const res = await fetchTradeExceptions(olderThanDays);
        setExceptions(res);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on tab / range / leak days
  }, [tab, from, to, olderThanDays]);

  const exportCsv = async () => {
    setExporting(true);
    setError('');
    try {
      if (tab === 'sell-through') await downloadTradeSellThroughCsv(from, to);
      else if (tab === 'suggested') await downloadTradeSuggestedQuantitiesCsv();
      else if (tab === 'waste') await downloadTradeWasteCsv(from, to);
      else if (tab === 'margins') await downloadTradeMarginsCsv(from, to);
      else if (tab === 'ageing') await downloadTradeAgeingCsv();
      else await downloadTradeExceptionsCsv(olderThanDays);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <PageShell>
      <PageHeader
        section="Analyze"
        title="Wholesale reports"
        subtitle="Sell-through, next-run quantities, waste, margin, ageing and leak lists"
        action={(
          <Btn variant="secondary" onClick={() => void exportCsv()} disabled={exporting || loading}>
            {exporting ? 'Exporting…' : 'Export CSV'}
          </Btn>
        )}
      />

      <p style={{ margin: '0 0 16px', fontSize: 13 }}>
        <Link to="/wholesale" style={{ color: 'var(--color-primary)', textDecoration: 'none' }}>← Wholesale shops</Link>
      </p>

      {error && <ErrorMsg message={error} />}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            style={{
              minHeight: 44, padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
              border: tab === t.id ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
              background: tab === t.id ? 'var(--color-border-light)' : 'var(--color-bg)',
              color: 'var(--color-text)', fontWeight: tab === t.id ? 700 : 500, fontSize: 13,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20, alignItems: 'flex-end' }}>
        {needsRange && (
          <>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--color-text-secondary)' }}>
              From
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ minHeight: 44, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--color-border)' }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--color-text-secondary)' }}>
              To
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ minHeight: 44, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--color-border)' }} />
            </label>
          </>
        )}
        {tab === 'exceptions' && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--color-text-secondary)' }}>
            Unreconciled older than (days)
            <input
              type="number"
              min={1}
              max={90}
              value={olderThanDays}
              onChange={(e) => setOlderThanDays(Math.max(1, Math.min(90, Number(e.target.value) || 3)))}
              style={{ minHeight: 44, width: 100, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--color-border)' }}
            />
          </label>
        )}
        <Btn variant="secondary" onClick={() => void load()} disabled={loading}>Refresh</Btn>
      </div>

      {loading ? <Spinner /> : (
        <>
          {tab === 'sell-through' && (
            <TableCard>
              <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--color-text-secondary)' }}>
                Worst sell-through first — unsold stock is where the money leaks.
              </p>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['Shop', 'Item', 'Sent', 'Sold', 'Returned good', 'Wasted', 'Missing', 'Sell-through %'].map((h) => (
                        <th key={h} style={th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sellThrough.length === 0 && (
                      <tr><td colSpan={8}><EmptyState>No reconciled deliveries in this period</EmptyState></td></tr>
                    )}
                    {sellThrough.map((r) => (
                      <tr key={`${r.trade_account_id}-${r.item_id}`}>
                        <td style={td}>{r.shop_name}</td>
                        <td style={td}>{r.item_name}</td>
                        <td style={td}>{r.qty_sent}</td>
                        <td style={td}>{r.qty_sold}</td>
                        <td style={td}>{r.qty_returned_good}</td>
                        <td style={td}>{r.qty_wasted}</td>
                        <td style={td}>{r.qty_missing}</td>
                        <td style={{ ...td, fontWeight: 700, color: r.sell_through_pct < 60 ? 'var(--color-danger)' : 'var(--color-text)' }}>
                          {Number(r.sell_through_pct).toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TableCard>
          )}

          {tab === 'suggested' && (
            <TableCard>
              <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--color-text-secondary)' }}>
                Trailing average of quantity sold across reconciled deliveries. Needs at least three deliveries — otherwise we say so instead of guessing.
              </p>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['Shop', 'Item', 'Deliveries', 'Avg sold', 'Suggested', 'Working'].map((h) => (
                        <th key={h} style={th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {suggested.length === 0 && (
                      <tr><td colSpan={6}><EmptyState>No delivery history yet</EmptyState></td></tr>
                    )}
                    {suggested.map((r) => (
                      <tr key={`${r.trade_account_id}-${r.item_id}`}>
                        <td style={td}>{r.shop_name}</td>
                        <td style={td}>{r.item_name}</td>
                        <td style={td}>{r.deliveries_count}</td>
                        <td style={td}>{r.average_sold}</td>
                        <td style={{ ...td, fontWeight: 700 }}>
                          {r.status === 'ok' ? r.suggested_qty : '—'}
                        </td>
                        <td style={{ ...td, color: 'var(--color-text-secondary)', maxWidth: 360 }}>{r.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TableCard>
          )}

          {tab === 'waste' && (
            <TableCard>
              <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--color-text-secondary)' }}>
                Sale-or-return waste at the stamped unit cost on each delivery line.
              </p>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['Shop', 'Item', 'Qty wasted', 'Waste cost'].map((h) => (
                        <th key={h} style={th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {waste.length === 0 && (
                      <tr><td colSpan={4}><EmptyState>No waste in this period</EmptyState></td></tr>
                    )}
                    {waste.map((r) => (
                      <tr key={`${r.trade_account_id}-${r.item_id}`}>
                        <td style={td}>{r.shop_name}</td>
                        <td style={td}>{r.item_name}</td>
                        <td style={td}>{r.qty_wasted}</td>
                        <td style={{ ...td, fontWeight: 700, color: 'var(--color-danger)' }}>{mvr(r.waste_cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TableCard>
          )}

          {tab === 'margins' && (
            <TableCard>
              <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--color-text-secondary)' }}>
                Wholesale revenue − stamped cost of goods − waste cost, per shop.
              </p>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['Shop', 'Revenue', 'COGS', 'Waste', 'Margin'].map((h) => (
                        <th key={h} style={th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {margins.length === 0 && (
                      <tr><td colSpan={5}><EmptyState>No wholesale margin data in this period</EmptyState></td></tr>
                    )}
                    {margins.map((r) => (
                      <tr key={r.trade_account_id}>
                        <td style={td}>{r.shop_name}</td>
                        <td style={td}>{mvr(r.revenue)}</td>
                        <td style={td}>{mvr(r.cogs)}</td>
                        <td style={td}>{mvr(r.waste_cost)}</td>
                        <td style={{ ...td, fontWeight: 700, color: r.margin >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                          {mvr(r.margin)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TableCard>
          )}

          {tab === 'ageing' && (
            <TableCard>
              <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--color-text-secondary)' }}>
                Open wholesale invoices by overdue bucket, with credit limit and Stage D exposure.
              </p>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['Shop', 'Current', '1–30', '31–60', '60+', 'Outstanding', 'Credit limit', 'Exposure'].map((h) => (
                        <th key={h} style={th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ageing.length === 0 && (
                      <tr><td colSpan={8}><EmptyState>No open wholesale receivables</EmptyState></td></tr>
                    )}
                    {ageing.map((r) => (
                      <tr key={r.trade_account_id}>
                        <td style={td}>{r.shop_name}</td>
                        <td style={td}>{mvr(r.current)}</td>
                        <td style={td}>{mvr(r.days_1_30)}</td>
                        <td style={td}>{mvr(r.days_31_60)}</td>
                        <td style={{ ...td, fontWeight: r.days_60_plus > 0 ? 700 : 400, color: r.days_60_plus > 0 ? 'var(--color-danger)' : 'var(--color-text)' }}>
                          {mvr(r.days_60_plus)}
                        </td>
                        <td style={{ ...td, fontWeight: 700 }}>{mvr(r.outstanding)}</td>
                        <td style={td}>{mvr(r.credit_limit)}</td>
                        <td style={{ ...td, fontWeight: 700 }}>{mvr(r.exposure)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TableCard>
          )}

          {tab === 'exceptions' && exceptions && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <TableCard>
                <p style={{ margin: '0 0 4px', fontWeight: 700, color: 'var(--color-danger)' }}>
                  Unreconciled deliveries older than {exceptions.older_than_days} days
                </p>
                <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--color-text-secondary)' }}>
                  Stock out the door with no count back — money can vanish here.
                </p>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {['Delivery', 'Shop', 'Dispatched', 'Days out'].map((h) => (
                          <th key={h} style={th}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {exceptions.unreconciled.length === 0 && (
                        <tr><td colSpan={4}><EmptyState>None — good</EmptyState></td></tr>
                      )}
                      {exceptions.unreconciled.map((r) => (
                        <tr key={r.id}>
                          <td style={td}>
                            <Link to={`/wholesale/deliveries/${r.id}`} style={{ color: 'var(--color-primary)', fontWeight: 600, textDecoration: 'none' }}>
                              {r.delivery_number}
                            </Link>
                          </td>
                          <td style={td}>{r.shop_name ?? '—'}</td>
                          <td style={td}>{r.dispatched_at ? new Date(r.dispatched_at).toLocaleString() : '—'}</td>
                          <td style={{ ...td, fontWeight: 700, color: 'var(--color-danger)' }}>{r.days_outstanding ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </TableCard>

              <TableCard>
                <p style={{ margin: '0 0 4px', fontWeight: 700, color: 'var(--color-warning)' }}>
                  Reported vs counted mismatch (unresolved)
                </p>
                <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--color-text-secondary)' }}>
                  Shop report disagreed with the count — resolve before invoicing or the books lie.
                </p>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {['Delivery', 'Shop', 'Reconciled', 'Status'].map((h) => (
                          <th key={h} style={th}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {exceptions.mismatches.length === 0 && (
                        <tr><td colSpan={4}><EmptyState>None — good</EmptyState></td></tr>
                      )}
                      {exceptions.mismatches.map((r) => (
                        <tr key={r.id}>
                          <td style={td}>
                            <Link to={`/wholesale/deliveries/${r.id}`} style={{ color: 'var(--color-primary)', fontWeight: 600, textDecoration: 'none' }}>
                              {r.delivery_number}
                            </Link>
                          </td>
                          <td style={td}>{r.shop_name ?? '—'}</td>
                          <td style={td}>{r.reconciled_at ? new Date(r.reconciled_at).toLocaleString() : '—'}</td>
                          <td style={td}>{r.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </TableCard>
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}
