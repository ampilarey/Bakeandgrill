import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ContentHubPage } from '../pages/ContentHub/ContentHubPage';
import * as contentApi from '../api/content';

let isMobileFlag = false;

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
  copyContentBlock: vi.fn(async () => ({ blocks: [] })),
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
}));
vi.mock('../components/MediaPicker', () => ({
  MediaPicker: () => null,
}));

const sharedPhone = {
  key: 'business_phone',
  label: 'Phone number',
  group: 'Contact',
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
  link_state: 'same' as const,
  brand_synced: false,
};

const splitPhone = {
  ...sharedPhone,
  state: 'split' as const,
  link_state: 'different' as const,
  shared: null,
  website: '+960 WEB',
  order_app: '+960 ORDER',
  resolved_website: '+960 WEB',
  resolved_order_app: '+960 ORDER',
};

const splitBoolean = {
  key: 'show_hours',
  label: 'Show hours',
  group: 'Contact',
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
  link_state: 'different' as const,
  brand_synced: false,
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

  it('split block renders tabs with only one editor in the DOM', async () => {
    mockBlocks([splitPhone]);
    render(
      <MemoryRouter initialEntries={['/content?group=Contact']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    await screen.findByTestId('scope-tabs-business_phone');
    expect(screen.getByDisplayValue('+960 WEB')).toBeTruthy();
    expect(screen.queryByDisplayValue('+960 ORDER')).toBeNull();
    expect(document.querySelectorAll('.content-preview-grid').length).toBe(0);

    fireEvent.click(screen.getByTestId('scope-tab-business_phone-order_app'));
    await waitFor(() => {
      expect(screen.getByDisplayValue('+960 ORDER')).toBeTruthy();
      expect(screen.queryByDisplayValue('+960 WEB')).toBeNull();
    });
  });

  it('edits write to the active tab scope and inactive tab shows a draft dot', async () => {
    mockBlocks([splitPhone]);
    render(
      <MemoryRouter initialEntries={['/content?group=Contact']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    await screen.findByDisplayValue('+960 WEB');
    fireEvent.change(screen.getByDisplayValue('+960 WEB'), { target: { value: '+960 WEB EDIT' } });

    fireEvent.click(screen.getByTestId('scope-tab-business_phone-order_app'));
    await waitFor(() => {
      expect(screen.getByDisplayValue('+960 ORDER')).toBeTruthy();
      expect(screen.getByTestId('scope-tab-dirty-business_phone-website')).toBeTruthy();
    });

    fireEvent.change(screen.getByDisplayValue('+960 ORDER'), { target: { value: '+960 ORDER EDIT' } });
    fireEvent.click(screen.getByTestId('scope-tab-business_phone-website'));
    await waitFor(() => {
      expect(screen.getByDisplayValue('+960 WEB EDIT')).toBeTruthy();
      expect(screen.getByTestId('scope-tab-dirty-business_phone-order_app')).toBeTruthy();
    });
  });

  it('Same in both renders one editor with no tabs', async () => {
    mockBlocks([sharedPhone]);
    render(
      <MemoryRouter initialEntries={['/content?group=Contact']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    await screen.findByDisplayValue('+960 SHARED');
    expect(screen.queryByTestId('scope-tabs-business_phone')).toBeNull();
  });

  it('boolean split block stays compact and untabbed', async () => {
    mockBlocks([splitBoolean]);
    render(
      <MemoryRouter initialEntries={['/content?group=Contact']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    await screen.findByTestId('boolean-scopes-show_hours');
    expect(screen.queryByTestId('scope-tabs-show_hours')).toBeNull();
  });

  it('History opens for the active tab scope', async () => {
    mockBlocks([splitPhone]);
    vi.mocked(contentApi.getContentRevisions).mockResolvedValue({ revisions: [] });
    render(
      <MemoryRouter initialEntries={['/content?group=Contact']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    await screen.findByTestId('scope-tabs-business_phone');
    fireEvent.click(screen.getByTestId('scope-tab-business_phone-order_app'));
    fireEvent.click(screen.getByTestId('block-more-business_phone'));
    fireEvent.click(screen.getByRole('menuitem', { name: /History/i }));

    await waitFor(() => {
      expect(contentApi.getContentRevisions).toHaveBeenCalledWith('business_phone', 'order_app', 'en');
    });
  });

  it('preview toggle docks/undocks and persists across remount', async () => {
    mockBlocks([sharedPhone]);
    window.localStorage.setItem('bg_hub_preview_open', '1');

    const { unmount } = render(
      <MemoryRouter initialEntries={['/content?group=Contact']}>
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
      <MemoryRouter initialEntries={['/content?group=Contact']}>
        <ContentHubPage />
      </MemoryRouter>,
    );
    await screen.findByTestId('hub-desktop-shell');
    expect(screen.queryByTestId('preview-pane')).toBeNull();
    expect(screen.getByTestId('hub-desktop-shell').getAttribute('data-preview')).toBe('off');
  });

  it('defaults preview ON at >=1600 and OFF below when nothing stored', async () => {
    mockBlocks([sharedPhone]);

    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1600 });
    const wide = render(
      <MemoryRouter initialEntries={['/content?group=Contact']}>
        <ContentHubPage />
      </MemoryRouter>,
    );
    await screen.findByTestId('hub-desktop-shell');
    expect(screen.getByTestId('hub-desktop-shell').getAttribute('data-preview')).toBe('on');
    expect(screen.getByTestId('preview-pane')).toBeTruthy();
    wide.unmount();

    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
    render(
      <MemoryRouter initialEntries={['/content?group=Contact']}>
        <ContentHubPage />
      </MemoryRouter>,
    );
    await screen.findByTestId('hub-desktop-shell');
    expect(screen.getByTestId('hub-desktop-shell').getAttribute('data-preview')).toBe('off');
    expect(screen.queryByTestId('preview-pane')).toBeNull();
  });

  it('rail collapse toggles icon strip and persists', async () => {
    mockBlocks([sharedPhone]);
    render(
      <MemoryRouter initialEntries={['/content?group=Contact']}>
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
      <MemoryRouter initialEntries={['/content?group=Contact']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    await screen.findByTestId('section-editor');
    expect(screen.getByTestId('section-rail-grid')).toBeTruthy();
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
