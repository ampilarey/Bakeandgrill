import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ContentHubPage } from '../pages/ContentHub/ContentHubPage';
import {
  WEBSITE_DESKTOP_REMOVED_LANDING_ROUTES,
  websiteDesktopRemovedSectionNames,
} from '../pages/ContentHub/websiteDesktopLandingRoutes';
import * as contentApi from '../api/content';

let isMobileFlag = false;

vi.mock('../hooks/useIsMobile', () => ({
  useIsMobile: () => isMobileFlag,
  useIsCompactAdmin: () => false,
  useIsWideDesktop: () => !isMobileFlag,
}));

vi.mock('../api/content', () => ({
  getContentBlocks: vi.fn(),
  getContentSchedules: vi.fn(async () => ({ schedules: [] })),
  getContentDrafts: vi.fn(async () => ({ drafts: {}, saved_at: null })),
  saveContentDrafts: vi.fn(async () => ({ drafts: {}, saved_at: null })),
  discardContentDrafts: vi.fn(async () => ({ message: 'ok', locale: 'en', scope: null, deleted: 0 })),
  updateContent: vi.fn(),
  uploadContentImage: vi.fn(),
  uploadContentFont: vi.fn(),
  exportContent: vi.fn(),
  importContent: vi.fn(),
  getContentRevisions: vi.fn(async () => ({ revisions: [] })),
  restoreContentRevision: vi.fn(),
  scheduleContent: vi.fn(),
  cancelContentSchedule: vi.fn(),
  createContentPreviewToken: vi.fn(async () => ({
    token: 't', website_url: '/preview', order_app_url: '/order-preview', expires_in: 900,
  })),
  getContentIntegrity: vi.fn(async () => ({
    generated_at: '2026-08-13T00:00:00Z',
    surfaces: [],
    issues: [],
    needs_review: [],
    summary: { issue_count: 0, needs_review_count: 0, surface_count: 14 },
  })),
  uploadContentVideo: vi.fn(),
}));

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }));
vi.mock('../components/ui', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));
vi.mock('../components/MediaPicker', () => ({ MediaPicker: () => null }));
vi.mock('../api/pageBlocks', () => ({
  fetchAdminPageBlocks: vi.fn(async () => ({
    app: 'website', page: 'home', blocks: [], available_types: [], unknown_types: [],
    draft: false, version: 0, saved_at: null,
  })),
  reorderPageBlocks: vi.fn(),
  updatePageBlock: vi.fn(),
  deletePageBlock: vi.fn(),
  createPageBlock: vi.fn(),
  createPageBlockPreviewToken: vi.fn(),
  publishPageBlocks: vi.fn(),
  discardPageBlockDraft: vi.fn(),
}));

function blk(key: string, group: string, label = key) {
  return {
    key,
    label,
    group,
    type: 'text',
    apps: ['website'] as Array<'website' | 'order_app'>,
    shareable: true,
    public: true,
    shared: 'value',
    website: null,
    order_app: null,
    resolved_website: 'value',
    resolved_order_app: 'value',
    state: 'shared' as const,
  };
}

/** Enough keys so every Stage A destination section appears in the rail. */
const websiteBlocks = [
  { ...blk('hero_slides', 'Hero', 'Hero'), type: 'json' as const, editor: 'hero' as const, shared: '[]', resolved_website: '[]', resolved_order_app: '[]' },
  blk('trust_items', 'Homepage', 'Trust'),
  blk('events_section_headline', 'Pages', 'Events'),
  blk('contact_page_title', 'Pages', 'Contact title'),
  blk('hours_page_title', 'Pages', 'Hours title'),
  blk('legal_privacy_body', 'Legal', 'Privacy body'),
  blk('privacy_page_title', 'Pages', 'Privacy title'),
  blk('footer_text', 'Footer', 'Footer'),
  blk('logo', 'Branding', 'Logo'),
  blk('announcement_text', 'Announcements', 'Announcement'),
  blk('meta_title', 'SEO', 'Meta title'),
  blk('nav_order_cta_text', 'General', 'Nav CTA'),
];

function openWebsiteDesktop(path = '/content/website') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ContentHubPage />
    </MemoryRouter>,
  );
}

