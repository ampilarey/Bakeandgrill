import { describe, expect, it } from 'vitest';
import type { ContentBlock } from '../../api/content';
import {
  LEGACY_PAGES_GROUP,
  WEBSITE_PAGE_TASKS,
  blocksForContentView,
  contentViewForKey,
  visibleContentGroups,
} from './websitePageTasks';

function block(key: string, group: string, apps: Array<'website' | 'order_app'> = ['website']): ContentBlock {
  return {
    key,
    label: key,
    group,
    type: 'text',
    apps,
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
  block('about_values', 'Pages', ['order_app']),
  block('about_page_title', 'About', ['order_app']),
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
  block('proof_stat', 'Home'),
  block('office_orders_headline', 'Pages', ['order_app']),
  block('order_checkout_title', 'Order App', ['order_app']),
  block('delivery_threshold', 'Contact'),
  block('site_name', 'General'),
];

describe('websitePageTasks ownership (Stage 4 inventory map)', () => {
  it('routes keys to page-first Website sections', () => {
    expect(contentViewForKey('contact_page_title')).toBe('Contact page');
    expect(contentViewForKey('maps_embed_url')).toBe('Contact page');
    expect(contentViewForKey('hours_page_title')).toBe('Hours page');
    expect(contentViewForKey('events_section_headline')).toBe('Home');
    expect(contentViewForKey('contact_events_cta_text')).toBe('Contact page');
    expect(contentViewForKey('footer_links')).toBe('Everywhere');
    expect(contentViewForKey('about_values', 'order_app')).toBe('About');
  });

  it('keeps Legal and Home ownership out of Contact / Hours', () => {
    expect(contentViewForKey('privacy_page_title')).toBe('Legal');
    expect(contentViewForKey('terms_page_title')).toBe('Legal');
    expect(contentViewForKey('refund_page_title')).toBe('Legal');
    expect(contentViewForKey('homepage_categories')).toBe('Home');
    expect(contentViewForKey('trust_items')).toBe('Home');
    expect(contentViewForKey('proof_details')).toBe('Home');
    expect(contentViewForKey('office_orders_headline', 'order_app')).toBe('Home');
  });

  it('each page task returns only its assigned fields', () => {
    for (const page of WEBSITE_PAGE_TASKS) {
      const keys = blocksForContentView(page.group, sample, 'website').map((b) => b.key);
      expect(keys.length).toBeGreaterThan(0);
      for (const other of WEBSITE_PAGE_TASKS) {
        if (other.id === page.id) continue;
        for (const key of keys) {
          expect(other.matchesKey(key)).toBe(false);
        }
      }
    }
  });

  it('Contact page never includes hours, legal, or home fields', () => {
    const keys = blocksForContentView('Contact page', sample, 'website').map((b) => b.key);
    expect(keys).toEqual(expect.arrayContaining([
      'contact_page_title',
      'maps_embed_url',
      'contact_events_cta_headline',
    ]));
    expect(blocksForContentView('Everywhere', sample, 'website').map((b) => b.key)).toEqual(
      expect.arrayContaining(['business_whatsapp']),
    );
    expect(blocksForContentView('Everywhere', sample, 'website').map((b) => b.key)).toEqual(
      expect.arrayContaining(['footer_text', 'site_name']),
    );
    expect(keys).not.toEqual(expect.arrayContaining([
      'hours_page_title',
      'privacy_page_title',
      'homepage_categories',
      'events_section_headline',
    ]));
  });

  it('legacy Pages view exposes no mixed list', () => {
    expect(blocksForContentView(LEGACY_PAGES_GROUP, sample, 'website')).toEqual([]);
  });

  it('hides legacy groups and surfaces Stage 4 sections', () => {
    const names = visibleContentGroups(sample, 'website');
    expect(names).not.toContain('Pages');
    expect(names).not.toContain('Contact');
    expect(names).not.toContain('Order App');
    expect(names).not.toContain('Footer');
    expect(names).toEqual(expect.arrayContaining([
      'Contact page',
      'Hours page',
      'Home',
      'Legal',
      'Everywhere',
    ]));
  });

  it('Home and Legal receive remapped fields; order checkout is Order App only', () => {
    expect(blocksForContentView('Home', sample, 'website').map((b) => b.key)).toEqual(
      expect.arrayContaining([
        'homepage_categories',
        'trust_items',
        'proof_details',
        'proof_stat',
        'events_section_headline',
        'delivery_threshold',
      ]),
    );
    expect(blocksForContentView('Home', sample, 'order_app').map((b) => b.key)).toEqual(
      expect.arrayContaining(['office_orders_headline']),
    );
    expect(blocksForContentView('Ordering', sample, 'order_app').map((b) => b.key)).toEqual(
      expect.arrayContaining(['order_checkout_title']),
    );
    expect(blocksForContentView('Legal', sample, 'website').map((b) => b.key)).toEqual(
      expect.arrayContaining(['privacy_page_title', 'legal_privacy_body']),
    );
  });
});
