import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ContentHubPage } from '../pages/ContentHub/ContentHubPage';
import * as contentApi from '../api/content';
import * as pageBlocksApi from '../api/pageBlocks';

let isMobileFlag = true;

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
    apps: ['website', 'order_app'] as Array<'website' | 'order_app'>,
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

const mixedBlocks = [
  blk('contact_page_title', 'Pages', 'Contact page title'),
  blk('maps_embed_url', 'Pages', 'Maps embed'),
  blk('business_whatsapp', 'Contact', 'WhatsApp'),
  blk('hours_page_title', 'Pages', 'Hours page title'),
  blk('about_values', 'Pages', 'About values'),
  blk('about_page_title', 'About', 'About title'),
  blk('events_section_headline', 'Pages', 'Events headline'),
  blk('contact_events_cta_headline', 'Pages', 'Events CTA'),
  blk('footer_text', 'Footer', 'Footer text'),
  blk('privacy_page_title', 'Pages', 'Privacy title'),
  blk('homepage_categories', 'Pages', 'Homepage categories'),
  blk('trust_items', 'Pages', 'Trust items'),
  blk('office_orders_headline', 'Pages', 'Office orders'),
  blk('legal_privacy_body', 'Legal', 'Privacy body'),
  blk('order_checkout_title', 'Order App', 'Checkout title'),
  blk('logo', 'Branding', 'Logo'),
];

function openHub(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ContentHubPage />
    </MemoryRouter>,
  );
}

