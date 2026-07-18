import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { useShellNav } from '../../context/ShellNavContext';
import { useActiveOrder } from '../../hooks/useActiveOrder';
import {
  HomeIcon,
  MenuIcon,
  OrdersIcon,
} from '../icons';

function RewardsIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function GiftIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M12 8v13" />
      <path d="M19 12v7a2 2 0 01-2 2H7a2 2 0 01-2-2v-7" />
      <path d="M7.5 8a2.5 2.5 0 010-5C9.5 3 12 8 12 8s2.5-5 4.5-5a2.5 2.5 0 010 5" />
    </svg>
  );
}

type Tab = {
  to: string;
  labelKey: string;
  match: (path: string) => boolean;
  icon: ReactNode;
  badge?: boolean;
};

/**
 * 5-tab bottom navigation — visible at all viewport widths inside AppShell.
 */
export function BottomNav() {
  const { t } = useLanguage();
  const { hideNav } = useShellNav();
  const location = useLocation();
  const { hasActiveOrder } = useActiveOrder();

  if (hideNav) return null;

  const tabs: Tab[] = [
    {
      to: '/',
      labelKey: 'nav.home',
      match: (p) => p === '/',
      icon: <HomeIcon size={24} />,
    },
    {
      to: '/menu',
      labelKey: 'nav.menu',
      match: (p) => p === '/menu' || p.startsWith('/menu/'),
      icon: <MenuIcon size={24} />,
    },
    {
      to: '/order-history',
      labelKey: 'nav.orders',
      match: (p) => p === '/order-history' || p.startsWith('/order-history/'),
      icon: <OrdersIcon size={24} />,
      badge: hasActiveOrder,
    },
    {
      to: '/rewards',
      labelKey: 'nav.rewards',
      match: (p) => p === '/rewards' || p.startsWith('/rewards/'),
      icon: <RewardsIcon size={24} />,
    },
    {
      to: '/gift-cards',
      labelKey: 'nav.gifts',
      match: (p) => p === '/gift-cards' || p.startsWith('/gift-cards/'),
      icon: <GiftIcon size={24} />,
    },
  ];

  return (
    <nav className="bottom-nav" aria-label={t('nav.aria')}>
      {tabs.map(({ to, labelKey, match, icon, badge }) => {
        const active = match(location.pathname);
        return (
          <Link
            key={to}
            to={to}
            className={`bottom-nav__item${active ? ' is-active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            <span className="bottom-nav__icon" style={{ position: 'relative', display: 'flex' }}>
              {icon}
              {badge && (
                <span
                  className="bottom-nav__badge"
                  aria-label={t('orders.active_badge')}
                />
              )}
            </span>
            <span>{t(labelKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
