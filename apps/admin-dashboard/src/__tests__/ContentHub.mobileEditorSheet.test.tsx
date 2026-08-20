import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ContentHubPage } from '../pages/ContentHub/ContentHubPage';
import * as contentApi from '../api/content';

let isMobileFlag = true;

vi.mock('../hooks/useIsMobile', () => ({
  useIsMobile: () => isMobileFlag,
  useIsCompactAdmin: () => false,
  useIsWideDesktop: () => !isMobileFlag,
}));

vi.mock('../api/content', () => ({
  getContentBlocks: vi.fn(),
  getContentSchedules: vi.fn(async () => ({ schedules: [] })),
  getContentDrafts: vi.fn(async () => ({ drafts: {}, saved_at: null })),
  saveContentDrafts: vi.fn(async () => ({ drafts: {}, saved_at: null })),
  updateContent: vi.fn(),
  uploadContentImage: vi.fn(),
  uploadContentFont: vi.fn(),
  exportContent: vi.fn(),
  importContent: vi.fn(),
  getContentRevisions: vi.fn(async () => ({ revisions: [] })),
  restoreContentRevision: vi.fn(),
  scheduleContent: vi.fn(),
  cancelContentSchedule: vi.fn(),
  createContentPreviewToken: vi.fn(async () => ({
    token: 't', website_url: '/preview', order_app_url: '/order-preview', expires_in: 900,
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
vi.mock('../components/ui', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
  Toggle: ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
    <button type="button" aria-pressed={checked} onClick={() => onChange(!checked)}>toggle</button>
  ),
  Button: ({ children, ...rest }: { children: React.ReactNode } & Record<string, unknown>) => (
    <button type="button" {...rest}>{children}</button>
  ),
}));
vi.mock('../components/MediaPicker', () => ({
  MediaPicker: () => null,
}));

vi.mock('../api/pageBlocks', () => ({
  fetchAdminPageBlocks: vi.fn(async (app: string) => ({
    app,
    page: 'home',
    blocks: [],
    available_types: [],
    unknown_types: [],
  })),
  reorderPageBlocks: vi.fn(),
  updatePageBlock: vi.fn(),
  deletePageBlock: vi.fn(),
  createPageBlock: vi.fn(),
  createPageBlockPreviewToken: vi.fn(async () => ({
    token: 'layout-preview',
    expires_in: 900,
  })),
}));

const heroEnable = {
  key: 'announcement_enabled',
  label: 'Show Hero Section',
  group: 'Home',
  type: 'boolean' as const,
  apps: ['website', 'order_app'] as Array<'website' | 'order_app'>,
  shareable: true,
  public: true,
  section_enable: true,
  shared: 'true',
  website: null,
  order_app: null,
  resolved_website: 'true',
  resolved_order_app: 'true',
  state: 'shared' as const,
};

const slidePayload = JSON.stringify([
  {
    image: '/hero-a.jpg',
    title: 'Very long hero title that must wrap instead of forcing horizontal scroll on a phone',
    subtitle: 'Long subtitle copy for the bakery hero that should wrap vertically',
    cta_text: 'Order freshly baked croissants online now →',
    cta_url: '/order/',
    cta2_text: 'View Menu',
    cta2_url: '/menu',
    eyebrow: 'Malé',
    showing: true,
  },
  {
    image: '/hero-b.jpg',
    title: 'Hidden slide',
    subtitle: 'Customers should not see this',
    cta_text: 'Hidden CTA',
    cta_url: '/order/',
    cta2_text: '',
    cta2_url: '',
    eyebrow: '',
    showing: false,
  },
]);

const heroSlides = {
  key: 'hero_slides',
  label: 'Hero Slides',
  group: 'Home',
  type: 'json' as const,
  editor: 'hero' as const,
  apps: ['website', 'order_app'] as Array<'website' | 'order_app'>,
  shareable: true,
  public: true,
  shared: slidePayload,
  website: null,
  order_app: null,
  resolved_website: slidePayload,
  resolved_order_app: slidePayload,
  state: 'shared' as const,
  description: 'Carousel slides for the top of the homepage with image title and CTAs.',
};

function mockBlocks(blocks: unknown[] = [heroEnable, heroSlides]) {
  vi.mocked(contentApi.getContentBlocks).mockResolvedValue({
    locale: 'en',
    locales: ['en', 'dv'],
    blocks: blocks as never,
  });
}

// Neither hub wraps a section in an editor sheet any more — both open their
// sections in place inside the page (2026-08-15). Two sheet mechanics still
// ship on a phone and are covered below: the per-slide hero editor, and the
// More action sheet's focus return. The body-scroll-lock test went with the
// section sheet it belonged to; nothing left locks the body.
function openHub(path = '/content/order-app') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ContentHubPage />
    </MemoryRouter>,
  );
}

/**
 * jsdom cannot compute real layout. Overflow / viewport assertions live in
 * Playwright (`e2e/tests/go-live/09-content-hub-mobile-layout.spec.ts`).
 * These tests only cover portal, dialog a11y, body-scroll lock, focus, and draft state.
 */
describe('ContentHub mobile editor sheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isMobileFlag = true;
    window.localStorage.clear();
    mockBlocks();
    document.body.innerHTML = '';
    document.body.style.overflow = '';
  });

  it('a phone opens Hero in the page, never in a dialog', async () => {
    openHub('/content/order-app?group=Home');

    await screen.findByTestId('order-app-content-workspace');
    expect(screen.queryByTestId('content-editor-sheet')).toBeNull();

    fireEvent.click(await screen.findByTestId('wcw-section-toggle-hero'));
    const body = await screen.findByTestId('wcw-section-body-hero');
    expect(body.closest('[role="dialog"]')).toBeNull();

    // The phone gets the stacked hero editor, not the three-column wide one.
    expect(within(body).getByTestId('hero-slides-mobile')).toBeTruthy();
    expect(within(body).queryByTestId('hero-slides-wide')).toBeNull();
    expect(screen.getAllByTestId('draft-save-status').length).toBeGreaterThan(0);
  });

  it('the More action sheet takes focus on open and hands it back on close', async () => {
    openHub('/content/order-app?group=Home');
    await screen.findByTestId('order-app-content-workspace');

    const moreBtn = screen.getByRole('button', { name: /More actions/i });
    fireEvent.click(moreBtn);

    const sheet = await screen.findByTestId('hub-more-menu-mobile');
    expect(document.body.contains(sheet)).toBe(true);
    const closeBtn = within(sheet).getByRole('button', { name: /close/i });
    await waitFor(() => {
      expect(document.activeElement).toBe(closeBtn);
    });

    fireEvent.click(closeBtn);
    await waitFor(() => {
      expect(screen.queryByTestId('hub-more-menu-mobile')).toBeNull();
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(moreBtn);
    });
  });

  it('a slide tap opens the slide editor and the draft survives closing it', async () => {
    openHub('/content/order-app?group=Home');
    await screen.findByTestId('order-app-content-workspace');
    fireEvent.click(await screen.findByTestId('wcw-section-toggle-hero'));

    const heroSheet = await screen.findByTestId('hero-slides-mobile');
    expect(within(heroSheet).getByTestId('hero-slide-overview-0')).toBeTruthy();
    expect(within(heroSheet).getByTestId('hero-slide-overview-1')).toBeTruthy();
    expect(within(heroSheet).getByTestId('hero-slide-overview-1').textContent).toMatch(/Hidden/);
    expect(within(heroSheet).queryByTestId('hero-slide-move-up-0')).toBeNull();

    expect(within(heroSheet).queryByLabelText(/Title/i)).toBeNull();

    fireEvent.click(screen.getByTestId('hero-slide-overview-0'));
    const slideSheet = await screen.findByTestId('hero-slide-editor-sheet');
    expect(within(slideSheet).getByTestId('draft-save-status')).toBeTruthy();
    const title = within(slideSheet).getByLabelText(/Title \(HTML/i) as HTMLTextAreaElement;
    expect(title.tagName).toBe('TEXTAREA');

    fireEvent.change(title, { target: { value: 'Draft title change' } });
    await waitFor(() => {
      expect(
        screen.getAllByTestId('draft-save-status').some((el) => /Draft saved|Saving draft/i.test(el.textContent || '')),
      ).toBe(true);
    });

    fireEvent.click(within(slideSheet).getByTestId('content-editor-sheet-close'));
    await waitFor(() => {
      expect(screen.queryByTestId('hero-slide-editor-sheet')).toBeNull();
    });

    expect(contentApi.updateContent).not.toHaveBeenCalled();
    const statuses = screen.getAllByTestId('draft-save-status');
    expect(statuses.some((el) => /Draft saved|Saving draft/i.test(el.textContent || ''))).toBe(true);
  });

  it('the More menu uses a collision-safe mobile action sheet', async () => {
    openHub('/content/order-app?group=Home');
    await screen.findByTestId('order-app-content-workspace');

    fireEvent.click(screen.getByRole('button', { name: /More actions/i }));
    const actionSheet = await screen.findByTestId('hub-more-menu-mobile');
    expect(actionSheet.className).toMatch(/hub-mobile-action-sheet|content-mobile-action-sheet/);
    expect(actionSheet.textContent).toMatch(/Export Order App/i);
  });

  it('mobile header keeps language + publish status readable; search can open overlay', async () => {
    openHub('/content/order-app');
    await screen.findByTestId('draft-save-status');

    expect(screen.getByRole('group', { name: 'Language' })).toBeTruthy();
    expect(screen.getByTestId('draft-save-status').textContent).toMatch(/Order App published|Draft saved|not yet live/i);

    const searchToggle = screen.getByTestId('hub-search-toggle');
    fireEvent.click(searchToggle);
    expect(await screen.findByTestId('hub-search-overlay')).toBeTruthy();
  });
});
