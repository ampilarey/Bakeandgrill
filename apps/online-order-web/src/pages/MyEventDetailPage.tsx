import { useEffect, useState, type CSSProperties } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchMyEventOrder, type CustomerEventOrderDetail } from '../api/eventOrders';
import { PageHeader } from '../components/shell/PageHeader';
import { useAuth } from '../context/AuthContext';
import { usePageTitle } from '../hooks/usePageTitle';

function mvr(amount: number): string {
  return amount.toFixed(2);
}

function statusLabel(status: string): string {
  return status.replace(/_/g, ' ');
}

export function MyEventDetailPage() {
  usePageTitle('Event details');
  const { reference } = useParams<{ reference: string }>();
  const { isAuthenticated, authReady } = useAuth();
  const [event, setEvent] = useState<CustomerEventOrderDetail | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authReady || !isAuthenticated || !reference) return;
    setLoading(true);
    fetchMyEventOrder(reference)
      .then((res) => setEvent(res.data))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [authReady, isAuthenticated, reference]);

  if (authReady && !isAuthenticated) {
    return (
      <div style={S.page}>
        <PageHeader title="Event details" />
        <div style={S.container}>
          <p style={S.muted}>Sign in to view this event.</p>
          <Link to="/account" style={S.btn}>Sign in</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <PageHeader title="Event details" />
      <div style={S.container} data-testid="event-detail">
        <Link to="/events/mine" style={S.back}>← My events</Link>

        {loading && <p style={S.muted}>Loading…</p>}
        {error && <p style={{ color: '#b91c1c' }}>{error}</p>}

        {event && (
          <>
            <div style={S.card}>
              <div style={{ fontWeight: 800, fontSize: 18 }}>{event.reference}</div>
              <div style={S.muted}>{statusLabel(event.status)}</div>
            </div>

            <div style={S.card}>
              <div style={S.sectionTitle}>When</div>
              <div>{event.event_date || 'Date TBD'}</div>
              {event.fulfillment_time && (
                <div style={S.muted}>
                  {(event.fulfillment_method === 'delivery' ? 'Delivery' : 'Pickup')} time · {event.fulfillment_time}
                </div>
              )}
            </div>

            {(event.fulfillment_method === 'delivery' || event.delivery_address || event.venue_name) && (
              <div style={S.card}>
                <div style={S.sectionTitle}>
                  {event.fulfillment_method === 'delivery' ? 'Delivery' : 'Location'}
                </div>
                {event.venue_name && <div>{event.venue_name}</div>}
                {event.delivery_address && <div>{event.delivery_address}</div>}
                {event.delivery_island && <div style={S.muted}>{event.delivery_island}</div>}
              </div>
            )}

            {(event.contact_name || event.phone) && (
              <div style={S.card}>
                <div style={S.sectionTitle}>Contact</div>
                {event.contact_name && <div>{event.contact_name}</div>}
                {event.phone && <div style={S.muted}>{event.phone}</div>}
              </div>
            )}

            {event.lines.length > 0 && (
              <div style={S.card}>
                <div style={S.sectionTitle}>Items</div>
                <ul style={S.list}>
                  {event.lines.map((line) => (
                    <li key={line.id} style={S.line}>
                      <span>
                        {line.quantity}× {line.name}
                        {line.notes ? <span style={S.muted}> — {line.notes}</span> : null}
                      </span>
                      {line.unit_price != null && (
                        <span style={S.muted}>MVR {mvr(line.unit_price)}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(event.notes || event.dietary_notes) && (
              <div style={S.card}>
                <div style={S.sectionTitle}>Notes</div>
                {event.notes && <div>{event.notes}</div>}
                {event.dietary_notes && <div style={S.muted}>{event.dietary_notes}</div>}
              </div>
            )}

            {(event.total_laar > 0 || event.paid_laar > 0) && (
              <div style={S.card}>
                <div style={S.sectionTitle}>Payment</div>
                <div>Paid MVR {mvr(event.paid_laar / 100)}</div>
                {event.balance_laar > 0 && (
                  <div style={S.muted}>Balance MVR {mvr(event.balance_laar / 100)}</div>
                )}
              </div>
            )}

            {event.quote_token && (
              <Link
                to={`/quote/${event.quote_token}`}
                data-testid="open-quote"
                style={S.btn}
              >
                View quote & pay
              </Link>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  page: { padding: '0 var(--page-gutter) 3rem' },
  container: { maxWidth: 560, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 10 },
  muted: { color: 'var(--color-text-muted)', fontSize: 13 },
  back: { color: 'var(--color-primary)', fontWeight: 600, textDecoration: 'none', fontSize: 14, marginBottom: 4 },
  card: {
    background: 'var(--color-surface)', border: '1px solid var(--color-border)',
    borderRadius: 12, padding: 14, color: 'inherit',
  },
  sectionTitle: { fontWeight: 800, fontSize: 13, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-muted)' },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 },
  line: { display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14 },
  btn: {
    display: 'block', minHeight: 44, padding: '0 16px', lineHeight: '44px',
    borderRadius: 12, background: 'var(--color-primary)', color: '#fff',
    fontWeight: 800, fontSize: 14, textDecoration: 'none', textAlign: 'center',
  },
};

export default MyEventDetailPage;
