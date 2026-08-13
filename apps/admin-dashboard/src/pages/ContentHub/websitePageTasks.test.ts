import { describe, expect, it } from 'vitest';
import type { ContentBlock } from '../../api/content';
import {
  LEGACY_PAGES_GROUP,
  WEBSITE_PAGE_TASKS,
  blocksForContentView,
  contentViewForKey,
  visibleContentGroups,
} from './websitePageTasks';

function block(key: string, group: string): ContentBlock {
  return {
    key,
    label: key,
    group,
    type: 'text',
    apps: ['website'],
    shareable: true,
    public: true,
    rich: false,
    state: 'shared',
    shared: '',
    website: null,
    order_app: null,
    resolved_website: '',
    resolved_order_app: '',
    scopes: ['shared'],
    section_enable: false,
  } as ContentBlock;
}

const sample: ContentBlock[] = [
  block('contact_page_title', 'Pages'),
  block('maps_embed_url', 'Pages'),
  block('business_whatsapp', 'Contact'),
  block('hours_page_title', 'Pages'),
  block('about_values', 'Pages'),
  block('about_page_title', 'About'),
  block('events_section_headline', 'Pages'),
  block('contact_events_cta_headline', 'Pages'),
  block('footer_text', 'Footer'),
  block('privacy_page_title', 'Pages'),
  block('terms_page_title', 'Pages'),
  block('refund_page_title', 'Pages'),
  block('legal_privacy_body', 'Legal'),
  block('homepage_categories', 'Pages'),
  block('trust_items', 'Pages'),
  block('proof_details', 'Pages'),
  block('proof_stat', 'Homepage'),
  block('office_orders_headline', 'Pages'),
  block('order_checkout_title', 'Order App'),
  block('delivery_threshold', 'Contact'),
  block('show_hours', 'Contact'),
  block('section_footer_enabled', 'Footer'),
];

describe('websitePageTasks ownership', () => {
  it('routes keys to focused Website pages (not mixed Pages)', () => {
    expect(contentViewForKey('contact_page_title')).toBe('Contact & map');
    expect(contentViewForKey('maps_embed_url')).toBe('Contact & map');
    expect(contentViewForKey('hours_page_title')).toBe('Opening hours');
    expect(contentViewForKey('about_values')).toBe('About');
    expect(contentViewForKey('events_section_headline')).toBe('Catering & events');
    expect(contentViewForKey('contact_events_cta_text')).toBe('Catering & events');
    expect(contentViewForKey('footer_links')).toBe('Footer');
  });

  it('keeps Legal, Homepage, and Order App ownership out of Website pages', () => {
    expect(contentViewForKey('privacy_page_title')).toBe('Legal');
    expect(contentViewForKey('terms_page_title')).toBe('Legal');
    expect(contentViewForKey('refund_page_title')).toBe('Legal');
    expect(contentViewForKey('homepage_categories')).toBe('Homepage');
    expect(contentViewForKey('trust_items')).toBe('Homepage');
    expect(contentViewForKey('proof_details')).toBe('Homepage');
    expect(contentViewForKey('office_orders_headline')).toBe('Order App');
  });

  it('each page task returns only its assigned fields', () => {
    for (const page of WEBSITE_PAGE_TASKS) {
      const keys = blocksForContentView(page.group, sample).map((b) => b.key);
      expect(keys.length).toBeGreaterThan(0);
      expect(keys).not.toContain('privacy_page_title');
      expect(keys).not.toContain('homepage_categories');
      expect(keys).not.toContain('office_orders_headline');
      // Foreign website pages must not leak in.
      for (const other of WEBSITE_PAGE_TASKS) {
        if (other.id === page.id) continue;
        for (const key of keys) {
          if (page.matchesKey(key)) continue; // owned by this page
          // Legacy fold-in (Contact/About/Footer registry leftovers) is OK.
          expect(other.matchesKey(key)).toBe(false);
        }
      }
    }
  });

  it('Contact & map never includes hours, legal, office, or home fields', () => {
    const keys = blocksForContentView('Contact & map', sample).map((b) => b.key);
    expect(keys).toEqual(expect.arrayContaining([
      'contact_page_title',
      'maps_embed_url',
      'business_whatsapp',
      'delivery_threshold',
      'show_hours',
    ]));
    expect(blocksForContentView('Footer', sample).map((b) => b.key)).toEqual(
      expect.arrayContaining(['footer_text', 'section_footer_enabled']),
    );
    expect(keys).not.toEqual(expect.arrayContaining([
      'hours_page_title',
      'about_values',
      'privacy_page_title',
      'office_orders_headline',
      'homepage_categories',
      'events_section_headline',
    ]));
  });

  it('legacy Pages view exposes no mixed list', () => {
    expect(blocksForContentView(LEGACY_PAGES_GROUP, sample)).toEqual([]);
  });

  it('hides Pages/Contact from visible groups and surfaces focused pages', () => {
    const names = visibleContentGroups(sample);
    expect(names).not.toContain('Pages');
    expect(names).not.toContain('Contact');
    expect(names).toEqual(expect.arrayContaining([
      'Contact & map',
      'Opening hours',
      'About',
      'Catering & events',
      'Footer',
      'Homepage',
      'Legal',
      'Order App',
    ]));
  });

  it('Homepage and Order App receive remapped fields', () => {
    expect(blocksForContentView('Homepage', sample).map((b) => b.key)).toEqual(
      expect.arrayContaining(['homepage_categories', 'trust_items', 'proof_details', 'proof_stat']),
    );
    expect(blocksForContentView('Order App', sample).map((b) => b.key)).toEqual(
      expect.arrayContaining(['office_orders_headline', 'order_checkout_title']),
    );
    expect(blocksForContentView('Legal', sample).map((b) => b.key)).toEqual(
      expect.arrayContaining(['privacy_page_title', 'legal_privacy_body']),
    );
  });
});
