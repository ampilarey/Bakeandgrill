import { describe, expect, it } from 'vitest';
import { getAllNavItems, navItemPathname } from '../components/navConfig';
import { GUIDES, PAGES_WITHOUT_GUIDE, guidesForPage, searchGuides } from './guides';

/*
 * The Help guides stay true to the menu (owner, 2026-11-10): every guide belongs to a real page,
 * and every page either has a guide or is on the waiting list, so a new page cannot arrive
 * without someone deciding about its guide.
 */
describe('help guides', () => {
  const pages = getAllNavItems().map((i) => navItemPathname(i.to));

  it('every guide belongs to a page in the menu and is complete', () => {
    const ids = new Set<string>();
    for (const g of GUIDES) {
      expect(pages, `guide ${g.id}: page ${g.page}`).toContain(g.page);
      expect(ids.has(g.id), `duplicate id ${g.id}`).toBe(false);
      ids.add(g.id);
      expect(g.title.length).toBeGreaterThan(8);
      expect(g.steps.length, `guide ${g.id} needs at least two steps`).toBeGreaterThanOrEqual(2);
      if (g.open) expect(g.open.to.startsWith('/')).toBe(true);
      // Plain words: no long dashes in the copy.
      expect([g.title, g.about ?? '', ...g.steps, ...(g.notes ?? [])].join(' ')).not.toMatch(/[—–]/);
    }
  });

  it('every page has a guide or is on the waiting list, never both', () => {
    for (const page of pages) {
      const has = guidesForPage(page).length > 0;
      const waiting = PAGES_WITHOUT_GUIDE.includes(page);
      expect(has || waiting, `${page} needs a guide in help/guides.ts, or a place in PAGES_WITHOUT_GUIDE`).toBe(true);
      expect(has && waiting, `${page} has a guide now: take it off PAGES_WITHOUT_GUIDE`).toBe(false);
    }
    for (const page of PAGES_WITHOUT_GUIDE) {
      expect(pages, `PAGES_WITHOUT_GUIDE lists ${page}, which is not in the menu`).toContain(page);
    }
  });

  it('finds a guide by a few plain words', () => {
    expect(searchGuides('first 50').map((g) => g.id)).toContain('offer-first-customers');
    expect(searchGuides('sold out').map((g) => g.id)).toContain('menu-sold-out');
    expect(searchGuides('qr card payments').map((g) => g.id)).toContain('check-payments');
    expect(searchGuides('zzzz')).toEqual([]);
    expect(searchGuides('  ')).toHaveLength(GUIDES.length);
  });
});
