import { useEffect, useState } from 'react';
import { fetchSalesSummary, type SalesSummary } from '../api';
import { Btn, Card, ErrorMsg, PageHeader, Spinner } from '../components/Layout';

function today() {
  return new Date().toISOString().slice(0, 10);
}

function weekAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}

function StatCard({ label, value, sub, color = '#0ea5e9' }: {
  label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <Card>
      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{sub}</div>}
    </Card>
  );
}

export function ReportsPage() {
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [from, setFrom] = useState(weekAgo());
  const [to, setTo] = useState(today());

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchSalesSummary({ from, to });
      setSummary(res);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const quickSet = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    setFrom(d.toISOString().slice(0, 10));
    setTo(today());
  };

  return (
    <>
      <PageHeader title="Reports" subtitle="Sales overview" />
      {error && <ErrorMsg message={error} />}

      {/* Date picker */}
      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px', fontSize: 14 }} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>To</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px', fontSize: 14 }} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
            {[[0, 'Today'], [7, '7 days'], [30, '30 days'], [90, '90 days']].map(([d, label]) => (
              <Btn key={label} small variant="secondary" onClick={() => quickSet(d as number)}>{label}</Btn>
            ))}
            <Btn small onClick={load}>Apply</Btn>
          </div>
        </div>
      </Card>

      {loading ? <Spinner /> : summary && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
            <StatCard
              label="Total Revenue"
              value={`MVR ${summary.total_revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
              color="#22c55e"
            />
            <StatCard
              label="Orders"
              value={summary.order_count.toLocaleString()}
              color="#0ea5e9"
            />
            <StatCard
              label="Avg Order Value"
              value={`MVR ${summary.average_order_value.toFixed(2)}`}
              color="#8b5cf6"
            />
          </div>

          <Card>
            <p style={{ color: '#64748b', fontSize: 14, textAlign: 'center', padding: '20px 0' }}>
              Period: <strong>{summary.period}</strong>
            </p>
            <p style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center' }}>
              Detailed breakdown reports (by item, category, staff) coming soon.
            </p>
          </Card>
        </>
      )}
    </>
  );
}
