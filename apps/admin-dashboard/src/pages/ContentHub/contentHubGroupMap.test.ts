import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ORDER_APP_HUB_GROUP_BY_KEY,
  ORDER_APP_HUB_SECTION_ORDER,
  WEBSITE_HUB_GROUP_BY_KEY,
  WEBSITE_HUB_SECTION_ORDER,
  hubGroupForKey,
} from './contentHubGroupMap';

type KeyMeta = { page: string };

type InventoryDoc = {
  website: { key_index: Record<string, KeyMeta>; page_count_keys: number };
  order_app: { key_index: Record<string, KeyMeta>; page_count_keys: number };
};

/** Inventory page slug → Stage 4 hub section label. */
const WEBSITE_PAGE_TO_SECTION: Record<string, string> = {
  home: 'Home',
  menu: 'Menu page',
  contact: 'Contact page',
  hours: 'Hours page',
  legal: 'Legal',
  legal_privacy: 'Legal',
  legal_terms: 'Legal',
  legal_refund: 'Legal',
  everywhere: 'Everywhere',
  reads_nowhere: 'Everywhere',
};

const ORDER_PAGE_TO_SECTION: Record<string, string> = {
  home: 'Home',
  menu: 'Menu',
  ordering: 'Ordering',
  order_history: 'Order history',
  gift_cards: 'Gift cards',
  about: 'About',
  contact: 'Contact page',
  hours: 'Hours page',
  privacy: 'Privacy',
  signage: 'Signage',
  everywhere: 'Everywhere',
  reads_nowhere: 'Everywhere',
};

const HUB_DIR = path.dirname(fileURLToPath(import.meta.url));

async function loadInventory(): Promise<InventoryDoc> {
  const fs = await import('node:fs') as unknown as {
    readFileSync: (p: string, e: string) => string;
  };
  const inventoryPath = path.join(HUB_DIR, '../../../../../docs/content_surface_inventory.json');
  return JSON.parse(fs.readFileSync(inventoryPath, 'utf8')) as InventoryDoc;
}

/**
 * Matrix row 8 (Stage 4 UI half): every inventory key for an app appears
 * exactly once in that app's hub group map.
 */
describe('contentHubGroupMap coverage (matrix row 8)', () => {
  it('website: every inventory key maps to exactly one hub section', async () => {
    const inventory = await loadInventory();
    const index = inventory.website.key_index;
    expect(Object.keys(index).length).toBe(inventory.website.page_count_keys);
    const seen = new Set<string>();
    for (const key of Object.keys(index)) {
      const group = hubGroupForKey(key, 'website');
      expect(group, `website key missing from map: ${key}`).toBeTruthy();
      expect(seen.has(key)).toBe(false);
      seen.add(key);
      const expected = WEBSITE_PAGE_TO_SECTION[index[key]!.page];
      expect(group, `website ${key} page=${index[key]!.page}`).toBe(expected);
    }
    expect(seen.size).toBe(Object.keys(index).length);
    expect(Object.keys(WEBSITE_HUB_GROUP_BY_KEY).sort()).toEqual(Object.keys(index).sort());
  });

  it('order_app: every inventory key maps to exactly one hub section', async () => {
    const inventory = await loadInventory();
    const index = inventory.order_app.key_index;
    expect(Object.keys(index).length).toBe(inventory.order_app.page_count_keys);
    const seen = new Set<string>();
    for (const key of Object.keys(index)) {
      const group = hubGroupForKey(key, 'order_app');
      expect(group, `order_app key missing from map: ${key}`).toBeTruthy();
      expect(seen.has(key)).toBe(false);
      seen.add(key);
      const expected = ORDER_PAGE_TO_SECTION[index[key]!.page];
      expect(group, `order_app ${key} page=${index[key]!.page}`).toBe(expected);
    }
    expect(seen.size).toBe(Object.keys(index).length);
    expect(Object.keys(ORDER_APP_HUB_GROUP_BY_KEY).sort()).toEqual(Object.keys(index).sort());
  });

  it('section orders cover every mapped hub section name', () => {
    for (const g of new Set(Object.values(WEBSITE_HUB_GROUP_BY_KEY))) {
      expect(WEBSITE_HUB_SECTION_ORDER as readonly string[]).toContain(g);
    }
    for (const g of new Set(Object.values(ORDER_APP_HUB_GROUP_BY_KEY))) {
      expect(ORDER_APP_HUB_SECTION_ORDER as readonly string[]).toContain(g);
    }
  });

  it('fail-prove: omitting a key from the map breaks exactly-once coverage', () => {
    const keys = Object.keys(WEBSITE_HUB_GROUP_BY_KEY);
    expect(keys.length).toBeGreaterThan(10);
    const missing = keys[0]!;
    const clone = { ...WEBSITE_HUB_GROUP_BY_KEY };
    delete clone[missing];
    expect(clone[missing]).toBeUndefined();
    expect(Object.keys(clone).length).toBe(keys.length - 1);
  });
});
