import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ContentHubPage } from '../pages/ContentHub/ContentHubPage';
import * as contentApi from '../api/content';

// Mutable flag — changed per describe/it to toggle mobile vs desktop
let isMobileFlag = false;

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
}));
vi.mock('../components/MediaPicker', () => ({
  MediaPicker: () => null,
}));

const phoneBlock = {
  key: 'home_specials_title',
  label: 'Phone number',
  group: 'Home',
  type: 'text',
  apps: ['website', 'order_app'] as Array<'website' | 'order_app'>,
  shareable: true,
  public: true,
  shared: '30–45 min',
  website: null,
  order_app: null,
  resolved_website: '30–45 min',
  resolved_order_app: '30–45 min',
  state: 'shared' as const,
};

const logoBlock = {
  key: 'logo',
  label: 'Logo (Light)',
  group: 'Everywhere',
  type: 'image',
  apps: ['website', 'order_app'] as Array<'website' | 'order_app'>,
  shareable: true,
  public: true,
  shared: '/logo.png',
  website: null,
  order_app: null,
  resolved_website: '/logo.png',
  resolved_order_app: '/logo.png',
  state: 'shared' as const,
};

function setup() {
  vi.mocked(contentApi.getContentBlocks).mockResolvedValue({
    locale: 'en',
    locales: ['en', 'dv'],
    blocks: [phoneBlock, logoBlock],
  });
}

