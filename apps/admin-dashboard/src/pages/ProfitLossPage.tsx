import { useEffect, useState } from 'react';
import { getProfitAndLoss, getCashFlow, getDailySummary, type PnLReport } from '../api';
import {
  Btn, Card, DateInput, ErrorMsg, PageHeader, PageShell, Spinner, StatCard, TableCard, TD, TH,
} from '../components/SharedUI';
import { usePageTitle } from '../hooks/usePageTitle';

import { today, daysAgo, monthStart } from '../utils/dateHelpers';

function ProgressBar({ pct, color = 'var(--color-primary)' }: { pct: number; color?: string }) {
  return (
    <div style={{ height: 8, background: 'var(--color-border-light)', borderRadius: 4, overflow: 'hidden', flex: 1 }}>
      <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, pct))}%`, background: color, borderRadius: 4, transition: 'width 0.6s ease' }} />
    </div>
  );
}

export function ProfitLossPage() {
  usePageTitle('Profit & Loss');
  const [pnl, setPnl]           = useState<PnLReport | null>(null);
  const [cashFlow, setCashFlow] = useState<{
    total_inflow: number;
    total_wholesale_inflow?: number;
    total_outflow: number;
    net_cash_flow: number;
    days: { date: string; inflow: number; wholesale_inflow?: number; outflow: number; net: number; running_balance: number }[];
  } | null>(null);
  const [daily, setDaily]       = useState<{ revenue: number; orders: number; avg_order: number; net_profit: number; wholesale_revenue?: number } | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [from, setFrom]         = useState(monthStart());
  const [to, setTo]             = useState(today());

  const load = async () => {
    setLoading(true); setError('');
    try {
      // Use the END of the selected range for the "snapshot" panel —
      // previously this hard-coded `today()` which made the snapshot
      // disagree with the rest of the page whenever the user picked
      // a historical date range (audit BE-006 ADM-006).
      const [pnlRes, cfRes, dailyRes] = await Promise.all([
        getProfitAndLoss(from, to),
        getCashFlow(from, to),
        getDailySummary(to),
      ]);
      setPnl(pnlRes); setCashFlow(cfRes); setDaily(dailyRes);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [from, to]);

  return (
    <PageShell>
    <>
      <PageHeader section="Analyze" title="Profit & Loss" subtitle="Financial performance overview" />
      {error && <ErrorMsg message={error} />}

      {/* Date filter */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <DateInput label="From" value={from} onChange={setFrom} />
        <DateInput label="To" value={to} onChange={setTo} />
        {[7, 30, 90].map((d) => (
          <Btn key={d} small variant="secondary" onClick={() => { setFrom(daysAgo(d)); setTo(today()); }}>{d}d</Btn>
        ))}
      </div>

      {loading ? <Spinner /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* End-date daily snapshot */}
          {daily && (
            <div style={{ background: '#fffbeb', border: '1px solid #fef08a', borderRadius: 14, padding: 20 }}>
              <p style={{ fontWeight: 700, marginBottom: 16, color: 'var(--color-warning-strong)', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 16px' }}>
                {to === today() ? "Today's Snapshot" : `Snapshot — ${to}`}
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
                <StatCard label="Retail Revenue" value={`MVR ${parseFloat(String(daily.revenue ?? 0)).toFixed(2)}`} accent="var(--color-primary)" />
                <StatCard label="Wholesale Revenue" value={`MVR ${parseFloat(String(daily.wholesale_revenue ?? 0)).toFixed(2)}`} accent="var(--color-primary)" />
                <StatCard label="Orders" value={String(daily.orders)} sub={`Avg MVR ${parseFloat(String(daily.avg_order ?? 0)).toFixed(2)}`} accent="#8b5cf6" />
                <StatCard label="Net Profit" value={`MVR ${parseFloat(String(daily.net_profit ?? 0)).toFixed(2)}`} accent={daily.net_profit >= 0 ? 'var(--color-success)' : 'var(--color-danger)'} />
              </div>
            </div>
          )}

          {/* P&L KPIs */}
          {pnl && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
                {/* Net of GST: the 8% on the bill is collected for MIRA, not
                    earned, so every profit figure below starts from what the
                    shop keeps. Takings incl. GST stay visible as the sub. */}
                <StatCard label="Retail Revenue" value={`MVR ${parseFloat(String(pnl.revenue.net ?? 0)).toFixed(2)}`} sub={`${pnl.revenue.orders} orders · MVR ${parseFloat(String(pnl.revenue.gross ?? 0)).toFixed(2)} incl. GST`} accent="var(--color-primary)" />
                <StatCard label="Wholesale Revenue" value={`MVR ${(parseFloat(String(pnl.revenue.wholesale ?? 0)) - parseFloat(String(pnl.revenue.wholesale_tax ?? 0))).toFixed(2)}`} sub="Trade invoices, ex GST" accent="var(--color-primary)" />
                <StatCard label="Gross Profit"  value={`MVR ${parseFloat(String(pnl.gross_profit ?? 0)).toFixed(2)}`} sub={`Margin: ${pnl.gross_margin_pct}%`} accent={pnl.gross_profit >= 0 ? 'var(--color-success)' : 'var(--color-danger)'} />
                <StatCard label="Operating Expenses" value={`MVR ${parseFloat(String(pnl.expenses.total ?? 0)).toFixed(2)}`} accent="#f97316" />
                <StatCard label="Net Profit"    value={`MVR ${parseFloat(String(pnl.operating_profit ?? 0)).toFixed(2)}`} sub={`Margin: ${pnl.net_profit_margin_pct}%`} accent={pnl.operating_profit >= 0 ? 'var(--color-success)' : 'var(--color-danger)'} />
              </div>

              <div className="form-grid-2" data-responsive-grid style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                {/* P&L Waterfall */}
                <Card>
                  <p style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-text)', marginBottom: 20, margin: '0 0 20px' }}>P&L Breakdown</p>
                  {[
                    { label: 'Takings incl. GST',      value: pnl.revenue.gross,                 color: 'var(--color-success)' },
                    { label: 'GST for MIRA',           value: -(pnl.revenue.tax ?? 0),           color: 'var(--color-text-muted)' },
                    { label: 'Refunds',                value: -(pnl.revenue.refunds ?? 0),       color: 'var(--color-warning)' },
                    { label: 'Wholesale Revenue',      value: (pnl.revenue.wholesale ?? 0) - (pnl.revenue.wholesale_tax ?? 0), color: 'var(--color-success)' },
                    // Every ingredient bought, retail and wholesale alike —
                    // the shop's cost is what it bought, not a per-dish sum.
                    { label: 'Ingredients bought',     value: -pnl.cogs,                         color: 'var(--color-danger)' },
                    { label: 'Operating Expenses',     value: -pnl.expenses.total,               color: '#f97316' },
                    // Recipe-priced cost of the goods on trade invoices. Those
                    // ingredients are inside "bought" already — shown to be
                    // compared, not subtracted a second time.
                    { label: 'Wholesale recipe cost (info)', value: -(pnl.wholesale_cogs ?? 0),  color: 'var(--color-text-muted)', info: true },
                    // Waste money is already inside COGS (the ingredients were
                    // bought) — shown to be watched, not subtracted again.
                    { label: 'of which wasted (info)',  value: -pnl.waste_cost,                  color: 'var(--color-text-muted)', info: true },
                    { label: 'Wholesale waste (info)', value: -(pnl.wholesale_waste_cost ?? 0),  color: 'var(--color-text-muted)', info: true },
                    { label: 'Net Profit',             value: pnl.operating_profit,              color: pnl.operating_profit >= 0 ? 'var(--color-primary)' : 'var(--color-danger-strong)' },
                  ].map((row: { label: string; value: number; color: string; info?: boolean }) => (
                    <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, opacity: row.info ? 0.75 : 1 }}>
                      <div style={{ width: 150, fontSize: 12, color: 'var(--color-text-secondary)', flexShrink: 0 }}>{row.label}</div>
                      <ProgressBar pct={pnl.revenue.gross !== 0 ? Math.abs(row.value) / pnl.revenue.gross * 100 : 0} color={row.color} />
                      <div style={{ width: 100, textAlign: 'right', fontWeight: 700, color: row.info ? 'var(--color-text-muted)' : row.value >= 0 ? 'var(--color-success-strong)' : 'var(--color-danger-strong)', fontSize: 13, flexShrink: 0 }}>
                        {row.info || row.value >= 0 ? '' : '−'}MVR {parseFloat(String(Math.abs(row.value) ?? 0)).toFixed(2)}
                      </div>
                    </div>
                  ))}
                </Card>

                {/* Expenses by category */}
                <Card>
                  <p style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-text)', marginBottom: 20, margin: '0 0 20px' }}>Expenses by Category</p>
                  {(pnl.expenses.by_category ?? []).length === 0 && (
                    <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>No expenses in this period.</p>
                  )}
                  {(pnl.expenses.by_category ?? []).map((cat) => (
                    <div key={cat.category} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{cat.icon} {cat.category}</span>
                      <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--color-text)' }}>MVR {parseFloat(String(cat.total ?? 0)).toFixed(2)}</span>
                    </div>
                  ))}
                </Card>
              </div>
            </>
          )}

          {/* Cash Flow */}
          {cashFlow && (
            <Card>
              <p style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-text)', marginBottom: 16, margin: '0 0 16px' }}>Cash Flow Summary</p>
              <div className="stat-grid" data-responsive-grid style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
                <StatCard label="Retail Inflow" value={`MVR ${parseFloat(String(cashFlow.total_inflow ?? 0)).toFixed(2)}`} accent="var(--color-success)" />
                <StatCard label="Wholesale Inflow" value={`MVR ${parseFloat(String(cashFlow.total_wholesale_inflow ?? 0)).toFixed(2)}`} accent="var(--color-success)" />
                <StatCard label="Total Outflow"  value={`MVR ${parseFloat(String(cashFlow.total_outflow ?? 0)).toFixed(2)}`}  accent="var(--color-danger)" />
                <StatCard label="Net Cash Flow"  value={`MVR ${parseFloat(String(cashFlow.net_cash_flow ?? 0)).toFixed(2)}`}  accent={cashFlow.net_cash_flow >= 0 ? 'var(--color-success)' : 'var(--color-danger)'} />
              </div>
              <TableCard>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      {['Date', 'Retail inflow', 'Wholesale', 'Outflow', 'Net', 'Running Balance'].map((h) => (
                        <th key={h} style={{ ...TH, textAlign: 'right' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(cashFlow.days ?? []).filter((d) => d.inflow > 0 || d.outflow > 0 || (d.wholesale_inflow ?? 0) > 0).slice(-14).map((d) => (
                      <tr key={d.date}>
                        <td style={{ ...TD, textAlign: 'left', color: 'var(--color-text-secondary)' }}>{d.date}</td>
                        <td style={{ ...TD, textAlign: 'right', color: 'var(--color-success-strong)', fontWeight: 600 }}>+{parseFloat(String(d.inflow ?? 0)).toFixed(2)}</td>
                        <td style={{ ...TD, textAlign: 'right', color: 'var(--color-success-strong)', fontWeight: 600 }}>+{parseFloat(String(d.wholesale_inflow ?? 0)).toFixed(2)}</td>
                        <td style={{ ...TD, textAlign: 'right', color: 'var(--color-danger-strong)', fontWeight: 600 }}>-{parseFloat(String(d.outflow ?? 0)).toFixed(2)}</td>
                        <td style={{ ...TD, textAlign: 'right', fontWeight: 700, color: d.net >= 0 ? 'var(--color-success-strong)' : 'var(--color-danger-strong)' }}>{parseFloat(String(d.net ?? 0)).toFixed(2)}</td>
                        <td style={{ ...TD, textAlign: 'right', fontWeight: 700, color: 'var(--color-text)' }}>{parseFloat(String(d.running_balance ?? 0)).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableCard>
            </Card>
          )}
        </div>
      )}
    </>

    </PageShell>
  );
}
