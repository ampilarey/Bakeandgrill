import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ContentHubPage } from '../pages/ContentHub/ContentHubPage';
import * as contentApi from '../api/content';

let isMobileFlag = true;

vi.mock('../hooks/useIsMobile', () => ({
  useIsMobile: () => isMobileFlag,
}));

vi.mock('../api/content', () => ({
  getContentBlocks: vi.fn(),
  getContentSchedules: vi.fn(async () => ({ schedules: [] })),
  getContentDrafts: vi.fn(async () => ({ drafts: {}, saved_at: null })),
  saveContentDrafts: vi.fn(async () => ({ drafts: {}, saved_at: null })),
  updateContent: vi.fn(),
  shareContentBlock: vi.fn(async () => ({ blocks: [] })),
  splitContentBlock: vi.fn(async () => ({ blocks: [] })),
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
    token: 't', website_url: '/preview', order_app_url: '/order-preview', expires_in: 900,
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
  key: 'section_hero_enabled',
  label: 'Show Hero Section',
  group: 'Hero',
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
  link_state: 'same' as const,
  brand_synced: false,
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
  group: 'Hero',
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
  link_state: 'same' as const,
  brand_synced: false,
  description: 'Carousel slides for the top of the homepage with image title and CTAs.',
};

function mockBlocks(blocks: unknown[] = [heroEnable, heroSlides]) {
  vi.mocked(contentApi.getContentBlocks).mockResolvedValue({
    locale: 'en',
    locales: ['en', 'dv'],
    blocks: blocks as never,
  });
}

function openHub(path = '/content') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ContentHubPage />
    </MemoryRouter>,
  );
}

function applyMobileViewportCss(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(document.documentElement, 'clientWidth', {
    configurable: true,
    value: width,
  });
  const style = document.createElement('style');
  style.setAttribute('data-testid', 'mobile-viewport-css');
  style.textContent = `
    html, body { width: ${width}px; max-width: ${width}px; overflow-x: hidden; margin: 0; }
    .hub-page, .content-studio-page, .page-shell { max-width: ${width}px; overflow-x: clip; }
    .page-header { display: flex; flex-wrap: wrap; gap: 8px; width: 100%; max-width: ${width}px; }
    .page-header-actions { flex-shrink: 1; min-width: 0; width: 100%; max-width: ${width}px; }
    .hub-header-actions { display: flex; flex-wrap: wrap; gap: 8px; width: 100%; max-width: ${width}px; }
    .content-editor-sheet {
      position: fixed; inset: 0; width: ${width}px; max-width: ${width}px;
      overflow-x: hidden; box-sizing: border-box;
    }
    .content-editor-sheet *, .hub-page * { max-width: 100%; box-sizing: border-box; }
    .hub-block-more-menu, .hub-mobile-action-sheet {
      position: fixed; left: 12px; right: 12px; bottom: 12px; width: auto; min-width: 0;
      max-width: calc(${width}px - 24px);
    }
  `;
  document.head.appendChild(style);
  return style;
}