describe('Website desktop Stage A — rail is the only map', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isMobileFlag = false;
    window.localStorage.clear();
    window.localStorage.setItem('bg_hub_preview_open', '0');
    vi.mocked(contentApi.getContentBlocks).mockResolvedValue({
      locale: 'en',
      locales: ['en', 'dv'],
      blocks: websiteBlocks as never,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('lands on the Home tab with the hero already open', async () => {
    openWebsiteDesktop('/content/website');
    await screen.findByTestId('website-content-workspace');
    expect(screen.queryByTestId('surface-builder-landing')).toBeNull();
    expect(screen.queryByTestId('task-card-hero')).toBeNull();
    expect(screen.queryByTestId('surface-card-website.desktop.home')).toBeNull();
    expect(screen.queryByTestId('section-rail')).toBeNull();

    expect(screen.getByTestId('wcw-tab-Home').getAttribute('aria-selected')).toBe('true');
    const hero = await screen.findByTestId('wcw-section-body-hero');
    expect(within(hero).getByTestId('hero-slides-wide')).toBeTruthy();

    // Hero is first, and it is the only section open.
    const sections = Array.from(
      screen.getByTestId('wcw-sections').querySelectorAll('[data-testid^="wcw-section-"]'),
    ).filter((el) => el.getAttribute('data-testid')?.startsWith('wcw-section-') && el.hasAttribute('data-open'));
    expect(sections[0]?.getAttribute('data-testid')).toBe('wcw-section-hero');
    expect(sections.filter((el) => el.getAttribute('data-open') === 'yes')).toHaveLength(1);

    // Closing it leaves the list, with nothing open.
    fireEvent.click(screen.getByTestId('wcw-section-toggle-hero'));
    await waitFor(() => {
      expect(screen.getByTestId('wcw-section-hero').getAttribute('data-open')).toBe('no');
    }, { timeout: 3000 });
  });

  it('the Home tab gets back to the hero from any other page', async () => {
    openWebsiteDesktop('/content/website?group=Legal');
    await screen.findByTestId('wcw-form-Legal');
    expect(screen.getByTestId('wcw-tab-Home').getAttribute('aria-selected')).toBe('false');

    fireEvent.click(screen.getByTestId('wcw-tab-Home'));
    await screen.findByTestId('wcw-sections');
    expect(screen.getByTestId('wcw-tab-Home').getAttribute('aria-selected')).toBe('true');

    fireEvent.click(screen.getByTestId('wcw-section-toggle-hero'));
    const hero = await screen.findByTestId('wcw-section-body-hero');
    expect(within(hero).getByTestId('hero-slides-wide')).toBeTruthy();
  });

  it('keeps every removed landing destination reachable from the rail or ⋯ tools', async () => {
    expect(WEBSITE_DESKTOP_REMOVED_LANDING_ROUTES).toHaveLength(20);

    openWebsiteDesktop('/content/website');
    await screen.findByTestId('website-content-workspace');

    for (const section of websiteDesktopRemovedSectionNames()) {
      expect(
        screen.getByTestId(`wcw-tab-${section}`),
        `no page tab for "${section}", required by a removed landing card`,
      ).toBeTruthy();
    }

    cleanup();

    // Each destination still opens from a deep link.
    for (const section of websiteDesktopRemovedSectionNames()) {
      openWebsiteDesktop(`/content/website?group=${encodeURIComponent(section)}`);
      await waitFor(() => {
        expect(screen.getByTestId('website-content-workspace').getAttribute('data-tab')).toBe(section);
      });
      expect(screen.getByTestId(`wcw-tab-${section}`).getAttribute('aria-selected')).toBe('true');
      cleanup();
    }

    openWebsiteDesktop('/content/website');
    await screen.findByTestId('wcw-sections');
    // Clicking another page tab moves there (guards against a stuck Home).
    fireEvent.click(screen.getByTestId('wcw-tab-Contact page'));
    await waitFor(() => {
      expect(screen.getByTestId('website-content-workspace').getAttribute('data-tab')).toBe('Contact page');
    });

    const moreTrigger = document.querySelector('.hub-more-trigger') as HTMLElement;
    expect(moreTrigger).toBeTruthy();
    fireEvent.click(moreTrigger);
    for (const route of WEBSITE_DESKTOP_REMOVED_LANDING_ROUTES) {
      if (route.kind !== 'tool') continue;
      expect(
        screen.getByTestId(route.toolTestId),
        `⋯ menu missing tool "${route.id}" (${route.toolTestId})`,
      ).toBeTruthy();
    }
  });

  it('hides the integrity panel when there is nothing to report', async () => {
    openWebsiteDesktop('/content/website');
    await screen.findByTestId('website-content-workspace');
    await waitFor(() => {
      expect(contentApi.getContentIntegrity).toHaveBeenCalled();
    });
    expect(screen.queryByTestId('content-integrity-panel')).toBeNull();
  });

  it('Order App desktop now gets the same workspace — no landing, no rail', async () => {
    // Owner, 2026-08-15: "Let's start order app." Both hubs land straight on
    // their page tabs; the surface landing and the section rail are gone.
    openWebsiteDesktop('/content/order-app');
    expect(await screen.findByTestId('order-app-content-workspace')).toBeTruthy();
    expect(screen.queryByTestId('surface-builder-landing')).toBeNull();
    expect(screen.queryByTestId('section-rail-tasks-home')).toBeNull();
  });
});
