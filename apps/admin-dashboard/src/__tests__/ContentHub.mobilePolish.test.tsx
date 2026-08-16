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
vi.mock('../components/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../components/ui')>();
  return {
    ...actual,
    useToast: () => ({ success: vi.fn(), error: vi.fn() }),
  };
});
vi.mock('../components/MediaPicker', () => ({
  MediaPicker: () => null,
}));

vi.mock('../api/pageBlocks', () => ({
  fetchAdminPageBlocks: vi.fn(async (app: string) => ({
    app,
    page: 'home',
    blocks: [
      {
        id: 1,
        app,
        page: 'home',
        block_type: 'hero',
        position: 0,
        is_enabled: true,
        content_mode: 'shared',
        settings: {},
        label: 'Hero banner',
        description: 'Top slideshow on the home page.',
        removable: true,
        supports_shared_content: true,
      },
    ],
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
  group: 'Everywhere',
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

const heroSlides = {
  key: 'hero_slides',
  label: 'Hero Slides',
  group: 'Home',
  type: 'json' as const,
  editor: 'hero' as const,
  apps: ['website', 'order_app'] as Array<'website' | 'order_app'>,
  shareable: true,
  public: true,
  shared: '[]',
  website: null,
  order_app: null,
  resolved_website: '[]',
  resolved_order_app: '[]',
  state: 'shared' as const,
  description: 'Carousel slides for the top of the homepage with image title and CTAs.',
};

const proofStat = {
  key: 'proof_stat',
  label: 'Proof headline number',
  group: 'Home',
  type: 'text' as const,
  apps: ['website'] as Array<'website' | 'order_app'>,
  shareable: false,
  public: true,
  shared: null,
  website: '500+',
  order_app: null,
  resolved_website: '500+',
  resolved_order_app: null,
  state: 'split' as const,
  description: 'Large number shown in the social proof band on the homepage.',
};

const footerEnable = {
  key: 'language_switcher_enabled',
  label: 'Show Footer',
  group: 'Everywhere',
  type: 'boolean' as const,
  apps: ['website', 'order_app'] as Array<'website' | 'order_app'>,
  shareable: true,
  public: true,
  section_enable: true,
  shared: null,
  website: 'true',
  order_app: 'false',
  resolved_website: 'true',
  resolved_order_app: 'false',
  state: 'split' as const,
};

const footerText = {
  key: 'footer_text',
  label: 'Footer tagline',
  group: 'Everywhere',
  type: 'text' as const,
  apps: ['website', 'order_app'] as Array<'website' | 'order_app'>,
  shareable: true,
  public: true,
  shared: 'Fresh every day',
  website: null,
  order_app: null,
  resolved_website: 'Fresh every day',
  resolved_order_app: 'Fresh every day',
  state: 'shared' as const,
  description: 'Short line under the logo in the site footer across pages.',
};

const logoBlock = {
  key: 'logo',
  label: 'Logo (Light)',
  group: 'Everywhere',
  type: 'image' as const,
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

const phoneBlock = {
  key: 'delivery_time',
  label: 'Phone number',
  group: 'Home',
  type: 'text' as const,
  apps: ['website', 'order_app'] as Array<'website' | 'order_app'>,
  shareable: true,
  public: true,
  shared: '30–45 min',
  website: null,
  order_app: null,
  resolved_website: '30–45 min',
  resolved_order_app: '30–45 min',
  state: 'shared' as const,
  description: 'Primary phone number shown on contact pages and the footer.',
};

/** Dual-app Home copy — the Order App phone still renders these as cards. */
const specialsTitle = {
  key: 'home_specials_title',
  label: 'Specials heading',
  group: 'Home',
  type: 'text' as const,
  apps: ['website', 'order_app'] as Array<'website' | 'order_app'>,
  shareable: true,
  public: true,
  shared: "Today's Specials",
  website: null,
  order_app: null,
  resolved_website: "Today's Specials",
  resolved_order_app: "Today's Specials",
  state: 'shared' as const,
  description: 'Large heading shown above the offers row on the homepage.',
};

const allBlocks = [
  heroEnable,
  specialsTitle,
  heroSlides,
  proofStat,
  footerEnable,
  footerText,
  logoBlock,
  phoneBlock,
];

function mockBlocks(blocks: unknown[] = allBlocks) {
  vi.mocked(contentApi.getContentBlocks).mockResolvedValue({
    locale: 'en',
    locales: ['en', 'dv'],
    blocks: blocks as never,
  });
}

function openSection(name: string, app: 'website' | 'order-app' = 'website') {
  return render(
    <MemoryRouter initialEntries={[`/content/${app}?group=${name}`]}>
      <ContentHubPage />
    </MemoryRouter>,
  );
}

describe('ContentHub mobile polish — systemic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isMobileFlag = false;
    window.localStorage.clear();
    mockBlocks();
  });

  it('does not render content-mode controls across multiple sections', async () => {
    openSection('Home');
    await screen.findByTestId('wcw-sections');
    expect(document.body.textContent).not.toMatch(/[◉○]/);

    const hero = await screen.findByTestId('wcw-section-body-hero');
    expect(within(hero).queryByTestId('content-mode-hero_slides')).toBeNull();

    fireEvent.click(screen.getByTestId('wcw-tab-Everywhere'));
    const form = await screen.findByTestId('wcw-form-Everywhere');
    expect(document.body.textContent).not.toMatch(/[◉○]/);
    const footer = within(form).getByTestId('wcw-field-footer_text');
    expect(within(footer).queryByTestId('content-mode-footer_text')).toBeNull();
    expect(within(footer).queryByTestId('scope-tabs-footer_text')).toBeNull();
  });

  it('an on/off setting writes to the current destination — never Both', async () => {
    openSection('Everywhere');
    const field = await screen.findByTestId('wcw-field-language_switcher_enabled');

    // One switch, for the page you are editing. No Website/Order App pair, no
    // "Both" — Website Content only ever writes the website.
    expect(within(field).getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.queryByTestId('scope-tabs-language_switcher_enabled')).toBeNull();
    expect(field.textContent).not.toMatch(/\bBoth\b/);
  });

  it('a field is named in words, never by its content key', async () => {
    openSection('Everywhere');
    const field = await screen.findByTestId('wcw-field-announcement_enabled');
    const label = field.querySelector('.wcw-field-label');
    expect(label?.textContent).toContain('Show Hero Section');
    expect(label?.textContent).not.toContain('announcement_enabled');
    expect(label?.textContent).not.toMatch(/·/);
  });

  it('Home shows its sections, and Section order & visibility stays reachable', async () => {
    openSection('Home');
    await screen.findByTestId('wcw-sections');
    expect(screen.getByTestId('home-layout-editor')).toBeTruthy();
    expect(screen.getByTestId('wcw-section-hero')).toBeTruthy();
    expect(screen.getByTestId('wcw-section-proof')).toBeTruthy();
    // The hero opens on arrival; proof waits until you ask for it.
    expect(screen.getByTestId('wcw-field-hero_slides')).toBeTruthy();
    expect(screen.queryByTestId('wcw-field-proof_stat')).toBeNull();

    fireEvent.click(screen.getByTestId('wcw-section-toggle-proof'));
    await waitFor(() => expect(screen.getByTestId('wcw-field-proof_stat')).toBeTruthy());
  });

  it('the logo is no longer editable here — it belongs to Business Details', async () => {
    openSection('Everywhere');
    const field = await screen.findByTestId('wcw-field-logo');
    expect(within(field).getByTestId('ops-owned-logo')).toBeTruthy();
    expect(screen.queryByTestId('brand-kit-card-logo')).toBeNull();
    expect(within(field).queryByRole('textbox')).toBeNull();
  });
});

describe('ContentHub mobile polish — stacking CSS + structure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isMobileFlag = true;
    window.localStorage.clear();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    mockBlocks();
  });

  it('a phone field keeps its name and its help text in separate containers', async () => {
    // The stacking itself is CSS and is asserted in Playwright against real
    // rules. jsdom can only check the hooks the CSS needs are in the DOM —
    // which is how the footer-links editor was caught not stacking.
    openSection('Home', 'order-app');
    await screen.findByTestId('order-app-content-workspace');
    fireEvent.click(await screen.findByTestId('wcw-section-toggle-specials'));

    const field = await screen.findByTestId('wcw-field-home_specials_title');
    expect(field.querySelector('.wcw-field-label')).toBeTruthy();

    const helper = within(field).getByText(/Large heading shown above the offers row/i);
    expect(helper.classList.contains('wcw-field-help')).toBe(true);
    expect(helper.textContent!.trim().split(/\s+/).length).toBeGreaterThanOrEqual(4);
  });

  it('an on/off setting is one labelled switch on a phone', async () => {
    openSection('Everywhere', 'order-app');
    const field = await screen.findByTestId('wcw-field-language_switcher_enabled');
    expect(within(field).getAllByRole('checkbox')).toHaveLength(1);
    expect(field.querySelector('.wcw-field-label')).toBeTruthy();
  });
});
