import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Delivery, DeliveryStatus } from '../types';
import { api } from '../api';
import StatusStepper from '../components/StatusStepper';
import ContactBar from '../components/ContactBar';

const S: Record<string, React.CSSProperties> = {
  card: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-2xl)',
    padding: '1rem',
    boxShadow: 'var(--shadow-sm)',
  },
  cardTitle: {
    fontSize: '0.7rem', fontWeight: 700,
    color: 'var(--color-text-muted)', textTransform: 'uppercase',
    letterSpacing: '0.08em', margin: '0 0 12px',
  },
};

export default function DetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const { delivery: d } = await api.getDelivery(parseInt(id, 10));
      setDelivery(d);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load delivery.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const handleStatusUpdate = async (next: DeliveryStatus) => {
    if (!delivery) return;
    setUpdating(true);
    setError('');
    try {
      const { delivery: updated } = await api.updateStatus(delivery.id, next);
      setDelivery(prev => prev ? { ...prev, ...updated, status: updated.status as DeliveryStatus } : prev);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update status.');
    } finally {
      setUpdating(false);
    }
  };

  const mapsLink = delivery?.delivery_address
    ? `https://maps.google.com/?q=${encodeURIComponent(
        [delivery.delivery_area, delivery.delivery_address, delivery.delivery_building]
          .filter(Boolean).join(', ')
      )}`
    : null;

  if (loading) {
    return (
      <div style={{ minHeight: '100dvh', background: 'var(--color-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="animate-spin" style={{ fontSize: '2rem', color: 'var(--color-primary)' }}>⟳</div>
      </div>
    );
  }

  if (!delivery) {
    return (
      <div style={{ minHeight: '100dvh', background: 'var(--color-bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <p style={{ color: 'var(--color-text)', fontWeight: 600, marginBottom: 12 }}>Delivery not found.</p>
        <button onClick={() => navigate('/')} style={{ color: 'var(--color-primary)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.9375rem' }}>
          ← Back to Active
        </button>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--color-bg)', paddingBottom: 100 }}>
      {/* Header */}
      <div style={{
        background: 'var(--color-dark)', color: 'white',
        padding: 'max(3rem, env(safe-area-inset-top)) 1.25rem 1.25rem',
      }}>
        <button
          onClick={() => navigate('/')}
          style={{ background: 'none', border: 'none', color: 'var(--color-primary)', fontWeight: 600, fontSize: '0.875rem', fontFamily: 'inherit', cursor: 'pointer', padding: '0 0 10px', display: 'flex', alignItems: 'center', gap: 4 }}
        >
          ‹ Back
        </button>
        <h1 style={{ fontSize: '1.375rem', fontWeight: 800, margin: '0 0 2px', letterSpacing: '-0.02em' }}>
          Delivery #{delivery.id}
        </h1>
        <p style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.5)', margin: 0 }}>
          MVR {parseFloat(String(delivery.total)).toFixed(2)}
        </p>
      </div>

      <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: 12 }} className="animate-fade-in">
        {error && (
          <div style={{ background: 'var(--color-error-bg)', border: '1px solid rgba(220,38,38,0.2)', color: '#7f1d1d', borderRadius: 'var(--radius-lg)', padding: '10px 14px', fontSize: '0.875rem' }}>
            {error}
          </div>
        )}

        {/* Status stepper */}
        <div style={S.card}>
          <p style={S.cardTitle}>Delivery Status</p>
          <StatusStepper status={delivery.status as DeliveryStatus} onUpdate={handleStatusUpdate} loading={updating} />
        </div>

        {/* Address */}
        <div style={S.card}>
          <p style={S.cardTitle}>Delivery Address</p>
          <div style={{ fontSize: '0.9rem', color: 'var(--color-text)', lineHeight: 1.7 }}>
            {delivery.delivery_area && <p style={{ fontWeight: 700, margin: '0 0 2px' }}>{delivery.delivery_area}</p>}
            {delivery.delivery_address && <p style={{ margin: '0 0 2px' }}>{delivery.delivery_address}</p>}
            {delivery.delivery_building && <p style={{ margin: '0 0 2px' }}>Building: {delivery.delivery_building}</p>}
            {delivery.delivery_floor && <p style={{ margin: '0 0 2px' }}>Floor: {delivery.delivery_floor}</p>}
            {delivery.delivery_notes && (
              <p style={{ color: 'var(--color-text-muted)', fontStyle: 'italic', margin: '6px 0 0' }}>
                Note: {delivery.delivery_notes}
              </p>
            )}
          </div>
          {mapsLink && (
            <a
              href={mapsLink}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                marginTop: 12, color: 'var(--color-primary)',
                fontWeight: 700, fontSize: '0.875rem', textDecoration: 'none',
              }}
            >
              🗺️ Open in Google Maps
            </a>
          )}
        </div>

        {/* Contact */}
        <ContactBar
          name={delivery.customer_name}
          phone={delivery.customer_phone ?? delivery.customer?.phone ?? null}
        />

        {/* Items */}
        {delivery.items && delivery.items.length > 0 && (
          <div style={S.card}>
            <p style={S.cardTitle}>Items ({delivery.items.length})</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {delivery.items.map((item, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--color-text)', margin: '0 0 2px' }}>
                      {item.quantity}× {item.name}
                    </p>
                    {item.variant && <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: 0 }}>{item.variant}</p>}
                    {item.modifiers.length > 0 && <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: 0 }}>{item.modifiers.join(', ')}</p>}
                    {item.notes && <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontStyle: 'italic', margin: '2px 0 0' }}>{item.notes}</p>}
                  </div>
                  <p style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text)', whiteSpace: 'nowrap', margin: 0 }}>
                    MVR {parseFloat(String(item.total_price)).toFixed(2)}
                  </p>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 12, marginTop: 10, borderTop: '1px solid var(--color-border)' }}>
              <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--color-text)' }}>Total</span>
              <span style={{ fontWeight: 800, fontSize: '0.9375rem', color: 'var(--color-primary)' }}>
                MVR {parseFloat(String(delivery.total)).toFixed(2)}
              </span>
            </div>
          </div>
        )}

        {/* Timeline */}
        {(delivery.driver_assigned_at || delivery.picked_up_at || delivery.delivered_at) && (
          <div style={S.card}>
            <p style={S.cardTitle}>Timeline</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { label: 'Assigned',  time: delivery.driver_assigned_at },
                { label: 'Picked up', time: delivery.picked_up_at },
                { label: 'Delivered', time: delivery.delivered_at },
              ].filter(r => r.time).map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>{row.label}</span>
                  <span style={{ color: 'var(--color-text)', fontWeight: 600 }}>
                    {new Date(row.time!).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
