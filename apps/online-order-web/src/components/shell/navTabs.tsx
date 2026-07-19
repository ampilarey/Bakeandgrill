import type { ComponentType } from 'react';
import { useSiteSettingsContext } from '../../context/SiteSettingsContext';
import { MenuIcon, OrdersIcon } from '../icons';

/** Bake & Grill logo for the Home tab (bottom nav). */
export function BrandHomeIcon({ size = 24 }: { size?: number }) {
  const { settings } = useSiteSettingsContext();
  const src = settings.logo || '/logo.png';
  return (
    <img
      className="bottom-nav__brand-logo"
      src={src}
      alt=""
      width={size}
      height={size}
      decoding="async"
    />
  );
}

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

export type ShellNavTab = {
  to: string;
  labelKey: string;
  match: (path: string) => boolean;
  Icon: ComponentType<{ size?: number }>;
  /** Orders tab shows an active-order dot when true. */
  showActiveOrderBadge?: boolean;
};

export const SHELL_NAV_TABS: ShellNavTab[] = [
  {
    to: '/',
    labelKey: 'nav.home',
    match: (p) => p === '/',
    Icon: BrandHomeIcon,
  },
  {
    to: '/menu',
    labelKey: 'nav.menu',
    match: (p) => p === '/menu' || p.startsWith('/menu/'),
    Icon: MenuIcon,
  },
  {
    to: '/order-history',
    labelKey: 'nav.orders',
    match: (p) => p === '/order-history' || p.startsWith('/order-history/'),
    Icon: OrdersIcon,
    showActiveOrderBadge: true,
  },
  {
    to: '/rewards',
    labelKey: 'nav.rewards',
    match: (p) => p === '/rewards' || p.startsWith('/rewards/'),
    Icon: RewardsIcon,
  },
  {
    to: '/gift-cards',
    labelKey: 'nav.gifts',
    match: (p) => p === '/gift-cards' || p.startsWith('/gift-cards/'),
    Icon: GiftIcon,
  },
];

/** Tablet + desktop chrome breakpoint (iPad portrait and up). */
export const DESKTOP_SHELL_MQ = '(min-width: 768px)';
