import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
}));
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

const heroSlides = {
  key: 'hero_slides',
  label: 'Hero Slides',
  group: 'Hero',
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
  link_state: 'same' as const,
  brand_synced: false,
  description: 'Carousel slides for the top of the homepage with image title and CTAs.',
};

const homeEnable = {
  key: 'section_proof_enabled',
  label: 'Show Social Proof',
  group: 'Homepage',
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

const proofStat = {
  key: 'proof_stat',
  label: 'Proof headline number',
  group: 'Homepage',
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
  link_state: 'different' as const,
  brand_synced: false,
  description: 'Large number shown in the social proof band on the homepage.',
};

const footerEnable = {
  key: 'section_footer_enabled',
  label: 'Show Footer',
  group: 'Footer',
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
  link_state: 'different' as const,
  brand_synced: false,
};

const footerText = {
  key: 'footer_tagline',
  label: 'Footer tagline',
  group: 'Footer',
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
  link_state: 'same' as const,
  brand_synced: false,
  description: 'Short line under the logo in the site footer across pages.',
};

const logoBlock = {
  key: 'logo',
  label: 'Logo (Light)',
  group: 'Branding',
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
  link_state: 'same' as const,
  brand_synced: true,
};

const phoneBlock = {
  key: 'business_phone',
  label: 'Phone number',
  group: 'Contact',
  type: 'text' as const,
  apps: ['website', 'order_app'] as Array<'website' | 'order_app'>,
  shareable: true,
  public: true,
  shared: '+960 912 0011',
  website: null,
  order_app: null,
  resolved_website: '+960 912 0011',
  resolved_order_app: '+960 912 0011',
  state: 'shared' as const,
  link_state: 'same' as const,
  brand_synced: false,
  description: 'Primary phone number shown on contact pages and the footer.',
};

const allBlocks = [
  heroEnable,
  heroSlides,
  homeEnable,
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
    <MemoryRouter initialEntries={[`/content?group=${name}`]}>
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

  it('never renders mockup ◉/○ content-mode notation across multiple sections', async () => {
    openSection('Hero');
    await screen.findByTestId('section-editor');
    expect(document.body.textContent).not.toMatch(/[◉○]/);
    expect(screen.getByTestId('content-mode-hero_slides').textContent).toMatch(/Where these banners appear/);
    expect(screen.getByTestId('content-mode-hero_slides').textContent).toMatch(/Shared with Website and Order App/);
    expect(screen.getByTestId('content-mode-hero_slides').textContent).toMatch(/Customise for each app/);
    expect(screen.getByTestId('content-mode-hero_slides').textContent).toMatch(/customise separately/i);

    fireEvent.click(screen.getByTestId('section-rail-Homepage'));
    await waitFor(() => {
      expect(screen.getByTestId('section-editor').getAttribute('data-section')).toBe('Homepage');
    });
    expect(document.body.textContent).not.toMatch(/[◉○]/);
    // Homepage chrome is the page_blocks layout editor (legacy order card hidden).
    expect(screen.getByTestId('home-layout-editor')).toBeTruthy();

    fireEvent.click(screen.getByTestId('section-rail-Footer'));
    await waitFor(() => {
      expect(screen.getByTestId('section-editor').getAttribute('data-section')).toBe('Footer');
    });
    expect(document.body.textContent).not.toMatch(/[◉○]/);
    expect(screen.getAllByLabelText(/Shared with Website and Order App/i).length).toBeGreaterThan(0);
  });

  it('section-enable switches use Show this section / Website / Order app — never Both', async () => {
    openSection('Hero');
    await screen.findByTestId('section-enable-section_hero_enabled');
    const heroSwitch = screen.getByTestId('section-enable-switch-section_hero_enabled-shared');
    expect(heroSwitch.textContent).toMatch(/Show this section/);
    expect(heroSwitch.textContent).not.toMatch(/\bBoth\b/);

    // Split enable on Footer
    fireEvent.click(screen.getByTestId('section-rail-Footer'));
    await screen.findByTestId('section-enable-section_footer_enabled');
    expect(screen.getByTestId('section-enable-switch-section_footer_enabled-website').textContent).toMatch(/Website/);
    expect(screen.getByTestId('section-enable-switch-section_footer_enabled-order_app').textContent).toMatch(/Order app/);
    expect(screen.queryByTestId('section-enable-switch-section_footer_enabled-shared')).toBeNull();

    const enableCard = screen.getByTestId('section-enable-section_footer_enabled');
    const switchLabels = Array.from(enableCard.querySelectorAll('.hub-section-enable-switch'))
      .map((el) => el.textContent || '');
    expect(switchLabels.some((t) => /\bBoth\b/.test(t))).toBe(false);
  });

  it('section-enable card face has no content key (extends meta-line rule)', async () => {
    openSection('Hero');
    await screen.findByTestId('section-enable-section_hero_enabled');
    const enableFace = screen.getByTestId('section-enable-section_hero_enabled');
    expect(enableFace.textContent).toContain('Show Hero Section');
    expect(enableFace.textContent).not.toContain('section_hero_enabled');
    expect(enableFace.querySelector('.hub-section-enable-face')?.textContent).not.toMatch(/·/);

    // Regular BlockCard path still holds
    expect(screen.queryByText(/hero_slides\s*·/i)).toBeNull();
    fireEvent.click(screen.getByTestId('block-more-hero_slides'));
    await waitFor(() => {
      expect(screen.getByTestId('block-menu-hero_slides').textContent).toContain('hero_slides');
    });
  });

  it('section header block count matches rendered cards on multiple sections', async () => {
    openSection('Hero');
    await screen.findByTestId('section-editor');
    // enable + hero slides = 2
    expect(screen.getByTestId('section-editor-count').textContent).toBe('2 blocks');
    const heroCards = document.querySelectorAll(
      '[data-testid="section-enable-section_hero_enabled"], [data-testid="block-card-hero_slides"]',
    );
    expect(heroCards.length).toBe(2);

    fireEvent.click(screen.getByTestId('section-rail-Homepage'));
    await waitFor(() => {
      expect(screen.getByTestId('section-editor').getAttribute('data-section')).toBe('Homepage');
    });
    // Layout editor chrome + proof_stat content card (legacy enable card hidden).
    expect(screen.getByTestId('home-layout-editor')).toBeTruthy();
    expect(screen.getByTestId('section-editor-count').textContent).toMatch(/^1 blocks?$/);
    expect(screen.getByTestId('block-card-proof_stat')).toBeTruthy();
    expect(screen.queryByTestId('section-enable-section_proof_enabled')).toBeNull();
  });

  it('scope tabs still say Website / Order app (labelForScope not broken)', async () => {
    openSection('Footer');
    await screen.findByTestId('section-enable-section_footer_enabled');

    vi.mocked(contentApi.splitContentBlock).mockResolvedValue({
      blocks: allBlocks.map((b) =>
        b.key === 'footer_tagline'
          ? {
              ...footerText,
              state: 'split' as const,
              link_state: 'different' as const,
              shared: null,
              website: 'Web line',
              order_app: 'Order line',
              resolved_website: 'Web line',
              resolved_order_app: 'Order line',
            }
          : b,
      ) as never,
    });

    const mode = screen.getByTestId('content-mode-footer_tagline');
    fireEvent.click(within(mode).getByLabelText(/Customise for Website and Order App/i));
    await screen.findByTestId('scope-tabs-footer_tagline');
    expect(screen.getByTestId('scope-tab-footer_tagline-website').textContent).toMatch(/Website/);
    expect(screen.getByTestId('scope-tab-footer_tagline-order_app').textContent).toMatch(/Order app/);
  });

  it('Brand Kit still hides key/type behind Advanced', async () => {
    openSection('Branding');
    await screen.findByTestId('brand-kit-card-logo');
    const logoCard = screen.getByTestId('brand-kit-card-logo');
    expect(logoCard.textContent).not.toMatch(/logo · image · en/i);
    const advancedBtn = Array.from(logoCard.querySelectorAll('button')).find((b) =>
      /Advanced/i.test(b.textContent || ''),
    );
    expect(advancedBtn).toBeTruthy();
    fireEvent.click(advancedBtn!);
    await waitFor(() => {
      expect(logoCard).toHaveTextContent(/logo · image · en/i);
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
    openSection('Homepage');
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
    openSection('Footer');
    await screen.findByTestId('section-enable-section_footer_enabled');

    const enableCard = screen.getByTestId('section-enable-section_footer_enabled');
    expect(enableCard.querySelector('.hub-section-enable-face')).toBeTruthy();
  });
});
