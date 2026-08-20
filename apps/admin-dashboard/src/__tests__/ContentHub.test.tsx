import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ContentHubPage } from '../pages/ContentHub/ContentHubPage';
import * as contentApi from '../api/content';

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

const phoneBlock = {
  key: 'home_specials_title',
  label: 'Phone number',
  group: 'Home',
  type: 'text',
  apps: ['website', 'order_app'],
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
  group: 'Everywhere',
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
};

describe('ContentHubPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(contentApi.getContentBlocks).mockResolvedValue({
      locale: 'en',
      locales: ['en', 'dv'],
      blocks: [phoneBlock, logoBlock],
    });
    vi.mocked(contentApi.updateContent).mockResolvedValue({
      blocks: [phoneBlock, logoBlock],
    });
  });

  it('renders Content & Branding hub sections', async () => {
    render(
      <MemoryRouter>
        <ContentHubPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: /Editing Website/i })).toBeTruthy();
    // Page tabs carry a count chip, so match the tab itself.
    expect(screen.getByTestId('wcw-tab-Everywhere')).toBeTruthy();
    expect(screen.getByTestId('wcw-tab-Home')).toBeTruthy();
  });

  it('edits dual-app content in the current destination scope without mode controls', async () => {
    render(
      <MemoryRouter initialEntries={['/content/website?group=Home']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByTestId('wcw-section-toggle-specials'));
    const sheet = await screen.findByTestId('wcw-field-home_specials_title');
    expect(within(sheet).queryByTestId('content-mode-home_specials_title')).toBeNull();
    expect(within(sheet).queryByTestId('scope-tabs-home_specials_title')).toBeNull();
    expect(within(sheet).getByDisplayValue('30–45 min')).toBeTruthy();

    fireEvent.change(within(sheet).getByDisplayValue('30–45 min'), {
      target: { value: 'WEB ETA EDIT' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: /Publish/i })[0]);

    await waitFor(() => {
      expect(contentApi.updateContent).toHaveBeenCalledWith(
        [{ key: 'home_specials_title', scope: 'website', value: 'WEB ETA EDIT', locale: 'en' }],
        'en',
      );
    });
  });

  it('the logo is read-only here — it lives in Business Details', async () => {
    render(
      <MemoryRouter initialEntries={['/content/website?group=Everywhere']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    const field = await screen.findByTestId('wcw-field-logo');
    expect(within(field).getByTestId('ops-owned-logo')).toBeTruthy();
    expect(screen.queryByText('Phone number')).toBeNull();
    expect(screen.queryByTestId(/content-mode-/)).toBeNull();
  });

  it('opens Everywhere from ?group=Branding deep link alias', async () => {
    render(
      <MemoryRouter initialEntries={['/content/website?group=Everywhere']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('wcw-tab-Everywhere').getAttribute('aria-selected')).toBe('true');
    });
    expect(screen.getByTestId('wcw-field-logo')).toBeTruthy();
    expect(screen.queryByText('Phone number')).toBeNull();
  });

});

describe('content hub destinations', () => {
  it('keeps /content/website and /content/order-app as separate destinations', async () => {
    render(
      <MemoryRouter initialEntries={['/content/website']}>
        <Routes>
          <Route path="/content" element={<div>Chooser</div>} />
          <Route path="/content/website" element={<div>Website hub</div>} />
          <Route path="/content/order-app" element={<div>Order hub</div>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('Website hub')).toBeTruthy();
    expect(screen.queryByText('Chooser')).toBeNull();
  });
});
