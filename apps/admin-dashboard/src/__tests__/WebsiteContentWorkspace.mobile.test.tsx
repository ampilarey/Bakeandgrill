import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ContentHubPage } from '../pages/ContentHub/ContentHubPage';
import * as contentApi from '../api/content';

/**
 * Website Content on a phone.
 *
 * The same screen as the desktop one, with a single change: five tabs do not
 * fit in a row on a 390px phone, so the pages become a list you tap into and
 * come back out of. Everything below that — the ten Home sections opening in
 * place, one at a time — is identical.
 */

vi.mock('../hooks/useIsMobile', () => ({
  useIsMobile: () => true,
  useIsCompactAdmin: () => false,
  useIsWideDesktop: () => false,
}));

vi.mock('../api/content', () => ({
  getContentBlocks: vi.fn(),
  getContentSchedules: vi.fn(async () => ({ schedules: [] })),
  getContentDrafts: vi.fn(async () => ({ drafts: {}, saved_at: null })),
  saveContentDrafts: vi.fn(async () => ({ drafts: {}, saved_at: null })),
  updateContent: vi.fn(),
  uploadContentImage: vi.fn(),
  uploadContentFont: vi.fn(),
  uploadContentVideo: vi.fn(),
  exportContent: vi.fn(),
  importContent: vi.fn(),
  getContentRevisions: vi.fn(async () => ({ revisions: [] })),
  restoreContentRevision: vi.fn(),
  scheduleContent: vi.fn(),
  cancelContentSchedule: vi.fn(),
  createContentPreviewToken: vi.fn(async () => ({
    token: 't', website_url: '/p', order_app_url: '/o', expires_in: 900,
  })),
  getContentIntegrity: vi.fn(async () => ({
    generated_at: '2026-08-15T00:00:00Z',
    surfaces: [], issues: [], needs_review: [],
    summary: { issue_count: 0, needs_review_count: 0, surface_count: 14 },
  })),
}));

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }));
vi.mock('../components/ui', async () => {
  const actual = await vi.importActual<typeof import('../components/ui')>('../components/ui');
  return { ...actual, useToast: () => ({ success: vi.fn(), error: vi.fn() }) };
});
vi.mock('../components/MediaPicker', () => ({ MediaPicker: () => null }));
vi.mock('../api/pageBlocks', () => ({
  fetchAdminPageBlocks: vi.fn(async () => ({
    app: 'website',
    page: 'home',
    blocks: [
      { id: 1, app: 'website', page: 'home', block_type: 'hero', position: 0, is_enabled: true, content_mode: 'own', settings: {}, label: 'Hero', description: '', removable: false, supports_shared_content: false },
      { id: 2, app: 'website', page: 'home', block_type: 'categories', position: 1, is_enabled: true, content_mode: 'own', settings: { show_mobile: false }, label: 'Categories', description: '', removable: true, supports_shared_content: false },
    ],
    available_types: [], unknown_types: [], draft: false, version: 0, saved_at: null,
  })),
  reorderPageBlocks: vi.fn(),
  updatePageBlock: vi.fn(),
  deletePageBlock: vi.fn(),
  createPageBlock: vi.fn(),
  createPageBlockPreviewToken: vi.fn(),
  publishPageBlocks: vi.fn(),
  discardPageBlockDraft: vi.fn(),
}));

function blk(key: string, group: string, extra: Record<string, unknown> = {}) {
  return {
    key,
    label: (extra.label as string) || key,
    group,
    type: (extra.type as string) || 'text',
    editor: extra.editor,
    apps: ['website'] as Array<'website' | 'order_app'>,
    shareable: false,
    public: true,
    shared: null,
    website: (extra.website as string) ?? 'current value',
    order_app: null,
    resolved_website: (extra.website as string) ?? 'current value',
    resolved_order_app: '',
    state: 'website' as const,
    managed_by: extra.managed_by ?? null,
    ...extra,
  };
}

const BLOCKS = [
  blk('hero_slides', 'Home', { type: 'json', editor: 'hero', website: '[]', label: 'Hero banners' }),
  blk('trust_items', 'Home', { type: 'json', editor: 'trust', website: '[]' }),
  blk('order_mode_delivery_hint', 'Home', { label: 'Delivery short line' }),
  blk('order_mode_pickup_hint', 'Home', { label: 'Pickup short line' }),
  blk('home_specials_title', 'Home', { label: 'Specials heading' }),
  blk('homepage_categories', 'Home', { type: 'json', editor: 'categories', website: '[]' }),
  blk('cta_band_headline', 'Home', { label: 'CTA headline' }),
  blk('home_location_title', 'Home', { label: 'Location heading' }),
  blk('delivery_time', 'Home', {
    label: 'Delivery time promise',
    managed_by: {
      owner_label: 'Ordering Control Center → Delivery Settings',
      owner_path: '/admin/delivery-settings',
      note: 'Kept beside the free-delivery threshold.',
      current_value: '30–45 min',
    },
  }),
  blk('footer_text', 'Everywhere', { label: 'Footer text' }),
  blk('nav_order_cta_text', 'Everywhere', { label: 'Order button says' }),
  blk('contact_page_title', 'Contact page', { label: 'Contact page title' }),
  blk('hours_page_title', 'Hours page', { label: 'Hours page title' }),
  blk('terms_page_title', 'Legal', { label: 'Terms page title' }),
];

function mount(entry = '/content/website') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <ContentHubPage />
    </MemoryRouter>,
  );
}

