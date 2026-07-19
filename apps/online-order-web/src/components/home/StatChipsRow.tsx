import { Link } from 'react-router-dom';
import { Skeleton } from '../ui/Skeleton';
import { useLanguage } from '../../context/LanguageContext';

type Props = {
  loading: boolean;
  isAuthenticated: boolean;
  loyaltyPoints: number | null;
  /** @deprecated Active orders are shown on the Orders tab badge — ignored. */
  activeOrder?: { id: number; status: string } | null;
  specialsCount: number;
  /** Phone shows points beside the account avatar — skip the chip. */
  hideLoyalty?: boolean;
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

/**
 * Home utility chips — points (signed-in) + specials only.
 * Guest "Sign in to earn points" and active-order chips removed;
 * active orders use the Orders tab count in the bottom nav.
 */
export function StatChipsRow({
  loading,
  isAuthenticated,
  loyaltyPoints,
  specialsCount,
  hideLoyalty = false,
}: Props) {
  const { t } = useLanguage();

  const loyaltyChip =
    hideLoyalty || (!loading && !isAuthenticated) ? null : loading ? (
      <Skeleton width={140} height={40} radius="var(--radius-full)" />
    ) : (
      <Link
        to="/rewards"
        style={{ ...chipBase, color: 'var(--color-primary)' }}
      >
        <span aria-hidden="true">⭐</span>
        {loyaltyPoints !== null
          ? `${loyaltyPoints} ${t('home.chip_rewards')}`
          : t('home.chip_rewards')}
      </Link>
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

  if (!loading && !loyaltyChip && !specialsChip) {
    return null;
  }

  return (
    <div className="home-stat-chips">
      <div className="home-stat-chips__row">
        {loyaltyChip}
        {specialsChip}
      </div>
    </div>
  );
}
