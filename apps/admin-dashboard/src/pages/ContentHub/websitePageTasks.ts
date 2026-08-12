import type { LucideIcon } from 'lucide-react';
import {
  CalendarDays,
  Clock,
  Contact,
  Info,
  LayoutTemplate,
} from 'lucide-react';
import type { ContentBlock } from '../../api/content';

/**
 * Focused Website page editors — routing by key ownership, not the legacy
 * mixed `Pages` backend group. Stored keys/values stay unchanged.
 */

export type WebsitePageTaskId =
  | 'contact_map'
  | 'opening_hours'
  | 'about'
  | 'catering_events'
  | 'footer';

export type WebsitePageTask = {
  id: WebsitePageTaskId;
  /** URL `?group=` value and editor title. */
  group: string;
  title: string;
  description: string;
  icon: LucideIcon;
  matchesKey: (key: string) => boolean;
};

/** Backend groups hidden from normal owner navigation (replaced by focused pages). */
export const HIDDEN_CONTENT_GROUPS = new Set(['Pages', 'Contact']);

/** Legacy deep link that must never open the mixed 48-block list. */
export const LEGACY_PAGES_GROUP = 'Pages';

const CONTACT_BUSINESS_KEYS = new Set([
  'business_phone',
  'business_email',
  'business_address',
  'business_whatsapp',
  'business_viber',
  'business_maps_url',
  'business_landmark',
  'business_website',
  'delivery_threshold',
  'delivery_time',
]);

const HOMEPAGE_OWNED_KEYS = new Set([
  'homepage_categories',
  'trust_items',
  'proof_details',
  'home_chat_label',
  'home_visit_card_title',
  'home_delivery_card_title',
  'home_directions_cta',
  'home_call_cta',
  'home_order_via_app_label',
]);

const FOOTER_EXTRA_KEYS = new Set([
  'show_social_links',
  'social_instagram',
  'social_facebook',
  'social_tiktok',
  'nav_order_cta_text',
]);

export const WEBSITE_PAGE_TASKS: WebsitePageTask[] = [
  {
    id: 'contact_map',
    group: 'Contact & map',
    title: 'Contact & map',
    description: 'Phone, messaging, address, and map',
    icon: Contact,
    matchesKey: (key) =>
      key === 'maps_embed_url'
      || CONTACT_BUSINESS_KEYS.has(key)
      || (/^contact_/i.test(key) && !/^contact_events_cta_/i.test(key)),
  },
  {
    id: 'opening_hours',
    group: 'Opening hours',
    title: 'Operating hours',
    description: 'Hours page wording — schedule is managed in Online Ordering',
    icon: Clock,
    matchesKey: (key) => /^hours_/i.test(key),
  },
  {
    id: 'about',
    group: 'About',
    title: 'About',
    description: 'Order App About page — story, title, and values',
    icon: Info,
    matchesKey: (key) => /^about_/i.test(key),
  },
  {
    id: 'catering_events',
    group: 'Catering & events',
    title: 'Catering & events',
    description: 'Website home band + contact CTAs (not a full standalone page)',
    icon: CalendarDays,
    matchesKey: (key) => /^events_/i.test(key) || /^contact_events_cta_/i.test(key),
  },
  {
    id: 'footer',
    group: 'Footer',
    title: 'Footer',
    description: 'Website footer + Order App brand footer text and nav links',
    icon: LayoutTemplate,
    matchesKey: (key) =>
      /^footer_/i.test(key)
      || FOOTER_EXTRA_KEYS.has(key)
      || /^social_/i.test(key)
      || key === 'home_chat_label',
  },
];

const PAGE_BY_GROUP = new Map(WEBSITE_PAGE_TASKS.map((t) => [t.group, t]));

export function websitePageTaskByGroup(group: string): WebsitePageTask | undefined {
  return PAGE_BY_GROUP.get(group);
}

export function isWebsitePageGroup(group: string): boolean {
  return PAGE_BY_GROUP.has(group);
}

