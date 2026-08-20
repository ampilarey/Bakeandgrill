import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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
  uploadContentFont: vi.fn(),
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

function brandBlock(key: string, label: string, type: string, shared: string | null = null) {
  return {
    key,
    label,
    group: 'Everywhere',
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
  group: 'Everywhere',
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

describe('Brand identity on Website Content', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
    vi.mocked(contentApi.getContentBlocks).mockResolvedValue({
      locale: 'en',
      locales: ['en', 'dv'],
      blocks: [...brandingBlocks, phoneBlock] as never,
    });
  });

  /**
   * The Brand Kit editor is gone from Website Content on purpose. Owner
   * decision 2026-08-14 moved logo, dark logo, favicon, link-preview image,
   * brand colour and the fallback item photo to Business Details so one logo
   * cannot have three different values. This file guards that they never grow
   * a second editable home here.
   */

  function mount() {
    return render(
      <MemoryRouter initialEntries={['/content/website?group=Everywhere']}>
        <ContentHubPage />
      </MemoryRouter>,
    );
  }

  it('offers no Brand Kit editor', async () => {
    mount();
    await screen.findByTestId('wcw-form-Everywhere');
    expect(screen.queryByTestId('brand-kit')).toBeNull();
    for (const card of BRAND_KIT_CARDS) {
      expect(screen.queryByTestId(`brand-kit-card-${card.key}`)).toBeNull();
      expect(screen.queryByTestId(`edit-brand-${card.key}`)).toBeNull();
    }
  });

  it('shows every brand setting read-only, pointing at Business Details', async () => {
    mount();
    await screen.findByTestId('wcw-form-Everywhere');

    for (const key of ['logo', 'logo_dark', 'favicon', 'og_image', 'primary_color']) {
      const field = screen.getByTestId(`wcw-field-${key}`);
      expect(within(field).getByTestId(`ops-owned-${key}`)).toBeTruthy();
      expect(within(field).queryByRole('textbox')).toBeNull();
    }
  });

  it('shows an ops-owned phone number with a link home, not an editor', async () => {
    mount();
    await screen.findByTestId('wcw-form-Everywhere');

    const field = screen.getByTestId('wcw-field-business_phone');
    expect(within(field).getByTestId('ops-owned-business_phone-value')).toHaveTextContent('+960 912 0011');
    expect(within(field).getByTestId('ops-owned-business_phone-link')).toHaveAttribute('href', '/business-details');
    expect(screen.queryByTestId('edit-business_phone')).toBeNull();
    expect(screen.queryByTestId('block-editor-sheet-business_phone')).toBeNull();
  });
});
