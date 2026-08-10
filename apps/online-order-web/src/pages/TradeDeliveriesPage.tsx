import { useEffect, useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchTradeDeliveries, type TradeDelivery } from '../api/trade';
import { PageHeader } from '../components/shell/PageHeader';
import { useAuth } from '../context/AuthContext';
import { usePageTitle } from '../hooks/usePageTitle';

export function TradeDeliveriesPage() {
  usePageTitle('My deliveries');
  const navigate = useNavigate();
  const { isAuthenticated, authReady } = useAuth();
  const [rows, setRows] = useState<TradeDelivery[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authReady || !isAuthenticated) return;
    setLoading(true);
    fetchTradeDeliveries()
      .then((res) => setRows(res.data ?? []))
      .catch((e: Error) => setError(e.message || 'Could not load deliveries.'))
      .finally(() => setLoading(false));
  }, [authReady, isAuthenticated]);

  if (authReady && !isAuthenticated) {
    return (
      <div style={S.page}>
        <PageHeader title="My deliveries" onBack={() => navigate('/account')} />
        <div style={S.container}>
          <p style={S.muted}>Sign in to see deliveries for your shop.</p>
          <Link to="/account" style={S.btn}>Sign in</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={S.page} data-testid="trade-deliveries-page">
      <PageHeader title="My deliveries" onBack={() => navigate('/account')} />
      <div style={S.container}>
        <div style={S.navRow}>
          <span style={S.navActive}>Deliveries</span>
          <Link to="/account/statement" style={S.navLink}>Statement</Link>
        </div>

        {loading && <p style={S.muted}>Loading…</p>}
        {error && <p style={S.error}>{error}</p>}
        {!loading && rows.length === 0 && (
          <p style={S.muted}>No deliveries yet. When we drop off stock, it will show up here.</p>
        )}

        {rows.map((d) => (
          <Link
            key={d.id}
            to={`/account/deliveries/${d.id}`}
            style={S.cardLink}
            data-testid={`trade-delivery-${d.id}`}
          >
            <div style={S.rowTop}>
              <strong>{d.delivery_number}</strong>
              <span style={S.badge}>{d.status}</span>
            </div>
            <div style={S.muted}>
              {d.date ?? '—'} · {d.summary}
            </div>
            {d.can_report_sales && !d.sales_reported && (
              <div style={S.cta}>Tell us what you sold →</div>
            )}
            {d.sales_reported && d.can_report_sales && (
              <div style={S.note}>Sales reported — tap to change until we check</div>
            )}
            {d.sales_reported && !d.can_report_sales && (
              <div style={S.note}>Sales reported</div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  page: { padding: '0 var(--page-gutter) 3rem' },
  container: { maxWidth: 560, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 10 },
  muted: { color: 'var(--color-text-muted)', fontSize: 13, margin: 0 },
  error: { color: 'var(--color-error, #dc2626)', fontSize: 14 },
  navRow: { display: 'flex', gap: 12, marginBottom: 4, fontSize: 14 },
  navLink: { color: 'var(--color-primary)', fontWeight: 600, textDecoration: 'none', minHeight: 44, display: 'inline-flex', alignItems: 'center' },
  navActive: { fontWeight: 800, minHeight: 44, display: 'inline-flex', alignItems: 'center' },
  cardLink: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 12,
    padding: '14px 16px',
    textDecoration: 'none',
    color: 'inherit',
    display: 'block',
    minHeight: 44,
  },
  rowTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 4 },
  badge: {
    fontSize: 12,
    fontWeight: 700,
    color: 'var(--color-text-secondary)',
    background: 'var(--color-bg)',
    padding: '4px 10px',
    borderRadius: 999,
  },
  cta: { marginTop: 8, fontWeight: 700, color: 'var(--color-primary)', fontSize: 14 },
  note: { marginTop: 8, fontSize: 13, color: 'var(--color-text-muted)' },
  btn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    padding: '0 16px',
    background: 'var(--color-primary)',
    color: '#fff',
    borderRadius: 12,
    fontWeight: 700,
    textDecoration: 'none',
  },
};

export default TradeDeliveriesPage;
