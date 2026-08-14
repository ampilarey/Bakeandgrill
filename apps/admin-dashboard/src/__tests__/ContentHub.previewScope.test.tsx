import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
  saveContentDrafts: vi.fn(async () => ({ drafts: {}, saved_at: '2026-07-23T12:00:00Z' })),
  updateContent: vi.fn(async () => ({ blocks: [] })),
  discardContentDrafts: vi.fn(async () => ({ message: 'ok', locale: 'en', scope: 'website', deleted: 0 })),
  uploadContentImage: vi.fn(),
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

const dualBlock: ContentBlock = {
  key: 'cta_band_headline',
  label: 'CTA headline',
  group: 'Home',
  type: 'textarea',
  rich: true,
  apps: ['website', 'order_app'],
  shareable: false,
  public: true,
  shared: null,
  website: 'Website copy',
  order_app: 'Order copy',
  resolved_website: 'Website copy',
  resolved_order_app: 'Order copy',
  state: 'split',
};

describe('Content Hub preview is app-locked', () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1400 });
    vi.mocked(contentApi.getContentBlocks).mockResolvedValue({
      locale: 'en',
      locales: ['en', 'dv'],
      blocks: [dualBlock],
    });
    vi.mocked(contentApi.getContentDrafts).mockResolvedValue({ drafts: {}, saved_at: null });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('Website desktop has no Preview host; View live site instead (Stage C)', async () => {
    render(
      <MemoryRouter initialEntries={['/content/website']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    await screen.findByTestId('hub-desktop-shell');
    expect(screen.queryByTestId('preview-pane')).toBeNull();
    expect(screen.queryByTestId('preview-app-locked-website')).toBeNull();
    expect(screen.getByTestId('view-live-site')).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Editing Website/i })).toBeTruthy();
    // No docked preview → no token mint on Website desktop.
    expect(contentApi.createContentPreviewToken).not.toHaveBeenCalled();
  }, 10000);

  it('Order App hub mints only order_app preview tokens and locks the pane', async () => {
    render(
      <MemoryRouter initialEntries={['/content/order-app']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(contentApi.createContentPreviewToken).toHaveBeenCalled(), { timeout: 5000 });
    const apps = vi.mocked(contentApi.createContentPreviewToken).mock.calls.map((c) => c[0]);
    expect(apps.every((a) => a === 'order_app')).toBe(true);
    expect(apps.some((a) => a === 'website')).toBe(false);

    expect(await screen.findByTestId('preview-app-locked-order_app')).toBeTruthy();
    expect(screen.queryByTestId('preview-app-website')).toBeNull();
    expect(screen.getByRole('heading', { name: /Editing Order App/i })).toBeTruthy();
  }, 10000);
});
