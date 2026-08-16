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
vi.mock('../components/MediaPicker', () => ({ MediaPicker: () => null }));

const heroBlock: ContentBlock = {
  key: 'hero_slides',
  label: 'Hero Slides',
  group: 'Home',
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
};

const phoneBlock: ContentBlock = {
  key: 'home_specials_title',
  label: 'Phone number',
  group: 'Home',
  type: 'text',
  apps: ['website', 'order_app'],
  shareable: true,
  public: true,
  shared: '30–45 min',
  website: null,
  order_app: null,
  resolved_website: '30–45 min',
  resolved_order_app: '30–45 min',
  state: 'shared',
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
    'opens a section in place, at full width, without sideways scroll at %spx',
    async (width) => {
      setViewport(width);
      // The compact card + focused sheet went when the Order App joined the
      // page-tab workspace: a section now opens in place, one at a time.
      render(
        <MemoryRouter initialEntries={['/content/order-app?group=Home']}>
          <ContentHubPage />
        </MemoryRouter>,
      );

      const toggle = await screen.findByTestId('wcw-section-toggle-hero');
      expect(screen.getByTestId('wcw-section-hero').getAttribute('data-open')).toBe('no');
      expect(screen.queryByTestId('block-card-hero_slides')).toBeNull();

      fireEvent.click(toggle);
      const body = await screen.findByTestId('wcw-section-body-hero');
      expect(within(body).getByTestId('wcw-field-hero_slides')).toBeTruthy();
      expect(within(body).queryByTestId('scope-tabs-hero_slides')).toBeNull();
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(document.documentElement.clientWidth + 1);

      // Opening one section closes it again on a second click — never two open.
      fireEvent.click(toggle);
      await waitFor(() => {
        expect(screen.getByTestId('wcw-section-hero').getAttribute('data-open')).toBe('no');
      });
    },
  );

  it('preserves draft after closing the section it was typed in', async () => {
    setViewport(1280);
    render(
      <MemoryRouter initialEntries={['/content/order-app?group=Home']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByTestId('wcw-section-toggle-specials'));
    let field = await screen.findByTestId('wcw-field-home_specials_title');
    fireEvent.change(within(field).getByDisplayValue('30–45 min'), {
      target: { value: 'DRAFT KEEP ETA' },
    });
    expect(screen.getAllByTestId('draft-save-status')[0].textContent).toMatch(/Draft saved|Saving draft/);
    expect(screen.getAllByTestId('draft-save-status')[0].textContent).not.toMatch(/All published/);

    fireEvent.click(screen.getByTestId('wcw-section-toggle-specials'));
    await waitFor(() => expect(screen.queryByTestId('wcw-field-home_specials_title')).toBeNull());

    expect(screen.getAllByTestId('draft-save-status')[0].textContent).toMatch(/Draft saved|Saving draft/);
    fireEvent.click(screen.getByTestId('wcw-section-toggle-specials'));
    field = await screen.findByTestId('wcw-field-home_specials_title');
    expect(within(field).getByDisplayValue('DRAFT KEEP ETA')).toBeTruthy();
  });
});
