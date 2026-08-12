import type { ComponentType } from 'react';
import type { PageBlockRow } from '../../api';
import { useSiteSettingsContext } from '../../context/SiteSettingsContext';
import { brandLogoSrc } from '../../lib/brandLogo';
import { MenuIcon, OrdersIcon } from '../icons';

/** Bake & Grill logo for the Home tab (bottom nav). CSS swaps on [data-theme="dark"]. */
export function BrandHomeIcon({ size = 24 }: { size?: number }) {
  const { settings } = useSiteSettingsContext();
  const light = brandLogoSrc(settings, false);
  const dark = brandLogoSrc(settings, true);
  return (
    <>
      <img
        className="bottom-nav__brand-logo brand-logo--light"
        src={light}
        alt=""
        width={size}
        height={size}
        decoding="async"
      />
      <img
        className="bottom-nav__brand-logo brand-logo--dark"
        src={dark}
        alt=""
        width={size}
        height={size}
        decoding="async"
      />
    </>
  );
}

function PreOrderIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
      <path d="M12 14v3l2 1" />
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

export type ResolvedShellNavTab = ShellNavTab & {
  /** Admin-configured label override from bottom_nav settings.tabs */
  displayLabel?: string;
};

type BottomNavTabConfig = {
  id: string;
  label?: string;
  href?: string;
  visible?: boolean;
};

function shellTabId(tab: ShellNavTab): string {
  if (tab.to === '/') return 'home';
  if (tab.to === '/menu') return 'menu';
  if (tab.to === '/order-history') return 'orders';
  if (tab.to === '/events') return 'events';
  if (tab.to === '/gift-cards') return 'gift_cards';
  return tab.to.replace(/^\//, '').replace(/\//g, '_');
}

function normalizeOrderAppHref(href: string): string {
  const trimmed = href.trim();
  if (!trimmed) return '';
  if (trimmed === '/orders') return '/order-history';
  if (trimmed.startsWith('/order/')) return trimmed.slice('/order'.length) || '/';
  return trimmed;
}

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
    to: '/events',
    labelKey: 'nav.preorder',
    match: (p) =>
      p === '/events'
      || p.startsWith('/events/')
      || p === '/pre-order'
      || p.startsWith('/pre-order/')
      || p.startsWith('/quote/'),
    Icon: PreOrderIcon,
  },
  {
    to: '/gift-cards',
    labelKey: 'nav.gifts',
    match: (p) => p === '/gift-cards' || p.startsWith('/gift-cards/'),
    Icon: GiftIcon,
  },
];

const SHELL_TAB_BY_ID = Object.fromEntries(
  SHELL_NAV_TABS.map((tab) => [shellTabId(tab), tab]),
) as Record<string, ShellNavTab>;

/** Resolve bottom-nav tabs from page_blocks settings, falling back to defaults. */
export function resolveBottomNavTabs(blocks: PageBlockRow[]): ResolvedShellNavTab[] {
  const block = blocks.find((b) => b.block_type === 'bottom_nav');
  const rawTabs = block?.settings?.tabs;
  if (!Array.isArray(rawTabs) || rawTabs.length === 0) {
    return SHELL_NAV_TABS;
  }

  const resolved: ResolvedShellNavTab[] = [];
  for (const entry of rawTabs as BottomNavTabConfig[]) {
    if (entry.visible === false) continue;
    const shell = SHELL_TAB_BY_ID[entry.id];
    if (!shell) continue;
    const href = typeof entry.href === 'string' ? normalizeOrderAppHref(entry.href) : '';
    resolved.push({
      ...shell,
      to: href || shell.to,
      displayLabel: typeof entry.label === 'string' && entry.label.trim() !== ''
        ? entry.label.trim()
        : undefined,
    });
  }

  return resolved.length > 0 ? resolved : SHELL_NAV_TABS;
}

/** Tablet + desktop chrome breakpoint (iPad portrait and up). */
export const DESKTOP_SHELL_MQ = '(min-width: 768px)';
