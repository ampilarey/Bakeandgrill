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
  key: 'delivery_time',
  label: 'Phone number',
  group: 'Contact',
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
      <MemoryRouter initialEntries={['/content/website?group=Contact']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    await screen.findByTestId('section-editor');
    expect(screen.getByTestId('section-rail')).toBeTruthy();
    expect(screen.getByTestId('preview-pane')).toBeTruthy();
  });

  it('?group=Branding deep link activates Branding in rail', async () => {
    render(
      <MemoryRouter initialEntries={['/content/website?group=Branding']}>
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
      <MemoryRouter initialEntries={['/content/website?group=Contact']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    await screen.findByTestId('section-editor');
    expect(screen.queryByTestId('section-dirty-Contact & map')).toBeNull();

    fireEvent.click(screen.getByTestId('edit-delivery_time'));
    const sheet = await screen.findByTestId('block-editor-sheet-delivery_time');
    const phoneInput = within(sheet).getByDisplayValue('30–45 min');
    fireEvent.change(phoneInput, { target: { value: '25–40 min' } });

    await waitFor(() => {
      expect(screen.getByTestId('section-dirty-Contact & map')).toBeTruthy();
    });
  });

  it('label search shows dropdown and clicking result navigates to section', async () => {
    render(
      <MemoryRouter initialEntries={['/content/website?group=Branding']}>
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

    // Editor should switch to Contact & map
    await waitFor(() => {
      expect(screen.getByTestId('section-editor').getAttribute('data-section')).toBe('Contact & map');
    });
  });

  it('block face has no key·type meta line; ⋯ menu has History and key', async () => {
    render(
      <MemoryRouter initialEntries={['/content/website?group=Contact']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    await screen.findByTestId('section-editor');

    // Face should NOT contain "delivery_time · text"
    expect(screen.queryByText(/delivery_time\s*·\s*text/i)).toBeNull();

    // Open ⋯ menu
    const moreBtn = screen.getByTestId('block-more-delivery_time');
    fireEvent.click(moreBtn);

    await waitFor(() => {
      expect(screen.getByTestId('block-menu-delivery_time')).toBeTruthy();
    });

    const menu = screen.getByTestId('block-menu-delivery_time');
    expect(menu.textContent).toMatch(/History/i);
    expect(menu.textContent).toContain('delivery_time');
  });

  it('section-enable card face has no content key either', async () => {
    vi.mocked(contentApi.getContentBlocks).mockResolvedValue({
      locale: 'en',
      locales: ['en', 'dv'],
      blocks: [
        {
          ...phoneBlock,
          key: 'section_contact_enabled',
          label: 'Show Contact Section',
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
      <MemoryRouter initialEntries={['/content/website?group=Contact']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    const enable = await screen.findByTestId('section-enable-section_contact_enabled');
    expect(enable.textContent).toContain('Show Contact Section');
    expect(enable.textContent).not.toContain('section_contact_enabled');
    expect(enable.querySelector('.hub-section-enable-face')?.textContent).not.toMatch(/·/);
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
      <MemoryRouter initialEntries={['/content/website?group=Contact']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    await screen.findByTestId('surface-builder-landing');
    // No column-variant preview pane on mobile (sheet is closed)
    expect(screen.queryByTestId('preview-pane')).toBeNull();
  });

  it('tapping a task card opens editor sheet; close returns to overview', async () => {
    render(
      <MemoryRouter>
        <ContentHubPage />
      </MemoryRouter>,
    );

    await screen.findByTestId('surface-builder-landing');

    expect(screen.queryByTestId('section-editor')).toBeNull();
    expect(screen.queryByTestId('content-editor-sheet')).toBeNull();

    fireEvent.click(screen.getByTestId('task-card-brand_profile'));

    const sheet = await screen.findByTestId('content-editor-sheet');
    expect(within(sheet).getByTestId('section-editor').getAttribute('data-section')).toBe('Branding');
    expect(within(sheet).getByTestId('draft-save-status')).toBeTruthy();

    fireEvent.click(within(sheet).getByTestId('content-editor-sheet-close'));

    await waitFor(() => {
      expect(screen.queryByTestId('content-editor-sheet')).toBeNull();
      expect(screen.queryByTestId('section-editor')).toBeNull();
    });
  });

  it('preview sheet opens and closes via sheet header Preview button', async () => {
    render(
      <MemoryRouter initialEntries={['/content/website?group=Contact']}>
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
