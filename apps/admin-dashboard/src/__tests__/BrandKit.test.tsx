import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ContentHubPage } from '../pages/ContentHub/ContentHubPage';
import * as contentApi from '../api/content';
import { BRAND_KIT_CARDS } from '../pages/ContentHub/brandKitConfig';

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
    token: 't', website_url: '/p', order_app_url: '/o', expires_in: 900,
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

function brandBlock(key: string, label: string, type: string, shared: string | null = null) {
  return {
    key,
    label,
    group: 'Branding',
    type,
    apps: ['website', 'order_app'] as Array<'website' | 'order_app'>,
    shareable: true,
    public: true,
    shared,
    website: null,
    order_app: null,
    resolved_website: shared ?? '',
    resolved_order_app: shared ?? '',
    state: 'shared' as const,
  };
}

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
  managed_by: {
    owner_label: 'Business Details',
    owner_path: '/admin/business-details',
    note: 'Shared operational business profile used on receipts, invoices, signage and public contact.',
    current_value: '+960 912 0011',
  },
};

const brandingBlocks = [
  brandBlock('logo', 'Logo', 'image', '/logo.png'),
  brandBlock('logo_dark', 'Logo Dark', 'image', null),
  brandBlock('favicon', 'Favicon', 'image', null),
  brandBlock('og_image', 'Link preview image', 'image', null),
  brandBlock('primary_color', 'Primary Color', 'color', null),
  brandBlock('default_item_image', 'Default item photo', 'image', null),
];

describe('Brand Kit UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(contentApi.getContentBlocks).mockResolvedValue({
      locale: 'en',
      locales: ['en', 'dv'],
      blocks: [...brandingBlocks, phoneBlock],
    });
  });

  it('renders Brand Kit cards for Branding and leaves other groups unchanged', async () => {
    render(
      <MemoryRouter initialEntries={['/content/website?group=Branding']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    expect(await screen.findByTestId('brand-kit')).toBeTruthy();
    expect(screen.queryByTestId('brand-kit-banner')).toBeNull();
    for (const card of BRAND_KIT_CARDS) {
      const el = screen.getByTestId(`brand-kit-card-${card.key}`);
      expect(el).toBeTruthy();
      expect(el).toHaveTextContent(card.title);
    }
    expect(screen.queryByText('Phone number')).toBeNull();
    expect(screen.queryByTestId(/content-mode-/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Contact & map' }));
    expect(await screen.findByText('Phone number')).toBeTruthy();
    expect(screen.queryByTestId('brand-kit')).toBeNull();
    // Business Details owned — read-only summary, no editor sheet / Save path.
    expect(screen.getByTestId('ops-owned-business_phone')).toBeTruthy();
    expect(screen.getByTestId('ops-owned-business_phone-value')).toHaveTextContent('+960 912 0011');
    expect(screen.getByTestId('ops-owned-business_phone-link')).toHaveAttribute('href', '/business-details');
    expect(screen.queryByTestId('edit-business_phone')).toBeNull();
    expect(screen.queryByTestId('block-editor-sheet-business_phone')).toBeNull();
  });

  it('shows one primary upload action and hides raw URL until Advanced', async () => {
    render(
      <MemoryRouter initialEntries={['/content/website?group=Branding']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    await screen.findByTestId('brand-kit-card-logo');
    const logoCard = screen.getByTestId('brand-kit-card-logo');
    expect(logoCard.querySelectorAll('[data-testid="brand-kit-dropzone"]').length).toBe(0);
    fireEvent.click(screen.getByTestId('edit-brand-logo'));
    const sheet = await screen.findByTestId('brand-kit-editor-sheet-logo');
    expect(within(sheet).getAllByTestId('brand-kit-dropzone').length).toBe(1);
    expect(within(sheet).queryByPlaceholderText('/storage/…')).toBeNull();

    const advancedBtn = Array.from(sheet.querySelectorAll('button')).find((b) =>
      /Advanced/i.test(b.textContent || ''),
    );
    expect(advancedBtn).toBeTruthy();
    fireEvent.click(advancedBtn!);
    await waitFor(() => {
      expect(within(sheet).getByPlaceholderText('/storage/…')).toBeTruthy();
    });
    expect(sheet).toHaveTextContent(/logo · image · en · Website/i);
  });

  it('empty asset shows Not set on overview and default copy in editor', async () => {
    render(
      <MemoryRouter initialEntries={['/content/website?group=Branding']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    await screen.findByTestId('brand-kit-card-favicon');
    const faviconCard = screen.getByTestId('brand-kit-card-favicon');
    expect(faviconCard).toHaveTextContent('Not set');
    const logoCard = screen.getByTestId('brand-kit-card-logo');
    expect(logoCard).toHaveTextContent('Showing');
    fireEvent.click(screen.getByTestId('edit-brand-favicon'));
    const sheet = await screen.findByTestId('brand-kit-editor-sheet-favicon');
    expect(sheet).toHaveTextContent('Not set — using the default');
  });
});