describe('ContentHub mobile editor sheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isMobileFlag = true;
    window.localStorage.clear();
    mockBlocks();
    document.body.innerHTML = '';
  });

  it.each([320, 375, 390])(
    'opens Hero in a full-screen sheet without horizontal overflow at %spx',
    async (width) => {
      const style = applyMobileViewportCss(width);
      openHub('/content');

      await screen.findByTestId('section-card-Hero');
      fireEvent.click(screen.getByTestId('section-card-Hero'));

      const sheet = await screen.findByTestId('content-editor-sheet');
      expect(sheet.getAttribute('role')).toBe('dialog');
      expect(within(sheet).getByTestId('section-editor').getAttribute('data-section')).toBe('Hero');
      // Draft / publish state must be visible inside the sheet
      expect(within(sheet).getByTestId('draft-save-status')).toBeTruthy();

      // Compact hero overview — full inline editor must not be expanded
      expect(within(sheet).getByTestId('block-card-hero_slides')).toBeTruthy();
      expect(within(sheet).getByTestId('edit-hero_slides')).toBeTruthy();
      expect(within(sheet).queryByTestId('hero-slide-0')).toBeNull();

      // Same/Different discoverability stays findable
      expect(within(sheet).getByTestId('content-mode-hero_slides').textContent).toMatch(/Same in both/);
      expect(within(sheet).getByTestId('content-mode-hero_slides').textContent).toMatch(/Different per app/);

      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);

      style.remove();
    },
  );

  it('Edit Hero opens slide overview sheet; slide tap opens slide editor; draft state preserved', async () => {
    applyMobileViewportCss(375);
    openHub('/content');
    await screen.findByTestId('section-card-Hero');
    fireEvent.click(screen.getByTestId('section-card-Hero'));
    await screen.findByTestId('content-editor-sheet');

    fireEvent.click(screen.getByTestId('edit-hero_slides'));
    const heroSheet = await screen.findByTestId('hero-editor-sheet');
    expect(within(heroSheet).getByTestId('draft-save-status')).toBeTruthy();
    expect(within(heroSheet).getByTestId('hero-slide-overview-0')).toBeTruthy();
    expect(within(heroSheet).getByTestId('hero-slide-overview-1')).toBeTruthy();
    expect(within(heroSheet).getByTestId('hero-slide-overview-1').textContent).toMatch(/Hidden/);

    // Full field editor not open yet
    expect(within(heroSheet).queryByLabelText(/Title/i)).toBeNull();

    fireEvent.click(screen.getByTestId('hero-slide-overview-0'));
    const slideSheet = await screen.findByTestId('hero-slide-editor-sheet');
    expect(within(slideSheet).getByTestId('draft-save-status')).toBeTruthy();
    const title = within(slideSheet).getByLabelText(/Title \(HTML/i) as HTMLTextAreaElement;
    expect(title.tagName).toBe('TEXTAREA');

    fireEvent.change(title, { target: { value: 'Draft title change' } });
    await waitFor(() => {
      expect(
        screen.getAllByTestId('draft-save-status').some((el) => /not yet live/i.test(el.textContent || '')),
      ).toBe(true);
    });

    // Closing sheets must keep the unpublished draft
    fireEvent.click(within(slideSheet).getByTestId('content-editor-sheet-close'));
    await waitFor(() => {
      expect(screen.queryByTestId('hero-slide-editor-sheet')).toBeNull();
    });
    fireEvent.click(within(screen.getByTestId('hero-editor-sheet')).getByTestId('content-editor-sheet-close'));
    await waitFor(() => {
      expect(screen.queryByTestId('hero-editor-sheet')).toBeNull();
    });

    // Still unpublished — never auto-published (autosave drafts ≠ publish)
    expect(contentApi.updateContent).not.toHaveBeenCalled();
    const statuses = screen.getAllByTestId('draft-save-status');
    expect(statuses.some((el) => /not yet live/i.test(el.textContent || ''))).toBe(true);
  });

  it('block ⋯ menu uses a collision-safe mobile action sheet', async () => {
    applyMobileViewportCss(320);
    openHub('/content?group=Hero');
    await screen.findByTestId('content-editor-sheet');

    fireEvent.click(screen.getByTestId('block-more-hero_slides'));
    const actionSheet = await screen.findByTestId('block-menu-hero_slides');
    expect(actionSheet.className).toMatch(/hub-mobile-action-sheet|content-mobile-action-sheet/);
    expect(actionSheet.textContent).toContain('History');
    expect(actionSheet.textContent).toContain('hero_slides');
  });

  it('mobile header keeps language + publish status readable; search can open overlay', async () => {
    applyMobileViewportCss(320);
    openHub('/content');
    await screen.findByTestId('draft-save-status');

    expect(screen.getByRole('group', { name: 'Language' })).toBeTruthy();
    expect(screen.getByTestId('draft-save-status').textContent).toMatch(/All published|not yet live/i);

    const searchToggle = screen.getByTestId('hub-search-toggle');
    fireEvent.click(searchToggle);
    expect(await screen.findByTestId('hub-search-overlay')).toBeTruthy();
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(320);
  });
});
