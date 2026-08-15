import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ContentHubPage } from '../pages/ContentHub/ContentHubPage';
import * as contentApi from '../api/content';

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

const sharedPhone = {
  key: 'home_specials_title',
  label: 'Specials heading',
  group: 'Home',
  type: 'text' as const,
  apps: ['website', 'order_app'] as Array<'website' | 'order_app'>,
  shareable: true,
  public: true,
  shared: '+960 SHARED',
  website: null,
  order_app: null,
  resolved_website: '+960 SHARED',
  resolved_order_app: '+960 SHARED',
  state: 'shared' as const,
};

const splitPhone = {
  ...sharedPhone,
  state: 'split' as const,
  shared: null,
  website: 'WEB ETA',
  order_app: 'ORDER ETA',
  resolved_website: 'WEB ETA',
  resolved_order_app: 'ORDER ETA',
};

const splitBoolean = {
  key: 'announcement_enabled',
  label: 'Show announcement',
  group: 'Everywhere',
  type: 'boolean' as const,
  apps: ['website', 'order_app'] as Array<'website' | 'order_app'>,
  shareable: true,
  public: true,
  shared: null,
  website: 'true',
  order_app: 'false',
  resolved_website: 'true',
  resolved_order_app: 'false',
  state: 'split' as const,
};

function mockBlocks(blocks: unknown[]) {
  vi.mocked(contentApi.getContentBlocks).mockResolvedValue({
    locale: 'en',
    locales: ['en', 'dv'],
    blocks: blocks as never,
  });
}

