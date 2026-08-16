import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ContentHubPage } from '../pages/ContentHub/ContentHubPage';
import type { ContentBlock } from '../api/content';
import * as contentApi from '../api/content';
import { ApiRequestError } from '@shared/api';

// Website desktop opens the section in place; Order App keeps the
// compact-card + focused-sheet pattern.
/**
 * Both hubs now use the same page-tab workspace, so "open the offers headline"
 * is one path: expand Today's Specials on Home and edit it in place.
 */
async function openCtaEditor() {
  fireEvent.click(await screen.findByTestId('wcw-section-toggle-specials'));
  const editor = await screen.findByTestId('wcw-field-offers_headline');
  await waitFor(() => expect(within(editor).getAllByTestId('rich-text-editor').length).toBeGreaterThan(0));
  return editor;
}

const toast = { success: vi.fn(), error: vi.fn() };

vi.mock('../api/content', () => ({
  getContentBlocks: vi.fn(),
  getContentSchedules: vi.fn(async () => ({ schedules: [] })),
  getContentDrafts: vi.fn(async () => ({ drafts: {}, saved_at: null })),
  saveContentDrafts: vi.fn(async () => ({ drafts: {}, saved_at: '2026-07-23T12:00:00Z' })),
  updateContent: vi.fn(async () => ({ blocks: [] })),
  discardContentDrafts: vi.fn(async () => ({ message: 'ok', locale: 'en', scope: 'website', deleted: 0 })),
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
vi.mock('../hooks/useIsMobile', () => ({
  useIsMobile: () => false,
  useIsCompactAdmin: () => false,
  useIsWideDesktop: () => true,
}));
vi.mock('../components/ui', async () => {
  const actual = await vi.importActual<typeof import('../components/ui')>('../components/ui');
  return {
    ...actual,
    useToast: () => toast,
  };
});
vi.mock('../components/MediaPicker', () => ({ MediaPicker: () => null }));

const websiteBlock: ContentBlock = {
  key: 'offers_headline',
  label: 'Offers headline',
  group: 'Home',
  type: 'textarea',
  rich: true,
  apps: ['website', 'order_app'],
  shareable: false,
  public: true,
  shared: null,
  website: 'Website live',
  order_app: 'Order live',
  resolved_website: 'Website live',
  resolved_order_app: 'Order live',
  state: 'split',
};

const heroBlock: ContentBlock = {
  key: 'hero_slides',
  label: 'Hero Slides',
  group: 'Home',
  type: 'json',
  editor: 'hero',
  apps: ['website', 'order_app'],
  shareable: false,
  public: true,
  shared: null,
  website: JSON.stringify([{ title: 'Web hero', image: '/w.jpg' }]),
  order_app: JSON.stringify([{ title: 'Order hero', image: '/o.jpg' }]),
  resolved_website: JSON.stringify([{ title: 'Web hero', image: '/w.jpg' }]),
  resolved_order_app: JSON.stringify([{ title: 'Order hero', image: '/o.jpg' }]),
  state: 'split',
};

describe('Content Hub publish reliability + app scope', () => {
  beforeEach(() => {
    toast.success.mockClear();
    toast.error.mockClear();
    vi.mocked(contentApi.getContentBlocks).mockResolvedValue({
      locale: 'en',
      locales: ['en', 'dv'],
      blocks: [websiteBlock, heroBlock],
    });
    vi.mocked(contentApi.getContentDrafts).mockResolvedValue({ drafts: {}, saved_at: null });
    vi.mocked(contentApi.saveContentDrafts).mockResolvedValue({
      drafts: { offers_headline: 'Edited' },
      saved_at: '2026-07-23T12:00:00Z',
    });
    vi.mocked(contentApi.updateContent).mockResolvedValue({
      blocks: [{ ...websiteBlock, website: 'Published copy' }],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('publish failure retains drafts and shows Publish failed', async () => {
    vi.mocked(contentApi.updateContent).mockRejectedValueOnce(
      new ApiRequestError('Headline is required', 422),
    );

    render(
      <MemoryRouter initialEntries={['/content/website?group=Home']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    const sheet = await openCtaEditor();
    const editor = within(sheet).getAllByTestId('rich-text-editor')[0];
    editor.innerHTML = 'Keep after fail';
    fireEvent.input(editor);

    fireEvent.click(screen.getByTestId('publish-live-btn'));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
      expect(String(toast.error.mock.calls[0][0])).toMatch(/Headline is required/);
    });

    expect(screen.getAllByTestId('draft-save-status')[0].textContent).toMatch(/Publish failed/);
    expect(within(sheet).getAllByTestId('rich-text-editor')[0].innerHTML).toMatch(/Keep after fail/);
    expect(screen.getAllByTestId('draft-retry-publish').length).toBeGreaterThan(0);
  });

  it('successful publish clears drafts only after server blocks return', async () => {
    let resolvePublish: (value: { blocks: ContentBlock[] }) => void = () => {};
    vi.mocked(contentApi.updateContent).mockImplementationOnce(
      () => new Promise((resolve) => { resolvePublish = resolve; }),
    );

    render(
      <MemoryRouter initialEntries={['/content/website?group=Home']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    const sheet = await openCtaEditor();
    const editor = within(sheet).getAllByTestId('rich-text-editor')[0];
    editor.innerHTML = 'Go live now';
    fireEvent.input(editor);

    fireEvent.click(screen.getByTestId('publish-live-btn'));

    await waitFor(() => expect(contentApi.updateContent).toHaveBeenCalled());
    // Local draft must still be present until the server confirms (matrix row 11).
    expect(within(sheet).getAllByTestId('rich-text-editor')[0].innerHTML).toMatch(/Go live now/);

    resolvePublish({ blocks: [{ ...websiteBlock, website: 'Go live now' }] });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Website published');
      expect(screen.getAllByTestId('draft-save-status')[0].textContent).toMatch(/Website published/);
      expect(screen.getAllByTestId('draft-save-status')[0].textContent).not.toMatch(/All published/);
    });
  });

  it('prevents duplicate concurrent publish requests', async () => {
    let resolvePublish: (value: { blocks: ContentBlock[] }) => void = () => {};
    vi.mocked(contentApi.updateContent).mockImplementationOnce(
      () => new Promise((resolve) => { resolvePublish = resolve; }),
    );

    render(
      <MemoryRouter initialEntries={['/content/website?group=Home']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    const sheet = await openCtaEditor();
    const editor = within(sheet).getAllByTestId('rich-text-editor')[0];
    editor.innerHTML = 'Once only';
    fireEvent.input(editor);

    fireEvent.click(screen.getByTestId('publish-live-btn'));
    fireEvent.click(screen.getByTestId('publish-live-btn'));
    fireEvent.click(screen.getByTestId('publish-live-btn'));

    await waitFor(() => expect(contentApi.updateContent).toHaveBeenCalledTimes(1));

    resolvePublish({ blocks: [{ ...websiteBlock, website: 'Once only' }] });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Website published'));
  });

  it('Website edits save and publish only website scope', async () => {
    render(
      <MemoryRouter initialEntries={['/content/website?group=Home']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    const sheet = await openCtaEditor();
    const editor = within(sheet).getAllByTestId('rich-text-editor')[0];
    editor.innerHTML = 'Website only edit';
    fireEvent.input(editor);

    await waitFor(() => expect(contentApi.saveContentDrafts).toHaveBeenCalled(), { timeout: 5000 });
    const saveCalls = vi.mocked(contentApi.saveContentDrafts).mock.calls;
    const saveArgs = saveCalls[saveCalls.length - 1]?.[0] ?? [];
    expect(saveArgs.every((c: { scope: string }) => c.scope === 'website')).toBe(true);
    expect(saveArgs.some((c: { scope: string }) => c.scope === 'order_app' || c.scope === 'shared')).toBe(false);

    fireEvent.click(screen.getByTestId('publish-live-btn'));
    await waitFor(() => expect(contentApi.updateContent).toHaveBeenCalled());
    const publishCalls = vi.mocked(contentApi.updateContent).mock.calls;
    const publishArgs = publishCalls[publishCalls.length - 1]?.[0] ?? [];
    expect(publishArgs.every((c: { scope: string }) => c.scope === 'website')).toBe(true);
    expect(toast.success).toHaveBeenCalledWith('Website published');
  }, 10000);

  it('Order App edits save and publish only order_app scope', async () => {
    render(
      <MemoryRouter initialEntries={['/content/order-app?group=Home']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    const sheet = await openCtaEditor();
    const editor = within(sheet).getAllByTestId('rich-text-editor')[0];
    editor.innerHTML = 'Order only edit';
    fireEvent.input(editor);

    await waitFor(() => expect(contentApi.saveContentDrafts).toHaveBeenCalled(), { timeout: 5000 });
    const saveCalls = vi.mocked(contentApi.saveContentDrafts).mock.calls;
    const saveArgs = saveCalls[saveCalls.length - 1]?.[0] ?? [];
    expect(saveArgs.every((c: { scope: string }) => c.scope === 'order_app')).toBe(true);

    fireEvent.click(screen.getByTestId('publish-live-btn'));
    await waitFor(() => expect(contentApi.updateContent).toHaveBeenCalled());
    const publishCalls = vi.mocked(contentApi.updateContent).mock.calls;
    const publishArgs = publishCalls[publishCalls.length - 1]?.[0] ?? [];
    expect(publishArgs.every((c: { scope: string }) => c.scope === 'order_app')).toBe(true);
    expect(toast.success).toHaveBeenCalledWith('Order App published');
  }, 10000);

  it('Website hero editor does not write order_app scope', async () => {
    render(
      <MemoryRouter initialEntries={['/content/website?group=Home']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    const editor = await screen.findByTestId('wcw-field-hero_slides');
    await within(editor).findByTestId('hero-slides-wide');
    const wordsCol = within(editor).getByTestId('hero-slide-wide-words-0');
    const title = within(wordsCol).getByLabelText(/Title \(HTML/i) as HTMLTextAreaElement;
    fireEvent.change(title, { target: { value: 'Website hero only' } });

    await waitFor(() => expect(contentApi.saveContentDrafts).toHaveBeenCalled(), { timeout: 5000 });
    const saveCalls = vi.mocked(contentApi.saveContentDrafts).mock.calls;
    const saveArgs = saveCalls[saveCalls.length - 1]?.[0] ?? [];
    expect(saveArgs.length).toBeGreaterThan(0);
    expect(saveArgs.every((c: { scope: string; key: string }) => c.scope === 'website' && c.key === 'hero_slides')).toBe(true);
  }, 10000);

  it('does not offer combined Website + Order App publish wording', async () => {
    render(
      <MemoryRouter initialEntries={['/content/website?group=Home']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    await openCtaEditor();
    expect(document.body.textContent).not.toMatch(/Same in both|Publish both|Website \+ Order/i);
  });
});
