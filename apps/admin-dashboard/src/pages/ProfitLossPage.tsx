import { useEffect, useState } from 'react';
import { getProfitAndLoss, getCashFlow, getDailySummary, type PnLReport } from '../api';
import { Btn, Card, ErrorMsg, PageHeader, Spinner } from '../components/Layout';

function today() { return new Date().toISOString().slice(0, 10); }
function monthStart() { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); }

function StatCard({ label, value, sub, positive }: { label: string; value: string; sub?: string; positive?: boolean }) {
  const color = positive === undefined ? '#0f172a' : positive ? '#16a34a' : '#dc2626';
  return (
    <Card>
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{sub}</div>}
    </Card>
  );
}

function ProgressBar({ pct, color = '#0ea5e9' }: { pct: number; color?: string }) {
  return (
    <div style={{ height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden', flex: 1 }}>
      <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, pct))}%`, background: color, borderRadius: 4, transition: 'width 0.6s ease' }} />
    </div>
  );
}

export function ProfitLossPage() {
  const [pnl, setPnl]             = useState<PnLReport | null>(null);
  const [cashFlow, setCashFlow]   = useState<{ total_inflow: number; total_outflow: number; net_cash_flow: number; days: { date: string; inflow: number; outflow: number; net: number; running_balance: number }[] } | null>(null);
  const [daily, setDaily]         = useState<{ revenue: number; orders: number; avg_order: number; net_profit: number; top_items: { name: string; qty: number; revenue: number }[] } | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [from, setFrom]           = useState(monthStart());
  const [to, setTo]               = useState(today());

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [pnlRes, cfRes, dailyRes] = await Promise.all([
        getProfitAndLoss(from, to),
        getCashFlow(from, to),
        getDailySummary(today()),
      ]);
      setPnl(pnlRes);
      setCashFlow(cfRes);
      setDaily(dailyRes);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [from, to]);

  return (
    <>
      <PageHeader title="Profit & Loss" subtitle="Financial performance overview" />
      {error && <ErrorMsg message={error} />}

      {/* Date filter */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14 }} />
        <span style={{ color: '#94a3b8' }}>to</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14 }} />
        {[7, 30, 90].map(d => (
          <button key={d} onClick={() => { const nd = new Date(); nd.setDate(nd.getDate() - d); setFrom(nd.toISOString().slice(0, 10)); setTo(today()); }}
            style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 13 }}>
            {d}d
          </button>
        ))}
        <Btn onClick={load}>Refresh</Btn>
      </div>

      {loading ? <Spinner /> : (
        <>
          {/* Today's snapshot */}
          {daily && (
            <div style={{ background: '#fffbeb', border: '1px solid #fef08a', borderRadius: 12, padding: 16, marginBottom: 24 }}>
              <div style={{ fontWeight: 700, marginBottom: 12, color: '#92400e' }}>Today's Snapshot</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
                <StatCard label="Today Revenue" value={`MVR ${daily.revenue.toFixed(2)}`} />
                <StatCard label="Orders" value={String(daily.orders)} sub={`Avg MVR ${daily.avg_order.toFixed(2)}`} />
                <StatCard label="Net Profit" value={`MVR ${daily.net_profit.toFixed(2)}`} positive={daily.net_profit >= 0} />
                <div />
              </div>
            </div>
          )}

          {/* P&L Summary */}
          {pnl && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
                <StatCard label="Gross Revenue" value={`MVR ${pnl.revenue.gross.toFixed(2)}`} sub={`${pnl.revenue.orders} orders`} />
                <StatCard label="Gross Profit" value={`MVR ${pnl.gross_profit.toFixed(2)}`} positive={pnl.gross_profit >= 0} sub={`Margin: ${pnl.gross_margin_pct}%`} />
                <StatCard label="Operating Expenses" value={`MVR ${pnl.expenses.total.toFixed(2)}`} />
                <StatCard label="Net Profit" value={`MVR ${pnl.operating_profit.toFixed(2)}`} positive={pnl.operating_profit >= 0} sub={`Margin: ${pnl.net_profit_margin_pct}%`} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
                {/* P&L Waterfall */}
                <Card>
                  <div style={{ fontWeight: 700, marginBottom: 16 }}>P&L Breakdown</div>
                  {[
                    { label: 'Gross Revenue', value: pnl.revenue.gross, color: '#22c55e' },
                    { label: 'Cost of Goods (COGS)', value: -pnl.cogs, color: '#ef4444' },
                    { label: 'Operating Expenses', value: -pnl.expenses.total, color: '#f97316' },
                    { label: 'Waste Cost', value: -pnl.waste_cost, color: '#f59e0b' },
                    { label: 'Net Profit', value: pnl.operating_profit, color: pnl.operating_profit >= 0 ? '#6366f1' : '#dc2626' },
                  ].map(row => (
                    <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                      <div style={{ width: 140, fontSize: 13, color: '#475569', flexShrink: 0 }}>{row.label}</div>
                      <ProgressBar pct={Math.abs(row.value) / pnl.revenue.gross * 100} color={row.color} />
                      <div style={{ width: 100, textAlign: 'right', fontWeight: 700, color: row.value >= 0 ? '#16a34a' : '#dc2626', fontSize: 13 }}>
                        {row.value < 0 ? '−' : ''}MVR {Math.abs(row.value).toFixed(2)}
                      </div>
                    </div>
                  ))}
                </Card>

                {/* Expenses by category */}
                <Card>
                  <div style={{ fontWeight: 700, marginBottom: 16 }}>Expenses by Category</div>
                  {pnl.expenses.by_category.length === 0 && <div style={{ color: '#94a3b8', fontSize: 13 }}>No expenses in period</div>}
                  {pnl.expenses.by_category.map(cat => (
                    <div key={cat.category} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <span style={{ fontSize: 13, color: '#475569' }}>{cat.icon} {cat.category}</span>
                      <span style={{ fontWeight: 700, fontSize: 13 }}>MVR {(cat.total as number).toFixed(2)}</span>
                    </div>
                  ))}
                </Card>
              </div>
            </>
          )}

          {/* Cash Flow summary */}
          {cashFlow && (
            <Card>
              <div style={{ fontWeight: 700, marginBottom: 16 }}>Cash Flow Summary</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
                <StatCard label="Total Inflow" value={`MVR ${cashFlow.total_inflow.toFixed(2)}`} positive={true} />
                <StatCard label="Total Outflow" value={`MVR ${cashFlow.total_outflow.toFixed(2)}`} positive={false} />
                <StatCard label="Net Cash Flow" value={`MVR ${cashFlow.net_cash_flow.toFixed(2)}`} positive={cashFlow.net_cash_flow >= 0} />
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                      {['Date', 'Inflow', 'Outflow', 'Net', 'Running Balance'].map(h => (
                        <th key={h} style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#475569', fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cashFlow.days.filter(d => d.inflow > 0 || d.outflow > 0).slice(-14).map(d => (
                      <tr key={d.date} style={{ borderBottom: '1px solid #f8fafc' }}>
                        <td style={{ padding: '7px 10px', color: '#64748b', textAlign: 'left' }}>{d.date}</td>
                        <td style={{ padding: '7px 10px', color: '#16a34a', textAlign: 'right', fontWeight: 600 }}>+{d.inflow.toFixed(2)}</td>
                        <td style={{ padding: '7px 10px', color: '#dc2626', textAlign: 'right', fontWeight: 600 }}>-{d.outflow.toFixed(2)}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: d.net >= 0 ? '#16a34a' : '#dc2626' }}>{d.net.toFixed(2)}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>{d.running_balance.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </>
  );
}
