import type { ContentBlock } from '../../api/content';

/**
 * Headings inside a Website Content form.
 *
 * Contact, Hours, Legal and Everywhere are 13–22 settings each — one ordinary
 * form with a heading every few fields beats anything cleverer at that size
 * (owner, 2026-08-15). These lists say what those headings are and which
 * fields sit under each.
 *
 * Keys are listed explicitly. A key nobody claims is not dropped: it lands
 * under the trailing catch-all heading, which is on screen and covered by
 * websiteFieldGroups.test.ts.
 */

export type FieldGroup = {
  label: string;
  keys: string[];
};

export type GroupedBlocks = Array<{ label: string | null; blocks: ContentBlock[] }>;

/**
 * Buckets blocks under their headings, in the order the headings are declared
 * and the order the keys are declared inside each.
 *
 * Empty headings disappear. Anything unclaimed is appended under
 * `catchAllLabel` so a new content key always has somewhere to show up.
 */
export function groupBlocks(
  blocks: ContentBlock[],
  groups: FieldGroup[] | undefined,
  catchAllLabel: string | null = 'Other',
): GroupedBlocks {
  if (!groups?.length) {
    return blocks.length > 0 ? [{ label: null, blocks }] : [];
  }

  const byKey = new Map(blocks.map((b) => [b.key, b] as const));
  const used = new Set<string>();
  const out: GroupedBlocks = [];

  for (const group of groups) {
    const inGroup: ContentBlock[] = [];
    for (const key of group.keys) {
      const block = byKey.get(key);
      if (!block || used.has(key)) continue;
      used.add(key);
      inGroup.push(block);
    }
    if (inGroup.length > 0) out.push({ label: group.label, blocks: inGroup });
  }

  const leftover = blocks.filter((b) => !used.has(b.key));
  if (leftover.length > 0) out.push({ label: catchAllLabel, blocks: leftover });

  return out;
}

/** Headings for the four Website pages that are one plain form. */
export const WEBSITE_PAGE_GROUPS: Record<string, FieldGroup[]> = {
  'Contact page': [
    { label: 'The page', keys: ['contact_page_title', 'contact_page_eyebrow', 'contact_page_subtitle'] },
    {
      label: 'Get in touch',
      keys: [
        'contact_touch_heading',
        'contact_phone_label',
        'contact_email_label',
        'contact_whatsapp_label',
        'contact_viber_label',
      ],
    },
    {
      label: 'Opening hours on this page',
      keys: ['contact_hours_heading', 'contact_schedule_label', 'contact_hours_fallback', 'business_hours'],
    },
    {
      label: 'Where we are',
      keys: ['contact_location_heading', 'contact_map_heading', 'contact_location_maps_label'],
    },
    { label: 'Events & catering', keys: ['contact_events_cta_headline', 'contact_events_cta_text'] },
    { label: 'In search results', keys: ['contact_meta_title'] },
  ],
  'Hours page': [
    { label: 'The page', keys: ['hours_page_title', 'hours_page_eyebrow', 'hours_page_note'] },
    {
      label: 'Open or closed',
      keys: ['hours_open_status_text', 'hours_closed_status_text', 'hours_special_closure_label'],
    },
    {
      label: 'Buttons',
      keys: ['hours_order_btn_label', 'hours_call_confirm_label', 'hours_contact_page_label'],
    },
    { label: 'Bottom band', keys: ['hours_page_cta_title', 'hours_page_cta_subtitle'] },
    // The description renders inside the title's Google-snippet preview, so it
    // is filtered out before grouping — listed here so it still has a home if
    // that pairing ever changes.
    { label: 'In search results', keys: ['hours_meta_title', 'hours_meta_description'] },
  ],
  Legal: [
    {
      label: 'Terms page',
      keys: [
        'terms_page_title',
        'terms_page_subtitle',
        'legal_terms_body',
        'terms_page_corporate_service_text',
        'terms_last_updated_label',
        'terms_email_label',
        'terms_phone_label',
        'terms_meta_title',
      ],
    },
    {
      label: 'Refund page',
      keys: [
        'refund_page_title',
        'refund_page_subtitle',
        'legal_refund_body',
        'refund_last_updated_label',
        'refund_meta_title',
      ],
    },
    {
      label: 'Privacy page',
      keys: [
        'privacy_page_title',
        'legal_privacy_body',
        'privacy_email',
        'privacy_email_label',
        'privacy_phone_label',
        'privacy_address_label',
        'privacy_last_updated_label',
        'privacy_meta_title',
      ],
    },
    { label: 'On all three pages', keys: ['legal_last_updated_date'] },
  ],
  Everywhere: [
    { label: 'Header', keys: ['nav_order_cta_text', 'language_switcher_enabled'] },
    { label: 'Dhivehi type', keys: ['dhivehi_font'] },
    {
      label: 'Announcement bar',
      keys: ['announcement_enabled', 'announcement_text', 'announcement_style', 'announcement_url'],
    },
    {
      label: 'Site footer',
      keys: [
        'footer_text',
        'footer_thanks',
        'footer_rights_suffix',
        'footer_contact_heading',
        'footer_hours_heading',
        'footer_location_heading',
        'footer_quick_links_heading',
        'footer_delivery_text',
        'footer_payments_text',
        'footer_ramadan_note',
        'footer_links',
      ],
    },
    { label: 'Chat button', keys: ['home_chat_label'] },
    { label: 'In search results', keys: ['meta_title', 'meta_description', 'meta_keywords'] },
  ],
};
