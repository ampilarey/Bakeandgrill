import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppContentEditor } from '../pages/ContentStudio/AppContentEditor';
import type { ContentBlock } from '../api/content';
import * as contentApi from '../api/content';

vi.mock('../api/content', () => ({
  getContentBlocks: vi.fn(),
  getContentSchedules: vi.fn(async () => ({ schedules: [] })),
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

const categoriesShared = JSON.stringify([
  { icon: '🥐', label: 'Bakery', name: 'Pastries', hook: 'Fresh', image_url: '', link: '/menu' },
  { icon: '', label: '', name: '', hook: '', image_url: '', link: '/menu' },
  { icon: '', label: '', name: '', hook: '', image_url: '', link: '/menu' },
  { icon: '', label: '', name: '', hook: '', image_url: '', link: '/menu' },
]);

function heroBlock(): ContentBlock {
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
    website: null,
    order_app: null,
    resolved_website: heroShared,
    resolved_order_app: heroShared,
    state: 'shared',
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

describe('ContentStudio visual editors (per-app)', () => {
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

  it('hero editor edits a slide field into the active website draft', async () => {
    render(
      <MemoryRouter>
        <AppContentEditor app="website" />
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

  it('category image upload sets the app-scoped draft image_url via crop endpoint', async () => {
    render(
      <MemoryRouter>
        <AppContentEditor app="website" />
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

  it('order app editor shows that app resolved hero values', async () => {
    const orderHero = {
      ...heroBlock(),
      order_app: JSON.stringify({
        ...JSON.parse(heroShared),
        eyebrow: 'Order eyebrow',
      }),
      resolved_order_app: JSON.stringify({
        ...JSON.parse(heroShared),
        eyebrow: 'Order eyebrow',
      }),
      state: 'split' as const,
    };
    vi.mocked(contentApi.getContentBlocks).mockResolvedValue({
      locale: 'en',
      locales: ['en', 'dv'],
      blocks: [orderHero, categoriesBlock()],
    });

    render(
      <MemoryRouter>
        <AppContentEditor app="order_app" />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('Order eyebrow')).toBeTruthy();
    });
    expect(screen.queryByText(/Make different per app/i)).toBeNull();
  });

  it('does not expose reset-to-shared or shareContentBlock', async () => {
    render(
      <MemoryRouter>
        <AppContentEditor app="website" />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getAllByText('Hero Slide 1').length).toBeGreaterThan(0);
    });

    expect(screen.queryByText(/Reset to shared/i)).toBeNull();
    expect(contentApi.shareContentBlock).not.toHaveBeenCalled();
    expect(contentApi.splitContentBlock).not.toHaveBeenCalled();
  });
});
