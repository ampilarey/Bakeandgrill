import { useState } from 'react';
import { Link } from 'react-router-dom';
import { usePageTitle } from '../hooks/usePageTitle';

interface HistoryEntry {
  orderId: number;
  orderType: 'takeaway' | 'delivery';
  totalLaar: number;
  itemCount: number;
  placedAt: string;
}

function loadHistory(): HistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem('bakegrill_order_history') ?? '[]');
  } catch { return []; }
}

function laarToMvr(laar: number) { return (laar / 100).toFixed(2); }

function fmtDate(iso: string) {
  const d = new Date(iso);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())} ${months[d.getMonth()]} ${d.getFullYear()}  ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function OrderHistoryPage() {
  usePageTitle('Order History');
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory);

  const clearHistory = () => {
    localStorage.removeItem('bakegrill_order_history');
    setHistory([]);
  };

  return (
    <div style={{ maxWidth: '680px', margin: '0 auto', padding: '2rem 1.25rem', minHeight: '60vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-dark)', margin: 0 }}>Order History</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', margin: '0.25rem 0 0' }}>
            Your recent orders from this device
          </p>
        </div>
        {history.length > 0 && (
          <button
            onClick={clearHistory}
            style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '0.4rem 0.875rem', fontSize: '0.8rem', color: 'var(--color-text-muted)', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
          >
            Clear history
          </button>
        )}
      </div>

      {history.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem 1.5rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.3 }}>📋</div>
          <p style={{ color: 'var(--color-text-muted)', marginBottom: '1.5rem' }}>No orders yet on this device.</p>
          <Link to="/menu" style={{ color: 'var(--color-primary)', fontWeight: 600, textDecoration: 'none' }}>
            Browse the menu →
          </Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {history.map((entry) => (
            <div
              key={`${entry.orderId}-${entry.placedAt}`}
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: '14px',
                padding: '1rem 1.25rem',
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <div style={{ fontSize: '1.75rem', flexShrink: 0 }}>
                {entry.orderType === 'delivery' ? '🛵' : '🥡'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, color: 'var(--color-text)', fontSize: '0.95rem' }}>
                    Order #{entry.orderId}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', background: 'var(--color-surface-alt)', padding: '0.1rem 0.5rem', borderRadius: '999px', textTransform: 'capitalize' }}>
                    {entry.orderType}
                  </span>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: '0.2rem' }}>
                  {entry.itemCount} item{entry.itemCount !== 1 ? 's' : ''} · MVR {laarToMvr(entry.totalLaar)}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: '0.1rem' }}>
                  {fmtDate(entry.placedAt)}
                </div>
              </div>
              <Link
                to={`/orders/${entry.orderId}`}
                style={{
                  padding: '0.45rem 0.875rem',
                  background: 'var(--color-primary-light)',
                  color: 'var(--color-primary)',
                  border: '1px solid rgba(217,119,6,0.2)',
                  borderRadius: '8px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                }}
              >
                Track →
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
