import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { fetchTradeDelivery, reportTradeSales, type TradeDelivery } from '../api/trade';
import { PageHeader } from '../components/shell/PageHeader';
import { useAuth } from '../context/AuthContext';
import { usePageTitle } from '../hooks/usePageTitle';

function newKey(): string {
  return `sales-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function TradeDeliveryDetailPage() {
  usePageTitle('Delivery');
  const { id } = useParams<{ id: string }>();
  const deliveryId = Number(id);
  const navigate = useNavigate();
  const { isAuthenticated, authReady } = useAuth();
  const [delivery, setDelivery] = useState<TradeDelivery | null>(null);
  const [qtys, setQtys] = useState<Record<number, string>>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!authReady || !isAuthenticated || !Number.isFinite(deliveryId)) return;
    setLoading(true);
    fetchTradeDelivery(deliveryId)
      .then((res) => {
        setDelivery(res.delivery);
        const next: Record<number, string> = {};
        for (const line of res.delivery.lines) {
          next[line.id] = line.reported_sold_qty != null ? String(line.reported_sold_qty) : '';
        }
        setQtys(next);
      })
      .catch((e: Error) => setError(e.message || 'Could not load this delivery.'))
      .finally(() => setLoading(false));
  }, [authReady, isAuthenticated, deliveryId]);

  const runningNote = useMemo(() => {
    if (!delivery) return '';
    const parts = delivery.lines.map((line) => {
      const v = qtys[line.id];
      if (v === '' || v == null) return null;
      return `${line.item_name}: ${v} of ${line.qty_delivered}`;
    }).filter(Boolean);
    return parts.length ? parts.join(' · ') : 'Enter how many you sold for each item.';
  }, [delivery, qtys]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!delivery || !delivery.can_report_sales) return;
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const lines = delivery.lines.map((line) => {
        const n = Number(qtys[line.id]);
        if (!Number.isInteger(n) || n < 0) {
          throw new Error(`Enter a whole number for ${line.item_name}.`);
        }
        if (n > line.qty_delivered) {
          throw new Error(`${line.item_name}: cannot be more than ${line.qty_delivered} delivered.`);
        }
        return { line_id: line.id, sold_qty: n };
      });
      const res = await reportTradeSales(delivery.id, {
        idempotency_key: newKey(),
        lines,
      });
      setDelivery(res.delivery);
      setMessage(res.message || 'Thanks — we have your sales numbers.');
      setConfirming(false);
    } catch (err) {
      setError((err as Error).message || 'Could not save.');
      setConfirming(false);
    } finally {
      setSaving(false);
    }
  };

  if (authReady && !isAuthenticated) {
    return (
      <div style={S.page}>
        <PageHeader title="Delivery" onBack={() => navigate('/account/deliveries')} />
        <div style={S.container}>
          <p style={S.muted}>Sign in to view this delivery.</p>
          <Link to="/account" style={S.btnPrimary}>Sign in</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={S.page} data-testid="trade-delivery-detail">
      <PageHeader title="Delivery" onBack={() => navigate('/account/deliveries')} />
      <div style={S.container}>
        {loading && <p style={S.muted}>Loading…</p>}
        {error && <p style={S.error} role="alert">{error}</p>}
        {message && <p style={S.ok} role="status">{message}</p>}

        {delivery && (
          <>
            <div style={S.card}>
              <div style={{ fontWeight: 800, fontSize: 17 }}>{delivery.delivery_number}</div>
              <div style={S.muted}>{delivery.date ?? '—'} · {delivery.status}</div>
              <div style={{ ...S.muted, marginTop: 4 }}>{delivery.summary}</div>
            </div>

            {delivery.can_report_sales ? (
              <form onSubmit={submit} style={S.form}>
                <h2 style={S.h2}>How many did you sell?</h2>
                {delivery.lines.map((line) => (
                  <label key={line.id} style={S.field} data-testid={`report-line-${line.id}`}>
                    <span style={S.label}>
                      {line.item_name} — {line.qty_delivered} delivered — how many did you sell?
                    </span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={line.qty_delivered}
                      step={1}
                      value={qtys[line.id] ?? ''}
                      onChange={(e) => {
                        setQtys((prev) => ({ ...prev, [line.id]: e.target.value }));
                        setConfirming(false);
                      }}
                      style={S.input}
                      required
                    />
                    <span style={S.hint}>MVR {line.unit_price_mvr.toFixed(2)} each</span>
                  </label>
                ))}
                <p style={S.running} data-testid="report-running-note">{runningNote}</p>
                <button type="submit" disabled={saving} style={S.btnPrimary}>
                  {saving ? 'Saving…' : confirming ? 'Confirm & submit' : 'Submit sales'}
                </button>
                {confirming && (
                  <button
                    type="button"
                    style={S.btnGhost}
                    onClick={() => setConfirming(false)}
                  >
                    Cancel
                  </button>
                )}
              </form>
            ) : (
              <div style={S.card}>
                <h2 style={S.h2}>What you reported</h2>
                {delivery.lines.map((line) => (
                  <div key={line.id} style={S.readonlyRow}>
                    <span>{line.item_name}</span>
                    <strong>
                      {line.reported_sold_qty ?? '—'} sold of {line.qty_delivered}
                    </strong>
                  </div>
                ))}
                <p style={S.muted}>Reporting is closed once we have checked this delivery.</p>
              </div>
            )}

            {delivery.sales_reported && delivery.can_report_sales && (
              <p style={S.muted}>You can change these numbers until we check the delivery.</p>
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
  muted: { color: 'var(--color-text-muted)', fontSize: 13, margin: 0 },
  error: { color: 'var(--color-error, #dc2626)', fontSize: 14, margin: 0 },
  ok: { color: 'var(--color-success, #15803d)', fontSize: 14, fontWeight: 600, margin: 0 },
  card: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 12,
    padding: '14px 16px',
  },
  form: { display: 'flex', flexDirection: 'column', gap: 14 },
  h2: { fontSize: 16, fontWeight: 800, margin: 0 },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 14, fontWeight: 600, lineHeight: 1.35 },
  input: {
    minHeight: 44,
    width: '100%',
    maxWidth: '100%',
    borderRadius: 12,
    border: '1px solid var(--color-border)',
    padding: '10px 12px',
    fontSize: 16,
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  hint: { fontSize: 12, color: 'var(--color-text-muted)' },
  running: {
    fontSize: 13,
    color: 'var(--color-text-secondary)',
    background: 'var(--color-bg)',
    borderRadius: 10,
    padding: '10px 12px',
    margin: 0,
  },
  readonlyRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 8,
    fontSize: 14,
    padding: '8px 0',
    borderBottom: '1px solid var(--color-border)',
  },
  btnPrimary: {
    minHeight: 44,
    border: 'none',
    borderRadius: 12,
    background: 'var(--color-primary)',
    color: '#fff',
    fontWeight: 700,
    fontSize: 15,
    fontFamily: 'inherit',
    cursor: 'pointer',
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 16px',
  },
  btnGhost: {
    minHeight: 44,
    border: '1px solid var(--color-border)',
    borderRadius: 12,
    background: 'transparent',
    fontWeight: 600,
    fontSize: 15,
    fontFamily: 'inherit',
    cursor: 'pointer',
  },
};

export default TradeDeliveryDetailPage;
