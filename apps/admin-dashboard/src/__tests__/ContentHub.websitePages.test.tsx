import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ContentHubPage } from '../pages/ContentHub/ContentHubPage';
import * as contentApi from '../api/content';

let isMobileFlag = true;

vi.mock('../hooks/useIsMobile', () => ({
  useIsMobile: () => isMobileFlag,
}));

vi.mock('../api/content', () => ({
  getContentBlocks: vi.fn(),
  getContentSchedules: vi.fn(async () => ({ schedules: [] })),
  getContentDrafts: vi.fn(async () => ({ drafts: {}, saved_at: null })),
  saveContentDrafts: vi.fn(async () => ({ drafts: {}, saved_at: null })),
  updateContent: vi.fn(),
  shareContentBlock: vi.fn(async () => ({ blocks: [] })),
  splitContentBlock: vi.fn(async () => ({ blocks: [] })),
  copyContentBlock: vi.fn(),
  copyContentSection: vi.fn(),
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
    link_state: 'same' as const,
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
    openHub('/content');
    await screen.findByTestId('surface-builder-landing');
    expect(screen.queryByTestId('task-card-website_pages')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Pages' })).toBeNull();
    expect(screen.queryByTestId('section-card-Pages')).toBeNull();

    expect(screen.getByTestId('task-card-contact_map')).toBeTruthy();
    expect(screen.getByTestId('task-card-opening_hours')).toBeTruthy();
    expect(screen.getByTestId('task-card-order_about')).toBeTruthy();
    expect(screen.getByTestId('task-card-catering_events')).toBeTruthy();
    expect(screen.getByTestId('surface-card-website.mobile.footer')).toBeTruthy();
  });

  it('legacy ?group=Pages redirects to the Website task overview', async () => {
    openHub('/content?group=Pages');
    await screen.findByTestId('surface-builder-landing');
    expect(screen.queryByTestId('content-editor-sheet')).toBeNull();
    expect(screen.queryByTestId('section-editor')).toBeNull();
    expect(screen.getByTestId('task-card-contact_map')).toBeTruthy();
  });

  it('Contact & map sheet shows only contact fields', async () => {
    openHub('/content');
    await screen.findByTestId('task-card-contact_map');
    fireEvent.click(screen.getByTestId('task-card-contact_map'));

    const sheet = await screen.findByTestId('content-editor-sheet');
    expect(sheet.textContent).toMatch(/Contact & map/);
    const editor = within(sheet).getByTestId('section-editor');
    expect(editor.getAttribute('data-section')).toBe('Contact & map');

    expect(within(sheet).getByTestId('block-card-contact_page_title')).toBeTruthy();
    expect(within(sheet).getByTestId('block-card-maps_embed_url')).toBeTruthy();
    expect(within(sheet).queryByTestId('block-card-hours_page_title')).toBeNull();
    expect(within(sheet).queryByTestId('block-card-privacy_page_title')).toBeNull();
    expect(within(sheet).queryByTestId('block-card-office_orders_headline')).toBeNull();
    expect(within(sheet).queryByTestId('block-card-homepage_categories')).toBeNull();
    expect(within(sheet).queryByTestId('block-card-events_section_headline')).toBeNull();
    expect(within(sheet).queryByTestId('block-card-about_values')).toBeNull();
  });

  it('Opening hours sheet shows only hours fields', async () => {
    openHub('/content?group=Opening%20hours');
    const sheet = await screen.findByTestId('content-editor-sheet');
    expect(within(sheet).getByTestId('block-card-hours_page_title')).toBeTruthy();
    expect(within(sheet).queryByTestId('block-card-contact_page_title')).toBeNull();
  });

  it('About sheet shows only about fields', async () => {
    openHub('/content?group=About');
    const sheet = await screen.findByTestId('content-editor-sheet');
    expect(within(sheet).getByTestId('block-card-about_values')).toBeTruthy();
    expect(within(sheet).getByTestId('block-card-about_page_title')).toBeTruthy();
    expect(within(sheet).queryByTestId('block-card-hours_page_title')).toBeNull();
  });

  it('Catering & events sheet shows only events fields', async () => {
    openHub('/content?group=Catering%20%26%20events');
    const sheet = await screen.findByTestId('content-editor-sheet');
    expect(within(sheet).getByTestId('block-card-events_section_headline')).toBeTruthy();
    expect(within(sheet).getByTestId('block-card-contact_events_cta_headline')).toBeTruthy();
    expect(within(sheet).queryByTestId('block-card-contact_page_title')).toBeNull();
  });

  it('Footer sheet shows only footer fields', async () => {
    openHub('/content?group=Footer');
    const sheet = await screen.findByTestId('content-editor-sheet');
    expect(within(sheet).getByTestId('block-card-footer_text')).toBeTruthy();
    expect(within(sheet).queryByTestId('block-card-privacy_page_title')).toBeNull();
  });

  it('Legal receives remapped privacy fields', async () => {
    isMobileFlag = false;
    window.localStorage.setItem('bg_hub_preview_open', '0');
    openHub('/content?group=Legal');
    await screen.findByTestId('section-editor');
    expect(screen.getByTestId('block-card-privacy_page_title')).toBeTruthy();
    expect(screen.getByTestId('block-card-legal_privacy_body')).toBeTruthy();
    expect(screen.queryByTestId('block-card-contact_page_title')).toBeNull();
  });

  it('Order App receives office_orders fields', async () => {
    isMobileFlag = false;
    window.localStorage.setItem('bg_hub_preview_open', '0');
    openHub('/content?group=Order%20App');
    await screen.findByTestId('section-editor');
    expect(screen.getByTestId('block-card-office_orders_headline')).toBeTruthy();
    expect(screen.getByTestId('block-card-order_checkout_title')).toBeTruthy();
  });

  it('Homepage receives remapped home content fields', async () => {
    isMobileFlag = false;
    window.localStorage.setItem('bg_hub_preview_open', '0');
    openHub('/content?group=Homepage');
    await screen.findByTestId('section-editor');
    expect(screen.getByTestId('block-card-homepage_categories')).toBeTruthy();
    expect(screen.getByTestId('block-card-trust_items')).toBeTruthy();
  });

  it.each([320, 375, 390] as const)('Contact & map sheet does not overflow at %ipx', async (width) => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: width });

    openHub('/content');
    await screen.findByTestId('task-card-contact_map');
    fireEvent.click(screen.getByTestId('task-card-contact_map'));
    const sheet = await screen.findByTestId('content-editor-sheet');

    await waitFor(() => {
      expect(sheet.scrollWidth).toBeLessThanOrEqual(width + 1);
    });
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width + 1);
  });
});
