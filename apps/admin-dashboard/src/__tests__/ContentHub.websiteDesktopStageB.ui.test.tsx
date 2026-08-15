import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ContentHubPage } from '../pages/ContentHub/ContentHubPage';
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
vi.mock('../components/ui', async () => {
  const actual = await vi.importActual<typeof import('../components/ui')>('../components/ui');
  return {
    ...actual,
    useToast: () => ({ success: vi.fn(), error: vi.fn() }),
  };
});
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

function blk(key: string, group: string, extra: Record<string, unknown> = {}) {
  return {
    key,
    label: (extra.label as string) || key,
    group,
    type: (extra.type as string) || 'text',
    editor: extra.editor,
    apps: ['website'] as Array<'website' | 'order_app'>,
    shareable: true,
    public: true,
    shared: (extra.shared as string) ?? 'value',
    website: null,
    order_app: null,
    resolved_website: (extra.shared as string) ?? 'value',
    resolved_order_app: 'value',
    state: 'shared' as const,
    managed_by: extra.managed_by,
  };
}

describe('Website desktop Stage B — page list with summaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isMobileFlag = false;
    window.localStorage.clear();
    window.localStorage.setItem('bg_hub_preview_open', '0');
    vi.mocked(contentApi.getContentBlocks).mockResolvedValue({
      locale: 'en',
      locales: ['en', 'dv'],
      blocks: [
        blk('hero_slides', 'Hero', {
          label: 'Hero banners',
          editor: 'hero',
          type: 'json',
          shared: JSON.stringify([{ title: 'Breakfast your grandmother made', showing: true }]),
        }),
        blk('trust_items', 'Homepage', {
          label: 'Trust strip',
          editor: 'trust',
          type: 'json',
          shared: JSON.stringify([{ heading: 'Fresh daily' }, { heading: 'Local' }]),
        }),
        blk('contact_page_title', 'Pages', { label: 'Contact page title', shared: 'Find us' }),
        blk('maps_embed_url', 'Pages', {
          label: 'Maps embed',
          managed_by: {
            owner_label: 'Business Details',
            owner_path: '/admin/business-details',
            note: 'Ops',
            current_value: 'https://maps.example',
          },
        }),
        blk('homepage_categories', 'Homepage', {
          label: 'Categories',
          editor: 'categories',
          type: 'json',
          shared: '[]',
        }),
      ] as never,
    });
  });

  afterEach(() => cleanup());

  it('names Home sections in words and never shows a raw content key', async () => {
    render(
      <MemoryRouter initialEntries={['/content/website']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    const sections = await screen.findByTestId('wcw-sections');
    expect(sections.textContent).toMatch(/Hero banner/);
    expect(sections.textContent).toMatch(/Trust strip/);
    expect(sections.textContent).not.toMatch(/hero_slides/);
    expect(sections.textContent).not.toMatch(/trust_items/);

    // Opening a section shows what it currently says, in its own editor.
    fireEvent.click(screen.getByTestId('wcw-section-toggle-trust'));
    const body = await screen.findByTestId('wcw-section-body-trust');
    expect(within(body).getByDisplayValue('Fresh daily')).toBeTruthy();

    // Opening one closes the other — the work area is never split.
    expect(screen.getByTestId('wcw-section-hero').getAttribute('data-open')).toBe('no');
    expect(screen.queryByTestId('website-desktop-page-list')).toBeNull();
    expect(screen.queryByTestId('section-editor')).toBeNull();
  });

  it('shows ops-owned rows as Managed elsewhere with owner link', async () => {
    render(
      <MemoryRouter initialEntries={['/content/website?group=Contact%20page']}>
        <ContentHubPage />
      </MemoryRouter>,
    );
    await screen.findByTestId('wcw-form-Contact page');
    const field = screen.getByTestId('wcw-field-maps_embed_url');
    expect(within(field).getByTestId('ops-owned-maps_embed_url')).toBeTruthy();
    expect(field.querySelector('.wcw-field-owner')?.textContent).toMatch(/Business Details/);
    expect(within(field).queryByRole('textbox')).toBeNull();
  });

  it('does not change Order App desktop (no page list)', async () => {
    render(
      <MemoryRouter initialEntries={['/content/order-app']}>
        <ContentHubPage />
      </MemoryRouter>,
    );
    expect(await screen.findByTestId('surface-builder-landing')).toBeTruthy();
    expect(screen.queryByTestId('website-desktop-page-list')).toBeNull();
  });
});
