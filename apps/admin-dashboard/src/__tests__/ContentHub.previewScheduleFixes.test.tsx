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
      ReactMod.useEffect(() => {
        layoutSignalHandler = onLayoutDraftChange ?? null;
        onLayoutDraftChange?.({ hasDraft: true, revision: 3 });
      }, [onLayoutDraftChange]);
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
  key: 'cta_band_headline',
  label: 'CTA headline',
  group: 'Homepage',
  type: 'textarea',
  rich: true,
  apps: ['website', 'order_app'],
  shareable: true,
  public: true,
  shared: null,
  website: 'Hello',
  order_app: null,
  resolved_website: 'Hello',
  resolved_order_app: 'Hello',
  state: 'split',
  link_state: 'different',
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

  it('remints docked preview tokens when the Home layout draft revision changes', async () => {
    openHub('/content/website?group=Homepage');
    await screen.findByTestId('home-layout-editor-stub');

    await waitFor(() => {
      expect(contentApi.createContentPreviewToken).toHaveBeenCalled();
    });
    const callsAfterMount = vi.mocked(contentApi.createContentPreviewToken).mock.calls.length;

    expect(layoutSignalHandler).toBeTruthy();
    layoutSignalHandler?.({ hasDraft: true, revision: 4 });

    await waitFor(
      () => {
        expect(vi.mocked(contentApi.createContentPreviewToken).mock.calls.length).toBeGreaterThan(callsAfterMount);
      },
      { timeout: 3000 },
    );
    const calls = vi.mocked(contentApi.createContentPreviewToken).mock.calls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall?.[3]).toBe(true); // includeLayout
  });

  it('schedules content, warns about layout drafts, and clears local draft state', async () => {
    vi.mocked(contentApi.getContentDrafts).mockImplementation(async (scope) => {
      if (scope === 'website') {
        return { drafts: { cta_band_headline: 'Draft headline' } as Record<string, string>, saved_at: '2026-08-12T12:00:00Z' };
      }
      return { drafts: {} as Record<string, string>, saved_at: null };
    });

    openHub('/content/website?group=Homepage');
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
      const status = screen.getByTestId('draft-save-status');
      expect(status.textContent).toMatch(/1 change waiting|Draft saved/i);
    });

    confirmSpy.mockRestore();
  });
});