export function isLegalOwnedKey(key: string): boolean {
  return /^privacy_/i.test(key) || /^terms_/i.test(key) || /^refund_/i.test(key);
}

export function isHomepageOwnedKey(key: string): boolean {
  return HOMEPAGE_OWNED_KEYS.has(key);
}

export function isOrderAppOwnedKey(key: string): boolean {
  return /^office_orders_/i.test(key);
}

/**
 * Resolve which Content Hub view owns a content key (for search + dirty dots).
 * Returns null when the key is not shown in normal owner navigation.
 */
export function contentViewForKey(key: string): string | null {
  if (isLegalOwnedKey(key)) return 'Legal';
  if (isHomepageOwnedKey(key)) return 'Homepage';
  if (isOrderAppOwnedKey(key)) return 'Order App';
  for (const page of WEBSITE_PAGE_TASKS) {
    if (page.matchesKey(key)) return page.group;
  }
  return null;
}

/** Backend groups whose remaining rows fold into a focused Website page. */
function legacyBackendGroupForPage(pageId: WebsitePageTaskId): string | null {
  if (pageId === 'contact_map') return 'Contact';
  if (pageId === 'about') return 'About';
  if (pageId === 'footer') return 'Footer';
  return null;
}

/** Blocks shown in a focused Website page / remapped section editor. */
export function blocksForContentView(
  sectionName: string,
  blocks: ContentBlock[],
): ContentBlock[] {
  if (sectionName === LEGACY_PAGES_GROUP) {
    return [];
  }

  const page = websitePageTaskByGroup(sectionName);
  if (page) {
    const legacyGroup = legacyBackendGroupForPage(page.id);
    return blocks.filter((b) => {
      if (page.matchesKey(b.key)) return true;
      // Fold leftover Contact/About/Footer registry rows (e.g. section_enable toggles).
      if (legacyGroup && b.group === legacyGroup) {
        // Keys remapped out of Contact must not reappear here.
        if (isLegalOwnedKey(b.key) || isHomepageOwnedKey(b.key) || isOrderAppOwnedKey(b.key)) {
          return false;
        }
        if (WEBSITE_PAGE_TASKS.some((other) => other.id !== page.id && other.matchesKey(b.key))) {
          return false;
        }
        return true;
      }
      return false;
    });
  }

  if (sectionName === 'Homepage') {
    return blocks.filter(
      (b) => b.group === 'Homepage' || isHomepageOwnedKey(b.key),
    );
  }

  if (sectionName === 'Legal') {
    return blocks.filter(
      (b) => b.group === 'Legal' || isLegalOwnedKey(b.key),
    );
  }

  if (sectionName === 'Order App') {
    return blocks.filter(
      (b) => b.group === 'Order App' || isOrderAppOwnedKey(b.key),
    );
  }

  // Never fall back to the mixed Pages dump for any other view.
  return blocks.filter(
    (b) => b.group === sectionName && !HIDDEN_CONTENT_GROUPS.has(b.group),
  );
}

/** Section names available in rail / landing after remapping. */
export function visibleContentGroups(blocks: ContentBlock[]): string[] {
  const names = new Set<string>();
  for (const block of blocks) {
    if (HIDDEN_CONTENT_GROUPS.has(block.group)) continue;
    const view = contentViewForKey(block.key);
    if (view) {
      names.add(view);
      continue;
    }
    names.add(block.group);
  }
  for (const page of WEBSITE_PAGE_TASKS) {
    if (blocks.some((b) => page.matchesKey(b.key))) {
      names.add(page.group);
    }
  }
  names.delete(LEGACY_PAGES_GROUP);
  names.delete('Contact');
  return Array.from(names);
}

export function isGroupDirty(
  sectionName: string,
  blocks: ContentBlock[],
  draftKeys: string[],
  parseDraftKey: (dk: string) => { key: string } | null,
): boolean {
  const sectionKeys = new Set(blocksForContentView(sectionName, blocks).map((b) => b.key));
  return draftKeys.some((dk) => {
    const parsed = parseDraftKey(dk);
    return Boolean(parsed && sectionKeys.has(parsed.key));
  });
}