describe('ContentHub desktop width', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isMobileFlag = false;
    window.localStorage.clear();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
  });

  it('dual-app blocks render one current-destination editor with no tabs', async () => {
    mockBlocks([splitPhone]);
    render(
      <MemoryRouter initialEntries={['/content/website?group=Home']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByTestId('wcw-section-toggle-specials'));
    const editor = await screen.findByTestId('wcw-field-home_specials_title');
    expect(within(editor).queryByTestId('scope-tabs-home_specials_title')).toBeNull();
    expect(within(editor).getByDisplayValue('WEB ETA')).toBeTruthy();
    expect(within(editor).queryByDisplayValue('ORDER ETA')).toBeNull();
    expect(document.querySelectorAll('.content-preview-grid').length).toBe(0);
  });

  it('edits write to the current destination scope', async () => {
    mockBlocks([splitPhone]);
    vi.mocked(contentApi.updateContent).mockResolvedValue({ blocks: [splitPhone] });
    render(
      <MemoryRouter initialEntries={['/content/website?group=Home']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByTestId('wcw-section-toggle-specials'));
    const editor = await screen.findByTestId('wcw-field-home_specials_title');
    await within(editor).findByDisplayValue('WEB ETA');
    fireEvent.change(within(editor).getByDisplayValue('WEB ETA'), { target: { value: 'WEB ETA EDIT' } });
    fireEvent.click(screen.getAllByRole('button', { name: /Publish/i })[0]);

    await waitFor(() => {
      expect(contentApi.updateContent).toHaveBeenCalledWith(
        [{ key: 'home_specials_title', scope: 'website', value: 'WEB ETA EDIT', locale: 'en' }],
        'en',
      );
    });
  });

  it('shared backend state still renders one current-destination editor with no tabs', async () => {
    mockBlocks([sharedPhone]);
    render(
      <MemoryRouter initialEntries={['/content/website?group=Home']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByTestId('wcw-section-toggle-specials'));
    const editor = await screen.findByTestId('wcw-field-home_specials_title');
    await within(editor).findByDisplayValue('+960 SHARED');
    expect(within(editor).queryByTestId('scope-tabs-home_specials_title')).toBeNull();
  });

  it('boolean dual-app block stays compact and untabbed', async () => {
    mockBlocks([splitBoolean]);
    render(
      <MemoryRouter initialEntries={['/content/website?group=Everywhere']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    const field = await screen.findByTestId('wcw-field-announcement_enabled');
    // One switch for the page you are on — never a Website/Order App pair.
    expect(within(field).getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.queryByTestId('boolean-scopes-announcement_enabled')).toBeNull();
    expect(screen.queryByTestId('scope-tabs-announcement_enabled')).toBeNull();
  });

  // Per-field History still moved out of the block face and into the header's
  // ⋯ menu (Stage A) — order_app desktop keeps the classic block ⋯ menu this
  // covers; the underlying openHistory/scope-resolution logic is shared code.
  it('History opens for the current destination scope', async () => {
    mockBlocks([splitPhone]);
    vi.mocked(contentApi.getContentRevisions).mockResolvedValue({ revisions: [] });
    render(
      <MemoryRouter initialEntries={['/content/order-app?group=Home']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByTestId('edit-home_specials_title'));
    const sheet = await screen.findByTestId('block-editor-sheet-home_specials_title');
    fireEvent.click(within(sheet).getByTestId('content-editor-sheet-close'));
    fireEvent.click(screen.getByTestId('block-more-home_specials_title'));
    fireEvent.click(screen.getByRole('menuitem', { name: /History/i }));

    await waitFor(() => {
      expect(contentApi.getContentRevisions).toHaveBeenCalledWith('home_specials_title', 'order_app', 'en');
    });
  });

  it('Website desktop has no Preview column; View live site instead', async () => {
    mockBlocks([sharedPhone]);
    window.localStorage.setItem('bg_hub_preview_open', '1');

    render(
      <MemoryRouter initialEntries={['/content/website?group=Home']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    await screen.findByTestId('website-content-workspace');
    expect(screen.queryByTestId('preview-pane')).toBeNull();
    expect(screen.queryByTestId('preview-toggle')).toBeNull();
    expect(screen.queryByTestId('hub-desktop-shell')).toBeNull();
    expect(screen.getByTestId('view-live-site')).toBeTruthy();
  });

  it('Order App preview toggle docks/undocks and persists across remount', async () => {
    mockBlocks([sharedPhone]);
    window.localStorage.setItem('bg_hub_preview_open', '1');

    const { unmount } = render(
      <MemoryRouter initialEntries={['/content/order-app?group=Home']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    await screen.findByTestId('hub-desktop-shell');
    expect(screen.getByTestId('preview-pane')).toBeTruthy();
    expect(screen.getByTestId('hub-desktop-shell').getAttribute('data-preview')).toBe('on');

    fireEvent.click(screen.getByTestId('preview-toggle'));
    await waitFor(() => {
      expect(screen.queryByTestId('preview-pane')).toBeNull();
      expect(screen.getByTestId('hub-desktop-shell').getAttribute('data-preview')).toBe('off');
    });
    expect(window.localStorage.getItem('bg_hub_preview_open')).toBe('0');

    unmount();
    render(
      <MemoryRouter initialEntries={['/content/order-app?group=Home']}>
        <ContentHubPage />
      </MemoryRouter>,
    );
    await screen.findByTestId('hub-desktop-shell');
    expect(screen.queryByTestId('preview-pane')).toBeNull();
    expect(screen.getByTestId('hub-desktop-shell').getAttribute('data-preview')).toBe('off');
  });

  it('Order App defaults preview ON at >=1280 and OFF below when nothing stored', async () => {
    mockBlocks([sharedPhone]);

    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
    const wide = render(
      <MemoryRouter initialEntries={['/content/order-app?group=Home']}>
        <ContentHubPage />
      </MemoryRouter>,
    );
    await screen.findByTestId('hub-desktop-shell');
    expect(screen.getByTestId('hub-desktop-shell').getAttribute('data-preview')).toBe('on');
    expect(screen.getByTestId('preview-pane')).toBeTruthy();
    wide.unmount();

    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1100 });
    render(
      <MemoryRouter initialEntries={['/content/order-app?group=Home']}>
        <ContentHubPage />
      </MemoryRouter>,
    );
    await screen.findByTestId('hub-desktop-shell');
    expect(screen.getByTestId('hub-desktop-shell').getAttribute('data-preview')).toBe('off');
    expect(screen.queryByTestId('preview-pane')).toBeNull();
  });

  it('Website desktop has page tabs instead of a section rail', async () => {
    mockBlocks([sharedPhone]);
    render(
      <MemoryRouter initialEntries={['/content/website?group=Home']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    await screen.findByTestId('website-content-workspace');
    expect(screen.queryByTestId('section-rail')).toBeNull();
    expect(screen.queryByTestId('rail-collapse-btn')).toBeNull();
    expect(screen.getByTestId('wcw-tab-Home')).toBeTruthy();
  });

  it('Order App still has its section rail, and it still collapses', async () => {
    mockBlocks([sharedPhone]);
    render(
      <MemoryRouter initialEntries={['/content/order-app?group=Home']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    await screen.findByTestId('section-rail');
    expect(screen.getByTestId('section-rail').getAttribute('data-collapsed')).toBe('false');

    fireEvent.click(screen.getByTestId('rail-collapse-btn'));
    expect(screen.getByTestId('section-rail').getAttribute('data-collapsed')).toBe('true');
    expect(window.localStorage.getItem('bg_hub_rail_collapsed')).toBe('1');
  });
});

describe('ContentHub desktop width — mobile unchanged', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isMobileFlag = true;
    window.localStorage.clear();
    mockBlocks([sharedPhone]);
  });

  it('keeps section grid, no preview column, sheet still works', async () => {
    render(
      <MemoryRouter initialEntries={['/content/website?group=Home']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    await screen.findByTestId('section-editor');
    expect(screen.getByTestId('surface-builder-landing')).toBeTruthy();
    expect(screen.queryByTestId('hub-desktop-shell')).toBeNull();
    expect(screen.queryByTestId('preview-pane')).toBeNull();
    expect(screen.queryByTestId('preview-toggle')).toBeNull();

    fireEvent.click(screen.getByTestId('preview-sheet-btn'));
    await screen.findByTestId('preview-sheet');
    fireEvent.click(screen.getByTestId('preview-sheet-close'));
    await waitFor(() => {
      expect(screen.queryByTestId('preview-sheet')).toBeNull();
    });
  });
});
