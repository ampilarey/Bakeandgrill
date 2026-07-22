import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ContentStudioPage from '../pages/ContentStudio/ContentStudioPage';
import type { ContentBlock } from '../api/content';
import * as contentApi from '../api/content';

vi.mock('../api/content', () => ({
  getContentBlocks: vi.fn(),
  getContentSchedules: vi.fn(async () => ({ schedules: [] })),
  updateContent: vi.fn(),
  shareContentBlock: vi.fn(),
  splitContentBlock: vi.fn(),
  copyContentBlock: vi.fn(),
  uploadContentImage: vi.fn(),
  exportContent: vi.fn(),
  importContent: vi.fn(),
  getContentRevisions: vi.fn(async () => ({ revisions: [] })),
  restoreContentRevision: vi.fn(),
  scheduleContent: vi.fn(),
  cancelContentSchedule: vi.fn(),
}));

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }));
vi.mock('../components/ui', async () => {
  const actual = await vi.importActual<typeof import('../components/ui')>('../components/ui');
  return {
    ...actual,
    useToast: () => ({ success: vi.fn(), error: vi.fn() }),
  };
});

const heroShared = JSON.stringify({
  image: '/images/a.jpg',
  eyebrow: 'Shared eyebrow',
  title: 'Shared title',
  subtitle: 'Sub',
  cta_text: 'Order',
  cta_url: '/order/',
  cta2_text: 'Menu',
  cta2_url: '/menu',
});

const heroWebsite = JSON.stringify({
  image: '/images/w.jpg',
  eyebrow: 'Web eyebrow',
  title: 'Web title',
  subtitle: 'Web sub',
  cta_text: 'Order',
  cta_url: '/order/',
  cta2_text: 'Menu',
  cta2_url: '/menu',
});

const categoriesShared = JSON.stringify([
  { icon: '🥐', label: 'Bakery', name: 'Pastries', hook: 'Fresh', image_url: '', link: '/menu' },
  { icon: '', label: '', name: '', hook: '', image_url: '', link: '/menu' },
  { icon: '', label: '', name: '', hook: '', image_url: '', link: '/menu' },
  { icon: '', label: '', name: '', hook: '', image_url: '', link: '/menu' },
]);

function heroBlock(state: 'shared' | 'split' = 'shared'): ContentBlock {
  return {
    key: 'hero_slide_1',
    label: 'Hero Slide 1',
    group: 'Hero',
    type: 'json',
    editor: 'hero',
    apps: ['website', 'order_app'],
    shareable: true,
    public: true,
    shared: heroShared,
    website: state === 'split' ? heroWebsite : null,
    order_app: state === 'split' ? heroShared : null,
    resolved_website: state === 'split' ? heroWebsite : heroShared,
    resolved_order_app: heroShared,
    state,
  };
}

function categoriesBlock(): ContentBlock {
  return {
    key: 'homepage_categories',
    label: 'Hedhikaa',
    group: 'Pages',
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

describe('ContentStudio visual editors', () => {
  beforeEach(() => {
    vi.mocked(contentApi.getContentBlocks).mockResolvedValue({
      locale: 'en',
      locales: ['en', 'dv'],
      blocks: [heroBlock('shared'), categoriesBlock()],
    });
    vi.mocked(contentApi.uploadContentImage).mockResolvedValue({
      url: '/storage/site/website/hero.jpg',
      thumb_url: '/storage/site/website/thumbs/hero.jpg',
    });
    vi.mocked(contentApi.splitContentBlock).mockResolvedValue({
      blocks: [heroBlock('split'), categoriesBlock()],
    });
    vi.mocked(contentApi.shareContentBlock).mockResolvedValue({
      blocks: [heroBlock('shared'), categoriesBlock()],
    });
  });

  it('hero editor edits a slide field into the active shared draft', async () => {
    render(
      <MemoryRouter>
        <ContentStudioPage />
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
      const previews = screen.getAllByTestId('content-live-preview');
      expect(previews.some((el) => el.textContent?.includes('Edited eyebrow'))).toBe(true);
    });
  });

  it('category image upload sets the scoped draft image_url via crop endpoint', async () => {
    render(
      <MemoryRouter>
        <ContentStudioPage />
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
        'shared',
        expect.any(File),
        undefined,
        'en',
      );
    });

    await waitFor(() => {
      expect(screen.getByDisplayValue('/storage/site/website/hero.jpg')).toBeTruthy();
    });
  });

  it('switching app tab shows that scope repeater rows after split', async () => {
    render(
      <MemoryRouter>
        <ContentStudioPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getAllByText('Hero Slide 1').length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByText(/Make different per app/i)[0]);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Website' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Order app' })).toBeTruthy();
    });

    expect(screen.getByDisplayValue('Web eyebrow')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Order app' }));
    await waitFor(() => {
      expect(screen.getByDisplayValue('Shared eyebrow')).toBeTruthy();
    });
  });

  it('reset-to-shared clears overrides', async () => {
    vi.mocked(contentApi.getContentBlocks).mockResolvedValue({
      locale: 'en',
      locales: ['en', 'dv'],
      blocks: [heroBlock('split'), categoriesBlock()],
    });

    window.confirm = vi.fn(() => true);

    render(
      <MemoryRouter>
        <ContentStudioPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Reset to shared/i)).toBeTruthy();
    });

    fireEvent.click(screen.getByText(/Reset to shared/i));

    await waitFor(() => {
      expect(contentApi.shareContentBlock).toHaveBeenCalledWith('hero_slide_1', 'en');
    });
  });
});
