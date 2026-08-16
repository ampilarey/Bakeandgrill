import { describe, expect, it } from 'vitest';
import type { ContentBlock } from '../../api/content';
import { ORDER_APP_HUB_GROUP_BY_KEY } from './contentHubGroupMap';
import { OPS_OWNED_CONTENT_KEYS } from './opsOwnedContentKeys';
import { ORDER_APP_HOME_SECTIONS, buildOrderAppHomeSections } from './orderAppHomeSections';

/** Every single-owner key is hidden from Content & Branding entirely. */
const HIDDEN = new Set(OPS_OWNED_CONTENT_KEYS);

const homeKeys = Object.entries(ORDER_APP_HUB_GROUP_BY_KEY)
  .filter(([key, group]) => group === 'Home' && !HIDDEN.has(key))
  .map(([key]) => key);

function fakeBlock(key: string): ContentBlock {
  return {
    key,
    label: key,
    group: 'x',
    type: 'text',
    apps: ['order_app'],
    shareable: false,
    public: true,
    shared: null,
    website: null,
    order_app: '',
    resolved_website: '',
    resolved_order_app: '',
    state: 'order_app',
  } as unknown as ContentBlock;
}

describe('Order App home sections', () => {
  it('covers every home setting exactly once', () => {
    const seen = new Map<string, string>();
    for (const section of ORDER_APP_HOME_SECTIONS) {
      for (const key of section.keys) {
        expect(seen.has(key), `[${key}] is claimed by both ${seen.get(key)} and ${section.id}`).toBe(false);
        seen.set(key, section.id);
      }
    }
    const unclaimed = homeKeys.filter((k) => !seen.has(k));
    expect(unclaimed, `home settings with no section: ${unclaimed.join(', ')}`).toEqual([]);
  });

  it('claims nothing that is not on the Order App home', () => {
    const home = new Set(homeKeys);
    const strays = ORDER_APP_HOME_SECTIONS.flatMap((s) => s.keys).filter((k) => !home.has(k));
    expect(strays, `filed on home but not there: ${strays.join(', ')}`).toEqual([]);
  });

  it('leaves the Other catch-all empty for the current inventory', () => {
    expect(buildOrderAppHomeSections(homeKeys.map(fakeBlock)).find((s) => s.id === 'other')).toBeUndefined();
  });

  it('is ten sections and 37 settings', () => {
    expect(ORDER_APP_HOME_SECTIONS).toHaveLength(10);
    expect(homeKeys).toHaveLength(37);
  });

  it('files nothing that is edited on another screen', () => {
    const filed = new Set(ORDER_APP_HOME_SECTIONS.flatMap((s) => s.keys));
    for (const key of ['delivery_time', 'delivery_threshold', 'logo', 'site_name', 'menu_new_days']) {
      expect(filed.has(key), `[${key}] is owned elsewhere`).toBe(false);
    }
  });

  it('every sub-heading only names keys its own section owns', () => {
    for (const section of ORDER_APP_HOME_SECTIONS) {
      const own = new Set(section.keys);
      for (const heading of section.headings ?? []) {
        for (const key of heading.keys) {
          expect(own.has(key), `[${key}] under ${section.id} › ${heading.label} is not in that section`).toBe(true);
        }
      }
    }
  });

  it('opens with the greeting — the first thing a customer sees', () => {
    expect(ORDER_APP_HOME_SECTIONS[0].id).toBe('greeting');
    expect(ORDER_APP_HOME_SECTIONS[1].id).toBe('hero');
  });

  it('is not the website home — the two screens differ', () => {
    const ids = ORDER_APP_HOME_SECTIONS.map((s) => s.id);
    // Order-app-only sections…
    expect(ids).toContain('greeting');
    expect(ids).toContain('opening_status');
    expect(ids).toContain('office_orders');
    // …and no Location & delivery, which is a website section.
    expect(ids).not.toContain('location');
  });
});
