import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ContentHubPage } from '../pages/ContentHub/ContentHubPage';
import { blockMatchesDevice } from '../pages/ContentHub/WebsiteDesktopPageList';
import type { ContentBlock } from '../api/content';
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
  return { ...actual, useToast: () => ({ success: vi.fn(), error: vi.fn() }) };
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
    type: 'text',
    apps: ['website'] as Array<'website' | 'order_app'>,
    shareable: true,
    public: true,
    shared: (extra.shared as string) ?? 'value',
    website: null,
    order_app: null,
    resolved_website: (extra.shared as string) ?? 'value',
    resolved_order_app: 'value',
    state: 'shared' as const,
    editor: extra.editor,
  };
}

describe('Website desktop Stages C+D', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isMobileFlag = false;
    window.localStorage.clear();
    window.localStorage.setItem('bg_hub_preview_open', '1');
    vi.mocked(contentApi.getContentBlocks).mockResolvedValue({
      locale: 'en',
      locales: ['en', 'dv'],
      blocks: [
        blk('hero_slides', 'Home', { label: 'Hero', editor: 'hero', shared: '[]' }),
        blk('delivery_time', 'Home', { label: 'Delivery time' }),
        blk('trust_items', 'Home', { label: 'Trust strip', shared: '[]' }),
      ] as never,
    });
  });

  afterEach(() => cleanup());

  it('Stage C: View live site replaces Preview column on Website desktop', async () => {
    render(
      <MemoryRouter initialEntries={['/content/website']}>
        <ContentHubPage />
      </MemoryRouter>,
    );
    await screen.findByTestId('website-content-workspace');
    expect(screen.queryByTestId('hub-desktop-shell')).toBeNull();
    expect(screen.getByTestId('view-live-site')).toBeTruthy();
    expect(screen.queryByTestId('preview-toggle')).toBeNull();
    expect(screen.queryByTestId('preview-desktop-column')).toBeNull();
    expect(screen.getAllByTestId('draft-save-status').length).toBeGreaterThan(0);
  });

  it('Stage D: Desktop|Mobile filter defaults to Desktop and is toggleable', async () => {
    render(
      <MemoryRouter initialEntries={['/content/website']}>
        <ContentHubPage />
      </MemoryRouter>,
    );
    // The Desktop|Mobile switch now chooses which device's Home layout the
    // "Section order & visibility" editor arranges. The settings themselves are
    // the same list on both devices, so it no longer filters fields.
    await screen.findByTestId('website-device-filter');
    expect(screen.getByTestId('website-device-filter-desktop').getAttribute('aria-pressed')).toBe('true');

    await screen.findByTestId('wcw-sections');
    expect(screen.getByTestId('wcw-section-hero')).toBeTruthy();

    fireEvent.click(screen.getByTestId('website-device-filter-mobile'));
    await waitFor(() => {
      expect(screen.getByTestId('website-device-filter-mobile').getAttribute('aria-pressed')).toBe('true');
    });
    // Switching device does not hide any setting.
    expect(screen.getByTestId('wcw-section-hero')).toBeTruthy();
    expect(screen.getByTestId('wcw-field-hero_slides')).toBeTruthy();
  });

  it('Stage D: blockMatchesDevice hides mobile-only keys on Desktop', () => {
    const mobileOnly = {
      key: 'mobile_bottom_nav_label',
      label: 'Mobile only tab',
    } as ContentBlock;
    const desktopOnly = {
      key: 'desktop_header_cta',
      label: 'Desktop header',
    } as ContentBlock;
    const shared = { key: 'hero_slides', label: 'Hero' } as ContentBlock;
    expect(blockMatchesDevice(mobileOnly, 'desktop')).toBe(false);
    expect(blockMatchesDevice(mobileOnly, 'mobile')).toBe(true);
    expect(blockMatchesDevice(desktopOnly, 'mobile')).toBe(false);
    expect(blockMatchesDevice(desktopOnly, 'desktop')).toBe(true);
    expect(blockMatchesDevice(shared, 'desktop')).toBe(true);
    expect(blockMatchesDevice(shared, 'mobile')).toBe(true);
  });

  it('Order App desktop still has Preview toggle (HubPreviewHost preserved)', async () => {
    render(
      <MemoryRouter initialEntries={['/content/order-app']}>
        <ContentHubPage />
      </MemoryRouter>,
    );
    await screen.findByTestId('surface-builder-landing');
    expect(screen.getByTestId('preview-toggle')).toBeTruthy();
    expect(screen.queryByTestId('view-live-site')).toBeNull();
    expect(screen.queryByTestId('website-device-filter')).toBeNull();
  });
});
