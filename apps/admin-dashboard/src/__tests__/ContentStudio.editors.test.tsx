import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ContentHubPage } from '../pages/ContentHub/ContentHubPage';
import type { ContentBlock } from '../api/content';
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
    token: 't',
    website_url: 'https://example.test/preview',
    order_app_url: 'https://example.test/order/?previewToken=t',
    expires_in: 900,
  })),
  uploadContentVideo: vi.fn(),
}));

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }));
vi.mock('../hooks/useIsMobile', () => ({ useIsMobile: () => false }));
vi.mock('../components/ui', async () => {
  const actual = await vi.importActual<typeof import('../components/ui')>('../components/ui');
  return {
    ...actual,
    useToast: () => ({ success: vi.fn(), error: vi.fn() }),
  };
});
vi.mock('../components/MediaPicker', () => ({
  MediaPicker: () => null,
}));

const heroSlides = JSON.stringify([
  {
    image: '/images/a.jpg',
    eyebrow: 'Shared eyebrow',
    title: 'Shared title',
    subtitle: 'Sub',
    cta_text: 'Order',
    cta_url: '/order/',
    cta2_text: 'Menu',
    cta2_url: '/menu',
  },
]);

const categoriesShared = JSON.stringify([
  { icon: '🥐', label: 'Bakery', name: 'Pastries', hook: 'Fresh', image_url: '', link: '/menu' },
]);

function heroBlock(): ContentBlock {
  return {
    key: 'hero_slides',
    label: 'Hero Slides',
    group: 'Hero',
    type: 'json',
    editor: 'hero',
    apps: ['website', 'order_app'],
    shareable: true,
    public: true,
    shared: heroSlides,
    website: null,
    order_app: null,
    resolved_website: heroSlides,
    resolved_order_app: heroSlides,
    state: 'shared',
  };
}

function categoriesBlock(): ContentBlock {
  return {
    key: 'homepage_categories',
    label: 'Hedhikaa',
    group: 'Homepage',
    type: 'json',
    editor: 'categories',
    apps: ['website', 'order_app'],
    shareable: true,
    public: true,
    shared: categoriesShared,
    website: null,
    order_app: null,
    resolved_website: categoriesShared,
    resolved_order_app: categoriesShared,
    state: 'shared',
  };
}

describe('Content Hub visual editors', () => {
  beforeEach(() => {
    vi.mocked(contentApi.getContentBlocks).mockResolvedValue({
      locale: 'en',
      locales: ['en', 'dv'],
      blocks: [heroBlock(), categoriesBlock()],
    });
    vi.mocked(contentApi.uploadContentImage).mockResolvedValue({
      url: '/storage/site/website/hero.jpg',
      thumb_url: '/storage/site/website/thumbs/hero.jpg',
    });
  });

  it('hero editor edits a slide field into the active draft', async () => {
    render(
      <MemoryRouter initialEntries={['/content?group=Hero']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('Shared eyebrow')).toBeTruthy();
    });

    fireEvent.change(screen.getByDisplayValue('Shared eyebrow'), {
      target: { value: 'Edited eyebrow' },
    });
    expect(screen.getByDisplayValue('Edited eyebrow')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByTestId('live-preview-frame')).toBeTruthy();
    });
  });

  it('category image upload sets the draft image_url via crop endpoint', async () => {
    render(
      <MemoryRouter initialEntries={['/content?group=Homepage']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getAllByText('Hedhikaa').length).toBeGreaterThan(0);
    });

    const uploadBtn = screen.getAllByRole('button', { name: /^Upload$/ })[0];
    fireEvent.click(uploadBtn);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['x'], 'cat.jpg', { type: 'image/jpeg' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(contentApi.uploadContentImage).toHaveBeenCalledWith(
        'homepage_categories',
        'website',
        expect.any(File),
        undefined,
        'en',
      );
    });

    await waitFor(() => {
      expect(screen.getByDisplayValue('/storage/site/website/hero.jpg')).toBeTruthy();
    });
  });

  it('hides legacy hero_slide_* blocks from the editor list', async () => {
    vi.mocked(contentApi.getContentBlocks).mockResolvedValue({
      locale: 'en',
      locales: ['en', 'dv'],
      blocks: [
        heroBlock(),
        {
          ...heroBlock(),
          key: 'hero_slide_1',
          label: 'Hero Slide 1 (legacy)',
          editor: null,
        },
      ],
    });

    render(
      <MemoryRouter initialEntries={['/content?group=Hero']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getAllByText('Hero Slides').length).toBeGreaterThan(0);
    });
    expect(screen.queryByText('Hero Slide 1 (legacy)')).toBeNull();
  });
});
