import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ContentHubPage } from '../pages/ContentHub/ContentHubPage';
import * as contentApi from '../api/content';
import * as pageBlocksApi from '../api/pageBlocks';

/**
 * Order App Content — the same page-tab workspace the website got, with the
 * Order App's own tabs. Owner, 2026-08-15: "Let's start order app."
 *
 * Three tabs, not nine: Home is its sections, Everywhere is its own tab, and
 * the seven small screens that hold sixteen settings between them share
 * "Other pages" with a heading each. See contentWorkspaceConfig.
 */

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
  uploadContentFont: vi.fn(),
  uploadContentVideo: vi.fn(),
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
    generated_at: '2026-08-15T00:00:00Z',
    surfaces: [], issues: [], needs_review: [],
    summary: { issue_count: 0, needs_review_count: 0, surface_count: 14 },
  })),
}));

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }));
vi.mock('../components/ui', async () => {
  const actual = await vi.importActual<typeof import('../components/ui')>('../components/ui');
  return { ...actual, useToast: () => ({ success: vi.fn(), error: vi.fn() }) };
});
vi.mock('../components/MediaPicker', () => ({ MediaPicker: () => null }));

vi.mock('../api/pageBlocks', () => ({
  fetchAdminPageBlocks: vi.fn(async () => ({
    app: 'order_app',
    page: 'home',
    blocks: [
      { id: 11, app: 'order_app', page: 'home', block_type: 'greeting', position: 0, is_enabled: true, content_mode: 'own', settings: {}, label: 'Greeting', description: '', removable: true, supports_shared_content: false },
      { id: 12, app: 'order_app', page: 'home', block_type: 'office_orders', position: 1, is_enabled: false, content_mode: 'own', settings: {}, label: 'Office orders', description: '', removable: true, supports_shared_content: false },
    ],
    available_types: [], unknown_types: [], draft: false, version: 4, saved_at: null,
  })),
  reorderPageBlocks: vi.fn(),
  updatePageBlock: vi.fn(async () => ({ block: {}, version: 5, draft: true })),
  deletePageBlock: vi.fn(),
  createPageBlock: vi.fn(),
  createPageBlockPreviewToken: vi.fn(),
  publishPageBlocks: vi.fn(),
  discardPageBlockDraft: vi.fn(),
}));

function blk(key: string, group: string, extra: Record<string, unknown> = {}) {
  return {
    key,
    label: (extra.label as string) || key,
    group,
    type: (extra.type as string) || 'text',
    apps: ['order_app'] as Array<'website' | 'order_app'>,
    shareable: false,
    public: true,
    shared: null,
    website: null,
    order_app: 'current value',
    resolved_website: '',
    resolved_order_app: 'current value',
    state: 'order_app' as const,
    ...extra,
  };
}

/** One key from each Order App page, so every tab and heading has something. */
const blocks = [
  // Home — three different sections.
  blk('order_home_greeting_hello', 'Home', { label: 'Greeting' }),
  blk('order_mode_delivery_hint', 'Home', { label: 'Delivery hint' }),
  blk('office_orders_headline', 'Home', { label: 'Office orders headline' }),
  // Other pages — four different small screens.
  blk('menu_page_title', 'Menu', { label: 'Menu title' }),
  blk('order_checkout_title', 'Ordering', { label: 'Checkout title' }),
  blk('about_page_title', 'About', { label: 'About title' }),
  blk('privacy_page_title', 'Privacy', { label: 'Privacy title' }),
  // Everywhere.
  blk('footer_text', 'Everywhere', { label: 'Footer text' }),
];

function openOrderApp(path = '/content/order-app') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ContentHubPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  isMobileFlag = false;
  window.localStorage.clear();
  vi.mocked(contentApi.getContentBlocks).mockResolvedValue({
    locale: 'en',
    locales: ['en', 'dv'],
    blocks: blocks as never,
  });
});

