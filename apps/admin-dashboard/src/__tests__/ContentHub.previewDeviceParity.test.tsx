/**
 * Matrix row 13 — Preview resolves the same app, device, surface as the editor.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ContentHubPage } from '../pages/ContentHub/ContentHubPage';
import type { ContentBlock } from '../api/content';
import * as contentApi from '../api/content';

vi.mock('../api/content', () => ({
  getContentIntegrity: vi.fn(async () => ({
    generated_at: '2026-08-13T00:00:00Z',
    surfaces: [],
    issues: [],
    needs_review: [],
    summary: { issue_count: 0, needs_review_count: 0, surface_count: 14 },
  })),
  getContentBlocks: vi.fn(),
  getContentSchedules: vi.fn(async () => ({ schedules: [] })),
  getContentDrafts: vi.fn(async () => ({ drafts: {}, saved_at: null })),
  saveContentDrafts: vi.fn(async () => ({ drafts: {}, saved_at: null })),
  updateContent: vi.fn(async () => ({ blocks: [] })),
  discardContentDrafts: vi.fn(async () => ({ message: 'ok', locale: 'en', scope: 'website', deleted: 0 })),
  uploadContentImage: vi.fn(),
  uploadContentFont: vi.fn(),
  exportContent: vi.fn(async () => ({ version: 1, exported_at: '', locale: 'en', entries: [] })),
  importContent: vi.fn(),
  getContentRevisions: vi.fn(async () => ({ revisions: [] })),
  restoreContentRevision: vi.fn(),
  scheduleContent: vi.fn(),
  cancelContentSchedule: vi.fn(),
  createContentPreviewToken: vi.fn(async (app: string) => ({
    token: `t-${app}`,
    website_url: app === 'website' ? '/preview/website' : '',
    order_app_url: app === 'order_app' ? '/preview/order' : '',
    expires_in: 900,
  })),
  uploadContentVideo: vi.fn(),
}));

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }));
vi.mock('../hooks/useIsMobile', () => ({
  useIsMobile: () => false,
  useIsCompactAdmin: () => false,
  useIsWideDesktop: () => true,
}));
vi.mock('../components/ui', async () => {
  const actual = await vi.importActual<typeof import('../components/ui')>('../components/ui');
  return { ...actual, useToast: () => ({ success: vi.fn(), error: vi.fn() }) };
});
vi.mock('../components/MediaPicker', () => ({ MediaPicker: () => null }));
vi.mock('../api/pageBlocks', () => ({
  fetchAdminPageBlocks: vi.fn(async () => ({
    blocks: [],
    version: 0,
    draft: null,
    library: [],
  })),
  publishPageBlocks: vi.fn(),
  discardPageBlockDraft: vi.fn(),
  createPageBlockPreviewToken: vi.fn(),
  savePageBlockDraft: vi.fn(),
  addPageBlock: vi.fn(),
  removePageBlock: vi.fn(),
  updatePageBlock: vi.fn(),
  reorderPageBlocks: vi.fn(),
}));

const heroBlock: ContentBlock = {
  key: 'hero_slides',
  label: 'Hero slides',
  group: 'Home',
  type: 'json',
  editor: 'hero',
  rich: false,
  apps: ['website', 'order_app'],
  shareable: false,
  public: true,
  shared: null,
  website: '[{"showing":true,"image":"/h.jpg","title":"Hello","cta_text":"Go"}]',
  order_app: '[{"showing":true,"image":"/h.jpg","title":"Hello","cta_text":"Go"}]',
  resolved_website: '[{"showing":true,"image":"/h.jpg","title":"Hello","cta_text":"Go"}]',
  resolved_order_app: '[{"showing":true,"image":"/h.jpg","title":"Hello","cta_text":"Go"}]',
  state: 'split',
};

describe('Content Hub preview device parity (matrix 13)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem('bg_hub_preview_open', '1');
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1400 });
    vi.mocked(contentApi.getContentBlocks).mockResolvedValue({
      locale: 'en',
      locales: ['en', 'dv'],
      blocks: [heroBlock],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('Website desktop: device filter replaces docked preview device lock (Stage D)', async () => {
    render(
      <MemoryRouter initialEntries={['/content/website?group=Home&surface=website.desktop.home']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    await screen.findByTestId('website-device-filter');
    expect(screen.queryByTestId('preview-pane')).toBeNull();
    expect(screen.getByTestId('website-device-filter-desktop').getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByTestId('website-device-filter-mobile'));
    await waitFor(() => {
      expect(screen.getByTestId('website-device-filter-mobile').getAttribute('aria-pressed')).toBe('true');
    });
  }, 10000);

  /**
   * The Order App's three docked-preview tests were removed on 2026-08-15.
   * It moved onto the same page-tab workspace as the website, which has no
   * preview pane to lock a device on — the Desktop|Mobile filter above does
   * that job for both hubs now. Nothing here was silently dropped: the
   * behaviour itself is gone, so a passing test for it would have been fiction.
   */
});