describe('ContentHub Website pages focused tasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isMobileFlag = true;
    window.localStorage.clear();
    vi.mocked(contentApi.getContentBlocks).mockResolvedValue({
      locale: 'en',
      locales: ['en', 'dv'],
      blocks: mixedBlocks as never,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('does not expose a generic mixed Pages editor or task', async () => {
    openHub('/content/website');
    await screen.findByTestId('surface-builder-landing');
    expect(screen.queryByTestId('task-card-website_pages')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Pages' })).toBeNull();
    expect(screen.queryByTestId('section-card-Pages')).toBeNull();

    expect(screen.getByTestId('hub-landing-primary')).toBeTruthy();
    expect(screen.getByTestId('task-card-hero')).toBeTruthy();
    expect(screen.getByTestId('hub-landing-page-contact-page')).toBeTruthy();
    expect(screen.getByTestId('hub-landing-page-hours-page')).toBeTruthy();
    expect(screen.queryByTestId('hub-landing-page-about')).toBeNull();
    expect(screen.getByTestId('surface-card-website.mobile.footer')).toBeTruthy();
    expect(screen.queryByTestId('surface-app-order_app')).toBeNull();
  });

  it('legacy ?group=Pages redirects to the Website task overview', async () => {
    openHub('/content/website?group=Pages');
    await screen.findByTestId('surface-builder-landing');
    expect(screen.queryByTestId('content-editor-sheet')).toBeNull();
    expect(screen.queryByTestId('section-editor')).toBeNull();
    expect(screen.getByTestId('hub-landing-page-contact-page')).toBeTruthy();
  });

  it('Contact page sheet shows only contact fields', async () => {
    openHub('/content/website');
    await screen.findByTestId('hub-landing-page-contact-page');
    fireEvent.click(screen.getByTestId('hub-landing-page-contact-page'));

    const sheet = await screen.findByTestId('content-editor-sheet');
    expect(sheet.textContent).toMatch(/Contact page/);
    const editor = within(sheet).getByTestId('section-editor');
    expect(editor.getAttribute('data-section')).toBe('Contact page');

    expect(within(sheet).getByTestId('block-card-contact_page_title')).toBeTruthy();
    expect(within(sheet).getByTestId('block-card-maps_embed_url')).toBeTruthy();
    expect(within(sheet).queryByTestId('block-card-hours_page_title')).toBeNull();
    expect(within(sheet).queryByTestId('block-card-privacy_page_title')).toBeNull();
    expect(within(sheet).queryByTestId('block-card-office_orders_headline')).toBeNull();
    expect(within(sheet).queryByTestId('block-card-homepage_categories')).toBeNull();
    expect(within(sheet).queryByTestId('block-card-events_section_headline')).toBeNull();
    expect(within(sheet).queryByTestId('block-card-about_values')).toBeNull();
    expect(within(sheet).getByTestId('block-card-contact_events_cta_headline')).toBeTruthy();
  });

  it('Hours page sheet shows only hours fields', async () => {
    openHub('/content/website?group=Hours%20page');
    const sheet = await screen.findByTestId('content-editor-sheet');
    expect(within(sheet).getByTestId('block-card-hours_page_title')).toBeTruthy();
    expect(within(sheet).queryByTestId('block-card-contact_page_title')).toBeNull();
  });

  it('About sheet shows only about fields on Order App', async () => {
    openHub('/content/order-app?group=About');
    const sheet = await screen.findByTestId('content-editor-sheet');
    expect(within(sheet).getByTestId('block-card-about_values')).toBeTruthy();
    expect(within(sheet).getByTestId('block-card-about_page_title')).toBeTruthy();
    expect(within(sheet).queryByTestId('block-card-hours_page_title')).toBeNull();
  });

  it('Home sheet includes events band fields', async () => {
    isMobileFlag = false;
    window.localStorage.setItem('bg_hub_preview_open', '0');
    openHub('/content/website?group=Home');
    await screen.findByTestId('website-page-mode');
    expect(screen.getByTestId('page-list-row-events_section_headline')).toBeTruthy();
    expect(screen.queryByTestId('page-list-row-contact_page_title')).toBeNull();
  });

  it('Everywhere sheet includes footer fields', async () => {
    openHub('/content/website?group=Everywhere');
    const sheet = await screen.findByTestId('content-editor-sheet');
    expect(within(sheet).getByTestId('block-card-footer_text')).toBeTruthy();
    expect(within(sheet).queryByTestId('block-card-privacy_page_title')).toBeNull();
  });

  it('Legal receives remapped privacy fields', async () => {
    isMobileFlag = false;
    window.localStorage.setItem('bg_hub_preview_open', '0');
    openHub('/content/website?group=Legal');
    await screen.findByTestId('website-page-mode');
    expect(screen.getByTestId('page-list-row-privacy_page_title')).toBeTruthy();
    expect(screen.getByTestId('page-list-row-legal_privacy_body')).toBeTruthy();
    expect(screen.queryByTestId('page-list-row-contact_page_title')).toBeNull();
  });

  it('Order App Home receives office_orders fields', async () => {
    isMobileFlag = false;
    window.localStorage.setItem('bg_hub_preview_open', '0');
    openHub('/content/order-app?group=Home');
    await screen.findByTestId('section-editor');
    expect(screen.getByTestId('block-card-office_orders_headline')).toBeTruthy();
    expect(screen.queryByTestId('block-card-order_checkout_title')).toBeNull();
  });

  it('Order App Ordering receives checkout fields', async () => {
    isMobileFlag = false;
    window.localStorage.setItem('bg_hub_preview_open', '0');
    openHub('/content/order-app?group=Ordering');
    await screen.findByTestId('section-editor');
    expect(screen.getByTestId('block-card-order_checkout_title')).toBeTruthy();
  });

  it('Home receives remapped home content fields', async () => {
    isMobileFlag = false;
    window.localStorage.setItem('bg_hub_preview_open', '0');
    openHub('/content/website?group=Home');
    await screen.findByTestId('website-page-mode');
    expect(screen.getByTestId('page-list-row-homepage_categories')).toBeTruthy();
    expect(screen.getByTestId('page-list-row-trust_items')).toBeTruthy();
  });

  it('enables Publish and publishes the layout when only the Home layout has a draft', async () => {
    isMobileFlag = false;
    window.localStorage.setItem('bg_hub_preview_open', '0');
    vi.mocked(pageBlocksApi.fetchAdminPageBlocks).mockImplementation(async (app: string) => ({
      app,
      page: 'home',
      blocks: [],
      available_types: [],
      unknown_types: [],
      draft: app === 'website',
      version: app === 'website' ? 3 : 0,
      saved_at: null,
    }));

    openHub('/content/website?group=Home');
    await screen.findByTestId('website-page-mode');

    // No content key drafts exist — Publish should still appear because the
    // Home layout has an unpublished draft (website app, version 3).
    const publishBtn = await screen.findByTestId('publish-live-btn');
    expect(publishBtn.hasAttribute('disabled')).toBe(false);

    fireEvent.click(publishBtn);

    await waitFor(() => {
      expect(pageBlocksApi.publishPageBlocks).toHaveBeenCalledWith({ app: 'website', version: 3 });
    });
    expect(pageBlocksApi.publishPageBlocks).not.toHaveBeenCalledWith(
      expect.objectContaining({ app: 'order_app' }),
    );
    expect(contentApi.updateContent).not.toHaveBeenCalled();
  });

  it('discards the layout draft via the unified Discard draft action', async () => {
    isMobileFlag = false;
    window.localStorage.setItem('bg_hub_preview_open', '0');
    vi.mocked(pageBlocksApi.fetchAdminPageBlocks).mockImplementation(async (app: string) => ({
      app,
      page: 'home',
      blocks: [],
      available_types: [],
      unknown_types: [],
      draft: app === 'website',
      version: app === 'website' ? 3 : 0,
      saved_at: null,
    }));
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    openHub('/content/website?group=Home');
    await screen.findByTestId('website-page-mode');
    await screen.findByTestId('publish-live-btn');

    const moreTrigger = document.querySelector('.hub-more-trigger') as HTMLElement;
    fireEvent.click(moreTrigger);
    fireEvent.click(await screen.findByTestId('hub-discard-draft'));

    await waitFor(() => {
      expect(pageBlocksApi.discardPageBlockDraft).toHaveBeenCalledWith({ app: 'website' });
    });
    expect(contentApi.discardContentDrafts).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it.each([320, 375, 390] as const)('Contact page sheet does not overflow at %ipx', async (width) => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: width });

    openHub('/content/website');
    await screen.findByTestId('hub-landing-page-contact-page');
    fireEvent.click(screen.getByTestId('hub-landing-page-contact-page'));
    const sheet = await screen.findByTestId('content-editor-sheet');

    await waitFor(() => {
      expect(sheet.scrollWidth).toBeLessThanOrEqual(width + 1);
    });
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width + 1);
  });
});
