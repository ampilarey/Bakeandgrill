import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppContentEditor } from '../pages/ContentStudio/AppContentEditor';
import type { ContentBlock } from '../api/content';
import * as contentApi from '../api/content';

vi.mock('../api/content', () => ({
  getContentBlocks: vi.fn(),
  getContentSchedules: vi.fn(async () => ({ schedules: [] })),
  getContentDrafts: vi.fn(async () => ({ drafts: {}, saved_at: null })),
  saveContentDrafts: vi.fn(async () => ({ drafts: {}, saved_at: '2026-07-23T12:00:00Z' })),
  updateContent: vi.fn(async () => ({ blocks: [] })),
  shareContentBlock: vi.fn(),
  splitContentBlock: vi.fn(),
  copyContentBlock: vi.fn(),
  copyContentSection: vi.fn(),
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
  return {
    ...actual,
    useToast: () => ({ success: vi.fn(), error: vi.fn() }),
  };
});

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
};

describe('Content Studio autosave + WYSIWYG', () => {
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
    vi.clearAllMocks();
  });

  // Real timers only — fake timers in this file previously timed out sibling suites.
  it('renders WYSIWYG for rich blocks and autosaves drafts', async () => {
    render(
      <MemoryRouter>
        <AppContentEditor app="website" />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByTestId('rich-text-editor')).toBeTruthy());

    const editor = screen.getByTestId('rich-text-editor');
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
      <MemoryRouter>
        <AppContentEditor app="website" />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByTestId('rich-text-editor')).toBeTruthy());
    const editor = screen.getByTestId('rich-text-editor');
    editor.innerHTML = 'Ready to publish';
    fireEvent.input(editor);

    const publishBtns = screen.getAllByRole('button', { name: /Publish/i });
    fireEvent.click(publishBtns[0]);

    await waitFor(() => expect(contentApi.updateContent).toHaveBeenCalled());
  });

  it('registers beforeunload when there are dirty drafts', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    render(
      <MemoryRouter>
        <AppContentEditor app="website" />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByTestId('rich-text-editor')).toBeTruthy());
    const editor = screen.getByTestId('rich-text-editor');
    editor.innerHTML = 'dirty';
    fireEvent.input(editor);

    expect(addSpy.mock.calls.some((c) => c[0] === 'beforeunload')).toBe(true);
    addSpy.mockRestore();
  });
});
