import { useEffect, useState } from 'react';
import { getDailySummary } from '../api';
import { usePageTitle } from '../hooks/usePageTitle';

type DailySummary = {
  date: string;
  revenue: number;
  tax: number;
  orders: number;
  avg_order: number;
  expenses: number;
  purchases: number;
  waste_cost: number;
  net_profit: number;
  by_type: { type: string; count: number; revenue: number }[];
  top_items: { name: string; qty: number; revenue: number }[];
};

function formatMVR(laari: number): string {
  return 'MVR ' + (laari / 100).toFixed(2);
}

function KPICard({
  label, value, sub, color = '#0ea5e9',
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div style={{
      background: '#fff', borderRadius: 12, padding: '20px 24px',
      boxShadow: '0 1px 4px rgba(0,0,0,0.07)', borderLeft: `4px solid ${color}`,
      minWidth: 0,
    }}>
      <p style={{ fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
        {label}
      </p>
      <p style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>{value}</p>
      {sub && <p style={{ fontSize: 12, color: '#94a3b8' }}>{sub}</p>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontSize: 15, fontWeight: 700, color: '#334155', marginBottom: 12, marginTop: 8 }}>
      {children}
    </h2>
  );
}

export function DashboardPage() {
    usePageTitle('Dashboard');
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [data, setData] = useState<DailySummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = (d: string) => {
    setLoading(true);
    setError('');
    getDailySummary(d)
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(date); }, [date]);

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>Dashboard</h1>
          <p style={{ fontSize: 13, color: '#64748b' }}>Daily snapshot for operations at a glance</p>
        </div>
        <input
          type="date"
          value={date}
          max={today}
          onChange={(e) => setDate(e.target.value)}
          style={{
            border: '1px solid #e2e8f0', borderRadius: 8, padding: '7px 12px',
            fontSize: 13, color: '#1e293b', outline: 'none',
          }}
        />
      </div>

      {error && (
        <div style={{ background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', color: '#991b1b', fontSize: 13 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8', fontSize: 14 }}>Loading…</div>
      ) : data ? (
        <>
          {/* Revenue KPIs */}
          <div>
            <SectionTitle>Revenue & Sales</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
              <KPICard
                label="Total Revenue"
                value={formatMVR(data.revenue)}
                color="#0ea5e9"
              />
              <KPICard
                label="Net Profit"
                value={formatMVR(data.net_profit)}
                color={data.net_profit >= 0 ? '#22c55e' : '#ef4444'}
              />
              <KPICard
                label="Orders"
                value={String(data.orders)}
                sub={`Avg: ${formatMVR(data.avg_order)}`}
                color="#8b5cf6"
              />
              <KPICard
                label="Tax Collected"
                value={formatMVR(data.tax)}
                color="#f59e0b"
              />
            </div>
          </div>

          {/* Cost KPIs */}
          <div>
            <SectionTitle>Costs</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
              <KPICard label="Expenses" value={formatMVR(data.expenses)} color="#f97316" />
              <KPICard label="Purchases" value={formatMVR(data.purchases)} color="#6366f1" />
              <KPICard label="Waste Cost" value={formatMVR(data.waste_cost)} color="#ef4444" />
            </div>
          </div>

          {/* Orders by type */}
          {data.by_type.length > 0 && (
            <div>
              <SectionTitle>Orders by Channel</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 420 }}>
                {data.by_type.map((t) => (
                  <div key={t.type} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: '#fff', borderRadius: 8, padding: '10px 14px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  }}>
                    <span style={{ flex: 1, fontSize: 13, textTransform: 'capitalize', color: '#334155' }}>{t.type}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#64748b' }}>{t.count} orders</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', minWidth: 90, textAlign: 'right' }}>
                      {formatMVR(t.revenue)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top items */}
          {data.top_items.length > 0 && (
            <div>
              <SectionTitle>Top Selling Items</SectionTitle>
              <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      <th style={{ padding: '10px 16px', textAlign: 'left', color: '#64748b', fontWeight: 600 }}>Item</th>
                      <th style={{ padding: '10px 16px', textAlign: 'right', color: '#64748b', fontWeight: 600 }}>Qty</th>
                      <th style={{ padding: '10px 16px', textAlign: 'right', color: '#64748b', fontWeight: 600 }}>Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.top_items.map((item, i) => (
                      <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '10px 16px', color: '#1e293b' }}>{item.name}</td>
                        <td style={{ padding: '10px 16px', textAlign: 'right', color: '#475569' }}>{item.qty}</td>
                        <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600, color: '#0f172a' }}>
                          {formatMVR(item.revenue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
