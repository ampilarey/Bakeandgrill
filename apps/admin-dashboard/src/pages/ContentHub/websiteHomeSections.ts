import type { ContentBlock } from '../../api/content';
import { groupBlocks, type FieldGroup, type GroupedBlocks } from './websiteFieldGroups';

/**
 * The homepage, as the owner sees it: ten sections in the order a visitor
 * scrolls past them — not fifty-odd loose settings.
 *
 * Owner decision 2026-08-15: "5 pages tabs in a row … when each part is clicked
 * it opens in place." This file answers *what the parts are*. `blockType` ties
 * each one to its `page_blocks` row so the Desktop/Mobile badge on the row is
 * real layout data rather than a guess.
 *
 * Membership is by explicit key list, never by regex over labels — a renamed
 * label must not silently move a setting to another section. Anything not
 * listed falls into the catch-all at the bottom, which is visible on screen
 * and asserted empty by websiteFieldGroups.test.ts, so a newly added key can
 * never disappear from the screen.
 *
 * Settings edited on another screen are NOT filed here. The delivery promise
 * and the free-delivery threshold used to sit at the bottom of Location &
 * delivery as read-only rows; the owner had them hidden on 2026-08-15 because
 * a row you cannot edit reads as a setting to fix.
 */

export type WebsiteHomeSectionId =
  | 'hero'
  | 'trust'
  | 'order_buttons'
  | 'specials'
  | 'featured'
  | 'categories'
  | 'proof'
  | 'cta'
  | 'events'
  | 'location';

export type WebsiteHomeSectionDef = {
  id: WebsiteHomeSectionId;
  /** Row title — what this is called on the page, in plain words. */
  label: string;
  /** One line under the title. No jargon. */
  description: string;
  /** `page_blocks.block_type`, for the Desktop/Mobile badge. */
  blockType: string;
  /** Content keys that belong to this section, in the order they are edited. */
  keys: string[];
  /** Sub-headings inside the open section, when it is big enough to need them. */
  headings?: FieldGroup[];
};

/** Ten sections, top to bottom, as the homepage renders. */
export const WEBSITE_HOME_SECTIONS: WebsiteHomeSectionDef[] = [
  {
    id: 'hero',
    label: 'Hero banner',
    description: 'The big picture and headline at the top',
    blockType: 'hero',
    keys: ['hero_slides'],
  },
  {
    id: 'trust',
    label: 'Trust strip',
    description: 'The short promises under the hero',
    blockType: 'trust_strip',
    keys: ['trust_items'],
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
      { label: 'Delivery', keys: ['order_mode_delivery_hint', 'order_mode_delivery_info', 'order_mode_delivery_image'] },
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
    id: 'featured',
    label: 'Featured items',
    description: 'Bestsellers and hand-picked dishes',
    blockType: 'featured',
    keys: [
      'home_featured_title_bestseller',
      'home_featured_eyebrow_bestseller',
      'home_featured_title_handpicked',
      'home_featured_eyebrow_handpicked',
      'home_featured_subtitle',
    ],
  },
  {
    id: 'categories',
    label: 'Categories',
    description: "What we're known for",
    blockType: 'categories',
    keys: ['homepage_categories', 'home_categories_title', 'home_categories_eyebrow', 'home_categories_subtitle'],
  },
  {
    id: 'proof',
    label: 'Proof',
    description: 'The numbers customers see',
    blockType: 'proof',
    keys: ['proof_details', 'proof_stat', 'proof_label', 'home_proof_eyebrow'],
  },
  {
    id: 'cta',
    label: 'CTA band',
    description: 'The "order now" strip',
    blockType: 'cta',
    keys: ['cta_band_headline', 'cta_band_subtext'],
  },
  {
    id: 'events',
    label: 'Events & Catering band',
    description: 'Parties, offices and catering',
    blockType: 'events_band',
    keys: [
      'events_section_headline',
      'events_section_blurb',
      'events_section_plan_cta',
      'events_section_browse_cta',
    ],
  },
  {
    id: 'location',
    label: 'Location & delivery',
    description: 'Where to find us, and how delivery is described',
    blockType: 'location',
    keys: [
      'home_location_title',
      'home_location_eyebrow',
      'home_location_subtitle',
      'home_visit_card_title',
      'home_open_badge_text',
      'home_closed_badge_text',
      'home_directions_cta',
      'home_call_cta',
      'home_order_via_app_label',
      'home_delivery_card_title',
      'home_delivery_tagline',
      'home_delivery_subtitle',
      'home_delivery_quality_line',
      'home_delivery_payment_line',
    ],
    headings: [
      {
        label: 'The section',
        keys: ['home_location_title', 'home_location_eyebrow', 'home_location_subtitle'],
      },
      {
        label: 'Visit card',
        keys: [
          'home_visit_card_title',
          'home_open_badge_text',
          'home_closed_badge_text',
          'home_directions_cta',
          'home_call_cta',
          'home_order_via_app_label',
        ],
      },
      {
        label: 'Delivery card',
        keys: [
          'home_delivery_card_title',
          'home_delivery_tagline',
          'home_delivery_subtitle',
          'home_delivery_quality_line',
          'home_delivery_payment_line',
        ],
      },
    ],
  },
];

/** Section id that owns a key, or null when nothing claims it. */
const SECTION_BY_KEY: Record<string, WebsiteHomeSectionId> = (() => {
  const map: Record<string, WebsiteHomeSectionId> = {};
  for (const section of WEBSITE_HOME_SECTIONS) {
    for (const key of section.keys) map[key] = section.id;
  }
  return map;
})();

export function homeSectionForKey(key: string): WebsiteHomeSectionId | null {
  return SECTION_BY_KEY[key] ?? null;
}

/** One section, resolved against the blocks the API actually returned. */
export type ResolvedHomeSection = {
  id: string;
  label: string;
  description: string;
  blockType: string | null;
  blocks: ContentBlock[];
  /** Blocks bucketed under their heading; the heading is dropped when empty. */
  groups: GroupedBlocks;
};

/**
 * Home's blocks, arranged into the ten sections in page order.
 *
 * Sections with nothing in them are dropped (a key can be hidden by ownership
 * rules). Anything unclaimed lands in a final "Other" section rather than
 * vanishing.
 */
export function buildWebsiteHomeSections(blocks: ContentBlock[]): ResolvedHomeSection[] {
  const byKey = new Map(blocks.map((b) => [b.key, b] as const));
  const claimed = new Set<string>();
  const out: ResolvedHomeSection[] = [];

  for (const def of WEBSITE_HOME_SECTIONS) {
    const present = def.keys
      .map((key) => byKey.get(key))
      .filter((b): b is ContentBlock => Boolean(b));
    if (present.length === 0) continue;
    present.forEach((b) => claimed.add(b.key));

    const groups = groupBlocks(present, def.headings, null);

    out.push({
      id: def.id,
      label: def.label,
      description: def.description,
      blockType: def.blockType,
      blocks: present,
      groups,
    });
  }

  const leftover = blocks.filter((b) => !claimed.has(b.key));
  if (leftover.length > 0) {
    out.push({
      id: 'other',
      label: 'Other',
      description: 'Settings that are on Home but not yet filed under a section',
      blockType: null,
      blocks: leftover,
      groups: [{ label: null, blocks: leftover }],
    });
  }

  return out;
}
