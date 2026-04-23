import { useEffect, useState } from 'react';
import {
  fetchSalesSummary, getSalesBreakdown, getXReport, getZReport, getTaxReport,
  getInventoryValuation, getAccountsPayable, getAccountsReceivable,
  getPromotionReport, getLoyaltyReport,
  type SalesSummary, type SalesBreakdown, type XReport, type ZReport,
  type TaxReport, type InventoryValuation, type AccountsPayable, type AccountsReceivable,
  type PromotionReportItem, type LoyaltyReport,
} from '../api';
import { Btn, Card, DateInput, ErrorMsg, PageHeader, Spinner, StatCard } from '../components/Layout';
import { usePageTitle } from '../hooks/usePageTitle';
import { downloadCSV } from '../utils/csvExport';

function today()        { return new Date().toISOString().slice(0, 10); }
function daysAgo(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }
function mvr(n: number) { return `MVR ${(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function pct(n: number, total: number) { return total > 0 ? `${((n / total) * 100).toFixed(1)}%` : '0%'; }

const ORDER_TYPE_LABELS: Record<string, string> = {
  online_pickup: 'Online Pickup', delivery: 'Delivery', dine_in: 'Dine-In',
  takeaway: 'Takeaway', pos: 'POS',
};

const TABS = ['Summary', 'Breakdown', 'X / Z Report', 'Tax', 'Inventory', 'Accounts Payable', 'Accounts Receivable', 'Promotions', 'Loyalty'] as const;
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
  const [ap,        setAp]        = useState<AccountsPayable[] | null>(null);
  const [ar,        setAr]        = useState<AccountsReceivable[] | null>(null);
  const [promoReport, setPromoReport] = useState<PromotionReportItem[] | null>(null);
  const [loyaltyReport, setLoyaltyReport] = useState<LoyaltyReport | null>(null);

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
      if (tab === 'Inventory')           setInventory(await getInventoryValuation());
      if (tab === 'Accounts Payable')    setAp((await getAccountsPayable()).data);
      if (tab === 'Accounts Receivable') setAr((await getAccountsReceivable()).data);
      if (tab === 'Promotions')          setPromoReport((await getPromotionReport()).report);
      if (tab === 'Loyalty')             setLoyaltyReport((await getLoyaltyReport()).report);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [tab, from, to]);

  const needsDate = tab === 'Summary' || tab === 'Breakdown' || tab === 'Tax';

  const handleExportCSV = () => {
    if (tab === 'Summary' && summary) {
      downloadCSV('sales-summary', [{ Period: summary.period, Revenue: mvr(summary.total_revenue), Orders: summary.order_count, 'Avg Order': mvr(summary.average_order_value ?? 0) }]);
    } else if (tab === 'Breakdown' && breakdown) {
      downloadCSV('sales-breakdown-items', (breakdown.top_items ?? []).map(i => ({ Item: i.name, Qty: i.qty, Revenue: mvr(i.revenue) })));
    } else if (tab === 'Tax' && taxReport) {
      downloadCSV('tax-report', (taxReport.by_rate ?? []).map(r => ({ 'Rate %': r.rate_pct, 'Net Sales': mvr(r.net_sales), 'Tax Amount': mvr(r.tax_amount) })));
    } else if (tab === 'Inventory' && inventory) {
      downloadCSV('inventory-valuation', inventory.items.map(i => ({ Item: i.name, Unit: i.unit, Qty: i.quantity, 'Cost/Unit': mvr(i.cost_per_unit), 'Total Value': mvr(i.total_value) })));
    } else if (tab === 'Accounts Payable' && ap) {
      downloadCSV('accounts-payable', ap.map(s => ({ Supplier: s.supplier_name, 'Outstanding (MVR)': mvr(s.outstanding_amount), 'Open Invoices': s.invoices.length })));
    } else if (tab === 'Accounts Receivable' && ar) {
      downloadCSV('accounts-receivable', ar.map(c => ({ Customer: c.customer_name ?? 'Unknown', 'Outstanding (MVR)': mvr(c.outstanding_amount), 'Open Invoices': c.invoices.length })));
    } else if (tab === 'Promotions' && promoReport) {
      downloadCSV('promotions-report', promoReport.map(p => ({ Name: p.name, Code: p.code, Redemptions: p.redemptions_count, 'Total Discount (MVR)': mvr(p.total_discount_laar / 100) })));
    } else if (tab === 'Loyalty' && loyaltyReport) {
      downloadCSV('loyalty-report', [{ 'Total Accounts': loyaltyReport.total_accounts, 'Outstanding Pts': loyaltyReport.total_outstanding_points, 'Lifetime Pts': loyaltyReport.total_earned_lifetime, Bronze: loyaltyReport.bronze_count, Silver: loyaltyReport.silver_count, Gold: loyaltyReport.gold_count, Platinum: loyaltyReport.platinum_count }]);
    }
  };

  const canExport = (tab === 'Summary' && summary) || (tab === 'Breakdown' && breakdown) ||
    (tab === 'Tax' && taxReport) || (tab === 'Inventory' && inventory) ||
    (tab === 'Accounts Payable' && ap) || (tab === 'Accounts Receivable' && ar) ||
    (tab === 'Promotions' && promoReport) || (tab === 'Loyalty' && loyaltyReport);

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Sales, breakdowns, tax, and inventory"
        action={canExport ? <Btn small variant="secondary" onClick={handleExportCSV}>Export CSV</Btn> : undefined}
      />

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
                {(breakdown.top_items ?? []).slice(0, 10).map(item => {
                  const max = (breakdown.top_items ?? [])[0]?.revenue ?? 1;
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
                {(breakdown.by_category ?? []).map(cat => {
                  const max = (breakdown.by_category ?? [])[0]?.revenue ?? 1;
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
                {(breakdown.by_type ?? []).map(t => {
                  const max = (breakdown.by_type ?? []).length ? Math.max(...(breakdown.by_type ?? []).map(x => x.revenue)) : 0;
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
                {(breakdown.by_hour ?? []).filter(h => h.orders > 0).map(h => {
                  const max = (breakdown.by_hour ?? []).length ? Math.max(...(breakdown.by_hour ?? []).map(x => x.revenue)) : 0;
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
                    {(data.by_type ?? []).map(t => (
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
                {(taxReport.by_rate ?? []).map(r => (
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

      {/* ── Accounts Payable ── */}
      {!loading && tab === 'Accounts Payable' && ap && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 20 }}>
            <StatCard label="Suppliers Owed"      value={String(ap.length)}                                                                accent="#f97316" />
            <StatCard label="Total Outstanding"   value={mvr(ap.reduce((s, x) => s + x.outstanding_amount, 0))}                           accent="#ef4444" />
            <StatCard label="Open Invoices"       value={String(ap.reduce((s, x) => s + x.invoices.length, 0))}                           accent="#6366f1" />
          </div>
          {ap.length === 0 ? (
            <Card><p style={{ textAlign: 'center', padding: '32px 0', color: '#9C8E7E', fontSize: 14 }}>No outstanding payables.</p></Card>
          ) : ap.map(supplier => (
            <Card key={supplier.supplier_id} style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: '#1C1408' }}>{supplier.supplier_name}</span>
                <span style={{ fontWeight: 700, fontSize: 14, color: '#ef4444' }}>{mvr(supplier.outstanding_amount)}</span>
              </div>
              <table style={S.table}>
                <thead><tr>
                  <th style={S.th}>Invoice #</th>
                  <th style={S.th}>Amount</th>
                  <th style={S.th}>Due Date</th>
                </tr></thead>
                <tbody>
                  {supplier.invoices.map(inv => (
                    <tr key={inv.id}>
                      <td style={{ ...S.td, fontFamily: 'monospace', fontSize: 12 }}>{inv.invoice_number}</td>
                      <td style={S.td}>{mvr(inv.amount)}</td>
                      <td style={{ ...S.td, color: inv.due_date && inv.due_date < today() ? '#ef4444' : '#6B5D4F' }}>
                        {inv.due_date ?? '—'}
                        {inv.due_date && inv.due_date < today() && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: '#ef4444' }}>OVERDUE</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ))}
        </>
      )}

      {/* ── Accounts Receivable ── */}
      {!loading && tab === 'Accounts Receivable' && ar && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 20 }}>
            <StatCard label="Customers with Balance" value={String(ar.length)}                                                             accent="#8b5cf6" />
            <StatCard label="Total Outstanding"      value={mvr(ar.reduce((s, x) => s + x.outstanding_amount, 0))}                        accent="#D4813A" />
            <StatCard label="Open Invoices"          value={String(ar.reduce((s, x) => s + x.invoices.length, 0))}                        accent="#f59e0b" />
          </div>
          {ar.length === 0 ? (
            <Card><p style={{ textAlign: 'center', padding: '32px 0', color: '#9C8E7E', fontSize: 14 }}>No outstanding receivables.</p></Card>
          ) : ar.map((customer, i) => (
            <Card key={customer.customer_id ?? i} style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: '#1C1408' }}>{customer.customer_name ?? 'Unknown Customer'}</span>
                <span style={{ fontWeight: 700, fontSize: 14, color: '#D4813A' }}>{mvr(customer.outstanding_amount)}</span>
              </div>
              <table style={S.table}>
                <thead><tr>
                  <th style={S.th}>Invoice #</th>
                  <th style={S.th}>Amount</th>
                  <th style={S.th}>Due Date</th>
                </tr></thead>
                <tbody>
                  {customer.invoices.map(inv => (
                    <tr key={inv.id}>
                      <td style={{ ...S.td, fontFamily: 'monospace', fontSize: 12 }}>{inv.invoice_number}</td>
                      <td style={S.td}>{mvr(inv.amount)}</td>
                      <td style={{ ...S.td, color: inv.due_date && inv.due_date < today() ? '#ef4444' : '#6B5D4F' }}>
                        {inv.due_date ?? '—'}
                        {inv.due_date && inv.due_date < today() && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: '#ef4444' }}>OVERDUE</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ))}
        </>
      )}

      {/* ── Promotions Analytics ── */}
      {!loading && tab === 'Promotions' && promoReport && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 20 }}>
            <StatCard label="Total Promotions"  value={String(promoReport.length)}                                                            accent="#D4813A" />
            <StatCard label="Total Redemptions" value={String(promoReport.reduce((s, p) => s + p.redemptions_count, 0))}                      accent="#8b5cf6" />
            <StatCard label="Total Discounts"   value={mvr(promoReport.reduce((s, p) => s + (p.total_discount_laar ?? 0), 0) / 100)}          accent="#ef4444" />
          </div>
          {promoReport.length === 0 ? (
            <Card><p style={{ textAlign: 'center', padding: '32px 0', color: '#9C8E7E', fontSize: 14 }}>No promotion data.</p></Card>
          ) : (
            <Card>
              <table style={S.table}>
                <thead><tr>
                  <th style={S.th}>Promotion</th>
                  <th style={S.th}>Code</th>
                  <th style={S.th}>Redemptions</th>
                  <th style={S.th}>Total Discount</th>
                  <th style={S.th}>Avg Discount</th>
                </tr></thead>
                <tbody>
                  {promoReport.map((p) => (
                    <tr key={p.id}>
                      <td style={{ ...S.td, fontWeight: 600 }}>{p.name}</td>
                      <td style={{ ...S.td, fontFamily: 'monospace', fontSize: 12 }}>{p.code}</td>
                      <td style={S.td}>{p.redemptions_count.toLocaleString()}</td>
                      <td style={S.td}>{mvr((p.total_discount_laar ?? 0) / 100)}</td>
                      <td style={S.td}>{p.redemptions_count > 0 ? mvr((p.total_discount_laar ?? 0) / 100 / p.redemptions_count) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}

      {/* ── Loyalty Analytics ── */}
      {!loading && tab === 'Loyalty' && loyaltyReport && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 20 }}>
            <StatCard label="Total Members"         value={loyaltyReport.total_accounts.toLocaleString()}           accent="#D4813A" />
            <StatCard label="Outstanding Points"    value={loyaltyReport.total_outstanding_points.toLocaleString()} accent="#ef4444" />
            <StatCard label="Lifetime Points Issued" value={loyaltyReport.total_earned_lifetime.toLocaleString()}   accent="#8b5cf6" />
          </div>
          <Card>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1C1408', margin: '0 0 16px' }}>Members by Tier</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
              {[
                { tier: 'Bronze',   count: loyaltyReport.bronze_count,   color: '#B45309', bg: '#FEF3E2' },
                { tier: 'Silver',   count: loyaltyReport.silver_count,   color: '#6B5D4F', bg: '#F0EBE5' },
                { tier: 'Gold',     count: loyaltyReport.gold_count,     color: '#92400E', bg: '#FFFBEB' },
                { tier: 'Platinum', count: loyaltyReport.platinum_count, color: '#1D4ED8', bg: '#EFF6FF' },
              ].map(({ tier, count, color, bg }) => (
                <div key={tier} style={{ background: bg, borderRadius: 10, padding: '16px', textAlign: 'center' }}>
                  <p style={{ fontSize: 22, fontWeight: 800, color, margin: 0 }}>{count}</p>
                  <p style={{ fontSize: 12, color, opacity: 0.8, margin: '4px 0 0', textTransform: 'capitalize' }}>{tier}</p>
                  <p style={{ fontSize: 11, color: '#9C8E7E', margin: '2px 0 0' }}>
                    {loyaltyReport.total_accounts > 0 ? `${((count / loyaltyReport.total_accounts) * 100).toFixed(1)}%` : '0%'}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </>
  );
}
