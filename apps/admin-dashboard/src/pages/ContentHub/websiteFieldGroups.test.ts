import { describe, expect, it } from 'vitest';
import type { ContentBlock } from '../../api/content';
import { WEBSITE_HUB_GROUP_BY_KEY } from './contentHubGroupMap';
import { OPS_OWNED_CONTENT_KEYS } from './opsOwnedContentKeys';
import { WEBSITE_HOME_SECTIONS, buildWebsiteHomeSections } from './websiteHomeSections';
import { WEBSITE_PAGE_GROUPS, groupBlocks } from './websiteFieldGroups';

/**
 * The screen is only trustworthy if every setting has a home on it.
 *
 * These tests fail the moment a content key exists that no section or heading
 * claims — which is exactly how a setting would quietly stop being editable.
 */

/** Business-record keys are hidden from Content & Branding entirely. */
const HIDDEN_FROM_HUB = new Set(
  [...OPS_OWNED_CONTENT_KEYS].filter((k) => k !== 'delivery_threshold' && k !== 'delivery_time'),
);

function websiteKeysIn(group: string): string[] {
  return Object.entries(WEBSITE_HUB_GROUP_BY_KEY)
    .filter(([key, g]) => g === group && !HIDDEN_FROM_HUB.has(key))
    .map(([key]) => key);
}

function fakeBlock(key: string): ContentBlock {
  return {
    key,
    label: key,
    group: 'x',
    type: 'text',
    apps: ['website'],
    shareable: false,
    public: true,
    shared: null,
    website: '',
    order_app: null,
    resolved_website: '',
    resolved_order_app: '',
    state: 'website',
  } as unknown as ContentBlock;
}

describe('Website Home sections', () => {
  const homeKeys = websiteKeysIn('Home');

  it('covers every Home setting exactly once', () => {
    const seen = new Map<string, string>();
    for (const section of WEBSITE_HOME_SECTIONS) {
      for (const key of section.keys) {
        expect(seen.has(key), `[${key}] is claimed by both ${seen.get(key)} and ${section.id}`).toBe(false);
        seen.set(key, section.id);
      }
    }

    const unclaimed = homeKeys.filter((k) => !seen.has(k));
    expect(unclaimed, `Home settings with no section: ${unclaimed.join(', ')}`).toEqual([]);
  });

  it('claims nothing that is not on Home', () => {
    const homeSet = new Set(homeKeys);
    const strays = WEBSITE_HOME_SECTIONS
      .flatMap((s) => s.keys)
      .filter((k) => !homeSet.has(k));
    expect(strays, `keys filed on Home that Home does not have: ${strays.join(', ')}`).toEqual([]);
  });

  it('leaves the Other catch-all empty for the current inventory', () => {
    const sections = buildWebsiteHomeSections(homeKeys.map(fakeBlock));
    expect(sections.find((s) => s.id === 'other')).toBeUndefined();
  });

  it('is ten sections and 54 settings', () => {
    expect(WEBSITE_HOME_SECTIONS).toHaveLength(10);
    expect(homeKeys).toHaveLength(54);
  });

  it('every sub-heading only names keys its own section owns', () => {
    for (const section of WEBSITE_HOME_SECTIONS) {
      const own = new Set(section.keys);
      for (const heading of section.headings ?? []) {
        for (const key of heading.keys) {
          expect(own.has(key), `[${key}] under ${section.id} › ${heading.label} is not in that section`).toBe(true);
        }
      }
    }
  });

  it('opens the hero first — it is the section the owner edits most', () => {
    expect(WEBSITE_HOME_SECTIONS[0].id).toBe('hero');
    expect(WEBSITE_HOME_SECTIONS[0].keys).toEqual(['hero_slides']);
  });
});

describe('Website page form headings', () => {
  for (const page of ['Contact page', 'Hours page', 'Legal', 'Everywhere']) {
    it(`${page}: every setting sits under a heading`, () => {
      const keys = websiteKeysIn(page);
      const grouped = groupBlocks(keys.map(fakeBlock), WEBSITE_PAGE_GROUPS[page]);
      const other = grouped.find((g) => g.label === 'Other');
      expect(
        other?.blocks.map((b) => b.key) ?? [],
        `${page} settings with no heading`,
      ).toEqual([]);
    });

    it(`${page}: headings name no key from another page`, () => {
      const keys = new Set(websiteKeysIn(page));
      const strays = WEBSITE_PAGE_GROUPS[page]
        .flatMap((g) => g.keys)
        .filter((k) => !keys.has(k));
      expect(strays, `${page} headings name keys it does not have: ${strays.join(', ')}`).toEqual([]);
    });
  }
});

describe('groupBlocks', () => {
  it('never drops a block it was given', () => {
    const blocks = ['a', 'b', 'c'].map(fakeBlock);
    const grouped = groupBlocks(blocks, [{ label: 'Known', keys: ['a'] }]);
    const rendered = grouped.flatMap((g) => g.blocks.map((b) => b.key));
    expect(rendered.sort()).toEqual(['a', 'b', 'c']);
    expect(grouped.find((g) => g.label === 'Other')?.blocks.map((b) => b.key)).toEqual(['b', 'c']);
  });

  it('drops headings that match nothing rather than showing an empty one', () => {
    const grouped = groupBlocks([fakeBlock('a')], [
      { label: 'Empty', keys: ['nope'] },
      { label: 'Known', keys: ['a'] },
    ]);
    expect(grouped.map((g) => g.label)).toEqual(['Known']);
  });
});
