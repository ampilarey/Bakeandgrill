import { Link } from 'react-router-dom';
import { Skeleton } from '../ui/Skeleton';
import { useLanguage } from '../../context/LanguageContext';

type Props = {
  loading: boolean;
  isAuthenticated: boolean;
  loyaltyPoints: number | null;
  activeOrder: { id: number; status: string } | null;
  specialsCount: number;
  /**
   * Desktop/iPad home: skip guest "Sign in to earn points" and empty
   * "No active order" filler. Phone keeps the full chip row.
   */
  compact?: boolean;
};

const chipBase: React.CSSProperties = {
  flexShrink: 0,
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.375rem',
  height: 40,
  padding: '0 0.875rem',
  borderRadius: 'var(--radius-full)',
  background: 'var(--color-surface)',
  border: '1.5px solid var(--color-border)',
  fontSize: '0.8125rem',
  fontWeight: 600,
  whiteSpace: 'nowrap',
  textDecoration: 'none',
};

function activeOrderLabel(status: string): string {
  const map: Record<string, string> = {
    payment_pending: 'Awaiting payment',
    pending: 'Order received',
    paid: 'Confirmed',
    preparing: 'Preparing…',
    ready: 'Ready to collect',
  };
  return map[status] ?? status;
}

export function StatChipsRow({
  loading,
  isAuthenticated,
  loyaltyPoints,
  activeOrder,
  specialsCount,
  compact = false,
}: Props) {
  const { t } = useLanguage();

  const loyaltyChip = loading ? (
    <Skeleton width={140} height={40} radius="var(--radius-full)" />
  ) : isAuthenticated ? (
    <Link
      to="/rewards"
      style={{ ...chipBase, color: 'var(--color-primary)' }}
    >
      <span aria-hidden="true">⭐</span>
      {loyaltyPoints !== null
        ? `${loyaltyPoints} ${t('home.chip_rewards')}`
        : t('home.chip_rewards')}
    </Link>
  ) : compact ? null : (
    <Link
      to="/account"
      style={{ ...chipBase, color: 'var(--color-text-muted)' }}
    >
      <span aria-hidden="true">⭐</span>
      {t('home.chip_sign_in_points')}
    </Link>
  );

  const orderChip = loading ? (
    <Skeleton width={160} height={40} radius="var(--radius-full)" />
  ) : activeOrder ? (
    <Link
      to={`/orders/${activeOrder.id}`}
      style={{
        ...chipBase,
        background: 'var(--color-primary)',
        border: 'none',
        color: '#fff',
      }}
    >
      <span aria-hidden="true">📦</span>
      {activeOrderLabel(activeOrder.status)}
    </Link>
  ) : compact ? null : (
    <span style={{ ...chipBase, color: 'var(--color-text-muted)' }}>
      <span aria-hidden="true">📦</span>
      {t('home.chip_no_order')}
    </span>
  );

  const specialsChip =
    !loading && specialsCount > 0 ? (
      <Link
        to="/menu"
        style={{ ...chipBase, color: 'var(--color-text)' }}
      >
        <span aria-hidden="true">🔥</span>
        {`${specialsCount} ${t('home.chip_specials')}`}
      </Link>
    ) : null;

  if (
    compact &&
    !loading &&
    !loyaltyChip &&
    !orderChip &&
    !specialsChip
  ) {
    return null;
  }

  return (
    <div className={compact ? 'home-stat-chips' : undefined} style={compact ? undefined : {
      padding: '0 var(--page-gutter) 0.75rem',
      maxWidth: 'var(--layout-max)',
      margin: '0 auto',
    }}>
      <div
        className={compact ? 'home-stat-chips__row' : undefined}
        style={compact ? undefined : {
          display: 'flex',
          gap: '0.625rem',
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
          paddingBottom: 2,
        }}
      >
        {loyaltyChip}
        {orderChip}
        {specialsChip}
      </div>
    </div>
  );
}
