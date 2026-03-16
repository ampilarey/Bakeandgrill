import { useState, useEffect, useCallback } from 'react';
import type { Delivery, Stats } from '../types';
import { api } from '../api';
import StatusBadge from '../components/StatusBadge';
import EarningsCard from '../components/EarningsCard';

export default function HistoryPage() {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState('');
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);

  const load = useCallback(async (p = 1, d = '') => {
    setLoading(true);
    try {
      const [histRes, statsRes] = await Promise.all([
        api.getHistory(p, d || undefined),
        api.getStats(),
      ]);
      setDeliveries(histRes.deliveries);
      setLastPage(histRes.meta.last_page);
      setPage(histRes.meta.current_page);
      setStats(statsRes.stats);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(1, date); }, [load, date]);

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--color-bg)', paddingBottom: 80 }}>
      {/* Header */}
      <div style={{
        background: 'var(--color-dark)', color: 'white',
        padding: 'max(3rem, env(safe-area-inset-top)) 1.25rem 1.5rem',
      }}>
        <h1 style={{ fontSize: '1.375rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
          Delivery History
        </h1>
      </div>

      <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {stats && <EarningsCard stats={stats} />}

        {/* Date filter */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            style={{
              flex: 1, height: 40, padding: '0 12px',
              border: '1.5px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              fontSize: '0.9rem', fontFamily: 'inherit',
              color: 'var(--color-text)', background: 'var(--color-surface)',
              outline: 'none',
            }}
          />
          {date && (
            <button
              onClick={() => setDate('')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', fontWeight: 600, fontFamily: 'inherit', fontSize: '0.875rem', padding: '4px 6px' }}
            >
              Clear
            </button>
          )}
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 90 }} />)}
          </div>
        ) : deliveries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 10, opacity: 0.4 }}>📋</div>
            <p style={{ fontWeight: 700, color: 'var(--color-text)', margin: '0 0 4px' }}>No deliveries yet</p>
            {date && <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', margin: 0 }}>Try a different date</p>}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} className="animate-fade-in">
            {deliveries.map(d => (
              <div key={d.id} style={{
                background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-2xl)', padding: '1rem', boxShadow: 'var(--shadow-sm)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <span style={{ fontWeight: 800, fontSize: '0.9375rem', color: 'var(--color-text)' }}>#{d.id}</span>
                  <StatusBadge status={d.status} />
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
                  {d.delivery_area && <p style={{ margin: 0 }}>📍 {d.delivery_area}</p>}
                  {d.delivered_at && (
                    <p style={{ margin: 0 }}>
                      🕐 {new Date(d.delivered_at).toLocaleDateString()} · {new Date(d.delivered_at).toLocaleTimeString()}
                    </p>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--color-border)' }}>
                  <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>{d.item_count} items</span>
                  <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-primary)' }}>
                    MVR {parseFloat(String(d.total)).toFixed(2)}
                  </span>
                </div>
              </div>
            ))}

            {lastPage > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '8px 0' }}>
                <button
                  onClick={() => void load(page - 1, date)}
                  disabled={page <= 1}
                  style={{ background: 'none', border: 'none', fontFamily: 'inherit', fontSize: '0.875rem', fontWeight: 600, color: page > 1 ? 'var(--color-primary)' : 'var(--color-text-muted)', cursor: page > 1 ? 'pointer' : 'not-allowed' }}
                >
                  ‹ Prev
                </button>
                <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>{page} / {lastPage}</span>
                <button
                  onClick={() => void load(page + 1, date)}
                  disabled={page >= lastPage}
                  style={{ background: 'none', border: 'none', fontFamily: 'inherit', fontSize: '0.875rem', fontWeight: 600, color: page < lastPage ? 'var(--color-primary)' : 'var(--color-text-muted)', cursor: page < lastPage ? 'pointer' : 'not-allowed' }}
                >
                  Next ›
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
