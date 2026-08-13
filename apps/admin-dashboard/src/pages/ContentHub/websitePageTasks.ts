import type { LucideIcon } from 'lucide-react';
import {
  Clock,
  Contact,
  Home,
  LayoutTemplate,
  Menu,
  ShoppingBag,
  Gift,
  History,
  Info,
  Shield,
  Tv,
} from 'lucide-react';
import type { ContentApp, ContentBlock } from '../../api/content';
import {
  hubGroupForKey,
  ORDER_APP_HUB_SECTION_ORDER,
  WEBSITE_HUB_SECTION_ORDER,
} from './contentHubGroupMap';

/**
 * Stage 4 — page-first Content Hub sections.
 * Membership comes from contentHubGroupMap (inventory-derived), not legacy
 * registry group names like Pages / General / Order App.
 */

/** Legacy deep link that must never open a mixed dump. */
export const LEGACY_PAGES_GROUP = 'Pages';

/** Old backend / URL group names no longer shown in the rail. */
export const HIDDEN_CONTENT_GROUPS = new Set([
  'Pages',
  'Contact',
  'General',
  'Branding',
  'Announcements',
  'Hero',
  'Footer',
  'SEO',
  'Homepage',
  'Order App',
  'Status banners',
  'Pre-Order',
  'Store',
  'Business Details',
  'Contact & map',
  'Opening hours',
  'Catering & events',
  'Events & Catering',
]);

/** Legacy ?group= → Stage 4 section. */
export const LEGACY_GROUP_ALIASES: Record<string, string> = {
  Pages: '',
  Contact: 'Contact page',
  'Contact & map': 'Contact page',
  'Opening hours': 'Hours page',
  'Catering & events': 'Home',
  'Events & Catering': 'Home',
  Homepage: 'Home',
  Hero: 'Home',
  Branding: 'Everywhere',
  Announcements: 'Everywhere',
  Footer: 'Everywhere',
  SEO: 'Everywhere',
  General: 'Everywhere',
  'Order App': 'Home',
  'Status banners': 'Home',
  Menu: 'Menu', // order app; website empty Menu page also ok
  Legal: 'Legal',
  About: 'About',
};

/** Home section (Stage 4 name) plus legacy Homepage deep links. */
export function isHomeSection(sectionName: string | null | undefined): boolean {
  return sectionName === 'Home' || sectionName === 'Homepage';
}

export type WebsitePageTaskId =
  | 'home'
  | 'contact_page'
  | 'hours_page'
  | 'legal'
  | 'everywhere';

export type WebsitePageTask = {
  id: WebsitePageTaskId;
  group: string;
  title: string;
  description: string;
  icon: LucideIcon;
  matchesKey: (key: string) => boolean;
};

/** Landing / deep-link tasks for Website Content (Stage 4 names). */
export const WEBSITE_PAGE_TASKS: WebsitePageTask[] = [
  {
    id: 'home',
    group: 'Home',
    title: 'Home',
    description: 'Homepage blocks in the order customers see them',
    icon: Home,
    matchesKey: (key) => hubGroupForKey(key, 'website') === 'Home',
  },
  {
    id: 'contact_page',
    group: 'Contact page',
    title: 'Contact page',
    description: 'Contact copy, labels, and map',
    icon: Contact,
    matchesKey: (key) => hubGroupForKey(key, 'website') === 'Contact page',
  },
  {
    id: 'hours_page',
    group: 'Hours page',
    title: 'Hours page',
    description: 'Hours page wording — schedule is managed in Online Ordering',
    icon: Clock,
    matchesKey: (key) => hubGroupForKey(key, 'website') === 'Hours page',
  },
  {
    id: 'legal',
    group: 'Legal',
    title: 'Legal',
    description: 'Privacy, terms, and refund pages',
    icon: Shield,
    matchesKey: (key) => hubGroupForKey(key, 'website') === 'Legal',
  },
  {
    id: 'everywhere',
    group: 'Everywhere',
    title: 'Everywhere',
    description: 'Header, footer, branding, SEO, and site-wide chrome',
    icon: LayoutTemplate,
    matchesKey: (key) => hubGroupForKey(key, 'website') === 'Everywhere',
  },
];

const PAGE_BY_GROUP = new Map(WEBSITE_PAGE_TASKS.map((t) => [t.group, t]));

export function websitePageTaskByGroup(group: string): WebsitePageTask | undefined {
  return PAGE_BY_GROUP.get(group);
}

export function isWebsitePageGroup(group: string): boolean {
  return PAGE_BY_GROUP.has(group);
}

/** @deprecated use hubGroupForKey — kept for older call sites during Stage 4. */
export function contentViewForKey(key: string, app: ContentApp = 'website'): string | null {
  return hubGroupForKey(key, app);
}

export function isLegalOwnedKey(key: string): boolean {
  return hubGroupForKey(key, 'website') === 'Legal';
}

export function isHomepageOwnedKey(key: string): boolean {
  return hubGroupForKey(key, 'website') === 'Home';
}

export function isOrderAppOwnedKey(key: string): boolean {
  return /^office_orders_/i.test(key);
}

/** Blocks shown in a hub section for the active app. */
export function blocksForContentView(
  sectionName: string,
  blocks: ContentBlock[],
  app: ContentApp = 'website',
): ContentBlock[] {
  if (sectionName === LEGACY_PAGES_GROUP) {
    return [];
  }
  const alias = LEGACY_GROUP_ALIASES[sectionName];
  const resolved = alias === '' ? null : (alias ?? sectionName);
  if (!resolved) return [];

  return blocks.filter((b) => {
    if (!b.apps.includes(app)) return false;
    return hubGroupForKey(b.key, app) === resolved;
  });
}

/** Section names available in rail / landing for this app's blocks. */
export function visibleContentGroups(blocks: ContentBlock[], app: ContentApp = 'website'): string[] {
  const names = new Set<string>();
  for (const block of blocks) {
    if (!block.apps.includes(app)) continue;
    const view = hubGroupForKey(block.key, app);
    if (view) names.add(view);
  }
  const order = app === 'order_app' ? ORDER_APP_HUB_SECTION_ORDER : WEBSITE_HUB_SECTION_ORDER;
  return order.filter((name) => names.has(name));
}

export function isGroupDirty(
  sectionName: string,
  blocks: ContentBlock[],
  draftKeys: string[],
  parseDraftKey: (dk: string) => { key: string } | null,
  app: ContentApp = 'website',
): boolean {
  const sectionKeys = new Set(blocksForContentView(sectionName, blocks, app).map((b) => b.key));
  return draftKeys.some((dk) => {
    const parsed = parseDraftKey(dk);
    return Boolean(parsed && sectionKeys.has(parsed.key));
  });
}

/** Icons for Stage 4 sections (rail). */
export const HUB_SECTION_ICONS: Record<string, LucideIcon> = {
  Home,
  'Menu page': Menu,
  Menu,
  'Contact page': Contact,
  'Hours page': Clock,
  Legal: Shield,
  Everywhere: LayoutTemplate,
  Ordering: ShoppingBag,
  'Order history': History,
  'Gift cards': Gift,
  About: Info,
  Privacy: Shield,
  Signage: Tv,
};
