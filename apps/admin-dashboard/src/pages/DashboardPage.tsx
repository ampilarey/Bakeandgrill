import { useEffect, useState } from 'react';
import { getDailySummary, fetchSalesSummary } from '../api';
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

type PeriodSummary = {
  total_revenue: number;
  order_count: number;
  average_order_value: number;
  period: string;
  payments?: Record<string, number>;
};

function fmt(val: unknown) { return 'MVR ' + parseFloat(String(val ?? 0)).toFixed(2); }

const PRESET_LABELS: { label: string; days: number }[] = [
  { label: '7 days',  days: 7  },
  { label: '14 days', days: 14 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
];

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export function DashboardPage() {
  usePageTitle('Dashboard');
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [data, setData] = useState<DailySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Period comparison panel
  const [periodFrom, setPeriodFrom] = useState(daysAgo(7));
  const [periodTo,   setPeriodTo]   = useState(today);
  const [periodData, setPeriodData] = useState<PeriodSummary | null>(null);
  const [periodLoading, setPeriodLoading] = useState(false);
  const [periodError,   setPeriodError]   = useState('');
  const [activePreset, setActivePreset] = useState(7);

  const load = (d: string) => {
    setLoading(true); setError('');
    getDailySummary(d)
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  const loadPeriod = (from: string, to: string) => {
    setPeriodLoading(true); setPeriodError('');
    fetchSalesSummary({ from, to })
      .then(setPeriodData)
      .catch((e: Error) => setPeriodError(e.message))
      .finally(() => setPeriodLoading(false));
  };

  useEffect(() => { load(date); }, [date]);
  useEffect(() => { loadPeriod(periodFrom, periodTo); }, [periodFrom, periodTo]);

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Daily snapshot for operations at a glance"
        action={<DateInput value={date} max={today} onChange={(v) => setDate(v)} />}
      />

      {error && <ErrorMsg message={error} />}

      {/* ── Period Summary Panel ── */}
      <Card style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: '#1C1408', marginRight: 4 }}>Period Summary</span>
          {PRESET_LABELS.map(({ label, days }) => (
            <button
              key={days}
              onClick={() => { setActivePreset(days); setPeriodFrom(daysAgo(days)); setPeriodTo(today); }}
              style={{
                padding: '4px 12px', borderRadius: 20, border: '1.5px solid',
                borderColor: activePreset === days ? '#D4813A' : '#E8E0D8',
                background: activePreset === days ? '#FEF3E8' : '#fff',
                color: activePreset === days ? '#D4813A' : '#6B5D4F',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}
            >{label}</button>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
            <DateInput value={periodFrom} max={periodTo} onChange={(v) => { setActivePreset(0); setPeriodFrom(v); }} />
            <span style={{ fontSize: 12, color: '#9C8E7E' }}>→</span>
            <DateInput value={periodTo} max={today} onChange={(v) => { setActivePreset(0); setPeriodTo(v); }} />
          </div>
        </div>

        {periodLoading ? <Spinner /> : periodError ? <ErrorMsg message={periodError} /> : periodData ? (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
              <StatCard label="Total Revenue"  value={fmt(periodData.total_revenue)}         accent="#D4813A" />
              <StatCard label="Orders"         value={String(periodData.order_count)}         accent="#8b5cf6" />
              <StatCard label="Avg Order Value" value={fmt(periodData.average_order_value)}   accent="#f59e0b" />
            </div>
            {periodData.payments && Object.keys(periodData.payments).length > 0 && (
              <>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#9C8E7E', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                  Payment Methods
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {Object.entries(periodData.payments).sort((a, b) => b[1] - a[1]).map(([method, amount]) => (
                    <div key={method} style={{
                      background: '#fff', border: '1px solid #E8E0D8', borderRadius: 10,
                      padding: '8px 14px', display: 'flex', gap: 10, alignItems: 'center',
                    }}>
                      <span style={{ fontSize: 12, color: '#6B5D4F', textTransform: 'capitalize', fontWeight: 600 }}>
                        {method.replace('_', ' ')}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#D4813A' }}>{fmt(amount)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : null}
      </Card>

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
