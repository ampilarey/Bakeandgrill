import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ContentHubPage } from '../pages/ContentHub/ContentHubPage';
import type { ContentBlock } from '../api/content';
import * as contentApi from '../api/content';
import {
  COMPACT_ADMIN_MEDIA_QUERY,
  MOBILE_MEDIA_QUERY,
  WIDE_DESKTOP_MEDIA_QUERY,
} from '../hooks/useIsMobile';

vi.mock('../api/content', () => ({
  getContentBlocks: vi.fn(),
  getContentSchedules: vi.fn(async () => ({ schedules: [] })),
  getContentDrafts: vi.fn(async () => ({ drafts: {}, saved_at: null })),
  saveContentDrafts: vi.fn(async () => ({ drafts: {}, saved_at: null })),
  updateContent: vi.fn(async () => ({ blocks: [] })),
  uploadContentImage: vi.fn(),
  uploadContentFont: vi.fn(),
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

const block: ContentBlock = {
  key: 'cta_band_headline',
  label: 'CTA headline',
  group: 'Home',
  type: 'textarea',
  rich: true,
  apps: ['website'],
  shareable: false,
  public: true,
  shared: null,
  website: 'Hello',
  order_app: null,
  resolved_website: 'Hello',
  resolved_order_app: null,
  state: 'split',
};

function mockViewport(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  window.matchMedia = vi.fn().mockImplementation((query: string) => {
    // Prefer exact band queries; for others require min AND max when both present
    // so compact `(min-width: 768px) and (max-width: 1199px)` is never true at 1200+.
    const max = /max-width:\s*(\d+)/.exec(query);
    const min = /min-width:\s*(\d+)/.exec(query);
    let matches = false;
    if (query === MOBILE_MEDIA_QUERY) matches = width <= 767;
    else if (query === COMPACT_ADMIN_MEDIA_QUERY) matches = width >= 768 && width <= 1199;
    else if (query === WIDE_DESKTOP_MEDIA_QUERY) matches = width >= 1200;
    else if (max && min) matches = width >= Number(min[1]) && width <= Number(max[1]);
    else if (max) matches = width <= Number(max[1]);
    else if (min) matches = width >= Number(min[1]);
    return {
      matches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onchange: null,
    };
  });
}

const WIDTHS = [320, 375, 390, 414, 767, 768, 1024, 1199, 1200, 1366];

describe('Content Hub responsive bands', () => {
  beforeEach(() => {
    vi.mocked(contentApi.getContentBlocks).mockResolvedValue({
      locale: 'en',
      locales: ['en', 'dv'],
      blocks: [block],
    });
    vi.mocked(contentApi.getContentDrafts).mockResolvedValue({ drafts: {}, saved_at: null });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it.each(WIDTHS)('renders without horizontal overflow affordances at %ipx', async (width) => {
    mockViewport(width);
    const { container } = render(
      <MemoryRouter initialEntries={['/content/website']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(contentApi.getContentBlocks).toHaveBeenCalled());

    const page = container.querySelector('.hub-page, .content-studio-page') as HTMLElement | null;
    expect(page).toBeTruthy();
    // Document root should not force a min-width wider than the band.
    expect(page!.scrollWidth).toBeLessThanOrEqual(Math.max(page!.clientWidth + 1, width + 1) || width);

    if (width <= 767) {
      expect(screen.queryByTestId('hub-desktop-shell')).toBeNull();
      expect(screen.getAllByTestId('draft-save-status').length).toBeGreaterThan(0);
    } else {
      // Website desktop is the page-tab workspace: no rail, no docked preview.
      await screen.findByTestId('website-content-workspace');
      expect(screen.queryByTestId('hub-desktop-shell')).toBeNull();
      expect(document.querySelector('.hub-preview-pane--column')).toBeNull();
      expect(screen.queryByTestId('preview-toggle')).toBeNull();
      expect(screen.getByTestId('view-live-site')).toBeTruthy();
      expect(screen.getAllByTestId('draft-save-status').length).toBeGreaterThan(0);

      const tabs = screen.getByRole('tablist', { name: /website pages/i });
      expect(tabs.scrollWidth).toBeLessThanOrEqual(Math.max(tabs.clientWidth, width) + 1);
    }
  });

  /**
   * The Order App moved onto the same page-tab workspace as the website
   * (owner, 2026-08-15: "Let's start order app"), so it made the same trade:
   * no docked preview column, a "View live site" link instead. What still has
   * to hold at every width is that nothing scrolls sideways.
   */
  it.each(WIDTHS)('Order App has no sideways scroll and no docked preview @ %ipx', async (width) => {
    mockViewport(width);
    window.localStorage.setItem('bg_hub_preview_open', '1');
    const { container } = render(
      <MemoryRouter initialEntries={['/content/order-app?group=Home']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    await screen.findByTestId('order-app-content-workspace');

    const page = container.querySelector('.hub-page, .content-studio-page') as HTMLElement | null;
    expect(page).toBeTruthy();
    expect(page!.scrollWidth).toBeLessThanOrEqual(Math.max(page!.clientWidth + 1, width + 1) || width);

    expect(screen.queryByTestId('hub-desktop-shell')).toBeNull();
    expect(document.querySelector('.hub-preview-pane--column')).toBeNull();
    expect(screen.queryByTestId('preview-toggle')).toBeNull();

    if (width > 767) {
      const tabs = screen.getByRole('tablist', { name: /order app screens/i });
      expect(tabs.scrollWidth).toBeLessThanOrEqual(Math.max(tabs.clientWidth, width) + 1);
    }
  });
});
