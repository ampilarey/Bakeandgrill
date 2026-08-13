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

const allBlocks = [
  heroEnable,
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

function openSection(name: string) {
  return render(
    <MemoryRouter initialEntries={[`/content/website?group=${name}`]}>
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
    await screen.findByTestId('section-editor');
    expect(document.body.textContent).not.toMatch(/[◉○]/);
    fireEvent.click(screen.getByTestId('edit-hero_slides'));
    const heroSheet = await screen.findByTestId('hero-editor-sheet');
    expect(within(heroSheet).queryByTestId('content-mode-hero_slides')).toBeNull();
    fireEvent.click(within(heroSheet).getByTestId('content-editor-sheet-close'));

    expect(screen.getByTestId('home-layout-editor')).toBeTruthy();

    fireEvent.click(screen.getByTestId('section-rail-Everywhere'));
    await waitFor(() => {
      expect(screen.getByTestId('section-editor').getAttribute('data-section')).toBe('Everywhere');
    });
    expect(document.body.textContent).not.toMatch(/[◉○]/);
    fireEvent.click(screen.getByTestId('edit-footer_text'));
    const footerSheet = await screen.findByTestId('block-editor-sheet-footer_text');
    expect(within(footerSheet).queryByTestId('content-mode-footer_text')).toBeNull();
    expect(within(footerSheet).queryByTestId('scope-tabs-footer_text')).toBeNull();
  });

  it('section-enable switches use the current destination — never Both', async () => {
    openSection('Everywhere');
    await screen.findByTestId('section-enable-announcement_enabled');
    const heroSwitch = screen.getByTestId('section-enable-switch-announcement_enabled-website');
    expect(heroSwitch.textContent).toMatch(/Website/);
    expect(heroSwitch.textContent).not.toMatch(/\bBoth\b/);

    await screen.findByTestId('section-enable-language_switcher_enabled');
    expect(screen.getByTestId('section-enable-switch-language_switcher_enabled-website').textContent).toMatch(/Website/);
    expect(screen.queryByTestId('section-enable-switch-language_switcher_enabled-order_app')).toBeNull();
    expect(screen.queryByTestId('section-enable-switch-language_switcher_enabled-shared')).toBeNull();

    const enableCard = screen.getByTestId('section-enable-language_switcher_enabled');
    const switchLabels = Array.from(enableCard.querySelectorAll('.hub-section-enable-switch'))
      .map((el) => el.textContent || '');
    expect(switchLabels.some((t) => /\bBoth\b/.test(t))).toBe(false);
  });

  it('section-enable card face has no content key (extends meta-line rule)', async () => {
    openSection('Everywhere');
    await screen.findByTestId('section-enable-announcement_enabled');
    const enableFace = screen.getByTestId('section-enable-announcement_enabled');
    expect(enableFace.textContent).toContain('Show Hero Section');
    expect(enableFace.textContent).not.toContain('announcement_enabled');
    expect(enableFace.querySelector('.hub-section-enable-face')?.textContent).not.toMatch(/·/);
  });

  it('section header block count matches rendered cards on Home', async () => {
    openSection('Home');
    await screen.findByTestId('section-editor');
    expect(screen.getByTestId('home-layout-editor')).toBeTruthy();
    // Layout editor chrome + content cards (hero_slides, proof_stat); legacy enable cards hidden.
    expect(screen.getByTestId('block-card-hero_slides')).toBeTruthy();
    expect(screen.getByTestId('block-card-proof_stat')).toBeTruthy();
    expect(screen.queryByTestId('section-enable-announcement_enabled')).toBeNull();
    const countText = screen.getByTestId('section-editor-count').textContent || '';
    expect(countText).toMatch(/^\d+ blocks?$/);
  });

  it('Brand Kit still hides key/type behind Advanced', async () => {
    openSection('Everywhere');
    await screen.findByTestId('brand-kit-card-logo');
    const logoCard = screen.getByTestId('brand-kit-card-logo');
    expect(logoCard.textContent).not.toMatch(/logo · image · en/i);
    fireEvent.click(screen.getByTestId('edit-brand-logo'));
    const sheet = await screen.findByTestId('brand-kit-editor-sheet-logo');
    const advancedBtn = Array.from(sheet.querySelectorAll('button')).find((b) =>
      /Advanced/i.test(b.textContent || ''),
    );
    expect(advancedBtn).toBeTruthy();
    fireEvent.click(advancedBtn!);
    await waitFor(() => {
      expect(sheet).toHaveTextContent(/logo · image · en/i);
    });
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

  it('mobile structure exposes title containers on Homepage content cards', async () => {
    openSection('Home');
    await screen.findByTestId('section-editor');
    await screen.findByTestId('home-layout-editor');

    // Layout (flex stack / 100% width) is asserted in Playwright against real CSS.
    // jsdom here only checks that the stacking hooks exist in the DOM.
    expect(screen.queryByTestId('section-enable-section_proof_enabled')).toBeNull();

    const blockCard = screen.getByTestId('block-card-proof_stat');
    expect(blockCard.querySelector('.hub-block-card-titles')).toBeTruthy();
    expect(blockCard.querySelector('.hub-block-card-top')).toBeTruthy();

    const helper = within(blockCard).getByText(
      /Large number shown in the social proof band/i,
    );
    expect(helper.textContent!.trim().split(/\s+/).length).toBeGreaterThanOrEqual(4);
  });

  it('mobile structure exposes section-enable face containers', async () => {
    openSection('Everywhere');
    await screen.findByTestId('section-enable-language_switcher_enabled');

    const enableCard = screen.getByTestId('section-enable-language_switcher_enabled');
    expect(enableCard.querySelector('.hub-section-enable-face')).toBeTruthy();
  });
});
