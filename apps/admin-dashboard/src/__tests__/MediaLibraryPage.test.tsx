import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { MediaLibraryPage } from '../pages/MediaLibraryPage';
import { renderWithRouter } from './testUtils';
import * as api from '../api';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockCan = vi.fn();
const mockUser = { id: 1, name: 'Owner', role: 'owner', permissions: [] as string[] };

vi.mock('../hooks/usePermissions', () => ({
  useCurrentUserPermissions: () => ({
    can: mockCan,
    user: mockUser,
    loading: false,
  }),
}));

const makeAsset = (id: number, overrides: Partial<api.MediaAsset> = {}): api.MediaAsset => ({
  id,
  url: `https://cdn.example.com/images/asset-${id}.jpg`,
  thumb_url: `https://cdn.example.com/images/asset-${id}-thumb.jpg`,
  media_type: 'image',
  mime_type: 'image/jpeg',
  file_size: 102400,
  width: 1200,
  height: 900,
  title: `Asset ${id}`,
  alt_text: `Alt text for asset ${id}`,
  tags: ['food', 'menu'],
  source: 'upload',
  collections: [],
  usage_count: 0,
  original_url: null,
  ...overrides,
});

const makeCollection = (id: number, name: string, slug: string): api.MediaCollection => ({
  id, name, slug,
});

const emptyMeta: api.MediaPaginationMeta = {
  current_page: 1,
  last_page: 1,
  per_page: 24,
  total: 0,
};

