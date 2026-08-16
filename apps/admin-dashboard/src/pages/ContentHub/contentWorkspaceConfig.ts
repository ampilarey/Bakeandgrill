import type { ContentApp, ContentBlock } from '../../api/content';
import { hubGroupForKey } from './contentHubGroupMap';
import { buildWebsiteHomeSections } from './websiteHomeSections';
import { buildOrderAppHomeSections } from './orderAppHomeSections';
import { groupBlocks, WEBSITE_PAGE_GROUPS, type GroupedBlocks } from './websiteFieldGroups';

/**
 * What the content workspace shows, per app.
 *
 * The website has five real pages, so it gets five tabs.
 *
 * The Order App is lopsided. Nine of its groups have anything in them at all,
 * and outside Home (39 settings) and Everywhere (36) the other seven hold 16
 * settings *between them* — Hours page has one, Signage has one. A row of nine
 * tabs where seven open onto a single field is worse than what it replaces. So
 * those seven share one "Other pages" tab, each under its own heading, and the
 * Order App gets three tabs.
 *
 * Owner, 2026-08-15, on which shape to use: "Up to u."
 */

export type WorkspaceSection = {
  id: string;
  label: string;
  description: string;
  /** `page_blocks.block_type`, for the Showing/Hidden switch. */
  blockType: string | null;
  blocks: ContentBlock[];
  groups: GroupedBlocks;
};

export type WorkspaceTab = {
  /** Hub groups this tab covers. The first one present is what the URL carries. */
  groups: string[];
  label: string;
  /** One line under the tabs. */
  blurb: string;
  /** One line on the phone's list of pages. */
  listBlurb: string;
} & (
  | { kind: 'sections'; buildSections: (blocks: ContentBlock[]) => WorkspaceSection[] }
  | { kind: 'form'; buildGroups: (blocks: ContentBlock[], app: ContentApp) => GroupedBlocks }
);

export type ContentWorkspaceConfig = {
  app: ContentApp;
  /** Root test id: `${idPrefix}-content-workspace`. */
  idPrefix: string;
  /** Screen-reader name for the tab row. */
  tabsLabel: string;
  /** One line above the phone's list of pages. */
  listIntro: string;
  /** Section expanded on arrival — the one the owner edits most. */
  defaultOpenSectionId: string;
  tabs: WorkspaceTab[];
};

/** One heading per page, for a tab that carries several small pages. */
function groupByPage(pageOrder: string[]) {
  return (blocks: ContentBlock[], app: ContentApp): GroupedBlocks => {
    const out: GroupedBlocks = [];
    const used = new Set<string>();
    for (const page of pageOrder) {
      const inPage = blocks.filter((b) => hubGroupForKey(b.key, app) === page);
      if (inPage.length === 0) continue;
      inPage.forEach((b) => used.add(b.key));
      out.push({ label: page, blocks: inPage });
    }
    const leftover = blocks.filter((b) => !used.has(b.key));
    if (leftover.length > 0) out.push({ label: 'Other', blocks: leftover });
    return out;
  };
}

const websitePageTab = (name: string, blurb: string, listBlurb: string): WorkspaceTab => ({
  kind: 'form',
  groups: [name],
  label: name,
  blurb,
  listBlurb,
  buildGroups: (blocks) => groupBlocks(blocks, WEBSITE_PAGE_GROUPS[name]),
});

export const WEBSITE_WORKSPACE: ContentWorkspaceConfig = {
  app: 'website',
  idPrefix: 'website',
  tabsLabel: 'Website pages',
  listIntro: 'Five pages make up your website. Tap one to edit it.',
  // Owner's own answer to "which section first": "usually hero".
  defaultOpenSectionId: 'hero',
  tabs: [
    {
      kind: 'sections',
      groups: ['Home'],
      label: 'Home',
      blurb: 'Ten sections, in the order they appear on the page. Click one to open it.',
      listBlurb: 'The homepage, section by section',
      buildSections: buildWebsiteHomeSections,
    },
    websitePageTab('Contact page', 'Everything on /contact, top to bottom.', 'Everything on /contact'),
    websitePageTab(
      'Hours page',
      'Wording only. The real opening times are managed in Online Ordering.',
      'Wording around your opening times',
    ),
    websitePageTab('Legal', 'Terms, refunds and privacy.', 'Terms, refunds and privacy'),
    websitePageTab(
      'Everywhere',
      'Header, announcement bar, footer and search wording — on every page.',
      'Header, announcement bar, footer, search wording',
    ),
  ],
};

/** The Order App's small pages, in the order they are listed under one tab. */
export const ORDER_APP_OTHER_PAGES = [
  'Menu',
  'Ordering',
  'Order history',
  'Gift cards',
  'About',
  'Contact page',
  'Hours page',
  'Privacy',
  'Signage',
];

export const ORDER_APP_WORKSPACE: ContentWorkspaceConfig = {
  app: 'order_app',
  idPrefix: 'order-app',
  tabsLabel: 'Order App screens',
  listIntro: 'Your ordering app, screen by screen. Tap one to edit it.',
  // The greeting is the top of the screen; the hero sits under it here.
  defaultOpenSectionId: 'greeting',
  tabs: [
    {
      kind: 'sections',
      groups: ['Home'],
      label: 'Home',
      blurb: 'The home screen, section by section. Click one to open it.',
      listBlurb: 'The home screen, section by section',
      buildSections: buildOrderAppHomeSections,
    },
    {
      kind: 'form',
      groups: ORDER_APP_OTHER_PAGES,
      label: 'Other pages',
      blurb: 'The smaller screens, one heading each — menu, checkout, about, contact, hours, privacy, signage.',
      listBlurb: 'Menu, checkout, about, contact, hours, privacy',
      buildGroups: groupByPage(ORDER_APP_OTHER_PAGES),
    },
    {
      kind: 'form',
      groups: ['Everywhere'],
      label: 'Everywhere',
      blurb: 'Header, announcement bar and footer — on every screen.',
      listBlurb: 'Header, announcement bar, footer',
      buildGroups: (blocks) => groupBlocks(blocks, WEBSITE_PAGE_GROUPS.Everywhere),
    },
  ],
};

export function workspaceConfigFor(app: ContentApp): ContentWorkspaceConfig {
  return app === 'order_app' ? ORDER_APP_WORKSPACE : WEBSITE_WORKSPACE;
}

/** The tab that owns a hub group, or null when nothing does. */
export function tabForGroup(
  config: ContentWorkspaceConfig,
  group: string | null,
): WorkspaceTab | null {
  if (!group) return null;
  return config.tabs.find((t) => t.groups.includes(group)) ?? null;
}
