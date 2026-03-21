import { useEffect, useState } from 'react';
import { getProfitAndLoss, getCashFlow, getDailySummary, type PnLReport } from '../api';
import { Btn, Card, DateInput, ErrorMsg, PageHeader, Spinner, StatCard, TableCard, TD, TH } from '../components/Layout';
import { usePageTitle } from '../hooks/usePageTitle';

function today() { return new Date().toISOString().slice(0, 10); }
function daysAgo(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }
function monthStart() { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); }

function ProgressBar({ pct, color = '#D4813A' }: { pct: number; color?: string }) {
  return (
    <div style={{ height: 8, background: '#F0EBE5', borderRadius: 4, overflow: 'hidden', flex: 1 }}>
      <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, pct))}%`, background: color, borderRadius: 4, transition: 'width 0.6s ease' }} />
    </div>
  );
}

export function ProfitLossPage() {
  usePageTitle('Profit & Loss');
  const [pnl, setPnl]           = useState<PnLReport | null>(null);
  const [cashFlow, setCashFlow] = useState<{ total_inflow: number; total_outflow: number; net_cash_flow: number; days: { date: string; inflow: number; outflow: number; net: number; running_balance: number }[] } | null>(null);
  const [daily, setDaily]       = useState<{ revenue: number; orders: number; avg_order: number; net_profit: number } | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [from, setFrom]         = useState(monthStart());
  const [to, setTo]             = useState(today());

  const load = async () => {
    setLoading(true); setError('');
    try {
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
    <>
      <PageHeader title="Profit & Loss" subtitle="Financial performance overview" />
      {error && <ErrorMsg message={error} />}

      {/* Date filter */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <DateInput label="From" value={from} onChange={setFrom} />
        <DateInput label="To" value={to} onChange={setTo} />
        {[7, 30, 90].map((d) => (
          <Btn key={d} small variant="secondary" onClick={() => { setFrom(daysAgo(d)); setTo(today()); }}>{d}d</Btn>
        ))}
        <Btn small onClick={load}>Apply</Btn>
      </div>

      {loading ? <Spinner /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* End-date daily snapshot */}
          {daily && (
            <div style={{ background: '#fffbeb', border: '1px solid #fef08a', borderRadius: 14, padding: 20 }}>
              <p style={{ fontWeight: 700, marginBottom: 16, color: '#92400e', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 16px' }}>
                Snapshot — {to}
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
                <StatCard label="Revenue" value={`MVR ${parseFloat(String(daily.revenue ?? 0)).toFixed(2)}`} accent="#D4813A" />
                <StatCard label="Orders" value={String(daily.orders)} sub={`Avg MVR ${parseFloat(String(daily.avg_order ?? 0)).toFixed(2)}`} accent="#8b5cf6" />
                <StatCard label="Net Profit" value={`MVR ${parseFloat(String(daily.net_profit ?? 0)).toFixed(2)}`} accent={daily.net_profit >= 0 ? '#22c55e' : '#ef4444'} />
              </div>
            </div>
          )}

          {/* P&L KPIs */}
          {pnl && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
                <StatCard label="Gross Revenue" value={`MVR ${parseFloat(String(pnl.revenue.gross ?? 0)).toFixed(2)}`} sub={`${pnl.revenue.orders} orders`} accent="#D4813A" />
                <StatCard label="Gross Profit"  value={`MVR ${parseFloat(String(pnl.gross_profit ?? 0)).toFixed(2)}`} sub={`Margin: ${pnl.gross_margin_pct}%`} accent={pnl.gross_profit >= 0 ? '#22c55e' : '#ef4444'} />
                <StatCard label="Operating Expenses" value={`MVR ${parseFloat(String(pnl.expenses.total ?? 0)).toFixed(2)}`} accent="#f97316" />
                <StatCard label="Net Profit"    value={`MVR ${parseFloat(String(pnl.operating_profit ?? 0)).toFixed(2)}`} sub={`Margin: ${pnl.net_profit_margin_pct}%`} accent={pnl.operating_profit >= 0 ? '#22c55e' : '#ef4444'} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                {/* P&L Waterfall */}
                <Card>
                  <p style={{ fontWeight: 700, fontSize: 14, color: '#1C1408', marginBottom: 20, margin: '0 0 20px' }}>P&L Breakdown</p>
                  {[
                    { label: 'Gross Revenue',       value: pnl.revenue.gross,       color: '#22c55e' },
                    { label: 'Cost of Goods (COGS)', value: -pnl.cogs,               color: '#ef4444' },
                    { label: 'Operating Expenses',   value: -pnl.expenses.total,     color: '#f97316' },
                    { label: 'Waste Cost',           value: -pnl.waste_cost,         color: '#f59e0b' },
                    { label: 'Net Profit',           value: pnl.operating_profit,    color: pnl.operating_profit >= 0 ? '#D4813A' : '#dc2626' },
                  ].map((row) => (
                    <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                      <div style={{ width: 150, fontSize: 12, color: '#6B5D4F', flexShrink: 0 }}>{row.label}</div>
                      <ProgressBar pct={pnl.revenue.gross !== 0 ? Math.abs(row.value) / pnl.revenue.gross * 100 : 0} color={row.color} />
                      <div style={{ width: 100, textAlign: 'right', fontWeight: 700, color: row.value >= 0 ? '#16a34a' : '#dc2626', fontSize: 13, flexShrink: 0 }}>
                        {row.value < 0 ? '−' : ''}MVR {parseFloat(String(Math.abs(row.value) ?? 0)).toFixed(2)}
                      </div>
                    </div>
                  ))}
                </Card>

                {/* Expenses by category */}
                <Card>
                  <p style={{ fontWeight: 700, fontSize: 14, color: '#1C1408', marginBottom: 20, margin: '0 0 20px' }}>Expenses by Category</p>
                  {pnl.expenses.by_category.length === 0 && (
                    <p style={{ color: '#9C8E7E', fontSize: 13 }}>No expenses in this period.</p>
                  )}
                  {pnl.expenses.by_category.map((cat) => (
                    <div key={cat.category} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <span style={{ fontSize: 13, color: '#6B5D4F' }}>{cat.icon} {cat.category}</span>
                      <span style={{ fontWeight: 700, fontSize: 13, color: '#1C1408' }}>MVR {parseFloat(String(cat.total ?? 0)).toFixed(2)}</span>
                    </div>
                  ))}
                </Card>
              </div>
            </>
          )}

          {/* Cash Flow */}
          {cashFlow && (
            <Card>
              <p style={{ fontWeight: 700, fontSize: 14, color: '#1C1408', marginBottom: 16, margin: '0 0 16px' }}>Cash Flow Summary</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
                <StatCard label="Total Inflow"   value={`MVR ${parseFloat(String(cashFlow.total_inflow ?? 0)).toFixed(2)}`}   accent="#22c55e" />
                <StatCard label="Total Outflow"  value={`MVR ${parseFloat(String(cashFlow.total_outflow ?? 0)).toFixed(2)}`}  accent="#ef4444" />
                <StatCard label="Net Cash Flow"  value={`MVR ${parseFloat(String(cashFlow.net_cash_flow ?? 0)).toFixed(2)}`}  accent={cashFlow.net_cash_flow >= 0 ? '#22c55e' : '#ef4444'} />
              </div>
              <TableCard>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      {['Date', 'Inflow', 'Outflow', 'Net', 'Running Balance'].map((h) => (
                        <th key={h} style={{ ...TH, textAlign: 'right' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cashFlow.days.filter((d) => d.inflow > 0 || d.outflow > 0).slice(-14).map((d) => (
                      <tr key={d.date}>
                        <td style={{ ...TD, textAlign: 'left', color: '#6B5D4F' }}>{d.date}</td>
                        <td style={{ ...TD, textAlign: 'right', color: '#16a34a', fontWeight: 600 }}>+{parseFloat(String(d.inflow ?? 0)).toFixed(2)}</td>
                        <td style={{ ...TD, textAlign: 'right', color: '#dc2626', fontWeight: 600 }}>-{parseFloat(String(d.outflow ?? 0)).toFixed(2)}</td>
                        <td style={{ ...TD, textAlign: 'right', fontWeight: 700, color: d.net >= 0 ? '#16a34a' : '#dc2626' }}>{parseFloat(String(d.net ?? 0)).toFixed(2)}</td>
                        <td style={{ ...TD, textAlign: 'right', fontWeight: 700, color: '#1C1408' }}>{parseFloat(String(d.running_balance ?? 0)).toFixed(2)}</td>
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
  );
}
