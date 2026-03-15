import { useEffect, useState } from 'react';
import { getSalesTrends, getRevenueForecast, getInventoryForecast } from '../api';
import { Btn, Card, ErrorMsg, PageHeader, Spinner } from '../components/Layout';
import { usePageTitle } from '../hooks/usePageTitle';

function today() { return new Date().toISOString().slice(0, 10); }
function daysAgo(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }

const STATUS_COLOR: Record<string, string> = {
  ok:           '#22c55e',
  warning:      '#f59e0b',
  low:          '#f97316',
  critical:     '#ef4444',
  out_of_stock: '#dc2626',
};

const STATUS_BG: Record<string, string> = {
  ok:           '#dcfce7',
  warning:      '#fef3c7',
  low:          '#ffedd5',
  critical:     '#fee2e2',
  out_of_stock: '#fecaca',
};

export function ForecastPage() {
    usePageTitle('Forecasts');
  const [trends, setTrends]     = useState<{ total_revenue: number; total_orders: number; data: { period: string; revenue: number; orders: number; growth_pct: number | null }[] } | null>(null);
  const [forecast, setForecast] = useState<{ weighted_moving_avg: number; growth_rate_pct: number; forecast: { week_start: string; projected_revenue: number }[] } | null>(null);
  const [invForecast, setInv]   = useState<{ items: { id: number; name: string; unit: string; category: string; current_stock: number; daily_usage_rate: number; days_of_stock: number | null; status: string }[] } | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [granularity, setGran]  = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [from, setFrom]         = useState(daysAgo(29));
  const [to, setTo]             = useState(today());

  const load = async () => {
    setLoading(true); setError('');
    const [t, f, i] = await Promise.allSettled([
      getSalesTrends({ granularity, from, to }),
      getRevenueForecast(8, 4),
      getInventoryForecast(),
    ]);
    if (t.status === 'fulfilled') setTrends(t.value);
    else setError(`Sales trends: ${(t.reason as Error).message}`);
    if (f.status === 'fulfilled') setForecast((f.value as typeof f.value & { insufficient_data?: boolean }).insufficient_data ? null : f.value);
    if (i.status === 'fulfilled') setInv(i.value);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [granularity, from, to]);

  const maxRevenue = trends ? Math.max(...trends.data.map(d => d.revenue), 1) : 1;

  return (
    <>
      <PageHeader title="Forecasts & Trends" subtitle="Revenue projections and inventory runway" />
      {error && <ErrorMsg message={error} />}

      {/* Controls */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14 }} />
        <span style={{ color: '#94a3b8' }}>to</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14 }} />
        <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 8, overflow: 'hidden' }}>
          {(['daily', 'weekly', 'monthly'] as const).map(g => (
            <button key={g} onClick={() => setGran(g)}
              style={{ padding: '8px 14px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                background: granularity === g ? '#0f172a' : 'transparent',
                color: granularity === g ? '#fff' : '#64748b' }}>
              {g.charAt(0).toUpperCase() + g.slice(1)}
            </button>
          ))}
        </div>
        <Btn onClick={load}>Refresh</Btn>
      </div>

      {loading ? <Spinner /> : (
        <div style={{ display: 'grid', gap: 20 }}>

          {/* Sales Trends chart (bar chart using divs) */}
          {trends && (
            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>Sales Trends</div>
                  <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>
                    MVR {trends.total_revenue.toFixed(2)} · {trends.total_orders} orders
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 120, overflowX: 'auto', paddingBottom: 8 }}>
                {trends.data.map(d => (
                  <div key={d.period} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, minWidth: 40 }}>
                    <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4 }}>
                      {d.growth_pct !== null ? (d.growth_pct >= 0 ? '+' : '') + d.growth_pct.toFixed(0) + '%' : ''}
                    </div>
                    <div
                      style={{
                        width: 32,
                        height: Math.max(4, (d.revenue / maxRevenue) * 100),
                        background: d.growth_pct !== null && d.growth_pct < 0 ? '#f97316' : '#6366f1',
                        borderRadius: '4px 4px 0 0',
                        transition: 'height 0.4s ease',
                      }}
                      title={`${d.period}: MVR ${d.revenue.toFixed(2)} (${d.orders} orders)`}
                    />
                    <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 4, textAlign: 'center', lineHeight: 1.2, maxWidth: 40 }}>
                      {d.period.slice(-5)}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Revenue forecast */}
          {!forecast && !loading && (
            <Card>
              <div style={{ padding: '24px 0', textAlign: 'center', color: '#94a3b8' }}>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Revenue Forecast</div>
                <div style={{ fontSize: 13 }}>Not enough sales history yet — need at least 2 weeks of completed orders.</div>
              </div>
            </Card>
          )}
          {forecast && (
            <Card>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Revenue Forecast (Next 4 Weeks)</div>
              <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
                Weighted Moving Avg: MVR {forecast.weighted_moving_avg.toFixed(2)}/wk ·
                Growth Rate: <span style={{ color: forecast.growth_rate_pct >= 0 ? '#16a34a' : '#dc2626', fontWeight: 700 }}>
                  {forecast.growth_rate_pct >= 0 ? '+' : ''}{forecast.growth_rate_pct.toFixed(2)}%/wk
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
                {forecast.forecast.map((wk, i) => (
                  <div key={wk.week_start} style={{ background: '#f8fafc', borderRadius: 10, padding: 16, textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>Week {i + 1}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8 }}>{wk.week_start}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: '#6366f1' }}>MVR {wk.projected_revenue.toFixed(2)}</div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Inventory runway */}
          {invForecast && (
            <Card>
              <div style={{ fontWeight: 700, marginBottom: 16 }}>Inventory Runway</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                      {['Item', 'Category', 'Stock', 'Daily Usage', 'Days Left', 'Status'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {invForecast.items.slice(0, 30).map(item => (
                      <tr key={item.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                        <td style={{ padding: '8px 12px', fontWeight: 600, color: '#1e293b' }}>{item.name}</td>
                        <td style={{ padding: '8px 12px', color: '#64748b' }}>{item.category ?? '—'}</td>
                        <td style={{ padding: '8px 12px' }}>{item.current_stock.toFixed(2)} {item.unit}</td>
                        <td style={{ padding: '8px 12px', color: '#64748b' }}>{item.daily_usage_rate.toFixed(3)}/day</td>
                        <td style={{ padding: '8px 12px', fontWeight: 700 }}>
                          {item.days_of_stock === null ? '∞' : item.days_of_stock === 0 ? 'OUT' : `${item.days_of_stock}d`}
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <span style={{ padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                            background: STATUS_BG[item.status] ?? '#f1f5f9',
                            color: STATUS_COLOR[item.status] ?? '#64748b' }}>
                            {item.status.replace('_', ' ').toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {invForecast.items.length === 0 && (
                      <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>No inventory data available</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
