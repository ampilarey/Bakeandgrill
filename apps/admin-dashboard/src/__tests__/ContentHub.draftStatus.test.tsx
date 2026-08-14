import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ContentHubPage } from '../pages/ContentHub/ContentHubPage';
import type { ContentBlock } from '../api/content';
import * as contentApi from '../api/content';

// Website desktop rev3 — page list row opens component mode (no sheet).
async function openCtaEditor() {
  fireEvent.click(await screen.findByTestId('page-list-row-cta_band_headline'));
  const editor = await screen.findByTestId('website-desktop-editor');
  await waitFor(() => expect(within(editor).getAllByTestId('rich-text-editor').length).toBeGreaterThan(0));
  return editor;
}

vi.mock('../api/content', () => ({
  getContentBlocks: vi.fn(),
  getContentSchedules: vi.fn(async () => ({ schedules: [] })),
  getContentDrafts: vi.fn(async () => ({ drafts: {}, saved_at: null })),
  saveContentDrafts: vi.fn(async () => ({ drafts: {}, saved_at: '2026-07-23T12:00:00Z' })),
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
vi.mock('../hooks/useIsMobile', () => ({ useIsMobile: () => false, useIsCompactAdmin: () => false, useIsWideDesktop: () => true }));
vi.mock('../components/ui', async () => {
  const actual = await vi.importActual<typeof import('../components/ui')>('../components/ui');
  return {
    ...actual,
    useToast: () => ({ success: vi.fn(), error: vi.fn() }),
  };
});
vi.mock('../components/MediaPicker', () => ({
  MediaPicker: () => null,
}));

const richBlock: ContentBlock = {
  key: 'cta_band_headline',
  label: 'CTA headline',
  group: 'Home',
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
};

describe('Content Hub draft vs published status', () => {
  beforeEach(() => {
    vi.mocked(contentApi.getContentBlocks).mockResolvedValue({
      locale: 'en',
      locales: ['en', 'dv'],
      blocks: [richBlock],
    });
    vi.mocked(contentApi.getContentDrafts).mockResolvedValue({ drafts: {}, saved_at: null });
    vi.mocked(contentApi.saveContentDrafts).mockResolvedValue({
      drafts: { cta_band_headline: 'Edited' },
      saved_at: '2026-07-23T12:00:00Z',
    });
    vi.mocked(contentApi.updateContent).mockResolvedValue({
      blocks: [{ ...richBlock, website: 'Ready to publish' }],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows not-yet-live wording and a reachable publish action while unpublished', async () => {
    render(
      <MemoryRouter initialEntries={['/content/website?group=Home']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    const sheet = await openCtaEditor();
    const editor = within(sheet).getAllByTestId('rich-text-editor')[0];
    editor.innerHTML = 'Edited draft';
    fireEvent.input(editor);

    const status = screen.getAllByTestId('draft-save-status')[0];
    expect(status.className).toMatch(/unpublished|busy/);
    expect(status.textContent).toMatch(/Draft saved|Saving draft/);
    expect(status.textContent).not.toMatch(/All published/);

    const publish = screen.getByTestId('publish-live-btn');
    expect(publish).toBeTruthy();
    expect(publish.textContent).toMatch(/Publish Website/i);
    expect(publish.className).toMatch(/needed/);
  });

  it('autosave does not call updateContent; publish does', async () => {
    render(
      <MemoryRouter initialEntries={['/content/website?group=Home']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    const sheet = await openCtaEditor();
    const editor = within(sheet).getAllByTestId('rich-text-editor')[0];
    editor.innerHTML = 'Autosaved only';
    fireEvent.input(editor);

    await waitFor(
      () => expect(contentApi.saveContentDrafts).toHaveBeenCalled(),
      { timeout: 5000 },
    );
    expect(contentApi.updateContent).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('publish-live-btn'));
    await waitFor(() => expect(contentApi.updateContent).toHaveBeenCalled());
  }, 10000);

  it('reads as published after publish clears dirty state', async () => {
    render(
      <MemoryRouter initialEntries={['/content/website?group=Home']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    const sheet = await openCtaEditor();
    const editor = within(sheet).getAllByTestId('rich-text-editor')[0];
    editor.innerHTML = 'Go live';
    fireEvent.input(editor);

    fireEvent.click(screen.getByTestId('publish-live-btn'));
    await waitFor(() => expect(contentApi.updateContent).toHaveBeenCalled());

    await waitFor(() => {
      const status = screen.getAllByTestId('draft-save-status')[0];
      expect(status.className).toMatch(/live/);
      expect(status.textContent).toMatch(/Website published/);
      expect(status.textContent).not.toMatch(/All published/);
      expect(status.textContent).not.toMatch(/Draft saved(?! —)/);
      expect(status.textContent).not.toMatch(/Draft not saved/);
    });
  });
});
