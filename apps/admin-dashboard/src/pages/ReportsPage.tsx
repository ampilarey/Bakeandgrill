import { useEffect, useState } from 'react';
import {
  fetchSalesSummary, getSalesBreakdown, getXReport, getZReport, getTaxReport,
  getInventoryValuation,
  type SalesSummary, type SalesBreakdown, type XReport, type ZReport,
  type TaxReport, type InventoryValuation,
} from '../api';
import { Btn, Card, DateInput, ErrorMsg, PageHeader, Spinner, StatCard } from '../components/Layout';
import { usePageTitle } from '../hooks/usePageTitle';

function today()        { return new Date().toISOString().slice(0, 10); }
function daysAgo(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }
function mvr(n: number) { return `MVR ${(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function pct(n: number, total: number) { return total > 0 ? `${((n / total) * 100).toFixed(1)}%` : '0%'; }

const ORDER_TYPE_LABELS: Record<string, string> = {
  online_pickup: 'Online Pickup', delivery: 'Delivery', dine_in: 'Dine-In',
  takeaway: 'Takeaway', pos: 'POS',
};

const TABS = ['Summary', 'Breakdown', 'X / Z Report', 'Tax', 'Inventory'] as const;
type Tab = typeof TABS[number];

const S = {
  tab: (active: boolean): React.CSSProperties => ({
    padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
    fontFamily: 'inherit', fontSize: 13, fontWeight: active ? 700 : 400,
    background: active ? '#D4813A' : 'transparent', color: active ? '#fff' : '#6B5D4F',
    transition: 'all .15s',
  }),
  table: { width: '100%', borderCollapse: 'collapse' } as React.CSSProperties,
  th: { textAlign: 'left' as const, padding: '8px 12px', fontSize: 12, color: '#9C8E7E', borderBottom: '1px solid #F0EAE3', whiteSpace: 'nowrap' as const },
  td: { padding: '10px 12px', fontSize: 13, color: '#1C1408', borderBottom: '1px solid #F8F4F0' },
  bar: (pctVal: number): React.CSSProperties => ({
    height: 8, borderRadius: 4, background: '#D4813A', width: `${Math.min(100, pctVal)}%`, minWidth: pctVal > 0 ? 4 : 0,
  }),
};

function BarCell({ value, max }: { value: number; max: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, background: '#F0EAE3', borderRadius: 4, height: 8 }}>
        <div style={S.bar(max > 0 ? (value / max) * 100 : 0)} />
      </div>
      <span style={{ fontSize: 12, color: '#6B5D4F', width: 80, textAlign: 'right' }}>{mvr(value)}</span>
    </div>
  );
}

export function ReportsPage() {
  usePageTitle('Reports');
  const [tab, setTab]         = useState<Tab>('Summary');
  const [from, setFrom]       = useState(daysAgo(7));
  const [to, setTo]           = useState(today());

  const [summary,   setSummary]   = useState<SalesSummary | null>(null);
  const [breakdown, setBreakdown] = useState<SalesBreakdown | null>(null);
  const [xReport,   setXReport]   = useState<XReport | null>(null);
  const [zReport,   setZReport]   = useState<ZReport | null>(null);
  const [taxReport, setTaxReport] = useState<TaxReport | null>(null);
  const [inventory, setInventory] = useState<InventoryValuation | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      if (tab === 'Summary')    setSummary(await fetchSalesSummary({ from, to }));
      if (tab === 'Breakdown')  setBreakdown(await getSalesBreakdown({ from, to }));
      if (tab === 'Tax')        setTaxReport(await getTaxReport({ from, to }));
      if (tab === 'X / Z Report') {
        const [x, z] = await Promise.all([getXReport(), getZReport()]);
        setXReport(x); setZReport(z);
      }
      if (tab === 'Inventory') setInventory(await getInventoryValuation());
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [tab, from, to]);

  const needsDate = tab === 'Summary' || tab === 'Breakdown' || tab === 'Tax';

  return (
    <>
      <PageHeader title="Reports" subtitle="Sales, breakdowns, tax, and inventory" />

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} style={S.tab(tab === t)} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {/* Date filters — only for date-range tabs */}
      {needsDate && (
        <Card style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
            <DateInput label="From" value={from} onChange={setFrom} />
            <DateInput label="To"   value={to}   onChange={setTo} />
            <div style={{ display: 'flex', gap: 8 }}>
              {[{ label: 'Today', days: 0 }, { label: '7 days', days: 7 }, { label: '30 days', days: 30 }, { label: '90 days', days: 90 }].map(({ label, days }) => (
                <Btn key={label} small variant="secondary" onClick={() => { setFrom(daysAgo(days)); setTo(today()); }}>
                  {label}
                </Btn>
              ))}
              <Btn small onClick={load}>Apply</Btn>
            </div>
          </div>
        </Card>
      )}

      {error && <ErrorMsg message={error} />}
      {loading && <Spinner />}

      {/* ── Summary ── */}
      {!loading && tab === 'Summary' && summary && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
            <StatCard label="Total Revenue"    value={mvr(summary.total_revenue)}    accent="#22c55e" />
            <StatCard label="Orders"           value={summary.order_count.toLocaleString()} accent="#D4813A" />
            <StatCard label="Avg Order Value"  value={mvr(summary.average_order_value ?? 0)} accent="#8b5cf6" />
          </div>
          <Card>
            <p style={{ fontSize: 13, color: '#6B5D4F', margin: 0 }}>
              Period: <strong style={{ color: '#1C1408' }}>{summary.period}</strong>
            </p>
          </Card>
        </>
      )}

      {/* ── Breakdown ── */}
      {!loading && tab === 'Breakdown' && breakdown && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20 }}>

          {/* Top Items */}
          <Card>
            <p style={{ fontWeight: 700, fontSize: 14, color: '#1C1408', margin: '0 0 16px' }}>Top Items</p>
            <table style={S.table}>
              <thead><tr>
                <th style={S.th}>Item</th>
                <th style={S.th}>Qty</th>
                <th style={{ ...S.th, minWidth: 160 }}>Revenue</th>
              </tr></thead>
              <tbody>
                {breakdown.top_items.slice(0, 10).map(item => {
                  const max = breakdown.top_items[0]?.revenue ?? 1;
                  return (
                    <tr key={item.id}>
                      <td style={S.td}>{item.name}</td>
                      <td style={{ ...S.td, color: '#9C8E7E' }}>{item.qty}</td>
                      <td style={S.td}><BarCell value={item.revenue} max={max} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          {/* By Category */}
          <Card>
            <p style={{ fontWeight: 700, fontSize: 14, color: '#1C1408', margin: '0 0 16px' }}>Revenue by Category</p>
            <table style={S.table}>
              <thead><tr>
                <th style={S.th}>Category</th>
                <th style={S.th}>Orders</th>
                <th style={{ ...S.th, minWidth: 160 }}>Revenue</th>
              </tr></thead>
              <tbody>
                {breakdown.by_category.map(cat => {
                  const max = breakdown.by_category[0]?.revenue ?? 1;
                  return (
                    <tr key={cat.category}>
                      <td style={S.td}>{cat.category}</td>
                      <td style={{ ...S.td, color: '#9C8E7E' }}>{cat.orders}</td>
                      <td style={S.td}><BarCell value={cat.revenue} max={max} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          {/* By Order Type */}
          <Card>
            <p style={{ fontWeight: 700, fontSize: 14, color: '#1C1408', margin: '0 0 16px' }}>Revenue by Order Type</p>
            <table style={S.table}>
              <thead><tr>
                <th style={S.th}>Type</th>
                <th style={S.th}>Orders</th>
                <th style={{ ...S.th, minWidth: 160 }}>Revenue</th>
              </tr></thead>
              <tbody>
                {breakdown.by_type.map(t => {
                  const max = Math.max(...breakdown.by_type.map(x => x.revenue));
                  return (
                    <tr key={t.type}>
                      <td style={S.td}>{ORDER_TYPE_LABELS[t.type] ?? t.type}</td>
                      <td style={{ ...S.td, color: '#9C8E7E' }}>{t.orders}</td>
                      <td style={S.td}><BarCell value={t.revenue} max={max} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          {/* By Hour */}
          <Card>
            <p style={{ fontWeight: 700, fontSize: 14, color: '#1C1408', margin: '0 0 16px' }}>Revenue by Hour</p>
            <table style={S.table}>
              <thead><tr>
                <th style={S.th}>Hour</th>
                <th style={S.th}>Orders</th>
                <th style={{ ...S.th, minWidth: 160 }}>Revenue</th>
              </tr></thead>
              <tbody>
                {breakdown.by_hour.filter(h => h.orders > 0).map(h => {
                  const max = Math.max(...breakdown.by_hour.map(x => x.revenue));
                  const label = `${String(h.hour).padStart(2, '0')}:00`;
                  return (
                    <tr key={h.hour}>
                      <td style={{ ...S.td, fontFamily: 'monospace' }}>{label}</td>
                      <td style={{ ...S.td, color: '#9C8E7E' }}>{h.orders}</td>
                      <td style={S.td}><BarCell value={h.revenue} max={max} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {/* ── X / Z Reports ── */}
      {!loading && tab === 'X / Z Report' && (xReport || zReport) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20 }}>
          {[{ label: 'X-Report (current shift)', data: xReport }, { label: 'Z-Report (last closed shift)', data: zReport }].map(({ label, data }) =>
            data && (
              <Card key={label}>
                <p style={{ fontWeight: 700, fontSize: 14, color: '#1C1408', margin: '0 0 4px' }}>{label}</p>
                <p style={{ fontSize: 11, color: '#9C8E7E', margin: '0 0 16px' }}>
                  Generated: {new Date(data.generated_at).toLocaleString()}
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                  {[
                    { l: 'Orders',    v: data.totals.orders.toString() },
                    { l: 'Revenue',   v: mvr(data.totals.revenue) },
                    { l: 'Tax',       v: mvr(data.totals.tax) },
                    { l: 'Discounts', v: mvr(data.totals.discounts) },
                  ].map(({ l, v }) => (
                    <div key={l} style={{ background: '#FAF7F4', borderRadius: 8, padding: '10px 14px' }}>
                      <div style={{ fontSize: 11, color: '#9C8E7E', marginBottom: 4 }}>{l}</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#1C1408' }}>{v}</div>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: 12, fontWeight: 600, color: '#6B5D4F', margin: '0 0 8px' }}>By Order Type</p>
                <table style={S.table}>
                  <thead><tr>
                    <th style={S.th}>Type</th><th style={S.th}>Count</th><th style={S.th}>Total</th>
                  </tr></thead>
                  <tbody>
                    {data.by_type.map(t => (
                      <tr key={t.type}>
                        <td style={S.td}>{ORDER_TYPE_LABELS[t.type] ?? t.type}</td>
                        <td style={{ ...S.td, color: '#9C8E7E' }}>{t.count}</td>
                        <td style={S.td}>{mvr(t.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {Object.keys(data.by_payment).length > 0 && (
                  <>
                    <p style={{ fontSize: 12, fontWeight: 600, color: '#6B5D4F', margin: '16px 0 8px' }}>By Payment Method</p>
                    <table style={S.table}>
                      <thead><tr><th style={S.th}>Method</th><th style={S.th}>Total</th></tr></thead>
                      <tbody>
                        {Object.entries(data.by_payment).map(([method, total]) => (
                          <tr key={method}>
                            <td style={S.td}>{method}</td>
                            <td style={S.td}>{mvr(total as number)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </Card>
            )
          )}
        </div>
      )}

      {/* ── Tax Report ── */}
      {!loading && tab === 'Tax' && taxReport && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 20 }}>
            <StatCard label="Total Tax Collected" value={mvr(taxReport.total_tax_collected)} accent="#D4813A" />
            <StatCard label="Period" value={`${taxReport.from} → ${taxReport.to}`} accent="#6B5D4F" />
          </div>
          <Card>
            <p style={{ fontWeight: 700, fontSize: 14, color: '#1C1408', margin: '0 0 16px' }}>Tax by Rate</p>
            <table style={S.table}>
              <thead><tr>
                <th style={S.th}>Rate</th>
                <th style={S.th}>Net Sales</th>
                <th style={S.th}>Tax Amount</th>
                <th style={S.th}>% of Total</th>
              </tr></thead>
              <tbody>
                {taxReport.by_rate.map(r => (
                  <tr key={r.rate_bp}>
                    <td style={{ ...S.td, fontWeight: 600 }}>{r.rate_pct}%</td>
                    <td style={S.td}>{mvr(r.net_sales)}</td>
                    <td style={S.td}>{mvr(r.tax_amount)}</td>
                    <td style={{ ...S.td, color: '#9C8E7E' }}>{pct(r.tax_amount, taxReport.total_tax_collected)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {/* ── Inventory Valuation ── */}
      {!loading && tab === 'Inventory' && inventory && (
        <>
          <div style={{ marginBottom: 20 }}>
            <StatCard label="Total Inventory Value" value={mvr(inventory.total_value)} accent="#22c55e" />
          </div>
          <Card>
            <p style={{ fontWeight: 700, fontSize: 14, color: '#1C1408', margin: '0 0 16px' }}>Stock Valuation</p>
            <table style={S.table}>
              <thead><tr>
                <th style={S.th}>Item</th>
                <th style={S.th}>Unit</th>
                <th style={S.th}>Qty</th>
                <th style={S.th}>Cost/Unit</th>
                <th style={S.th}>Total Value</th>
              </tr></thead>
              <tbody>
                {inventory.items.map(item => (
                  <tr key={item.id}>
                    <td style={{ ...S.td, fontWeight: 500 }}>{item.name}</td>
                    <td style={{ ...S.td, color: '#9C8E7E' }}>{item.unit}</td>
                    <td style={S.td}>{item.quantity}</td>
                    <td style={S.td}>{mvr(item.cost_per_unit)}</td>
                    <td style={{ ...S.td, fontWeight: 600 }}>{mvr(item.total_value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </>
  );
}
