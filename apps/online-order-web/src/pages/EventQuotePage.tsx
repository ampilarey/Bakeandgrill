import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  approveEventQuote,
  fetchEventQuote,
  mvrFromLaar,
  type PublicEventQuote,
} from '../api/eventQuotes';
import { PageHeader } from '../components/shell/PageHeader';
import { usePageTitle } from '../hooks/usePageTitle';

function useCountdown(expiresAt: string | null): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [expiresAt]);

  return useMemo(() => {
    if (!expiresAt) return '';
    const ms = new Date(expiresAt).getTime() - now;
    if (ms <= 0) return 'Expired';
    const totalSec = Math.floor(ms / 1000);
    const d = Math.floor(totalSec / 86400);
    const h = Math.floor((totalSec % 86400) / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (d > 0) return `${d}d ${h}h ${m}m`;
    return `${h}h ${m}m ${s}s`;
  }, [expiresAt, now]);
}

export function EventQuotePage() {
  usePageTitle('Event quote');
  const { token } = useParams<{ token: string }>();
  const [quote, setQuote] = useState<PublicEventQuote | null>(null);
  const [error, setError] = useState('');
  const [expired, setExpired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const countdown = useCountdown(quote?.quote_expires_at ?? null);

  useEffect(() => {
    if (!token) {
      setError('Invalid quote link.');
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchEventQuote(token)
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          setExpired(Boolean(res.expired));
          setError(res.message);
          setQuote(null);
          return;
        }
        setQuote(res.quote);
        setError('');
        setExpired(false);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [token]);

  const onApprove = async () => {
    if (!token) return;
    setPaying(true);
    setError('');
    try {
      const { payment_url } = await approveEventQuote(token);
      window.location.href = payment_url;
    } catch (e) {
      setError((e as Error).message);
      setPaying(false);
    }
  };

  const payLaar = quote?.quote_payment_laar ?? 0;
  const isConfirmed = quote?.status === 'confirmed';

  return (
    <div style={S.page}>
      <PageHeader title="Event quote" onBack={() => { window.location.href = '/order/contact'; }} />
      <div style={S.container}>
        {loading && <p style={S.muted}>Loading quote…</p>}

        {!loading && (expired || (!quote && error)) && (
          <section style={S.card} data-testid="quote-expired">
            <h2 style={{ marginTop: 0 }}>{expired ? 'Quote expired' : 'Quote unavailable'}</h2>
            <p style={S.muted}>{error || 'This link is no longer valid.'}</p>
            <Link to="/contact" style={S.link}>Contact us to renew</Link>
          </section>
        )}

        {!loading && quote && (
          <>
            <section style={S.card}>
              <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Reference</div>
              <h1 style={{ margin: '4px 0 8px', fontSize: 22 }} data-testid="quote-reference">{quote.reference}</h1>
              {quote.quote_expires_at && !isConfirmed && (
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#B45309' }} data-testid="quote-countdown">
                  Expires in {countdown}
                </p>
              )}
              {isConfirmed && (
                <p data-testid="quote-paid" style={{ margin: '8px 0 0', fontWeight: 700, color: '#065F46' }}>
                  Event confirmed — thank you!
                </p>
              )}
            </section>

            <section style={S.card}>
              <h2 style={S.h2}>Fulfilment</h2>
              <dl style={S.dl}>
                <div><dt>Method</dt><dd>{quote.fulfillment_method === 'delivery' ? 'Delivery' : 'Pickup'}</dd></div>
                <div><dt>Date</dt><dd>{quote.event_date || '—'}</dd></div>
                <div><dt>Event time</dt><dd>{quote.fulfillment_time || '—'}</dd></div>
                <div><dt>Setup time</dt><dd>{quote.setup_time || '—'}</dd></div>
                {quote.venue_name && <div><dt>Venue</dt><dd>{quote.venue_name}</dd></div>}
                {quote.fulfillment_method === 'delivery' && (
                  <div>
                    <dt>Address</dt>
                    <dd>{quote.delivery_address}{quote.delivery_island ? `, ${quote.delivery_island}` : ''}</dd>
                  </div>
                )}
                {(quote.onsite_contact_name || quote.onsite_contact_phone) && (
                  <div>
                    <dt>On-site contact</dt>
                    <dd>{[quote.onsite_contact_name, quote.onsite_contact_phone].filter(Boolean).join(' · ')}</dd>
                  </div>
                )}
                {quote.headcount != null && <div><dt>Headcount</dt><dd>{quote.headcount}</dd></div>}
              </dl>
              {quote.dietary_notes && (
                <div style={S.dietary} data-testid="quote-dietary">
                  <strong>Dietary notes</strong>
                  <p style={{ margin: '4px 0 0' }}>{quote.dietary_notes}</p>
                </div>
              )}
            </section>

            <section style={S.card}>
              <h2 style={S.h2}>Items</h2>
              {quote.lines.map((l, i) => (
                <div key={`${l.name}-${i}`} style={S.line}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{l.name}</div>
                    <div style={S.muted}>
                      × {l.quantity}
                      {l.is_custom ? ' · custom' : ''}
                      {l.packaging_option_name ? ` · ${l.packaging_option_name}` : ''}
                    </div>
                  </div>
                  <div style={{ fontWeight: 700 }}>
                    {l.unit_price != null ? `MVR ${(l.unit_price * l.quantity).toFixed(2)}` : '—'}
                  </div>
                </div>
              ))}
              <div style={{ ...S.line, borderTop: '1px solid var(--color-border)', marginTop: 8, paddingTop: 10 }}>
                <span>Subtotal</span><span>MVR {mvrFromLaar(quote.subtotal_laar)}</span>
              </div>
              {(quote.packaging_fee_laar ?? 0) > 0 && (
                <div style={S.line} data-testid="quote-packaging-fee">
                  <span>{quote.packaging_fee_label ?? 'Packaging fee'}</span>
                  <span>MVR {mvrFromLaar(quote.packaging_fee_laar!)}</span>
                </div>
              )}
              <div style={S.line}><span>GST</span><span>MVR {mvrFromLaar(quote.tax_laar)}</span></div>
              <div style={{ ...S.line, fontWeight: 800, fontSize: 16 }}>
                <span>Total</span><span>MVR {mvrFromLaar(quote.total_laar)}</span>
              </div>
            </section>

            {!isConfirmed && quote.status === 'awaiting_customer' && (
              <section style={S.card}>
                <p style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700 }} data-testid="pay-now-label">
                  Pay now: MVR {mvrFromLaar(payLaar)}
                  {quote.quote_is_deposit ? ' (deposit)' : ''}
                </p>
                {error && <p style={{ color: '#b91c1c', fontSize: 13 }}>{error}</p>}
                <button
                  type="button"
                  data-testid="approve-pay"
                  style={S.btn}
                  disabled={paying || countdown === 'Expired'}
                  onClick={() => void onApprove()}
                >
                  {paying ? 'Redirecting…' : 'Approve & Pay'}
                </button>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  page: { padding: '0 var(--page-gutter) 3rem' },
  container: { maxWidth: 560, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 },
  card: { background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 14, padding: 16 },
  h2: { margin: '0 0 10px', fontSize: 15 },
  muted: { color: 'var(--color-text-muted)', fontSize: 13 },
  link: { color: 'var(--color-primary)', fontWeight: 700 },
  dl: { display: 'grid', gap: 8, margin: 0, fontSize: 14 },
  line: { display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', fontSize: 14 },
  dietary: { marginTop: 12, background: '#FFFBEB', borderRadius: 10, padding: 10, color: '#92400E', fontSize: 13 },
  btn: {
    width: '100%', minHeight: 48, border: 'none', borderRadius: 12, background: 'var(--color-primary)',
    color: '#fff', fontWeight: 800, fontSize: 16, cursor: 'pointer', fontFamily: 'inherit',
  },
};

export default EventQuotePage;
