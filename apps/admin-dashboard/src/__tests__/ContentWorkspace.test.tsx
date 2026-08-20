import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ContentHubPage } from '../pages/ContentHub/ContentHubPage';
import * as contentApi from '../api/content';
import * as pageBlocksApi from '../api/pageBlocks';

/**
 * Website Content, desktop — the owner's layout.
 *
 * Five page tabs; Home is ten sections that open in place, one at a time, at
 * full page width. No side panel, no pop-up window.
 */

vi.mock('../hooks/useIsMobile', () => ({
  useIsMobile: () => false,
  useIsCompactAdmin: () => false,
  useIsWideDesktop: () => true,
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

describe('Website Content workspace — desktop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
    vi.mocked(contentApi.getContentBlocks).mockResolvedValue({
      locale: 'en',
      locales: ['en', 'dv'],
      blocks: BLOCKS as never,
    });
  });

  it('shows the five page tabs in a row', async () => {
    mount();
    await screen.findByTestId('website-content-workspace');
    for (const name of ['Home', 'Contact page', 'Hours page', 'Legal', 'Everywhere']) {
      expect(screen.getByTestId(`wcw-tab-${name}`)).toBeTruthy();
    }
  });

  it('lists Home as its sections, not as loose settings', async () => {
    mount();
    await screen.findByTestId('wcw-sections');
    for (const id of ['hero', 'trust', 'order_buttons', 'specials', 'cta', 'location']) {
      expect(screen.getByTestId(`wcw-section-${id}`)).toBeTruthy();
    }
    // A setting inside a closed section is not on screen.
    expect(screen.queryByTestId('wcw-field-cta_band_headline')).toBeNull();
  });

  it('opens a section in place and closes the one that was open', async () => {
    mount();
    // Hero opens on arrival — the owner's own "usually hero".
    await waitFor(() => expect(screen.getByTestId('wcw-section-hero').dataset.open).toBe('yes'));

    fireEvent.click(screen.getByTestId('wcw-section-toggle-cta'));

    await waitFor(() => expect(screen.getByTestId('wcw-section-cta').dataset.open).toBe('yes'));
    expect(screen.getByTestId('wcw-section-hero').dataset.open).toBe('no');
    expect(screen.getByTestId('wcw-field-cta_band_headline')).toBeTruthy();
  });

  it('clicking an open section closes it again', async () => {
    mount();
    fireEvent.click(await screen.findByTestId('wcw-section-toggle-specials'));
    await waitFor(() => expect(screen.getByTestId('wcw-section-specials').dataset.open).toBe('yes'));
    fireEvent.click(screen.getByTestId('wcw-section-toggle-specials'));
    await waitFor(() => expect(screen.getByTestId('wcw-section-specials').dataset.open).toBe('no'));
  });

  it('nothing opens in a pop-up window or a side panel', async () => {
    mount();
    fireEvent.click(await screen.findByTestId('wcw-section-toggle-location'));
    const body = await screen.findByTestId('wcw-section-body-location');
    // The editor lives inside the section row itself, not in a dialog.
    expect(body.closest('[role="dialog"]')).toBeNull();
    expect(screen.queryByTestId('website-desktop-page-list')).toBeNull();
  });

  it('groups a big section under headings', async () => {
    mount();
    fireEvent.click(await screen.findByTestId('wcw-section-toggle-order_buttons'));
    const body = await screen.findByTestId('wcw-section-body-order_buttons');
    expect(within(body).getByTestId('wcw-group-Delivery')).toBeTruthy();
    expect(within(body).getByTestId('wcw-group-Pickup')).toBeTruthy();
  });

  it('typing in a field marks it unsaved', async () => {
    mount();
    fireEvent.click(await screen.findByTestId('wcw-section-toggle-specials'));
    const field = await screen.findByTestId('wcw-field-home_specials_title');
    const input = within(field).getByDisplayValue('current value');
    fireEvent.change(input, { target: { value: 'Fresh today' } });

    await waitFor(() => expect(screen.getByTestId('wcw-dirty-home_specials_title')).toBeTruthy());
    expect(screen.getByTestId('wcw-section-dirty-specials')).toBeTruthy();
    expect((input as HTMLInputElement).value).toBe('Fresh today');
  });

  it('a setting owned elsewhere is not offered here, and never vanishes silently', async () => {
    // The API hides single-owner keys (owner, 2026-08-15) — enforced backend
    // side. This screen owns the other half of the promise: if one ever does
    // arrive, it appears somewhere, read-only, rather than being dropped.
    mount();
    fireEvent.click(await screen.findByTestId('wcw-section-toggle-location'));
    const location = await screen.findByTestId('wcw-section-body-location');
    expect(within(location).queryByTestId('wcw-field-delivery_time')).toBeNull();

    fireEvent.click(screen.getByTestId('wcw-section-toggle-other'));
    const other = await screen.findByTestId('wcw-section-body-other');
    const field = within(other).getByTestId('wcw-field-delivery_time');
    expect(within(field).getByTestId('ops-owned-delivery_time')).toBeTruthy();
    expect(within(field).queryByRole('textbox')).toBeNull();
    expect(field.querySelector('.wcw-field-owner')?.textContent).toMatch(/Delivery Settings/);
  });

  it('turns a section off from its own row', async () => {
    // Owner, 2026-08-15: "if i want to hide hero banner for a short period of
    // time … now i have to go to section order and visibility tab to do that."
    vi.mocked(pageBlocksApi.updatePageBlock).mockResolvedValue({
      version: 1,
      block: { id: 1, is_enabled: false },
    } as never);

    mount();
    const toggle = await screen.findByTestId('wcw-section-where-hero');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(toggle.textContent).toBe('Desktop + mobile');

    fireEvent.click(toggle);

    await waitFor(() => {
      expect(pageBlocksApi.updatePageBlock).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ app: 'website', page: 'home', is_enabled: false }),
      );
    });
    await waitFor(() => {
      expect(screen.getByTestId('wcw-section-where-hero').textContent).toBe('Hidden');
    });
    expect(screen.getByTestId('wcw-section-where-hero').getAttribute('aria-pressed')).toBe('false');
  });

  it('turning a section off does not open or close it', async () => {
    vi.mocked(pageBlocksApi.updatePageBlock).mockResolvedValue({
      version: 1,
      block: { id: 2, is_enabled: false },
    } as never);

    mount();
    fireEvent.click(await screen.findByTestId('wcw-section-toggle-categories'));
    await waitFor(() => expect(screen.getByTestId('wcw-section-categories').dataset.open).toBe('yes'));

    fireEvent.click(screen.getByTestId('wcw-section-where-categories'));
    await waitFor(() => {
      expect(screen.getByTestId('wcw-section-where-categories').textContent).toBe('Hidden');
    });
    // Still open — hiding a section is not a reason to close its editor.
    expect(screen.getByTestId('wcw-section-categories').dataset.open).toBe('yes');
  });

  it('says where each section shows, from the real layout', async () => {
    mount();
    await waitFor(() => {
      expect(screen.getByTestId('wcw-section-where-hero').textContent).toBe('Desktop + mobile');
    });
    expect(screen.getByTestId('wcw-section-where-categories').textContent).toBe('Desktop only');
  });

  it('the other four pages are one plain form, not a section list', async () => {
    mount();
    fireEvent.click(await screen.findByTestId('wcw-tab-Everywhere'));

    const form = await screen.findByTestId('wcw-form-Everywhere');
    expect(screen.queryByTestId('wcw-sections')).toBeNull();
    // Every field is visible at once — no clicking to reveal.
    expect(within(form).getByTestId('wcw-field-footer_text')).toBeTruthy();
    expect(within(form).getByTestId('wcw-field-nav_order_cta_text')).toBeTruthy();
    expect(within(form).getByTestId('wcw-group-Header')).toBeTruthy();
    expect(within(form).getByTestId('wcw-group-Site footer')).toBeTruthy();
  });

  it('switching tabs starts the new page closed', async () => {
    mount();
    fireEvent.click(await screen.findByTestId('wcw-section-toggle-cta'));
    await waitFor(() => expect(screen.getByTestId('wcw-section-cta').dataset.open).toBe('yes'));

    fireEvent.click(screen.getByTestId('wcw-tab-Legal'));
    await screen.findByTestId('wcw-form-Legal');
    fireEvent.click(screen.getByTestId('wcw-tab-Home'));

    await screen.findByTestId('wcw-sections');
    expect(screen.getByTestId('wcw-section-cta').dataset.open).toBe('no');
  });

  it('keeps Section order & visibility reachable', async () => {
    mount();
    await screen.findByTestId('wcw-sections');
    expect(screen.getByTestId('wcw-section-toggle-layout')).toBeTruthy();
  });
});