describe('Website Content workspace — phone', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    vi.mocked(contentApi.getContentBlocks).mockResolvedValue({
      locale: 'en',
      locales: ['en', 'dv'],
      blocks: BLOCKS as never,
    });
  });

  it('opens on the list of five pages, not on a page', async () => {
    mount();
    const list = await screen.findByTestId('wcw-pagelist');
    for (const name of ['Home', 'Contact page', 'Hours page', 'Legal', 'Everywhere']) {
      expect(within(list).getByTestId(`wcw-page-${name}`)).toBeTruthy();
    }
    // A row of tabs would need sideways scrolling on a phone.
    expect(screen.queryByRole('tablist', { name: /website pages/i })).toBeNull();
    expect(screen.queryByTestId('wcw-sections')).toBeNull();
  });

  it('drops the old card grid and its editor sheet', async () => {
    mount();
    await screen.findByTestId('wcw-pagelist');
    expect(screen.queryByTestId('surface-builder-landing')).toBeNull();
    expect(screen.queryByTestId('content-editor-sheet')).toBeNull();
    expect(screen.queryByTestId('preview-sheet-btn')).toBeNull();
  });

  it('taps into Home and shows the ten sections, none of them open', async () => {
    mount();
    fireEvent.click(await screen.findByTestId('wcw-page-Home'));

    await screen.findByTestId('wcw-sections');
    expect(screen.getByTestId('wcw-mobile-back')).toBeTruthy();
    expect(screen.getByTestId('wcw-section-hero')).toBeTruthy();
    // Unlike the desktop, nothing is expanded on arrival — a phone screen is
    // too short to open into the middle of the hero editor.
    expect(screen.getByTestId('wcw-section-hero').dataset.open).toBe('no');
    expect(screen.queryByTestId('wcw-field-hero_slides')).toBeNull();
  });

  it('opens a section in place, one at a time, just like the desktop', async () => {
    mount();
    fireEvent.click(await screen.findByTestId('wcw-page-Home'));
    fireEvent.click(await screen.findByTestId('wcw-section-toggle-specials'));

    await waitFor(() => expect(screen.getByTestId('wcw-section-specials').dataset.open).toBe('yes'));
    expect(screen.getByTestId('wcw-field-home_specials_title')).toBeTruthy();

    fireEvent.click(screen.getByTestId('wcw-section-toggle-cta'));
    await waitFor(() => expect(screen.getByTestId('wcw-section-cta').dataset.open).toBe('yes'));
    expect(screen.getByTestId('wcw-section-specials').dataset.open).toBe('no');
  });

  it('Back returns to the list of five pages', async () => {
    mount();
    fireEvent.click(await screen.findByTestId('wcw-page-Legal'));
    await screen.findByTestId('wcw-form-Legal');

    fireEvent.click(screen.getByTestId('wcw-mobile-back'));
    await screen.findByTestId('wcw-pagelist');
    expect(screen.queryByTestId('wcw-form-Legal')).toBeNull();
  });

  it('edits save the same way they do on the desktop', async () => {
    mount();
    fireEvent.click(await screen.findByTestId('wcw-page-Home'));
    fireEvent.click(await screen.findByTestId('wcw-section-toggle-specials'));

    const field = await screen.findByTestId('wcw-field-home_specials_title');
    fireEvent.change(within(field).getByDisplayValue('current value'), {
      target: { value: 'Fresh today' },
    });

    await waitFor(() => expect(screen.getByTestId('wcw-dirty-home_specials_title')).toBeTruthy());
    expect(screen.getByTestId('wcw-section-dirty-specials')).toBeTruthy();
  });

  it('a deep link opens that page directly, with a way back', async () => {
    mount('/content/website?group=Everywhere');
    const form = await screen.findByTestId('wcw-form-Everywhere');
    expect(within(form).getByTestId('wcw-field-footer_text')).toBeTruthy();
    expect(screen.getByTestId('wcw-mobile-back')).toBeTruthy();
  });

  it('a setting owned elsewhere is not offered here, and never vanishes silently', async () => {
    // The API hides single-owner keys (owner, 2026-08-15) — that is enforced
    // backend-side. What this screen must guarantee is the other half: if one
    // ever does arrive, it shows up somewhere, read-only, instead of being
    // quietly dropped.
    mount();
    fireEvent.click(await screen.findByTestId('wcw-page-Home'));

    fireEvent.click(await screen.findByTestId('wcw-section-toggle-location'));
    const location = await screen.findByTestId('wcw-section-body-location');
    expect(within(location).queryByTestId('wcw-field-delivery_time')).toBeNull();

    fireEvent.click(screen.getByTestId('wcw-section-toggle-other'));
    const other = await screen.findByTestId('wcw-section-body-other');
    const field = within(other).getByTestId('wcw-field-delivery_time');
    expect(within(field).getByTestId('ops-owned-delivery_time')).toBeTruthy();
    expect(within(field).queryByRole('textbox')).toBeNull();
  });

  it('gives the hero its phone layout, not the three-column desktop one', async () => {
    // Owner, 2026-08-15: "contents are on 3 columns in hero which shrinks the
    // content and difficult to see." The phone shell was built, but the field
    // editors inside it were still being handed the desktop layout.
    mount();
    fireEvent.click(await screen.findByTestId('wcw-page-Home'));
    fireEvent.click(await screen.findByTestId('wcw-section-toggle-hero'));

    const body = await screen.findByTestId('wcw-section-body-hero');
    expect(within(body).getByTestId('hero-slides-mobile')).toBeTruthy();
    expect(within(body).queryByTestId('hero-slides-wide')).toBeNull();
    expect(within(body).queryByTestId('hero-slides-wide-fields')).toBeNull();
  });

  it('Section order & visibility is reachable, and arranges the phone layout', async () => {
    mount();
    fireEvent.click(await screen.findByTestId('wcw-page-Home'));
    expect(await screen.findByTestId('wcw-section-toggle-layout')).toBeTruthy();
  });
});
