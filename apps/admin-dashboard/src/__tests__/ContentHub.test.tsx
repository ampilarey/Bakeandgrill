import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ContentHubPage } from '../pages/ContentHub/ContentHubPage';
import * as contentApi from '../api/content';

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
  link_state: 'same' as const,
  brand_synced: false,
};

const logoBlock = {
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
  state: 'shared' as const,
  link_state: 'same' as const,
  brand_synced: true,
};

describe('ContentHubPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(contentApi.getContentBlocks).mockResolvedValue({
      locale: 'en',
      locales: ['en', 'dv'],
      blocks: [phoneBlock, logoBlock],
    });
    vi.mocked(contentApi.shareContentBlock).mockImplementation(async () => ({
      blocks: [phoneBlock, logoBlock],
    }));
    vi.mocked(contentApi.splitContentBlock).mockImplementation(async () => ({
      blocks: [
        { ...phoneBlock, state: 'split', link_state: 'different', website: '+960 111', order_app: '+960 222' },
        logoBlock,
      ],
    }));
  });

  it('renders Content & Branding hub sections', async () => {
    render(
      <MemoryRouter>
        <ContentHubPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Content & Branding' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Branding' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Contact' })).toBeTruthy();
  });

  it('shows Same/Different control and splits into two editors', async () => {
    render(
      <MemoryRouter>
        <ContentHubPage />
      </MemoryRouter>,
    );

    await screen.findByText('Phone number');
    expect(screen.getByText(/Content:/i)).toBeTruthy();
    expect(screen.getByLabelText(/Different per app/i)).toBeTruthy();

    fireEvent.click(screen.getByLabelText(/Different per app/i));

    await waitFor(() => {
      expect(contentApi.splitContentBlock).toHaveBeenCalledWith('business_phone', 'en');
    });

    await waitFor(() => {
      expect(screen.getByDisplayValue('+960 111')).toBeTruthy();
      expect(screen.getByDisplayValue('+960 222')).toBeTruthy();
    });

    fireEvent.click(screen.getByLabelText(/Same in both/i));
    await waitFor(() => {
      expect(contentApi.shareContentBlock).toHaveBeenCalledWith('business_phone', 'en');
    });
  });

  it('branding block has no link control', async () => {
    render(
      <MemoryRouter initialEntries={['/content?group=Branding']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    await screen.findByText('Logo — for light backgrounds');
    expect(screen.queryByText('Phone number')).toBeNull();
    expect(screen.queryByLabelText(/Different per app/i)).toBeNull();
    expect(screen.queryByLabelText(/Same in both/i)).toBeNull();
  });

  it('opens Branding from ?group= deep link', async () => {
    render(
      <MemoryRouter initialEntries={['/content?group=Branding']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Branding' }).getAttribute('aria-pressed')).toBe('true');
    });
    expect(screen.getByText('Logo — for light backgrounds')).toBeTruthy();
    expect(screen.queryByText('Phone number')).toBeNull();
  });
});

describe('legacy content routes redirect to hub', () => {
  it('redirects /content/website to /content', async () => {
    const { WebsiteContentPage } = await import('../pages/ContentStudio/ContentStudioPage');
    render(
      <MemoryRouter initialEntries={['/content/website']}>
        <Routes>
          <Route path="/content/website" element={<WebsiteContentPage />} />
          <Route path="/content" element={<div>Hub</div>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('Hub')).toBeTruthy();
  });
});
