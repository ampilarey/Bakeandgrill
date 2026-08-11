import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
vi.mock('../hooks/useIsMobile', () => ({ useIsMobile: () => true }));
vi.mock('../components/ui', async () => {
  const actual = await vi.importActual<typeof import('../components/ui')>('../components/ui');
  return {
    ...actual,
    useToast: () => ({ success: vi.fn(), error: vi.fn() }),
  };
});
vi.mock('../components/MediaPicker', () => ({ MediaPicker: () => null }));

const heroSame: ContentBlock = {
  key: 'hero_slides',
  label: 'Hero Slides',
  group: 'Hero',
  type: 'json',
  editor: 'hero',
  apps: ['website', 'order_app'],
  shareable: true,
  public: true,
  shared: JSON.stringify([{ title: 'Shared', image: '/a.jpg' }]),
  website: null,
  order_app: null,
  resolved_website: JSON.stringify([{ title: 'Shared', image: '/a.jpg' }]),
  resolved_order_app: JSON.stringify([{ title: 'Shared', image: '/a.jpg' }]),
  state: 'shared',
  link_state: 'same',
};

const heroDifferent: ContentBlock = {
  ...heroSame,
  website: JSON.stringify([{ title: 'Web', image: '/w.jpg' }]),
  order_app: JSON.stringify([{ title: 'Order', image: '/o.jpg' }]),
  state: 'split',
  link_state: 'different',
};

describe('Content Hub content-mode buttons (mobile)', () => {
  beforeEach(() => {
    vi.mocked(contentApi.getContentBlocks).mockResolvedValue({
      locale: 'en',
      locales: ['en', 'dv'],
      blocks: [heroSame],
    });
    vi.mocked(contentApi.splitContentBlock).mockResolvedValue({ blocks: [heroDifferent] });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('Different per app button calls split and shows scope tabs', async () => {
    render(
      <MemoryRouter initialEntries={['/content?group=Hero']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    await screen.findByTestId('content-mode-hero_slides');
    fireEvent.click(screen.getByTestId('content-mode-hero_slides-different'));

    await waitFor(() => {
      expect(contentApi.splitContentBlock).toHaveBeenCalledWith('hero_slides', 'en');
    });
    await waitFor(() => {
      expect(screen.getByTestId('scope-tabs-hero_slides')).toBeTruthy();
    });
  });
});
