import type { ContentBlock } from '../../api/content';
import { groupBlocks, type FieldGroup, type GroupedBlocks } from './websiteFieldGroups';

/**
 * The Order App home screen, as the owner sees it: sections in the order a
 * customer scrolls past them — not thirty-seven loose settings.
 *
 * Same idea as websiteHomeSections, different list. The Order App home is a
 * different screen from the website home: it greets a customer by name, shows
 * whether the kitchen is open, and leads with the three ways to order.
 *
 * Membership is by explicit key list, never by regex over labels. Anything not
 * listed lands in the catch-all at the bottom, which is on screen and asserted
 * empty by orderAppHomeSections.test.ts, so a new key can never disappear.
 */

export type OrderAppHomeSectionDef = {
  id: string;
  label: string;
  description: string;
  /** `page_blocks.block_type`, for the Showing/Hidden badge. */
  blockType: string;
  keys: string[];
  headings?: FieldGroup[];
};

export const ORDER_APP_HOME_SECTIONS: OrderAppHomeSectionDef[] = [
  {
    id: 'greeting',
    label: 'Greeting',
    description: 'The welcome line at the top',
    blockType: 'greeting',
    keys: ['order_home_greeting_hello', 'order_home_greeting_named', 'order_home_greeting_sub'],
  },
  {
    id: 'hero',
    label: 'Hero banner',
    description: 'The big picture and headline',
    blockType: 'hero',
    keys: ['hero_slides', 'home_hero_fallback_title', 'home_hero_fallback_subtitle'],
    headings: [
      { label: 'The slides', keys: ['hero_slides'] },
      {
        label: 'When there are no slides',
        keys: ['home_hero_fallback_title', 'home_hero_fallback_subtitle'],
      },
    ],
  },
  {
    id: 'opening_status',
    label: 'Open or closed',
    description: 'What the badge says when you are open, and when you are not',
    blockType: 'opening_status',
    keys: ['order_hours_open', 'order_hours_open_closes', 'order_hours_closed', 'order_hours_closed_opens'],
    headings: [
      { label: 'Open', keys: ['order_hours_open', 'order_hours_open_closes'] },
      { label: 'Closed', keys: ['order_hours_closed', 'order_hours_closed_opens'] },
    ],
  },
  {
    id: 'order_buttons',
    label: 'Order buttons',
    description: 'Delivery · Pickup · Eat here',
    blockType: 'mode_cards',
    keys: [
      'order_mode_delivery_hint',
      'order_mode_delivery_info',
      'order_mode_delivery_image',
      'home_delivery_tagline',
      'order_mode_pickup_hint',
      'order_mode_pickup_info',
      'order_mode_pickup_image',
      'order_mode_dine_in_hint',
      'order_mode_dine_in_info',
      'order_mode_dine_in_image',
      'order_mode_status_available',
      'order_mode_status_unavailable',
      'order_mode_status_unavailable_opens',
      'order_mode_learn_more',
    ],
    headings: [
      {
        label: 'Delivery',
        keys: [
          'order_mode_delivery_hint',
          'order_mode_delivery_info',
          'order_mode_delivery_image',
          'home_delivery_tagline',
        ],
      },
      { label: 'Pickup', keys: ['order_mode_pickup_hint', 'order_mode_pickup_info', 'order_mode_pickup_image'] },
      { label: 'Eat here', keys: ['order_mode_dine_in_hint', 'order_mode_dine_in_info', 'order_mode_dine_in_image'] },
      {
        label: 'When something is closed',
        keys: [
          'order_mode_status_available',
          'order_mode_status_unavailable',
          'order_mode_status_unavailable_opens',
          'order_mode_learn_more',
        ],
      },
    ],
  },
  {
    id: 'specials',
    label: "Today's Specials",
    description: 'The offers row',
    blockType: 'specials',
    keys: ['home_specials_title', 'home_specials_eyebrow', 'offers_headline', 'offers_subtext'],
  },
  {
    id: 'categories',
    label: 'Categories',
    description: 'Shortcut tiles into the menu',
    blockType: 'categories',
    keys: ['homepage_categories', 'home_categories_title', 'home_categories_eyebrow'],
  },
  {
    id: 'trust',
    label: 'Trust strip',
    description: 'The short promises',
    blockType: 'trust_strip',
    keys: ['trust_items'],
  },
  {
    id: 'proof',
    label: 'Proof',
    description: 'The numbers customers see',
    blockType: 'proof',
    keys: ['home_proof_eyebrow'],
  },
  {
    id: 'reviews',
    label: 'Reviews',
    description: 'Recent ratings and comments',
    blockType: 'reviews',
    keys: ['order_home_reviews_title'],
  },
  {
    id: 'office_orders',
    label: 'Office orders',
    description: 'The corporate / office catering card',
    blockType: 'office_orders',
    keys: ['office_orders_enabled', 'office_orders_headline', 'office_orders_subtext'],
  },
];

const SECTION_BY_KEY: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const section of ORDER_APP_HOME_SECTIONS) {
    for (const key of section.keys) map[key] = section.id;
  }
  return map;
})();

export function orderAppHomeSectionForKey(key: string): string | null {
  return SECTION_BY_KEY[key] ?? null;
}

export type ResolvedOrderAppSection = {
  id: string;
  label: string;
  description: string;
  blockType: string | null;
  blocks: ContentBlock[];
  groups: GroupedBlocks;
};

/** The Order App home's blocks, arranged into sections in screen order. */
export function buildOrderAppHomeSections(blocks: ContentBlock[]): ResolvedOrderAppSection[] {
  const byKey = new Map(blocks.map((b) => [b.key, b] as const));
  const claimed = new Set<string>();
  const out: ResolvedOrderAppSection[] = [];

  for (const def of ORDER_APP_HOME_SECTIONS) {
    const present = def.keys
      .map((key) => byKey.get(key))
      .filter((b): b is ContentBlock => Boolean(b));
    if (present.length === 0) continue;
    present.forEach((b) => claimed.add(b.key));

    out.push({
      id: def.id,
      label: def.label,
      description: def.description,
      blockType: def.blockType,
      blocks: present,
      groups: groupBlocks(present, def.headings, null),
    });
  }

  const leftover = blocks.filter((b) => !claimed.has(b.key));
  if (leftover.length > 0) {
    out.push({
      id: 'other',
      label: 'Other',
      description: 'On the home screen but not yet filed under a section',
      blockType: null,
      blocks: leftover,
      groups: [{ label: null, blocks: leftover }],
    });
  }

  return out;
}
