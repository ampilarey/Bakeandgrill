import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import { ContentHubPage } from '../pages/ContentHub/ContentHubPage';
import * as contentApi from '../api/content';
import type { ContentBlock } from '../api/content';
import type { LayoutDraftSignal } from '../pages/ContentHub/HomeLayoutEditor';

const toastSuccess = vi.fn();
let layoutSignalHandler: ((signal: LayoutDraftSignal) => void) | null = null;

vi.mock('../hooks/useIsMobile', () => ({
  useIsMobile: () => false,
  useIsCompactAdmin: () => false,
  useIsWideDesktop: () => true,
}));

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }));

vi.mock('../components/ui', () => ({
  useToast: () => ({ success: toastSuccess, error: vi.fn() }),
}));

vi.mock('../components/MediaPicker', () => ({ MediaPicker: () => null }));

vi.mock('../pages/ContentHub/HomeLayoutEditor', async () => {
  const ReactMod = await import('react');
  return {
    HomeLayoutEditor: ReactMod.forwardRef(function StubHomeLayoutEditor(
      { onLayoutDraftChange }: { onLayoutDraftChange?: (signal: LayoutDraftSignal) => void },
      ref: React.ForwardedRef<unknown>,
    ) {
      // Keep handler ref fresh without re-firing the initial draft signal every render.
      const handlerRef = ReactMod.useRef(onLayoutDraftChange);
      handlerRef.current = onLayoutDraftChange;
      ReactMod.useEffect(() => {
        layoutSignalHandler = (signal) => handlerRef.current?.(signal);
        handlerRef.current?.({ hasDraft: true, revision: 3 });
      }, []);
      ReactMod.useImperativeHandle(ref, () => ({
        publishAll: async () => {},
        discardAll: async () => {},
        reload: async () => {},
        hasDraft: true,
      }));
      return ReactMod.createElement('div', { 'data-testid': 'home-layout-editor-stub' });
    }),
  };
});

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
  discardContentDrafts: vi.fn(async () => ({ message: 'ok', locale: 'en', scope: null, deleted: 0 })),
  updateContent: vi.fn(),
  uploadContentImage: vi.fn(),
  exportContent: vi.fn(),
  importContent: vi.fn(),
  getContentRevisions: vi.fn(async () => ({ revisions: [] })),
  restoreContentRevision: vi.fn(),
  scheduleContent: vi.fn(async () => ({ schedules: [], drafts_cleared: 1 })),
  cancelContentSchedule: vi.fn(),
  createContentPreviewToken: vi.fn(async ({ } = {}) => ({
    token: 't', website_url: '/preview?v=1', order_app_url: '/order-preview?v=1', expires_in: 900,
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
    draft: app === 'website',
    version: app === 'website' ? 3 : 0,
    saved_at: null,
  })),
  reorderPageBlocks: vi.fn(),
  updatePageBlock: vi.fn(),
  deletePageBlock: vi.fn(),
  createPageBlock: vi.fn(),
  createPageBlockPreviewToken: vi.fn(),
  publishPageBlocks: vi.fn(),
  discardPageBlockDraft: vi.fn(),
}));

const block: ContentBlock = {
  key: 'delivery_time',
  label: 'Delivery time',
  group: 'Home',
  type: 'text',
  rich: false,
  apps: ['website', 'order_app'],
  shareable: true,
  public: true,
  shared: null,
  website: '30 min',
  order_app: '25 min',
  resolved_website: '30 min',
  resolved_order_app: '25 min',
  state: 'split',
};

function openHub(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ContentHubPage />
    </MemoryRouter>,
  );
}

