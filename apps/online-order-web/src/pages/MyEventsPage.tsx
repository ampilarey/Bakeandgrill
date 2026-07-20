import { useEffect, useState, type CSSProperties } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { fetchMyEventOrders, type CustomerEventOrder } from '../api/eventOrders';
import { PageHeader } from '../components/shell/PageHeader';
import { useAuth } from '../context/AuthContext';
import { usePageTitle } from '../hooks/usePageTitle';

function mvr(laar: number): string {
  return (laar / 100).toFixed(2);
}

export function MyEventsPage() {
  usePageTitle('My events');
  const { isAuthenticated, authReady } = useAuth();
  const [rows, setRows] = useState<CustomerEventOrder[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authReady || !isAuthenticated) return;
    setLoading(true);
    fetchMyEventOrders()
      .then((res) => setRows(res.data ?? []))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [authReady, isAuthenticated]);

  if (authReady && !isAuthenticated) {
    return <Navigate to="/account" replace />;
  }

  return (
    <div style={S.page}>
      <PageHeader title="My events" />
      <div style={S.container}>
        <div style={S.navRow} data-testid="events-nav">
          <Link to="/events" style={S.navLink}>Plan an event</Link>
          <span style={S.navActive}>My events</span>
        </div>

        {loading && <p style={S.muted}>Loading…</p>}
        {error && <p style={{ color: '#b91c1c' }}>{error}</p>}
        {!loading && rows.length === 0 && (
          <p style={S.muted}>No events yet. <Link to="/events">Plan your first event</Link></p>
        )}
        {rows.map((row) => {
          const quoteLink = row.status === 'awaiting_customer' && row.quote_token
            ? `/quote/${row.quote_token}`
            : null;
          const body = (
            <>
              <div style={{ fontWeight: 800 }}>{row.reference}</div>
              <div style={S.muted}>
                {row.event_date || 'Date TBD'}
                {row.fulfillment_time ? ` · ${row.fulfillment_time}` : ''}
                {' · '}
                {row.status.replace(/_/g, ' ')}
              </div>
              {(row.total_laar > 0 || row.paid_laar > 0) && (
                <div style={{ fontSize: 13, marginTop: 4 }}>
                  Paid MVR {mvr(row.paid_laar)}
                  {row.balance_laar > 0 ? ` · Balance MVR ${mvr(row.balance_laar)}` : ''}
                </div>
              )}
            </>
          );
          return quoteLink ? (
            <Link key={row.reference} to={quoteLink} style={S.cardLink} data-testid={`event-row-${row.reference}`}>
              {body}
            </Link>
          ) : (
            <div key={row.reference} style={S.card} data-testid={`event-row-${row.reference}`}>
              {body}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  page: { padding: '0 var(--page-gutter) 3rem' },
  container: { maxWidth: 560, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 10 },
  muted: { color: 'var(--color-text-muted)', fontSize: 13 },
  navRow: { display: 'flex', gap: 12, marginBottom: 8, fontSize: 14 },
  navLink: { color: 'var(--color-primary)', fontWeight: 600, textDecoration: 'none' },
  navActive: { fontWeight: 800 },
  card: {
    background: 'var(--color-surface)', border: '1px solid var(--color-border)',
    borderRadius: 12, padding: 14, color: 'inherit',
  },
  cardLink: {
    background: 'var(--color-surface)', border: '1px solid var(--color-border)',
    borderRadius: 12, padding: 14, color: 'inherit', textDecoration: 'none', display: 'block',
  },
};

export default MyEventsPage;
