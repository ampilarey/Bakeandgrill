import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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

/**
 * Every single-owner key is hidden from Content & Branding entirely — business
 * records (2026-08-14) and the two Delivery Settings mirrors (2026-08-15).
 */
const HIDDEN_FROM_HUB = new Set(OPS_OWNED_CONTENT_KEYS);

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

  it('is ten sections and 52 settings', () => {
    // 54 until the delivery promise and the free-delivery threshold were
    // hidden here and left to Delivery Settings (owner, 2026-08-15).
    expect(WEBSITE_HOME_SECTIONS).toHaveLength(10);
    expect(homeKeys).toHaveLength(52);
  });

  it('files nothing that is edited on another screen', () => {
    const filed = new Set(WEBSITE_HOME_SECTIONS.flatMap((s) => s.keys));
    for (const key of ['delivery_time', 'delivery_threshold', 'logo', 'business_phone']) {
      expect(filed.has(key), `[${key}] is owned elsewhere and must not be filed on Home`).toBe(false);
    }
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


/**
 * Phone layout audit, 2026-08-15 — owner: "Did u check the all the pages of
 * mobile view?"
 *
 * The rule the phone relies on is a CSS one: a repeater row carrying
 * `content-editor-row` stacks its controls at 767px and below. jsdom cannot
 * check CSS, but it CAN check that every repeater editor asks for the class —
 * which is how the footer links editor was caught squeezing a label and a URL
 * into 340px while every other repeater stacked.
 *
 * Read from disk, not imported: a bundled `?raw` import is cached between runs
 * and would happily pass against a stale copy of the file.
 */
describe('every repeater editor opts into the phone stacking rule', () => {
  it('carries content-editor-row on its row', () => {
    const dir = join(dirname(fileURLToPath(import.meta.url)), '../../components/content-editors');
    for (const name of [
      'TrustItemsEditor',
      'CategoriesEditor',
      'ProofDetailsEditor',
      'FooterLinksEditor',
      // Order App only (About page). It was the one repeater this list missed —
      // found on 2026-08-16 when the owner asked whether the Order App's phone
      // view was finished, which is exactly how FooterLinksEditor was caught.
      'AboutValuesEditor',
    ]) {
      const source = readFileSync(join(dir, `${name}.tsx`), 'utf8');
      // The class on the element, not the words in a comment — the first
      // version of this test passed on its own explanatory comment.
      expect(
        source.includes('className="content-editor-row"'),
        `[${name}] must carry className="content-editor-row" so its row stacks on a phone`,
      ).toBe(true);
    }
  });

  /**
   * The list above must name every repeater that ships, or a new one can skip
   * the rule unnoticed — which is how AboutValuesEditor slipped through.
   *
   * BusinessHoursEditor is deliberately absent: its row is a day name beside
   * that day's hours, and stacking a day above its own times reads worse than
   * the 90px label it has now. It is not a repeater of like-sized fields.
   */
  it('names every repeater that exists, so a new one cannot skip the rule', () => {
    const dir = join(dirname(fileURLToPath(import.meta.url)), '../../components/content-editors');
    const covered = new Set([
      'TrustItemsEditor',
      'CategoriesEditor',
      'ProofDetailsEditor',
      'FooterLinksEditor',
      'AboutValuesEditor',
    ]);
    const exempt = new Set(['BusinessHoursEditor']);

    const repeaters = readdirSync(dir)
      .filter((f) => f.endsWith('Editor.tsx'))
      .map((f) => f.replace(/\.tsx$/, ''))
      .filter((name) => readFileSync(join(dir, `${name}.tsx`), 'utf8').includes('<RepeaterShell'));

    const unclassified = repeaters.filter((n) => !covered.has(n) && !exempt.has(n));
    expect(
      unclassified,
      `new repeater editor(s) not yet checked for phone stacking: ${unclassified.join(', ')}`,
    ).toEqual([]);
  });
});
