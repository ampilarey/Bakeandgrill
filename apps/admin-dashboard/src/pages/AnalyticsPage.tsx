import { useEffect, useState } from 'react';
import { getAnalytics } from '../api';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  Card, ErrorMsg, PageHeader, PageShell, SectionLabel, Spinner, StatCard,
  TableCard, TD, TH,
} from '../components/Layout';

type PeakHour     = { hour: number; label: string; count: number; avg_total: number };
type RetentionRow = { week: string; new: number; returning: number; total_customers: number };
type ProfitItem   = { id: number; name: string; total_qty: number; total_revenue: number; gross_profit: number; margin_pct: number };
type ForecastRow  = { date: string; day: string; avg_orders: number };
type LtvCustomer  = { id: number; name: string; total_spent: number; order_count: number; last_order: string };

export default function AnalyticsPage() {
  usePageTitle('Analytics');
  const [peakHours,    setPeakHours]    = useState<PeakHour[]>([]);
  const [retention,    setRetention]    = useState<RetentionRow[]>([]);
  const [profitItems,  setProfitItems]  = useState<ProfitItem[]>([]);
  const [forecast,     setForecast]     = useState<ForecastRow[]>([]);
  const [ltvCustomers, setLtvCustomers] = useState<LtvCustomer[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');

  useEffect(() => {
    const loadAll = async () => {
      setLoading(true); setError('');
      try {
        const [ph, rt, pr, fc, ltv] = await Promise.all([
          getAnalytics<{ peak_hours: PeakHour[] }>('/admin/analytics/peak-hours'),
          getAnalytics<{ retention: RetentionRow[] }>('/admin/analytics/retention'),
          getAnalytics<{ items: ProfitItem[] }>('/admin/analytics/profitability'),
          getAnalytics<{ forecast: ForecastRow[] }>('/admin/analytics/forecast'),
          getAnalytics<{ top_customers: LtvCustomer[] }>('/admin/analytics/customer-ltv'),
        ]);
        setPeakHours(ph.peak_hours ?? []);
        setRetention(rt.retention ?? []);
        setProfitItems(pr.items ?? []);
        setForecast(fc.forecast ?? []);
        setLtvCustomers(ltv.top_customers ?? []);
      } catch (e) {
        setError((e as Error).message ?? 'Failed to load analytics.');
      } finally {
        setLoading(false);
      }
    };
    void loadAll();
  }, []);

  const maxCount = peakHours.length > 0 ? Math.max(...peakHours.map((h) => h.count ?? 0), 1) : 1;

  if (loading) {
    return (
      <PageShell>
        <PageHeader section="Analyze" title="Analytics" subtitle="Insights, forecasting and profitability" />
        <Spinner />
      </PageShell>
    );
  }
  if (error) {
    return (
      <PageShell>
        <PageHeader section="Analyze" title="Analytics" subtitle="Insights, forecasting and profitability" />
        <ErrorMsg message={error} />
      </PageShell>
    );
  }

  return (
    <PageShell>
    <>
      <PageHeader section="Analyze" title="Analytics" subtitle="Insights, forecasting and profitability" />

      {/* Peak Hours bar chart */}
      <div style={{ marginBottom: 24 }}>
        <SectionLabel>Peak Hours — last 30 days</SectionLabel>
        <Card>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 120 }}>
            {peakHours.filter((h) => h.hour >= 7 && h.hour <= 22).map((h) => (
              <div key={h.hour} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div
                  style={{
                    width: '100%', borderRadius: '4px 4px 0 0',
                    background: 'var(--color-primary)',
                    height: `${Math.max((h.count / maxCount) * 100, h.count > 0 ? 4 : 0)}px`,
                    transition: 'height 0.3s ease',
                  }}
                  title={`${h.label}: ${h.count} orders`}
                />
                <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{h.hour}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* 7-Day Demand Forecast */}
      <div style={{ marginBottom: 24 }}>
        <SectionLabel>7-Day Demand Forecast</SectionLabel>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {forecast.map((f) => (
            <div key={f.date} style={{
              background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12,
              padding: '16px 20px', minWidth: 90, textAlign: 'center',
              boxShadow: '0 1px 2px rgba(28,20,8,0.05)',
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)' }}>{f.day}</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 6 }}>{f.date?.slice(5) ?? ''}</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--color-primary)' }}>{f.avg_orders}</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>orders</div>
            </div>
          ))}
          {forecast.length === 0 && (
            <div style={{ color: 'var(--color-text-muted)', fontSize: 13, padding: '16px 0' }}>No forecast data available.</div>
          )}
        </div>
      </div>

      {/* Retention + Top Customers */}
      <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
        <div>
          <SectionLabel>Customer Retention — last 12 weeks</SectionLabel>
          <TableCard>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr>
                  {['Week', 'New', 'Returning'].map((h) => <th key={h} style={TH}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {retention.slice(-8).map((r) => (
                  <tr key={r.week}>
                    <td style={{ ...TD, color: 'var(--color-text-secondary)' }}>{r.week}</td>
                    <td style={{ ...TD, color: 'var(--color-success)', fontWeight: 700 }}>{r.new}</td>
                    <td style={{ ...TD, color: 'var(--color-primary)', fontWeight: 700 }}>{r.returning}</td>
                  </tr>
                ))}
                {retention.length === 0 && (
                  <tr><td colSpan={3} style={{ ...TD, color: 'var(--color-text-muted)', textAlign: 'center' }}>No data yet.</td></tr>
                )}
              </tbody>
            </table>
          </TableCard>
        </div>

        <div>
          <SectionLabel>Top Customers by Revenue</SectionLabel>
          <TableCard>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr>
                  {['Name', 'Orders', 'Revenue'].map((h) => <th key={h} style={TH}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {ltvCustomers.slice(0, 8).map((c) => (
                  <tr key={c.id}>
                    <td style={{ ...TD, fontWeight: 600, color: 'var(--color-text)' }}>{c.name}</td>
                    <td style={{ ...TD, color: 'var(--color-text-secondary)', textAlign: 'center' }}>{c.order_count}</td>
                    <td style={{ ...TD, fontWeight: 700, color: 'var(--color-primary)' }}>MVR {parseFloat(String(c.total_spent ?? 0)).toFixed(2)}</td>
                  </tr>
                ))}
                {ltvCustomers.length === 0 && (
                  <tr><td colSpan={3} style={{ ...TD, color: 'var(--color-text-muted)', textAlign: 'center' }}>No data yet.</td></tr>
                )}
              </tbody>
            </table>
          </TableCard>
        </div>
      </div>

      {/* Item Profitability */}
      <div>
        <SectionLabel>Item Profitability — this month</SectionLabel>
        <TableCard>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr>
                {['Item', 'Qty Sold', 'Revenue', 'Gross Profit', 'Margin'].map((h) => (
                  <th key={h} style={TH}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {profitItems.slice(0, 15).map((item) => (
                <tr key={item.id}>
                  <td style={{ ...TD, fontWeight: 600, color: 'var(--color-text)' }}>{item.name}</td>
                  <td style={{ ...TD, color: 'var(--color-text-secondary)', textAlign: 'center' }}>{item.total_qty}</td>
                  <td style={{ ...TD, color: 'var(--color-text)' }}>MVR {parseFloat(String(item.total_revenue ?? 0)).toFixed(2)}</td>
                  <td style={{ ...TD, fontWeight: 700, color: item.gross_profit >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                    MVR {parseFloat(String(item.gross_profit ?? 0)).toFixed(2)}
                  </td>
                  <td style={{ ...TD, fontWeight: 700, color: item.margin_pct >= 50 ? 'var(--color-success)' : item.margin_pct >= 20 ? 'var(--color-primary)' : 'var(--color-danger)' }}>
                    {item.margin_pct}%
                  </td>
                </tr>
              ))}
              {profitItems.length === 0 && (
                <tr><td colSpan={5} style={{ ...TD, color: 'var(--color-text-muted)', textAlign: 'center' }}>No profitability data yet.</td></tr>
              )}
            </tbody>
          </table>
        </TableCard>
      </div>

      {/* Summary stats */}
      {ltvCustomers.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <SectionLabel>Summary</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
            <StatCard label="Top Customer Spend" value={`MVR ${parseFloat(String(ltvCustomers[0]?.total_spent ?? 0)).toFixed(2)}`} accent="var(--color-primary)" />
            <StatCard label="Unique Customers" value={String(ltvCustomers.length)} accent="#8b5cf6" />
            <StatCard label="Menu Items Tracked" value={String(profitItems.length)} accent="var(--color-success)" />
          </div>
        </div>
      )}
    </>

    </PageShell>
  );
}
