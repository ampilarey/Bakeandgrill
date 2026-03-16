import { useState, useEffect, useCallback } from 'react';
import type { Delivery, Driver } from '../types';
import { api } from '../api';
import DeliveryCard from '../components/DeliveryCard';

interface Props { driver: Driver }

export default function ActivePage({ driver }: Props) {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const { deliveries: d } = await api.getDeliveries();
      setDeliveries(d);
      setError('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load deliveries.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const id = setInterval(() => void load(), 30_000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--color-bg)', paddingBottom: 80 }}>
      {/* Header */}
      <div style={{
        background: 'var(--color-dark)', color: 'white',
        padding: 'max(3rem, env(safe-area-inset-top)) 1.25rem 1.5rem',
      }}>
        <p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px' }}>
          Good day,
        </p>
        <h1 style={{ fontSize: '1.375rem', fontWeight: 800, margin: '0 0 2px', letterSpacing: '-0.02em' }}>
          {driver.name}
        </h1>
        {driver.vehicle_type && (
          <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.5)', margin: 0 }}>
            🚗 {driver.vehicle_type}
          </p>
        )}
      </div>

      <div style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--color-text)', margin: 0 }}>
            Active Deliveries
          </h2>
          <button
            onClick={() => { setLoading(true); void load(); }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-primary)',
              fontFamily: 'inherit', padding: '4px 8px',
            }}
          >
            ↻ Refresh
          </button>
        </div>

        {error && (
          <div style={{
            background: 'var(--color-error-bg)', border: '1px solid rgba(220,38,38,0.2)',
            color: '#7f1d1d', borderRadius: 'var(--radius-lg)',
            padding: '10px 14px', fontSize: '0.875rem', marginBottom: 12,
          }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[1, 2].map(i => (
              <div key={i} className="skeleton" style={{ height: 120 }} />
            ))}
          </div>
        ) : deliveries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: 12, opacity: 0.5 }}>🎉</div>
            <p style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--color-text)', margin: '0 0 4px' }}>
              No active deliveries
            </p>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', margin: 0 }}>
              You're all caught up!
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} className="animate-fade-in">
            {deliveries.map(d => <DeliveryCard key={d.id} delivery={d} />)}
          </div>
        )}
      </div>
    </div>
  );
}