describe('Order App Content — desktop', () => {
  it('opens on three tabs, and lands on Home without a landing screen first', async () => {
    openOrderApp();

    const workspace = await screen.findByTestId('order-app-content-workspace');
    expect(workspace.getAttribute('data-tab')).toBe('Home');

    const tabs = screen.getByRole('tablist', { name: /order app screens/i });
    expect(within(tabs).getAllByRole('tab').map((t) => t.textContent?.replace(/\d+$/, '')))
      .toEqual(['Home', 'Other pages', 'Everywhere']);

    // Not the website's tabs, and not the old landing.
    expect(screen.queryByTestId('wcw-tab-Contact page')).toBeNull();
    expect(screen.queryByTestId('surface-builder-landing')).toBeNull();
  });

  it('counts a combined tab as the sum of the pages inside it', async () => {
    openOrderApp();
    await screen.findByTestId('order-app-content-workspace');

    // Menu + Ordering + About + Privacy = 4 settings under one tab.
    expect(screen.getByTestId('wcw-tab-Other pages').textContent).toMatch(/4$/);
    expect(screen.getByTestId('wcw-tab-Everywhere').textContent).toMatch(/1$/);
  });

  it('shows Home as sections, closed, in screen order', async () => {
    openOrderApp();
    const sections = await screen.findByTestId('wcw-sections');

    const ids = within(sections)
      .getAllByTestId(/^wcw-section-(?!body|toggle|where|dirty)/)
      .map((el) => el.getAttribute('data-testid'));
    expect(ids).toEqual([
      'wcw-section-greeting',
      'wcw-section-order_buttons',
      'wcw-section-office_orders',
      'wcw-section-layout',
    ]);

    // Nothing lands in the catch-all: every key on Home has a section.
    expect(screen.queryByTestId('wcw-section-other')).toBeNull();
  });

  it('opens one section at a time, in place', async () => {
    openOrderApp();
    await screen.findByTestId('wcw-sections');

    fireEvent.click(screen.getByTestId('wcw-section-toggle-order_buttons'));
    const body = await screen.findByTestId('wcw-section-body-order_buttons');
    expect(within(body).getByTestId('wcw-field-order_mode_delivery_hint')).toBeTruthy();
    // Delivery / Pickup / Eat here headings inside the section.
    expect(within(body).getByTestId('wcw-group-Delivery')).toBeTruthy();

    fireEvent.click(screen.getByTestId('wcw-section-toggle-greeting'));
    await waitFor(() => {
      expect(screen.queryByTestId('wcw-section-body-order_buttons')).toBeNull();
    });
    expect(screen.getByTestId('wcw-section-body-greeting')).toBeTruthy();
  });

  it('reads each section Showing/Hidden from the Order App page blocks, not the website ones', async () => {
    openOrderApp();
    await screen.findByTestId('wcw-sections');

    await waitFor(() => {
      expect(screen.getByTestId('wcw-section-where-greeting').textContent).toMatch(/Desktop \+ mobile/);
    });
    expect(screen.getByTestId('wcw-section-where-office_orders').textContent).toMatch(/Hidden/);

    expect(pageBlocksApi.fetchAdminPageBlocks).toHaveBeenCalledWith('order_app', 'home');
  });

  it('turns a section back on from its own row, against the Order App', async () => {
    openOrderApp();
    await screen.findByTestId('wcw-sections');
    await waitFor(() => {
      expect(screen.getByTestId('wcw-section-where-office_orders')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('wcw-section-where-office_orders'));
    await waitFor(() => {
      expect(pageBlocksApi.updatePageBlock).toHaveBeenCalledWith(12, {
        app: 'order_app',
        page: 'home',
        version: 4,
        is_enabled: true,
      });
    });
  });

  it('puts each small screen under its own heading on the Other pages tab', async () => {
    openOrderApp();
    // Deliberately clicked as soon as the tabs exist, without waiting for the
    // one-time "open Home" landing to settle. An explicit tab click claims the
    // landing; before that fix this bounced straight back to Home.
    await screen.findByTestId('wcw-tab-Other pages');

    fireEvent.click(screen.getByTestId('wcw-tab-Other pages'));

    const form = await screen.findByTestId('wcw-form-Other pages');
    expect(within(form).getByTestId('wcw-group-Menu')).toBeTruthy();
    expect(within(form).getByTestId('wcw-group-Ordering')).toBeTruthy();
    expect(within(form).getByTestId('wcw-group-About')).toBeTruthy();
    expect(within(form).getByTestId('wcw-group-Privacy')).toBeTruthy();

    // All four pages' settings are on screen at once — and none is stranded.
    expect(within(form).getByTestId('wcw-field-menu_page_title')).toBeTruthy();
    expect(within(form).getByTestId('wcw-field-privacy_page_title')).toBeTruthy();
    expect(within(form).queryByTestId('wcw-group-Other')).toBeNull();

    // Home and Everywhere stay on their own tabs.
    expect(within(form).queryByTestId('wcw-field-footer_text')).toBeNull();
    expect(within(form).queryByTestId('wcw-field-office_orders_headline')).toBeNull();
  });

  it('keeps Section order & visibility at the bottom of Home, mounted while closed', async () => {
    openOrderApp();
    const sections = await screen.findByTestId('wcw-sections');
    const layout = within(sections).getByTestId('wcw-section-layout');
    expect(layout.getAttribute('data-open')).toBe('no');
    // Mounted-but-hidden, so an unpublished layout draft still reaches Publish.
    expect(within(layout).getByTestId('wcw-section-body-layout').hasAttribute('hidden')).toBe(true);
  });
});

describe('Order App Content — phone', () => {
  beforeEach(() => {
    isMobileFlag = true;
  });

  it('opens on a list of screens, not a row of tabs', async () => {
    openOrderApp();

    await screen.findByTestId('wcw-pagelist');
    expect(screen.getByTestId('wcw-blurb').textContent).toMatch(/screen by screen/i);
    expect(screen.getByTestId('wcw-page-Home')).toBeTruthy();
    expect(screen.getByTestId('wcw-page-Other pages')).toBeTruthy();
    expect(screen.getByTestId('wcw-page-Everywhere')).toBeTruthy();
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('opens a screen from the list and comes back to it', async () => {
    openOrderApp();
    await screen.findByTestId('wcw-pagelist');

    fireEvent.click(screen.getByTestId('wcw-page-Other pages'));
    const form = await screen.findByTestId('wcw-form-Other pages');
    expect(within(form).getByTestId('wcw-field-menu_page_title')).toBeTruthy();

    fireEvent.click(screen.getByTestId('wcw-mobile-back'));
    await waitFor(() => {
      expect(screen.getByTestId('wcw-pagelist')).toBeTruthy();
    });
  });
});
