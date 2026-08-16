import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ContentHubPage } from '../pages/ContentHub/ContentHubPage';
import * as contentApi from '../api/content';
import * as pageBlocksApi from '../api/pageBlocks';
import type { ContentBlock } from '../api/content';

vi.mock('../hooks/useIsMobile', () => ({
  useIsMobile: () => true,
  useIsCompactAdmin: () => false,
  useIsWideDesktop: () => false,
}));

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }));

vi.mock('../components/ui', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

vi.mock('../components/MediaPicker', () => ({ MediaPicker: () => null }));

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

vi.mock('../api/pageBlocks', () => ({
  fetchAdminPageBlocks: vi.fn(async (app: string) => ({
    app,
    page: 'home',
    blocks: [],
    available_types: [],
    unknown_types: [],
    draft: true,
    version: 3,
    saved_at: null,
  })),
  reorderPageBlocks: vi.fn(),
  updatePageBlock: vi.fn(),
  deletePageBlock: vi.fn(),
  createPageBlock: vi.fn(),
  createPageBlockPreviewToken: vi.fn(),
  publishPageBlocks: vi.fn(async () => ({ draft: false, version: 0 })),
  discardPageBlockDraft: vi.fn(async () => ({ draft: false, version: 0 })),
}));

const block: ContentBlock = {
  key: 'footer_text',
  label: 'Footer text',
  group: 'Everywhere',
  type: 'text',
  apps: ['website', 'order_app'],
  shareable: true,
  public: true,
  shared: 'Hi',
  website: null,
  order_app: null,
  resolved_website: 'Hi',
  resolved_order_app: 'Hi',
  state: 'shared',
};

describe('ContentHub mobile audit fixes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.setItem('bg_hub_preview_open', '0');
    vi.mocked(contentApi.getContentBlocks).mockResolvedValue({
      locale: 'en',
      locales: ['en', 'dv'],
      blocks: [block],
    });
  });

  afterEach(() => cleanup());

  it('Website Content on a phone opens on the five pages, not a card grid', async () => {
    render(
      <MemoryRouter initialEntries={['/content/website']}>
        <ContentHubPage />
      </MemoryRouter>,
    );
    await screen.findByTestId('wcw-pagelist');
    expect(screen.getByTestId('wcw-page-Everywhere')).toBeTruthy();
    expect(screen.queryByTestId('surface-builder-landing')).toBeNull();
    expect(screen.queryByTestId('task-card-hero')).toBeNull();
  });

  it('Order App on a phone opens on its pages too, not a card grid', async () => {
    render(
      <MemoryRouter initialEntries={['/content/order-app']}>
        <ContentHubPage />
      </MemoryRouter>,
    );
    await screen.findByTestId('wcw-pagelist');
    expect(screen.getByTestId('wcw-page-Everywhere')).toBeTruthy();
    expect(screen.queryByTestId('surface-builder-landing')).toBeNull();
    expect(screen.queryByTestId('task-card-hero')).toBeNull();
  });

  it('layout-only draft still enables Publish on a phone', async () => {
    // Reordering or hiding a section is a draft even though no wording changed.
    // Publish must not sit there greyed out with that work unpublished.
    render(
      <MemoryRouter initialEntries={['/content/order-app?group=Everywhere']}>
        <ContentHubPage />
      </MemoryRouter>,
    );
    await screen.findByTestId('order-app-content-workspace');
    const publish = await screen.findByTestId('publish-live-btn-mobile');
    expect(publish.hasAttribute('disabled')).toBe(false);

    fireEvent.click(publish);
    await waitFor(() => {
      expect(pageBlocksApi.publishPageBlocks).toHaveBeenCalledWith({ app: 'order_app', version: 3 });
    });
  });

  it('More menu stays open for Discard after mousedown outside the trigger', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(
      <MemoryRouter initialEntries={['/content/order-app?group=Everywhere']}>
        <ContentHubPage />
      </MemoryRouter>,
    );
    await screen.findByTestId('order-app-content-workspace');
    fireEvent.click(screen.getByRole('button', { name: /More actions/i }));
    const menu = await screen.findByTestId('hub-more-menu-mobile');
    expect(menu).toBeTruthy();

    // Simulate the old bug: document mousedown outside moreMenuRef.
    fireEvent.mouseDown(document.body);
    expect(screen.getByTestId('hub-more-menu-mobile')).toBeTruthy();

    fireEvent.click(within(menu).getByTestId('hub-discard-draft'));
    await waitFor(() => {
      expect(pageBlocksApi.discardPageBlockDraft).toHaveBeenCalled();
    });
    confirmSpy.mockRestore();
  });

  /**
   * "preview sheet portals above the editor" was removed on 2026-08-15. The
   * Order App phone no longer stacks a preview sheet over an editor sheet —
   * there is neither sheet now, just the page and a View live site link.
   */
});
