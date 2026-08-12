import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ContentHubPage } from '../pages/ContentHub/ContentHubPage';
import type { ContentBlock } from '../api/content';
import * as contentApi from '../api/content';

vi.mock('../api/content', () => ({
  getContentBlocks: vi.fn(),
  getContentSchedules: vi.fn(async () => ({ schedules: [] })),
  getContentDrafts: vi.fn(async () => ({ drafts: {}, saved_at: null })),
  saveContentDrafts: vi.fn(async () => ({ drafts: {}, saved_at: null })),
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
vi.mock('../hooks/useIsMobile', () => ({ useIsMobile: () => false }));
vi.mock('../components/ui', async () => {
  const actual = await vi.importActual<typeof import('../components/ui')>('../components/ui');
  return {
    ...actual,
    useToast: () => ({ success: vi.fn(), error: vi.fn() }),
  };
});
vi.mock('../components/MediaPicker', () => ({ MediaPicker: () => null }));

const heroBlock: ContentBlock = {
  key: 'hero_slides',
  label: 'Hero Slides',
  group: 'Hero',
  type: 'json',
  editor: 'hero',
  apps: ['website', 'order_app'],
  shareable: true,
  public: true,
  shared: JSON.stringify([{ title: 'Welcome', image: '/a.jpg', eyebrow: 'Hi' }]),
  website: null,
  order_app: null,
  resolved_website: JSON.stringify([{ title: 'Welcome', image: '/a.jpg', eyebrow: 'Hi' }]),
  resolved_order_app: JSON.stringify([{ title: 'Welcome', image: '/a.jpg', eyebrow: 'Hi' }]),
  state: 'shared',
  link_state: 'same',
};

const phoneBlock: ContentBlock = {
  key: 'business_phone',
  label: 'Phone number',
  group: 'Contact',
  type: 'text',
  apps: ['website', 'order_app'],
  shareable: true,
  public: true,
  shared: '+960 912 0011',
  website: null,
  order_app: null,
  resolved_website: '+960 912 0011',
  resolved_order_app: '+960 912 0011',
  state: 'shared',
  link_state: 'same',
};

function setViewport(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  window.dispatchEvent(new Event('resize'));
}

describe('Content Hub Overview → Edit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    vi.mocked(contentApi.getContentBlocks).mockResolvedValue({
      locale: 'en',
      locales: ['en', 'dv'],
      blocks: [heroBlock, phoneBlock],
    });
  });

  it.each([320, 375, 390, 1280, 1440])(
    'keeps overview cards simple and opens a focused editor at %spx',
    async (width) => {
      setViewport(width);
      render(
        <MemoryRouter initialEntries={['/content?group=Hero']}>
          <ContentHubPage />
        </MemoryRouter>,
      );

      const card = await screen.findByTestId('block-card-hero_slides');
      expect(card.getAttribute('data-compact')).toBe('true');
      expect(within(card).getByTestId('edit-hero_slides')).toBeTruthy();
      expect(within(card).getByTestId('block-visibility-hero_slides').textContent).toMatch(/Showing|Hidden/);
      expect(within(card).queryByTestId('scope-tabs-hero_slides')).toBeNull();
      expect(within(card).queryByLabelText(/Move .* up/i)).toBeNull();
      expect(within(card).queryByLabelText(/Remove/i)).toBeNull();
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(document.documentElement.clientWidth + 1);

      fireEvent.click(within(card).getByTestId('edit-hero_slides'));
      const sheet = await screen.findByTestId('hero-editor-sheet');
      expect(sheet.getAttribute('role')).toBe('dialog');
      expect(within(sheet).getByText(/Edit Hero Slides/i)).toBeTruthy();

      // Reorder controls appear only after enabling reorder mode.
      expect(within(sheet).queryByTestId('hero-slide-move-up-0')).toBeNull();
      fireEvent.click(within(sheet).getByTestId('hero-reorder-toggle'));
      await waitFor(() => {
        expect(within(sheet).getByTestId('hero-slide-move-up-0')).toBeTruthy();
      });

      fireEvent.click(within(sheet).getByTestId('content-editor-sheet-close'));
      await waitFor(() => {
        expect(screen.queryByTestId('hero-editor-sheet')).toBeNull();
      });
    },
  );

  it('preserves draft after closing the focused editor', async () => {
    setViewport(1280);
    render(
      <MemoryRouter initialEntries={['/content?group=Contact']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByTestId('edit-business_phone'));
    let sheet = await screen.findByTestId('block-editor-sheet-business_phone');
    fireEvent.change(within(sheet).getByDisplayValue('+960 912 0011'), {
      target: { value: '+960 DRAFT KEEP' },
    });
    expect(screen.getAllByTestId('draft-save-status')[0].textContent).toMatch(/Draft saved — not live/);
    expect(screen.getAllByTestId('draft-save-status')[0].textContent).not.toMatch(/All published/);

    fireEvent.click(within(sheet).getByTestId('content-editor-sheet-close'));
    await waitFor(() => expect(screen.queryByTestId('block-editor-sheet-business_phone')).toBeNull());

    expect(screen.getAllByTestId('draft-save-status')[0].textContent).toMatch(/Draft saved — not live/);
    fireEvent.click(screen.getByTestId('edit-business_phone'));
    sheet = await screen.findByTestId('block-editor-sheet-business_phone');
    expect(within(sheet).getByDisplayValue('+960 DRAFT KEEP')).toBeTruthy();
  });
});
