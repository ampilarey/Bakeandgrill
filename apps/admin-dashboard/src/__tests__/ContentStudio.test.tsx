import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppContentEditor } from '../pages/ContentStudio/AppContentEditor';
import * as contentApi from '../api/content';

vi.mock('../api/content', () => ({
  getContentBlocks: vi.fn(),
  getContentSchedules: vi.fn(async () => ({ schedules: [] })),
  getContentDrafts: vi.fn(async () => ({ drafts: {}, saved_at: null })),
  saveContentDrafts: vi.fn(async () => ({ drafts: {}, saved_at: null })),
  updateContent: vi.fn(),
  shareContentBlock: vi.fn(),
  splitContentBlock: vi.fn(),
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
    token: 't', website_url: '/p', order_app_url: '/o', expires_in: 900,
  })),
  uploadContentVideo: vi.fn(),
}));

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }));
vi.mock('../components/ui', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

const phoneBlock = {
  key: 'business_phone',
  label: 'Phone number',
  group: 'Contact',
  type: 'text',
  apps: ['website', 'order_app'],
  shareable: true,
  public: true,
  shared: '+960 912 0011',
  website: null,
  order_app: null,
  resolved_website: '+960 912 0011',
  resolved_order_app: '+960 912 0011',
  state: 'shared' as const,
};

describe('ContentStudioPage (Website Content editor)', () => {
  beforeEach(() => {
    vi.mocked(contentApi.getContentBlocks).mockResolvedValue({
      locale: 'en',
      locales: ['en', 'dv'],
      blocks: [phoneBlock],
    });
  });

  it('loads registry blocks and shows resolved seed value without shared/split toggle', async () => {
    render(
      <MemoryRouter>
        <AppContentEditor app="website" />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Phone number')).toBeTruthy();
    });
    expect(screen.getByRole('heading', { name: 'Website Content' })).toBeTruthy();
    expect(screen.queryByText(/Make different per app/i)).toBeNull();
    expect(screen.getByDisplayValue('+960 912 0011')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Copy from Order App/i })).toBeTruthy();
  });

  it('opens Branding section from ?group=Branding deep link', async () => {
    vi.mocked(contentApi.getContentBlocks).mockResolvedValue({
      locale: 'en',
      locales: ['en', 'dv'],
      blocks: [
        {
          key: 'logo',
          label: 'Logo (Light)',
          group: 'Branding',
          type: 'image',
          apps: ['website', 'order_app'],
          shareable: true,
          public: true,
          shared: '/logo.png',
          website: null,
          order_app: null,
          resolved_website: '/logo.png',
          resolved_order_app: '/logo.png',
          state: 'shared',
        },
        {
          key: 'default_item_image',
          label: 'Default item photo',
          group: 'Branding',
          type: 'image',
          apps: ['website', 'order_app'],
          shareable: true,
          public: true,
          description: "Shown for menu items that don't have their own photo.",
          shared: '',
          website: null,
          order_app: null,
          resolved_website: '',
          resolved_order_app: '',
          state: 'shared',
        },
        phoneBlock,
      ],
    });

    render(
      <MemoryRouter initialEntries={['/content/website?group=Branding']}>
        <AppContentEditor app="website" />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Default item photo')).toBeTruthy();
    });
    expect(screen.getByText(/Shown for menu items that don't have their own photo/i)).toBeTruthy();
    expect(screen.queryByText('Phone number')).toBeNull();
    expect(screen.getByRole('button', { name: 'Branding' }).getAttribute('aria-pressed')).toBe('true');
  });
});
