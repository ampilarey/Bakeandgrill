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
  exportContent: vi.fn(),
  importContent: vi.fn(),
  getContentRevisions: vi.fn(async () => ({ revisions: [] })),
  restoreContentRevision: vi.fn(),
  scheduleContent: vi.fn(),
  cancelContentSchedule: vi.fn(),
  createContentPreviewToken: vi.fn(async () => ({
    token: 't', website_url: '/p', order_app_url: '/o', expires_in: 900,
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
  group: 'Homepage',
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
    const matches =
      (query === MOBILE_MEDIA_QUERY && width <= 767)
      || (query === COMPACT_ADMIN_MEDIA_QUERY && width >= 768 && width <= 1199)
      || (query === WIDE_DESKTOP_MEDIA_QUERY && width >= 1200)
      || (query.includes('max-width') && /max-width:\s*(\d+)/.test(query)
        && width <= Number(query.match(/max-width:\s*(\d+)/)?.[1]))
      || (query.includes('min-width') && /min-width:\s*(\d+)/.test(query)
        && width >= Number(query.match(/min-width:\s*(\d+)/)?.[1]));
    return {
      matches: Boolean(matches),
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
    } else if (width <= 1199) {
      const shell = await screen.findByTestId('hub-desktop-shell');
      expect(shell.getAttribute('data-rail')).toBe('collapsed');
      expect(document.querySelector('.hub-preview-pane--column')).toBeNull();
      expect(screen.getByTestId('preview-toggle')).toBeTruthy();
      expect(screen.getAllByTestId('draft-save-status').length).toBeGreaterThan(0);
    } else {
      const shell = await screen.findByTestId('hub-desktop-shell');
      expect(shell).toBeTruthy();
      expect(screen.getByTestId('preview-toggle')).toBeTruthy();
      expect(screen.getAllByTestId('draft-save-status').length).toBeGreaterThan(0);
    }
  });
});
