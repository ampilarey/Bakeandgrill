import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ContentHubPage } from '../pages/ContentHub/ContentHubPage';
import type { ContentBlock } from '../api/content';
import * as contentApi from '../api/content';

async function openCtaEditor() {
  fireEvent.click(await screen.findByTestId('edit-cta_band_headline'));
  const sheet = await screen.findByTestId('block-editor-sheet-cta_band_headline');
  await waitFor(() => expect(within(sheet).getAllByTestId('rich-text-editor').length).toBeGreaterThan(0));
  return sheet;
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
  uploadContentVideo: vi.fn(),
}));

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }));
vi.mock('../hooks/useIsMobile', () => ({ useIsMobile: () => false }));
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

describe('Content Hub autosave + WYSIWYG', () => {
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
    vi.mocked(contentApi.updateContent).mockResolvedValue({ blocks: [richBlock] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('renders WYSIWYG for rich blocks and autosaves drafts', async () => {
    render(
      <MemoryRouter initialEntries={['/content/website?group=Homepage']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    const sheet = await openCtaEditor();
    const editor = within(sheet).getAllByTestId('rich-text-editor')[0];
    editor.innerHTML = 'Edited draft';
    fireEvent.input(editor);

    await waitFor(
      () => {
        expect(contentApi.saveContentDrafts).toHaveBeenCalled();
      },
      { timeout: 5000 },
    );

    const calls = vi.mocked(contentApi.saveContentDrafts).mock.calls;
    const [changes] = calls[calls.length - 1];
    expect(changes[0].scope).toBe('website');
    expect(changes[0].key).toBe('cta_band_headline');
  }, 10000);

  it('publish promotes via updateContent', async () => {
    render(
      <MemoryRouter initialEntries={['/content/website?group=Homepage']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    const sheet = await openCtaEditor();
    const editor = within(sheet).getAllByTestId('rich-text-editor')[0];
    editor.innerHTML = 'Ready to publish';
    fireEvent.input(editor);

    const publishBtns = screen.getAllByRole('button', { name: /Publish/i });
    fireEvent.click(publishBtns[0]);

    await waitFor(() => expect(contentApi.updateContent).toHaveBeenCalled());
  });

  it('registers beforeunload when there are dirty drafts', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    render(
      <MemoryRouter initialEntries={['/content/website?group=Homepage']}>
        <ContentHubPage />
      </MemoryRouter>,
    );
    const sheet = await openCtaEditor();
    const editor = within(sheet).getAllByTestId('rich-text-editor')[0];
    editor.innerHTML = 'dirty';
    fireEvent.input(editor);

    expect(addSpy.mock.calls.some((c) => c[0] === 'beforeunload')).toBe(true);
    addSpy.mockRestore();
  });

  it('ignores stale autosave responses after a newer draft change', async () => {
    let resolveFirst: (value: { drafts: Record<string, string>; saved_at: string }) => void = () => {};
    let resolveSecond: (value: { drafts: Record<string, string>; saved_at: string }) => void = () => {};
    vi.mocked(contentApi.saveContentDrafts)
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve; }));

    render(
      <MemoryRouter initialEntries={['/content/website?group=Homepage']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    const sheet = await openCtaEditor();
    const editor = within(sheet).getAllByTestId('rich-text-editor')[0];

    editor.innerHTML = 'First draft';
    fireEvent.input(editor);
    await waitFor(() => expect(contentApi.saveContentDrafts).toHaveBeenCalledTimes(1), { timeout: 5000 });

    editor.innerHTML = 'Second draft';
    fireEvent.input(editor);
    await waitFor(() => expect(contentApi.saveContentDrafts).toHaveBeenCalledTimes(2), { timeout: 5000 });

    await act(async () => {
      resolveSecond({ drafts: { cta_band_headline: 'Second draft' }, saved_at: '2026-07-23T11:00:00Z' });
    });
    await waitFor(() => {
      expect(screen.getAllByTestId('draft-save-status')[0].textContent).toMatch(/11:/);
    });

    await act(async () => {
      resolveFirst({ drafts: { cta_band_headline: 'First draft' }, saved_at: '2026-07-23T10:00:00Z' });
    });

    expect(screen.getAllByTestId('draft-save-status')[0].textContent).toMatch(/11:/);
    expect(screen.getAllByTestId('draft-save-status')[0].textContent).not.toMatch(/10:/);
  }, 12000);
});
