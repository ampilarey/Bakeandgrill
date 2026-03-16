import { useNavigate } from 'react-router-dom';
import type { Delivery } from '../types';
import StatusBadge from './StatusBadge';

interface Props { delivery: Delivery }

function timeSince(iso: string | null): string {
  if (!iso) return '';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
}

export default function DeliveryCard({ delivery }: Props) {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate(`/delivery/${delivery.id}`)}
      style={{
        width: '100%', background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-2xl)',
        padding: '1rem', textAlign: 'left',
        cursor: 'pointer', fontFamily: 'inherit',
        boxShadow: 'var(--shadow-sm)',
        transition: 'box-shadow 0.15s, transform 0.1s',
      }}
      onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.99)')}
      onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
      onTouchStart={e => (e.currentTarget.style.transform = 'scale(0.99)')}
      onTouchEnd={e => (e.currentTarget.style.transform = 'scale(1)')}
    >
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 800, fontSize: '0.9375rem', color: 'var(--color-text)' }}>
            #{delivery.id}
          </span>
          <StatusBadge status={delivery.status} />
        </div>
        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
          {timeSince(delivery.driver_assigned_at)}
        </span>
      </div>

      {/* Address */}
      <div style={{ marginBottom: 8 }}>
        {delivery.delivery_area && (
          <p style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-text)', margin: '0 0 2px', display: 'flex', alignItems: 'center', gap: 5 }}>
            <span>📍</span> {delivery.delivery_area}
          </p>
        )}
        {delivery.delivery_address && (
          <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', margin: 0, paddingLeft: 20, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {delivery.delivery_address}
          </p>
        )}
        {delivery.customer_name && (
          <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', margin: '4px 0 0', display: 'flex', alignItems: 'center', gap: 5 }}>
            <span>👤</span> {delivery.customer_name}
          </p>
        )}
      </div>

      {/* Footer */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        paddingTop: 10, borderTop: '1px solid var(--color-border)',
      }}>
        <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
          {delivery.item_count} item{delivery.item_count !== 1 ? 's' : ''}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontWeight: 700, color: 'var(--color-primary)', fontSize: '0.875rem' }}>
            MVR {parseFloat(String(delivery.total)).toFixed(2)}
          </span>
          <span style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>›</span>
        </div>
      </div>
    </button>
  );
}
