import { Link } from 'react-router-dom';

export function OrderHistorySection() {
  return (
    <Link
      to="/order-history"
      style={{
        display: 'flex', flexDirection: 'column', gap: 4,
        padding: '16px 18px',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 14,
        textDecoration: 'none',
      }}
    >
      <span style={{ fontSize: 22 }}>🧾</span>
      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-dark)' }}>Order History</span>
      <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>View past orders</span>
    </Link>
  );
}