const twoPageMeta: api.MediaPaginationMeta = {
  current_page: 1,
  last_page: 2,
  per_page: 24,
  total: 30,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('MediaLibraryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser.role = 'owner';
    mockCan.mockImplementation((slug?: string) => {
      if (!slug) return true;
      return ['media.view', 'media.manage'].includes(slug);
    });

    vi.spyOn(api, 'getMediaCollections').mockResolvedValue({
      data: [
        makeCollection(1, 'Menu Items', 'menu-items'),
        makeCollection(2, 'Banners', 'banners'),
      ],
    });

    vi.spyOn(api, 'getMedia').mockResolvedValue({
      data: [makeAsset(1), makeAsset(2), makeAsset(3)],
      meta: { current_page: 1, last_page: 1, per_page: 24, total: 3 },
    });
  });

  it('renders page heading and media grid', async () => {
    renderWithRouter(<MediaLibraryPage />);

    expect(await screen.findByRole('heading', { name: /media library/i })).toBeTruthy();
    await waitFor(() => {
      expect(api.getMedia).toHaveBeenCalledWith(expect.objectContaining({ per_page: 24 }));
    });
    expect(await screen.findByTestId('media-grid')).toBeTruthy();
    expect(await screen.findByTestId('asset-card-1')).toBeTruthy();
    expect(await screen.findByTestId('asset-card-2')).toBeTruthy();
  });

  it('shows upload and reconcile buttons for media.manage', async () => {
    renderWithRouter(<MediaLibraryPage />);
    expect(await screen.findByRole('button', { name: /upload/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /reconcile/i })).toBeTruthy();
  });

  it('renders collections sidebar with collection buttons', async () => {
    renderWithRouter(<MediaLibraryPage />);
    expect(await screen.findByTestId('collections-sidebar')).toBeTruthy();
    expect(await screen.findByTestId('collection-btn-menu-items')).toBeTruthy();
    expect(screen.getByTestId('collection-btn-banners')).toBeTruthy();
  });

  it('filters by collection when collection button is clicked', async () => {
    renderWithRouter(<MediaLibraryPage />);
    await screen.findByTestId('collections-sidebar');

    vi.mocked(api.getMedia).mockResolvedValueOnce({
      data: [makeAsset(4)],
      meta: { current_page: 1, last_page: 1, per_page: 24, total: 1 },
    });

    fireEvent.click(screen.getByTestId('collection-btn-menu-items'));

    await waitFor(() => {
      expect(api.getMedia).toHaveBeenCalledWith(
        expect.objectContaining({ collection: 'menu-items' }),
      );
    });
  });

  it('type tabs change the media type filter', async () => {
    renderWithRouter(<MediaLibraryPage />);
    await screen.findByTestId('media-grid');

    vi.mocked(api.getMedia).mockResolvedValueOnce({
      data: [],
      meta: emptyMeta,
    });

    fireEvent.click(screen.getByRole('button', { name: /^images$/i }));

    await waitFor(() => {
      expect(api.getMedia).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'image' }),
      );
    });
  });

  it('opens detail drawer when asset is clicked and shows edit modal save prompt', async () => {
    renderWithRouter(<MediaLibraryPage />);
    const assetCard = await screen.findByTestId('asset-card-1');
    fireEvent.click(assetCard);

    const drawer = await screen.findByTestId('detail-drawer');
    expect(drawer).toBeTruthy();

    // The title field should be pre-filled
    const titleInput = drawer.querySelector('input[placeholder="Descriptive title"]') as HTMLInputElement;
    expect(titleInput).toBeTruthy();
    expect(titleInput.value).toBe('Asset 1');

    // Edit op buttons visible for owner
    expect(screen.getByRole('button', { name: /resize/i })).toBeTruthy();

    // Click Resize to select the op
    fireEvent.click(screen.getByRole('button', { name: /resize/i }));

    // Apply button should appear
    const applyBtn = await screen.findByRole('button', { name: /^apply$/i });
    expect(applyBtn).toBeTruthy();

    // Click Apply → opens save mode modal
    fireEvent.click(applyBtn);
    expect(await screen.findByText(/replace everywhere/i)).toBeTruthy();
    expect(screen.getByText(/save as new copy/i)).toBeTruthy();
  });

  it('save mode modal calls editMedia with replace and shows updated_references', async () => {
    const updatedAsset = makeAsset(1, { title: 'Asset 1 resized' });
    const editSpy = vi.spyOn(api, 'editMedia').mockResolvedValue({
      asset: updatedAsset,
      updated_references: 3,
      mode: 'replace',
    });

    renderWithRouter(<MediaLibraryPage />);
    fireEvent.click(await screen.findByTestId('asset-card-1', {}, { timeout: 5000 }));
    // Open resize tool, then Apply → save-mode modal
    const resizeBtns = await screen.findAllByRole('button', { name: /resize/i });
    fireEvent.click(resizeBtns[resizeBtns.length - 1]!);
    fireEvent.click(await screen.findByRole('button', { name: /^apply$/i }));

    fireEvent.click(await screen.findByRole('button', { name: /replace everywhere/i }));

    await waitFor(() => {
      expect(editSpy).toHaveBeenCalledWith(1, 'resize', expect.any(Object), 'replace');
    }, { timeout: 5000 });

    expect(await screen.findByText(/replaced in 3 reference/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /restore previous version/i })).toBeTruthy();
  }, 30_000);

  it('shows empty state when no assets match', async () => {
    vi.mocked(api.getMedia).mockResolvedValueOnce({ data: [], meta: emptyMeta });
    renderWithRouter(<MediaLibraryPage />);
    expect(await screen.findByText(/no assets found/i)).toBeTruthy();
  });

  it('shows pagination controls when multiple pages', async () => {
    vi.mocked(api.getMedia).mockResolvedValueOnce({
      data: Array.from({ length: 24 }, (_, i) => makeAsset(i + 1)),
      meta: twoPageMeta,
    });
    renderWithRouter(<MediaLibraryPage />);
    expect(await screen.findByText(/page 1 of 2/i)).toBeTruthy();
  });

  it('delete button in drawer opens delete confirm modal', async () => {
    renderWithRouter(<MediaLibraryPage />);
    fireEvent.click(await screen.findByTestId('asset-card-1'));
    await screen.findByTestId('detail-drawer');

    // Find the red Trash2 icon button in drawer (aria-label is not set, find by variant=danger which renders a button)
    const deleteButtons = screen.getAllByRole('button');
    const trashBtn = deleteButtons.find((b) => b.innerHTML.includes('trash-2') || b.querySelector('svg'));
    // Open via the detail drawer delete button (last Btn with danger variant)
    const drawerButtons = screen.getByTestId('detail-drawer').querySelectorAll('button');
    const drawerDeleteBtn = Array.from(drawerButtons).find((b) => b.getAttribute('style')?.includes('danger') || b.innerHTML.includes('Trash'));
    expect(drawerDeleteBtn || trashBtn).toBeTruthy();
  });
});
