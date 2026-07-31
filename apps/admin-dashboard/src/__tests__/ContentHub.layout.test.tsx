import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ContentHubPage } from '../pages/ContentHub/ContentHubPage';
import * as contentApi from '../api/content';

// Mutable flag — changed per describe/it to toggle mobile vs desktop
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

const phoneBlock = {
  key: 'business_phone',
  label: 'Phone number',
  group: 'Contact',
  type: 'text',
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
};

const logoBlock = {
  key: 'logo',
  label: 'Logo (Light)',
  group: 'Branding',
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
  link_state: 'same' as const,
  brand_synced: true,
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

  it('shows section rail, editor, and preview pane', async () => {
    render(
      <MemoryRouter initialEntries={['/content?group=Contact']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    await screen.findByTestId('section-editor');
    expect(screen.getByTestId('section-rail')).toBeTruthy();
    expect(screen.getByTestId('preview-pane')).toBeTruthy();
  });

  it('?group=Branding deep link activates Branding in rail', async () => {
    render(
      <MemoryRouter initialEntries={['/content?group=Branding']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('section-rail-Branding').getAttribute('aria-pressed')).toBe('true');
    });
    expect(screen.getByTestId('section-editor').getAttribute('data-section')).toBe('Branding');
  });

  it('dirty dot appears when section has unsaved drafts', async () => {
    render(
      <MemoryRouter initialEntries={['/content?group=Contact']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    await screen.findByTestId('section-editor');
    expect(screen.queryByTestId('section-dirty-Contact')).toBeNull();

    const phoneInput = screen.getByDisplayValue('+960 912 0011');
    fireEvent.change(phoneInput, { target: { value: '+960 999 9999' } });

    await waitFor(() => {
      expect(screen.getByTestId('section-dirty-Contact')).toBeTruthy();
    });
  });

  it('label search shows dropdown and clicking result navigates to section', async () => {
    render(
      <MemoryRouter initialEntries={['/content?group=Branding']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    await screen.findByTestId('section-editor');

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

    // Editor should switch to Contact
    await waitFor(() => {
      expect(screen.getByTestId('section-editor').getAttribute('data-section')).toBe('Contact');
    });
  });

  it('block face has no key·type meta line; ⋯ menu has History and key', async () => {
    render(
      <MemoryRouter initialEntries={['/content?group=Contact']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    await screen.findByTestId('section-editor');

    // Face should NOT contain "business_phone · text"
    expect(screen.queryByText(/business_phone\s*·\s*text/i)).toBeNull();

    // Open ⋯ menu
    const moreBtn = screen.getByTestId('block-more-business_phone');
    fireEvent.click(moreBtn);

    await waitFor(() => {
      expect(screen.getByTestId('block-menu-business_phone')).toBeTruthy();
    });

    const menu = screen.getByTestId('block-menu-business_phone');
    expect(menu.textContent).toMatch(/History/i);
    expect(menu.textContent).toContain('business_phone');
  });
});

describe('ContentHub layout — mobile (useIsMobile=true)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isMobileFlag = true;
    setup();
  });

  it('shows section grid and no preview column on mobile', async () => {
    render(
      <MemoryRouter initialEntries={['/content?group=Contact']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    await screen.findByTestId('section-rail-grid');
    // No column-variant preview pane on mobile (sheet is closed)
    expect(screen.queryByTestId('preview-pane')).toBeNull();
  });

  it('tapping a section card opens editor; back button returns to overview', async () => {
    render(
      <MemoryRouter>
        <ContentHubPage />
      </MemoryRouter>,
    );

    // Wait for grid to load
    await screen.findByTestId('section-rail-grid');

    // SectionEditor not visible yet
    expect(screen.queryByTestId('section-editor')).toBeNull();

    // Click Contact card
    const contactCard = screen.getByTestId('section-card-Contact');
    fireEvent.click(contactCard);

    // Editor appears
    await screen.findByTestId('section-editor');
    expect(screen.getByTestId('section-editor').getAttribute('data-section')).toBe('Contact');

    // Press back
    fireEvent.click(screen.getByTestId('section-editor-back'));

    // Editor disappears
    await waitFor(() => {
      expect(screen.queryByTestId('section-editor')).toBeNull();
    });
  });

  it('preview sheet opens and closes via floating button', async () => {
    render(
      <MemoryRouter initialEntries={['/content?group=Contact']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    await screen.findByTestId('section-editor');

    // No preview-pane column
    expect(screen.queryByTestId('preview-pane')).toBeNull();

    // Open preview sheet
    fireEvent.click(screen.getByTestId('preview-sheet-btn'));
    await screen.findByTestId('preview-sheet');
    expect(screen.getByTestId('preview-pane')).toBeTruthy();

    // Close preview sheet
    fireEvent.click(screen.getByTestId('preview-sheet-close'));
    await waitFor(() => {
      expect(screen.queryByTestId('preview-sheet')).toBeNull();
    });
  });
});
