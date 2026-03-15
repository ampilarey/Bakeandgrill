import { useEffect, useState } from 'react';
import { fetchSalesSummary, type SalesSummary } from '../api';
import { Btn, Card, DateInput, ErrorMsg, PageHeader, Spinner, StatCard } from '../components/Layout';
import { usePageTitle } from '../hooks/usePageTitle';

function today() { return new Date().toISOString().slice(0, 10); }
function daysAgo(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }

export function ReportsPage() {
  usePageTitle('Reports');
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [from, setFrom]       = useState(daysAgo(7));
  const [to, setTo]           = useState(today());

  const load = async () => {
    setLoading(true); setError('');
    try { setSummary(await fetchSalesSummary({ from, to })); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [from, to]);

  return (
    <>
      <PageHeader title="Reports" subtitle="Sales overview for a custom date range" />
      {error && <ErrorMsg message={error} />}

      {/* Filters */}
      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
          <DateInput label="From" value={from} onChange={setFrom} />
          <DateInput label="To" value={to} onChange={setTo} />
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

      {loading ? <Spinner /> : summary && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
            <StatCard
              label="Total Revenue"
              value={`MVR ${summary.total_revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
              accent="#22c55e"
            />
            <StatCard
              label="Orders"
              value={summary.order_count.toLocaleString()}
              accent="#D4813A"
            />
            <StatCard
              label="Avg Order Value"
              value={`MVR ${parseFloat(String(summary.average_order_value ?? 0)).toFixed(2)}`}
              accent="#8b5cf6"
            />
          </div>

          <Card>
            <p style={{ color: '#6B5D4F', fontSize: 14, textAlign: 'center', padding: '8px 0 4px' }}>
              Period: <strong style={{ color: '#1C1408' }}>{summary.period}</strong>
            </p>
            <p style={{ color: '#9C8E7E', fontSize: 13, textAlign: 'center' }}>
              Detailed breakdown reports (by item, category, staff) coming soon.
            </p>
          </Card>
        </>
      )}
    </>
  );
}