describe('ContentHub layout — desktop (useIsMobile=false)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isMobileFlag = false;
    window.localStorage.clear();
    // Existing desktop layout tests expect the docked preview column.
    window.localStorage.setItem('bg_hub_preview_open', '1');
    setup();
  });

  it('shows the five page tabs and Home as sections — no Website Preview column', async () => {
    render(
      <MemoryRouter initialEntries={['/content/website?group=Home']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    await screen.findByTestId('website-content-workspace');
    expect(screen.getByTestId('wcw-tab-Home')).toBeTruthy();
    expect(screen.getByTestId('wcw-sections')).toBeTruthy();
    expect(screen.queryByTestId('section-rail')).toBeNull();
    expect(screen.queryByTestId('preview-pane')).toBeNull();
    expect(screen.getByTestId('view-live-site')).toBeTruthy();
  });

  it('?group=Branding deep link activates Everywhere in rail', async () => {
    render(
      <MemoryRouter initialEntries={['/content/website?group=Everywhere']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('wcw-tab-Everywhere').getAttribute('aria-selected')).toBe('true');
    });
    expect(screen.getByTestId('website-content-workspace').getAttribute('data-tab')).toBe('Everywhere');
  });

  it('dirty dot appears when section has unsaved drafts', async () => {
    render(
      <MemoryRouter initialEntries={['/content/website?group=Home']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    await screen.findByTestId('wcw-sections');
    expect(screen.queryByTestId('wcw-section-dirty-specials')).toBeNull();

    fireEvent.click(screen.getByTestId('wcw-section-toggle-specials'));
    const editor = await screen.findByTestId('wcw-field-home_specials_title');
    const phoneInput = within(editor).getByDisplayValue('30–45 min');
    fireEvent.change(phoneInput, { target: { value: '25–40 min' } });

    await waitFor(() => {
      expect(screen.getByTestId('wcw-section-dirty-specials')).toBeTruthy();
    });
  });

  it('label search shows dropdown and clicking result navigates to section', async () => {
    render(
      <MemoryRouter initialEntries={['/content/website?group=Everywhere']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    await screen.findByTestId('website-content-workspace');

    const searchInput = screen.getByPlaceholderText(/search by label/i);
    fireEvent.change(searchInput, { target: { value: 'Phone' } });

    // Dropdown appears with result label
    await waitFor(() => {
      const options = screen.getAllByRole('option');
      expect(options.some((el) => el.textContent?.includes('Phone number'))).toBe(true);
    });

    // Click the result that contains 'Phone number'
    const resultBtn = screen.getAllByRole('option').find((el) =>
      el.textContent?.includes('Phone number'),
    );
    expect(resultBtn).toBeTruthy();
    fireEvent.click(resultBtn!);

    // Website desktop: search opens the section that holds the match, in place.
    await waitFor(() => {
      expect(screen.getByTestId('website-content-workspace').getAttribute('data-tab')).toBe('Home');
    });
    expect(screen.getByTestId('wcw-section-specials').dataset.open).toBe('yes');
    expect(screen.getByTestId('wcw-field-home_specials_title')).toBeTruthy();
  });

  it('block face has no key·type meta line; ⋯ menu has History and key', async () => {
    // Per-block ⋯ / History menu lives on the classic BlockCard list, which the
    // Website desktop redesign replaced with the page list + component editor.
    // Order App still uses BlockCard, so this generic Content Hub rule is
    // exercised there — Website desktop coverage is in the Stage B/C tests.
    render(
      <MemoryRouter initialEntries={['/content/order-app?group=Home']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    await screen.findByTestId('section-editor');

    // Face should NOT contain "home_specials_title · text"
    expect(screen.queryByText(/home_specials_title\s*·\s*text/i)).toBeNull();

    // Open ⋯ menu
    const moreBtn = screen.getByTestId('block-more-home_specials_title');
    fireEvent.click(moreBtn);

    await waitFor(() => {
      expect(screen.getByTestId('block-menu-home_specials_title')).toBeTruthy();
    });

    const menu = screen.getByTestId('block-menu-home_specials_title');
    expect(menu.textContent).toMatch(/History/i);
    expect(menu.textContent).toContain('home_specials_title');
  });

  it('section-enable card face has no content key either', async () => {
    vi.mocked(contentApi.getContentBlocks).mockResolvedValue({
      locale: 'en',
      locales: ['en', 'dv'],
      blocks: [
        {
          ...logoBlock,
          key: 'announcement_enabled',
          label: 'Show Contact Section',
          group: 'Everywhere',
          section_enable: true,
          type: 'boolean',
          shared: 'true',
          resolved_website: 'true',
          resolved_order_app: 'true',
        } as never,
        phoneBlock as never,
        logoBlock as never,
      ],
    });

    render(
      <MemoryRouter initialEntries={['/content/website?group=Everywhere']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    const enable = await screen.findByTestId('wcw-field-announcement_enabled');
    const label = enable.querySelector('.wcw-field-label');
    expect(label?.textContent).toContain('Show Contact Section');
    expect(label?.textContent).not.toContain('announcement_enabled');
    expect(label?.textContent).not.toMatch(/·/);
  });
});

describe('ContentHub layout — mobile (useIsMobile=true)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isMobileFlag = true;
    setup();
  });

  it('Website Content on a phone is the page list, and Home opens in place', async () => {
    render(
      <MemoryRouter initialEntries={['/content/website?group=Home']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    await screen.findByTestId('wcw-sections');
    expect(screen.getByTestId('wcw-mobile-back')).toBeTruthy();
    expect(screen.queryByTestId('surface-builder-landing')).toBeNull();
    expect(screen.queryByTestId('preview-pane')).toBeNull();
  });

  it('Order App on a phone still taps a task card into an editor sheet', async () => {
    render(
      <MemoryRouter initialEntries={['/content/order-app']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    await screen.findByTestId('surface-builder-landing');

    expect(screen.queryByTestId('section-editor')).toBeNull();
    expect(screen.queryByTestId('content-editor-sheet')).toBeNull();

    fireEvent.click(screen.getByTestId('task-card-brand_profile'));

    const sheet = await screen.findByTestId('content-editor-sheet');
    expect(within(sheet).getByTestId('section-editor').getAttribute('data-section')).toBe('Everywhere');
    expect(within(sheet).getByTestId('draft-save-status')).toBeTruthy();

    fireEvent.click(within(sheet).getByTestId('content-editor-sheet-close'));

    await waitFor(() => {
      expect(screen.queryByTestId('content-editor-sheet')).toBeNull();
      expect(screen.queryByTestId('section-editor')).toBeNull();
    });
  });

  it('Order App preview sheet opens and closes via the sheet header', async () => {
    render(
      <MemoryRouter initialEntries={['/content/order-app?group=Home']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    const sheet = await screen.findByTestId('content-editor-sheet');
    expect(within(sheet).queryByTestId('preview-pane')).toBeNull();

    // Preview lives in the portaled sheet header (above the editor stack).
    fireEvent.click(within(sheet).getByTestId('preview-sheet-btn'));
    await screen.findByTestId('preview-sheet');
    expect(screen.getByTestId('preview-pane')).toBeTruthy();

    fireEvent.click(screen.getByTestId('preview-sheet-close'));
    await waitFor(() => {
      expect(screen.queryByTestId('preview-sheet')).toBeNull();
    });
  });
});
