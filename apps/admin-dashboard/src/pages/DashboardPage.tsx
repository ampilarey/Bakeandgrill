import { useEffect, useState } from 'react';
import { getDailySummary } from '../api';
import { Card, DateInput, ErrorMsg, PageHeader, SectionLabel, Spinner, StatCard, TD, TH, TableCard } from '../components/Layout';
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

function fmt(val: unknown) { return 'MVR ' + parseFloat(String(val ?? 0)).toFixed(2); }

export function DashboardPage() {
  usePageTitle('Dashboard');
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [data, setData] = useState<DailySummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = (d: string) => {
    setLoading(true); setError('');
    getDailySummary(d)
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(date); }, [date]);

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Daily snapshot for operations at a glance"
        action={<DateInput value={date} max={today} onChange={(v) => setDate(v)} />}
      />

      {error && <ErrorMsg message={error} />}

      {loading ? <Spinner /> : data ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Revenue KPIs */}
          <div>
            <SectionLabel>Revenue & Sales</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
              <StatCard label="Total Revenue"  value={fmt(data.revenue)}   accent="#D4813A" />
              <StatCard label="Net Profit"     value={fmt(data.net_profit)} accent={data.net_profit >= 0 ? '#22c55e' : '#ef4444'} />
              <StatCard label="Orders"         value={String(data.orders)} sub={`Avg: ${fmt(data.avg_order)}`} accent="#8b5cf6" />
              <StatCard label="Tax Collected"  value={fmt(data.tax)}       accent="#f59e0b" />
            </div>
          </div>

          {/* Cost KPIs */}
          <div>
            <SectionLabel>Costs</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
              <StatCard label="Expenses"   value={fmt(data.expenses)}  accent="#f97316" />
              <StatCard label="Purchases"  value={fmt(data.purchases)} accent="#6366f1" />
              <StatCard label="Waste Cost" value={fmt(data.waste_cost)} accent="#ef4444" />
            </div>
          </div>

          {/* Orders by channel */}
          {data.by_type.length > 0 && (
            <div>
              <SectionLabel>Orders by Channel</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 440 }}>
                {data.by_type.map((t) => (
                  <div key={t.type} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    background: '#fff', borderRadius: 10, padding: '11px 16px',
                    border: '1px solid #E8E0D8',
                  }}>
                    <span style={{ flex: 1, fontSize: 13, textTransform: 'capitalize', color: '#1C1408', fontWeight: 600 }}>{t.type.replace('_', ' ')}</span>
                    <span style={{ fontSize: 13, color: '#9C8E7E' }}>{t.count} orders</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#D4813A', minWidth: 90, textAlign: 'right' }}>
                      {fmt(t.revenue)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top items */}
          {data.top_items.length > 0 && (
            <div>
              <SectionLabel>Top Selling Items</SectionLabel>
              <TableCard>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr>
                      <th style={TH}>Item</th>
                      <th style={{ ...TH, textAlign: 'right' }}>Qty</th>
                      <th style={{ ...TH, textAlign: 'right' }}>Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.top_items.map((item, i) => (
                      <tr key={i}>
                        <td style={TD}>{item.name}</td>
                        <td style={{ ...TD, textAlign: 'right', color: '#6B5D4F' }}>{item.qty}</td>
                        <td style={{ ...TD, textAlign: 'right', fontWeight: 700, color: '#D4813A' }}>
                          {fmt(item.revenue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableCard>
            </div>
          )}

          {data.by_type.length === 0 && data.top_items.length === 0 && (
            <Card>
              <div style={{ textAlign: 'center', padding: '32px 0', color: '#9C8E7E', fontSize: 14 }}>
                No orders recorded for this date.
              </div>
            </Card>
          )}
        </div>
      ) : null}
    </>
  );
}