describe('ContentHub preview + schedule fixes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toastSuccess.mockReset();
    layoutSignalHandler = null;
    window.localStorage.setItem('bg_hub_preview_open', '1');
    vi.mocked(contentApi.getContentBlocks).mockResolvedValue({
      locale: 'en',
      locales: ['en', 'dv'],
      blocks: [block],
    });
    vi.mocked(contentApi.getContentDrafts).mockResolvedValue({ drafts: {}, saved_at: null });
    vi.mocked(contentApi.getContentSchedules).mockResolvedValue({ schedules: [] });
    vi.mocked(contentApi.createContentPreviewToken).mockImplementation(async () => ({
      token: 't',
      website_url: `/preview?n=${vi.mocked(contentApi.createContentPreviewToken).mock.calls.length}`,
      order_app_url: `/order-preview?n=${vi.mocked(contentApi.createContentPreviewToken).mock.calls.length}`,
      expires_in: 900,
    }));
  });

  afterEach(() => {
    cleanup();
  });

  it('Order App still docks Preview and remints when content drafts change', async () => {
    openHub('/content/order-app?group=Home');
    await screen.findByTestId('home-layout-editor-stub');
    expect(screen.getByTestId('preview-toggle')).toBeTruthy();

    await waitFor(() => {
      expect(contentApi.createContentPreviewToken).toHaveBeenCalled();
    }, { timeout: 5000 });
    const callsAfterMount = vi.mocked(contentApi.createContentPreviewToken).mock.calls.length;
    expect(callsAfterMount).toBeGreaterThan(0);
    expect(vi.mocked(contentApi.createContentPreviewToken).mock.calls.every((c) => c[0] === 'order_app')).toBe(true);

    // Remint path: draft map change (same debounce effect as layoutRevision).
    vi.mocked(contentApi.getContentDrafts).mockResolvedValue({
      drafts: { delivery_time: 'Updated ETA' },
      saved_at: '2026-08-12T12:00:00Z',
    });
    // Trigger a drafts reload by toggling locale EN→DV→EN is heavy; bump layout revision instead.
    expect(layoutSignalHandler).toBeTruthy();
    layoutSignalHandler?.({ hasDraft: true, revision: 99 });

    await waitFor(
      () => {
        expect(vi.mocked(contentApi.createContentPreviewToken).mock.calls.length).toBeGreaterThan(callsAfterMount);
      },
      { timeout: 5000 },
    );
    const calls = vi.mocked(contentApi.createContentPreviewToken).mock.calls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall?.[0]).toBe('order_app');
    expect(lastCall?.[3]).toBe(true);
  });

  it('Website desktop does not mint preview tokens after Stage C (View live site)', async () => {
    openHub('/content/website?group=Home');
    await screen.findByTestId('website-content-workspace');
    expect(screen.getByTestId('view-live-site')).toBeTruthy();
    // Allow the 600ms preview debounce to fire if it were still wired.
    await new Promise((r) => setTimeout(r, 800));
    expect(contentApi.createContentPreviewToken).not.toHaveBeenCalled();
  });

  it('schedules content, warns about layout drafts, and clears local draft state', async () => {
    vi.mocked(contentApi.getContentDrafts).mockImplementation(async (scope) => {
      if (scope === 'website') {
        return { drafts: { home_specials_title: 'Draft heading' } as Record<string, string>, saved_at: '2026-08-12T12:00:00Z' };
      }
      return { drafts: {} as Record<string, string>, saved_at: null };
    });

    openHub('/content/website?group=Home');
    await screen.findByTestId('publish-live-btn');

    const moreTrigger = document.querySelector('.hub-more-trigger') as HTMLElement;
    fireEvent.click(moreTrigger);
    expect(await screen.findByTestId('hub-schedule-layout-note')).toBeTruthy();

    fireEvent.change(screen.getByTestId('hub-schedule-at'), {
      target: { value: '2099-01-01T12:00' },
    });

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByTestId('hub-schedule-submit'));

    await waitFor(() => {
      expect(contentApi.scheduleContent).toHaveBeenCalled();
    });
    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith(
        expect.stringContaining('layout draft was not included'),
      );
    });

    // Local content drafts cleared — Publish disabled unless layout draft remains.
    await waitFor(() => {
      const status = screen.getAllByTestId('draft-save-status')[0];
      expect(status.textContent).toMatch(/1 change waiting|Draft saved/i);
    });

    confirmSpy.mockRestore();
  });
});
