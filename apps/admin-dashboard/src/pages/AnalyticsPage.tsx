import { useEffect, useState } from 'react';
import { getAnalytics } from '../api';

type PeakHour     = { hour: number; label: string; count: number; avg_total: number };
type RetentionRow = { week: string; new: number; returning: number; total_customers: number };
type ProfitItem   = { id: number; name: string; total_qty: number; total_revenue: number; gross_profit: number; margin_pct: number };
type ForecastRow  = { date: string; day: string; avg_orders: number };
type LtvCustomer  = { id: number; name: string; total_spent: number; order_count: number; last_order: string };

export default function AnalyticsPage() {
  const [peakHours,    setPeakHours]    = useState<PeakHour[]>([]);
  const [retention,    setRetention]    = useState<RetentionRow[]>([]);
  const [profitItems,  setProfitItems]  = useState<ProfitItem[]>([]);
  const [forecast,     setForecast]     = useState<ForecastRow[]>([]);
  const [ltvCustomers, setLtvCustomers] = useState<LtvCustomer[]>([]);
  const [loading,      setLoading]      = useState(true);

  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      try {
        const [ph, rt, pr, fc, ltv] = await Promise.all([
          getAnalytics<{ peak_hours: PeakHour[] }>('/admin/analytics/peak-hours'),
          getAnalytics<{ retention: RetentionRow[] }>('/admin/analytics/retention'),
          getAnalytics<{ items: ProfitItem[] }>('/admin/analytics/profitability'),
          getAnalytics<{ forecast: ForecastRow[] }>('/admin/analytics/forecast'),
          getAnalytics<{ top_customers: LtvCustomer[] }>('/admin/analytics/customer-ltv'),
        ]);
        setPeakHours(ph.peak_hours);
        setRetention(rt.retention);
        setProfitItems(pr.items);
        setForecast(fc.forecast);
        setLtvCustomers(ltv.top_customers);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    void loadAll();
  }, []);

  const maxCount = Math.max(...peakHours.map(h => h.count), 1);

  if (loading) return <div style={{ padding: 40, color: '#9CA3AF', textAlign: 'center' }}>Loading analytics…</div>;

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Analytics</h1>
      <p style={{ color: '#6B7280', marginBottom: 32 }}>Insights, forecasting, and profitability</p>

      {/* ── Peak Hours ── */}
      <section style={sectionStyle}>
        <h2 style={sectionTitle}>Peak Hours (last 30 days)</h2>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 120, marginTop: 16 }}>
          {peakHours.filter(h => h.hour >= 7 && h.hour <= 22).map(h => (
            <div key={h.hour} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ width: '100%', background: '#F59E0B', borderRadius: '4px 4px 0 0', height: `${(h.count / maxCount) * 100}px`, minHeight: h.count > 0 ? 4 : 0 }} title={`${h.count} orders`} />
              <span style={{ fontSize: 10, color: '#9CA3AF' }}>{h.hour}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Demand Forecast ── */}
      <section style={sectionStyle}>
        <h2 style={sectionTitle}>7-Day Demand Forecast</h2>
        <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
          {forecast.map(f => (
            <div key={f.date} style={{ background: '#EFF6FF', borderRadius: 12, padding: '14px 18px', minWidth: 80, textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: '#6B7280' }}>{f.day}</div>
              <div style={{ fontSize: 11, color: '#9CA3AF' }}>{f.date.slice(5)}</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#1D4ED8', marginTop: 4 }}>{f.avg_orders}</div>
              <div style={{ fontSize: 11, color: '#6B7280' }}>orders</div>
            </div>
          ))}
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* ── Retention ── */}
        <section style={sectionStyle}>
          <h2 style={sectionTitle}>Customer Retention (12 weeks)</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
            <thead>
              <tr>{['Week', 'New', 'Returning'].map(h => <th key={h} style={thS}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {retention.slice(-8).map(r => (
                <tr key={r.week} style={{ borderBottom: '1px solid #F3F4F6' }}>
                  <td style={tdS}>{r.week}</td>
                  <td style={{ ...tdS, color: '#10B981', fontWeight: 600 }}>{r.new}</td>
                  <td style={{ ...tdS, color: '#3B82F6', fontWeight: 600 }}>{r.returning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* ── Top Customers (LTV) ── */}
        <section style={sectionStyle}>
          <h2 style={sectionTitle}>Top Customers by Revenue</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
            <thead>
              <tr>{['Name', 'Orders', 'Revenue'].map(h => <th key={h} style={thS}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {ltvCustomers.slice(0, 8).map(c => (
                <tr key={c.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                  <td style={tdS}>{c.name}</td>
                  <td style={{ ...tdS, textAlign: 'center' as const }}>{c.order_count}</td>
                  <td style={{ ...tdS, fontWeight: 600, color: '#059669' }}>MVR {c.total_spent.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      {/* ── Profitability ── */}
      <section style={sectionStyle}>
        <h2 style={sectionTitle}>Item Profitability (this month)</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
          <thead>
            <tr>{['Item', 'Qty', 'Revenue', 'Gross Profit', 'Margin'].map(h => <th key={h} style={thS}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {profitItems.slice(0, 15).map(item => (
              <tr key={item.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                <td style={tdS}>{item.name}</td>
                <td style={{ ...tdS, textAlign: 'center' as const }}>{item.total_qty}</td>
                <td style={tdS}>MVR {item.total_revenue.toFixed(2)}</td>
                <td style={{ ...tdS, color: item.gross_profit >= 0 ? '#059669' : '#DC2626', fontWeight: 600 }}>
                  MVR {item.gross_profit.toFixed(2)}
                </td>
                <td style={{ ...tdS, color: item.margin_pct >= 50 ? '#059669' : item.margin_pct >= 20 ? '#D97706' : '#DC2626' }}>
                  {item.margin_pct}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

const sectionStyle: React.CSSProperties = { background: 'white', borderRadius: 14, padding: '20px 24px', marginBottom: 24, border: '1px solid #E5E7EB', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' };
const sectionTitle: React.CSSProperties = { fontSize: 16, fontWeight: 700, margin: 0, color: '#111827' };
const thS: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', fontSize: 11, color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', whiteSpace: 'nowrap', borderBottom: '2px solid #F3F4F6' };
const tdS: React.CSSProperties = { padding: '10px', fontSize: 13 };
