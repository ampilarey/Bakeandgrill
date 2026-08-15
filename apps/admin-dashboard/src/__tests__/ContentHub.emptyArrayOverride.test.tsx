import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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

const heroBlock: ContentBlock = {
  key: 'hero_slides',
  label: 'Hero slides',
  group: 'Home',
  type: 'json',
  editor: 'hero',
  apps: ['website', 'order_app'],
  shareable: true,
  public: true,
  shared: JSON.stringify([{ title: 'Shared', image: '/shared.jpg' }]),
  website: '[]',
  order_app: null,
  resolved_website: '[]',
  resolved_order_app: JSON.stringify([{ title: 'Shared', image: '/shared.jpg' }]),
  state: 'split',
};

describe('Content Hub empty JSON array overrides', () => {
  beforeEach(() => {
    vi.mocked(contentApi.getContentBlocks).mockResolvedValue({
      locale: 'en',
      locales: ['en', 'dv'],
      blocks: [heroBlock],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('does not show the old shared-mask warning when an app holds []', async () => {
    render(
      <MemoryRouter initialEntries={['/content/website?group=Home']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    // Website desktop — the hero section is already open on the Home tab.
    await waitFor(() => expect(screen.getByTestId('wcw-section-hero')).toBeTruthy());
    const editor = await screen.findByTestId('hero-slides-wide');
    expect(within(editor).queryByTestId('empty-array-override-hero_slides')).toBeNull();
    expect(editor.textContent).not.toMatch(/shared content/i);
  });
});
