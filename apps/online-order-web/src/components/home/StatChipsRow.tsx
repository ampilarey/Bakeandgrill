import { Link } from 'react-router-dom';
import { Skeleton } from '../ui/Skeleton';
import { useLanguage } from '../../context/LanguageContext';

type Props = {
  loading: boolean;
  isAuthenticated: boolean;
  loyaltyPoints: number | null;
  activeOrder: { id: number; status: string } | null;
  specialsCount: number;
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

/**
 * Utility chips under the hero — only when there is something useful to show.
 * Guest "Sign in to earn points" removed (noise). Empty "No active order" omitted.
 */
export function StatChipsRow({
  loading,
  isAuthenticated,
  loyaltyPoints,
  activeOrder,
  specialsCount,
}: Props) {
  const { t } = useLanguage();

  const showLoyalty = isAuthenticated;
  const showActive = Boolean(activeOrder);
  const showSpecials = !loading && specialsCount > 0;

  if (!loading && !showLoyalty && !showActive && !showSpecials) {
    return null;
  }

  return (
    <div className="home-stat-chips">
      <div className="home-stat-chips__row">
        {loading ? (
          <Skeleton width={140} height={40} radius="var(--radius-full)" />
        ) : showLoyalty ? (
          <Link
            to="/rewards"
            style={{ ...chipBase, color: 'var(--color-primary)' }}
          >
            <span aria-hidden="true">⭐</span>
            {loyaltyPoints !== null
              ? `${loyaltyPoints} ${t('home.chip_rewards')}`
              : t('home.chip_rewards')}
          </Link>
        ) : null}

        {loading ? (
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
        ) : null}

        {showSpecials && (
          <Link
            to="/menu"
            style={{ ...chipBase, color: 'var(--color-text)' }}
          >
            <span aria-hidden="true">🔥</span>
            {`${specialsCount} ${t('home.chip_specials')}`}
          </Link>
        )}
      </div>
    </div>
  );
}
