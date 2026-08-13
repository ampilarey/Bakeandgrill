import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  it.each([768, 1024, 1199] as const)(
    'compact Admin preview toggle opens a sheet, never a docked column @ %ipx',
    async (width) => {
      mockViewport(width);
      window.localStorage.setItem('bg_hub_preview_open', '0');
      render(
        <MemoryRouter initialEntries={['/content/website?group=Home']}>
          <ContentHubPage />
        </MemoryRouter>,
      );
      await screen.findByTestId('hub-desktop-shell');
      expect(document.querySelector('.hub-preview-pane--column')).toBeNull();

      fireEvent.click(screen.getByTestId('preview-toggle'));
      await waitFor(() => {
        expect(screen.getByTestId('preview-sheet')).toBeTruthy();
      });
      expect(document.querySelector('.hub-preview-pane--column')).toBeNull();
    },
  );

  it.each([1200, 1366] as const)(
    'wide desktop preview toggle docks a column @ %ipx',
    async (width) => {
      mockViewport(width);
      window.localStorage.setItem('bg_hub_preview_open', '0');
      render(
        <MemoryRouter initialEntries={['/content/website?group=Home']}>
          <ContentHubPage />
        </MemoryRouter>,
      );
      await screen.findByTestId('hub-desktop-shell');
      expect(document.querySelector('.hub-preview-pane--column')).toBeNull();

      fireEvent.click(screen.getByTestId('preview-toggle'));
      await waitFor(() => {
        expect(document.querySelector('.hub-preview-pane--column')).toBeTruthy();
      });
      expect(screen.queryByTestId('preview-sheet')).toBeNull();
    },
  );
});
