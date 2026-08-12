import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Navigate, Route, Routes } from 'react-router-dom';
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
    expect(screen.getByRole('button', { name: 'Contact & map' })).toBeTruthy();
  });

  it('shows Same/Different control and splits into scoped tabs', async () => {
    render(
      <MemoryRouter initialEntries={['/content?group=Contact']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    await screen.findByText('Phone number');
    fireEvent.click(screen.getByTestId('edit-business_phone'));
    const sheet = await screen.findByTestId('block-editor-sheet-business_phone');
    expect(within(sheet).getByTestId('content-mode-business_phone')).toBeTruthy();
    expect(within(sheet).getByLabelText(/Customise for Website and Order App/i)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/[◉○]/);

    fireEvent.click(within(sheet).getByLabelText(/Customise for Website and Order App/i));

    await waitFor(() => {
      expect(contentApi.splitContentBlock).toHaveBeenCalledWith('business_phone', 'en');
    });

    await waitFor(() => {
      expect(within(sheet).getByTestId('scope-tabs-business_phone')).toBeTruthy();
      expect(within(sheet).getByDisplayValue('+960 111')).toBeTruthy();
      expect(within(sheet).queryByDisplayValue('+960 222')).toBeNull();
    });

    fireEvent.click(within(sheet).getByTestId('scope-tab-business_phone-order_app'));
    await waitFor(() => {
      expect(within(sheet).getByDisplayValue('+960 222')).toBeTruthy();
      expect(within(sheet).queryByDisplayValue('+960 111')).toBeNull();
    });

    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('Website');
    fireEvent.click(within(sheet).getByLabelText(/Shared with Website and Order App/i));
    await waitFor(() => {
      expect(contentApi.shareContentBlock).toHaveBeenCalledWith('business_phone', 'en', { source: 'website' });
    });
    promptSpy.mockRestore();
  });

  it('passes discard draft_action after confirmation when mode changes with dirty drafts', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(
      <MemoryRouter initialEntries={['/content?group=Contact']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByTestId('edit-business_phone'));
    const sheet = await screen.findByTestId('block-editor-sheet-business_phone');
    await within(sheet).findByDisplayValue('+960 912 0011');
    fireEvent.change(within(sheet).getByDisplayValue('+960 912 0011'), {
      target: { value: '+960 DRAFT' },
    });
    fireEvent.click(within(sheet).getByLabelText(/Customise for Website and Order App/i));

    await waitFor(() => {
      expect(contentApi.splitContentBlock).toHaveBeenCalledWith('business_phone', 'en', { draft_action: 'discard' });
    });
    expect(confirmSpy).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('branding block has no link control', async () => {
    render(
      <MemoryRouter initialEntries={['/content?group=Branding']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    await screen.findByText('Logo — for light backgrounds');
    expect(screen.queryByText('Phone number')).toBeNull();
    expect(screen.queryByLabelText(/Customise for Website and Order App/i)).toBeNull();
    expect(screen.queryByLabelText(/Shared with Website and Order App/i)).toBeNull();
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

  it('copy-from-other-app appears only on split blocks and calls the copy endpoint', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(contentApi.getContentBlocks).mockResolvedValue({
      locale: 'en',
      locales: ['en', 'dv'],
      blocks: [
        {
          ...phoneBlock,
          state: 'split',
          link_state: 'different',
          shared: null,
          website: '+960 WEB',
          order_app: '+960 ORDER',
          resolved_website: '+960 WEB',
          resolved_order_app: '+960 ORDER',
        },
        logoBlock,
      ],
    });
    vi.mocked(contentApi.copyContentBlock).mockResolvedValue({
      blocks: [
        {
          ...phoneBlock,
          state: 'split',
          link_state: 'different',
          shared: null,
          website: '+960 ORDER',
          order_app: '+960 ORDER',
          resolved_website: '+960 ORDER',
          resolved_order_app: '+960 ORDER',
        },
        logoBlock,
      ],
    });

    render(
      <MemoryRouter initialEntries={['/content?group=Contact']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    await screen.findByText('Phone number');
    fireEvent.click(screen.getByTestId('block-more-business_phone'));
    expect(screen.getByTestId('copy-from-order-business_phone')).toBeTruthy();
    expect(screen.queryByTestId('copy-from-website-business_phone')).toBeNull();

    fireEvent.click(screen.getByTestId('copy-from-order-business_phone'));
    await waitFor(() => {
      expect(contentApi.copyContentBlock).toHaveBeenCalledWith(
        'business_phone',
        'order_app',
        'website',
        'en',
      );
    });
    expect(confirmSpy).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('edit-business_phone'));
    const sheet = await screen.findByTestId('block-editor-sheet-business_phone');
    await waitFor(() => {
      expect(within(sheet).getAllByDisplayValue('+960 ORDER').length).toBeGreaterThanOrEqual(1);
    });

    confirmSpy.mockRestore();
  });

  it('copy-from-other-app is hidden for Same-in-both and branding blocks', async () => {
    render(
      <MemoryRouter initialEntries={['/content?group=Contact']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    await screen.findByText('Phone number');
    fireEvent.click(screen.getByTestId('block-more-business_phone'));
    expect(screen.queryByTestId('copy-from-website-business_phone')).toBeNull();
    expect(screen.queryByTestId('copy-from-order-business_phone')).toBeNull();

    // Branding has no Same/Different control and no copy actions in the hub.
    fireEvent.click(screen.getByRole('button', { name: 'Branding' }));
    await screen.findByText('Logo — for light backgrounds');
    expect(screen.queryByTestId('copy-from-website-logo')).toBeNull();
    expect(screen.queryByTestId('copy-from-order-logo')).toBeNull();
    expect(screen.queryByTestId('block-more-logo')).toBeNull();
  });
});

describe('legacy content routes redirect to hub', () => {
  it('redirects /content/website to /content', async () => {
    // Mirrors App.tsx Navigate routes (legacy ContentStudioPage redirects removed).
    render(
      <MemoryRouter initialEntries={['/content/website']}>
        <Routes>
          <Route path="/content/website" element={<Navigate to="/content" replace />} />
          <Route path="/content" element={<div>Hub</div>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('Hub')).toBeTruthy();
  });
});
