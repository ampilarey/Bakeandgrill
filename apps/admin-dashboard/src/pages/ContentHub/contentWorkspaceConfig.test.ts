import { describe, expect, it } from 'vitest';
import type { ContentApp, ContentBlock } from '../../api/content';
import {
  ORDER_APP_HUB_SECTION_ORDER,
  WEBSITE_HUB_SECTION_ORDER,
  ORDER_APP_HUB_GROUP_BY_KEY,
  WEBSITE_HUB_GROUP_BY_KEY,
} from './contentHubGroupMap';
import { OPS_OWNED_CONTENT_KEYS } from './opsOwnedContentKeys';
import {
  ORDER_APP_OTHER_PAGES,
  ORDER_APP_WORKSPACE,
  WEBSITE_WORKSPACE,
  tabForGroup,
  workspaceConfigFor,
} from './contentWorkspaceConfig';

/**
 * The tabs are only trustworthy if every page has exactly one home on them.
 *
 * A group claimed by no tab is a page the owner can no longer open; a group
 * claimed by two is a page whose settings appear twice and disagree. Both of
 * those fail here rather than in front of him.
 */

const HIDDEN_FROM_HUB = new Set(OPS_OWNED_CONTENT_KEYS);

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

/** Keys still editable in Content & Branding, by group. */
function keysIn(map: Record<string, string>, group: string): string[] {
  return Object.entries(map)
    .filter(([key, g]) => g === group && !HIDDEN_FROM_HUB.has(key))
    .map(([key]) => key);
}

const orderAppKeysIn = (group: string) => keysIn(ORDER_APP_HUB_GROUP_BY_KEY, group);

describe.each([
  ['website' as ContentApp, WEBSITE_WORKSPACE, WEBSITE_HUB_SECTION_ORDER, WEBSITE_HUB_GROUP_BY_KEY],
  ['order_app' as ContentApp, ORDER_APP_WORKSPACE, ORDER_APP_HUB_SECTION_ORDER, ORDER_APP_HUB_GROUP_BY_KEY],
])('%s workspace tabs', (app, config, sectionOrder, groupByKey) => {
  /**
   * Groups with at least one editable key. A group with none — the website's
   * empty "Menu page" — needs no tab, and demanding one would be noise.
   */
  const populated = (sectionOrder as readonly string[])
    .filter((g) => keysIn(groupByKey, g).length > 0);

  it('has real pages to show', () => {
    expect(populated.length).toBeGreaterThan(1);
  });

  it('claims every populated group of its app exactly once', () => {
    const seen = new Map<string, string>();
    for (const tab of config.tabs) {
      for (const group of tab.groups) {
        expect(
          seen.has(group),
          `[${group}] is claimed by both ${seen.get(group)} and ${tab.label}`,
        ).toBe(false);
        seen.set(group, tab.label);
      }
    }

    const unclaimed = populated.filter((g) => !seen.has(g));
    expect(unclaimed, `groups no tab opens: ${unclaimed.join(', ')}`).toEqual([]);
  });

  it('claims nothing its app does not have', () => {
    const real = new Set<string>(sectionOrder as readonly string[]);
    const strays = config.tabs.flatMap((t) => t.groups).filter((g) => !real.has(g));
    expect(strays, `tabs name groups this app has no keys for: ${strays.join(', ')}`).toEqual([]);
  });

  it('resolves every populated group back to the tab that shows it', () => {
    for (const group of populated) {
      const tab = tabForGroup(config, group);
      expect(tab, `[${group}] resolves to no tab`).not.toBeNull();
      expect(tab!.groups).toContain(group);
    }
    expect(tabForGroup(config, 'Not a page')).toBeNull();
    expect(tabForGroup(config, null)).toBeNull();
  });

  it('gives every tab a blurb, a list blurb, and a first group to send to the URL', () => {
    for (const tab of config.tabs) {
      expect(tab.blurb.length, `${tab.label} has no blurb`).toBeGreaterThan(0);
      expect(tab.listBlurb.length, `${tab.label} has no list blurb`).toBeGreaterThan(0);
      expect(tab.groups.length, `${tab.label} claims no group`).toBeGreaterThan(0);
    }
  });

  it('opens on a section tab, so Home is sections and not a wall of fields', () => {
    expect(config.tabs[0].kind).toBe('sections');
    expect(config.tabs[0].groups).toEqual(['Home']);
  });

  it('is reachable from the app name alone', () => {
    expect(workspaceConfigFor(app)).toBe(config);
  });
});

describe('Order App "Other pages" tab', () => {
  const tab = ORDER_APP_WORKSPACE.tabs.find((t) => t.label === 'Other pages')!;

  it('is the reason there are three tabs and not eleven', () => {
    expect(ORDER_APP_WORKSPACE.tabs).toHaveLength(3);
    expect(tab.groups).toEqual(ORDER_APP_OTHER_PAGES);
    expect(ORDER_APP_OTHER_PAGES.length).toBeGreaterThan(3);
  });

  it('files every setting under its own page heading — nothing lands in Other', () => {
    if (tab.kind !== 'form') throw new Error('Other pages must be a form tab');
    const blocks = ORDER_APP_OTHER_PAGES.flatMap((page) => orderAppKeysIn(page)).map(fakeBlock);
    const grouped = tab.buildGroups(blocks, 'order_app');

    const other = grouped.find((g) => g.label === 'Other');
    expect(
      other?.blocks.map((b) => b.key) ?? [],
      'Order App settings with no page heading',
    ).toEqual([]);
  });

  it('lists its pages in the order they were given, skipping empty ones', () => {
    if (tab.kind !== 'form') throw new Error('Other pages must be a form tab');
    // Only two pages have anything, so only two headings may appear.
    const blocks = [...orderAppKeysIn('Menu'), ...orderAppKeysIn('About')].map(fakeBlock);
    const labels = tab.buildGroups(blocks, 'order_app').map((g) => g.label);
    expect(labels).toEqual(['Menu', 'About']);
  });

  it('keeps every setting it is handed, even one it does not recognise', () => {
    if (tab.kind !== 'form') throw new Error('Other pages must be a form tab');
    const stray = fakeBlock('a_key_no_page_claims');
    const grouped = tab.buildGroups([stray], 'order_app');
    const rendered = grouped.flatMap((g) => g.blocks.map((b) => b.key));
    expect(rendered).toContain('a_key_no_page_claims');
  });
});

describe('the two workspaces stay distinct', () => {
  it('use different root test ids, so a test cannot pass against the wrong screen', () => {
    expect(WEBSITE_WORKSPACE.idPrefix).not.toBe(ORDER_APP_WORKSPACE.idPrefix);
    expect(WEBSITE_WORKSPACE.tabsLabel).not.toBe(ORDER_APP_WORKSPACE.tabsLabel);
  });

  it('open on the section each owner actually edits first', () => {
    // Owner: "usually hero" for the website. The Order App's greeting sits
    // above its hero, so that is what opens there.
    expect(WEBSITE_WORKSPACE.defaultOpenSectionId).toBe('hero');
    expect(ORDER_APP_WORKSPACE.defaultOpenSectionId).toBe('greeting');
  });
});
