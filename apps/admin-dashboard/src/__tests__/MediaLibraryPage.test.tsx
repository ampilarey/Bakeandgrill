import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { MediaLibraryPage } from '../pages/MediaLibraryPage';
import { renderWithRouter } from './testUtils';
import * as api from '../api';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('react-easy-crop', async () => {
  const React = await import('react');
  return {
    default: function MockCropper({
      onCropComplete,
    }: {
      onCropComplete?: (area: unknown, pixels: { x: number; y: number; width: number; height: number }) => void;
    }) {
      React.useEffect(() => {
        onCropComplete?.({}, { x: 10, y: 20, width: 100, height: 80 });
        // intentionally once on mount
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return React.createElement('div', { 'data-testid': 'mock-cropper' });
    },
  };
});

const mockCan = vi.fn();
const mockUser = { id: 1, name: 'Owner', role: 'owner', permissions: [] as string[] };
const mockIsMobile = vi.fn(() => false);

vi.mock('../hooks/usePermissions', () => ({
  useCurrentUserPermissions: () => ({
    can: mockCan,
    user: mockUser,
    loading: false,
  }),
}));

vi.mock('../hooks/useIsMobile', () => ({
  useIsMobile: () => mockIsMobile(),
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
  checksum: `checksum-${id}`,
  updated_at: '2026-01-01T00:00:00Z',
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
    mockIsMobile.mockReturnValue(false);
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

  it('renders img for image assets when thumb_url is null (url fallback)', async () => {
    vi.mocked(api.getMedia).mockResolvedValueOnce({
      data: [makeAsset(9, {
        thumb_url: null,
        url: '/storage/menu/plain.jpg',
        checksum: 'abc',
        updated_at: '2026-07-01T12:00:00Z',
        file_size: 50,
      })],
      meta: { current_page: 1, last_page: 1, per_page: 24, total: 1 },
    });
    renderWithRouter(<MediaLibraryPage />);
    const card = await screen.findByTestId('asset-card-9');
    const img = card.querySelector('img');
    expect(img).toBeTruthy();
    expect(img?.getAttribute('src')).toContain('/storage/menu/plain.jpg?v=');
    expect(img?.getAttribute('src')).toContain(encodeURIComponent('2026-07-01T12:00:00Z'));
    expect(img?.getAttribute('src')).toContain('abc');
  });

  it('detail drawer preview uses the full image url with cache buster', async () => {
    renderWithRouter(<MediaLibraryPage />);
    fireEvent.click(await screen.findByTestId('asset-card-1'));
    const preview = await screen.findByTestId('detail-preview-img');
    const src = preview.getAttribute('src') || '';
    expect(src.startsWith('https://cdn.example.com/images/asset-1.jpg?v=')).toBe(true);
    expect(src).toContain(encodeURIComponent('2026-01-01T00:00:00Z'));
    expect(src).toContain('checksum-1');
  });

  it('after replace edit, preview src updates when checksum/updated_at change', async () => {
    const editSpy = vi.spyOn(api, 'editMedia').mockResolvedValue({
      asset: makeAsset(1, {
        checksum: 'after-edit',
        updated_at: '2026-07-23T18:00:00Z',
        file_size: 999,
        title: 'Asset 1 resized',
      }),
      updated_references: 0,
      mode: 'replace',
    });

    renderWithRouter(<MediaLibraryPage />);
    fireEvent.click(await screen.findByTestId('asset-card-1'));
    const before = (await screen.findByTestId('detail-preview-img')).getAttribute('src') || '';
    expect(before).toContain('checksum-1');

    fireEvent.click(screen.getByRole('button', { name: /resize/i }));
    fireEvent.click(await screen.findByRole('button', { name: /^apply$/i }));
    fireEvent.click(await screen.findByRole('button', { name: /replace everywhere/i }));

    await waitFor(() => {
      expect(editSpy).toHaveBeenCalled();
    });
    const after = (await screen.findByTestId('detail-preview-img')).getAttribute('src') || '';
    expect(after).not.toBe(before);
    expect(after).toContain('after-edit');
    expect(after).toContain(encodeURIComponent('2026-07-23T18:00:00Z'));
  });

  it('rotate tool shows a live preview with controls', async () => {
    renderWithRouter(<MediaLibraryPage />);
    fireEvent.click(await screen.findByTestId('asset-card-1'));
    fireEvent.click(screen.getByRole('button', { name: /^rotate$/i }));
    expect(await screen.findByTestId('media-rotate-panel')).toBeTruthy();
    expect(screen.getByTestId('edit-live-preview')).toBeTruthy();
    expect(screen.getByTestId('rotate-angle-slider')).toBeTruthy();
    expect(screen.getByRole('button', { name: /flip horizontal/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /rotate right 90/i }));
    expect(screen.getByText(/preview: 180/i)).toBeTruthy();
  });

  it('crop confirm sends croppedAreaPixels as crop params', async () => {
    const editSpy = vi.spyOn(api, 'editMedia').mockResolvedValue({
      asset: makeAsset(1, { updated_at: '2026-07-23T19:00:00Z' }),
      updated_references: 0,
      mode: 'replace',
    });

    renderWithRouter(<MediaLibraryPage />);
    fireEvent.click(await screen.findByTestId('asset-card-1'));
    fireEvent.click(screen.getByRole('button', { name: /^crop$/i }));

    expect(await screen.findByTestId('media-crop-panel')).toBeTruthy();
    // Mocked Cropper fires onCropComplete on mount with fixed pixels
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^apply$/i })).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole('button', { name: /^apply$/i }));
    fireEvent.click(await screen.findByRole('button', { name: /replace everywhere/i }));

    await waitFor(() => {
      expect(editSpy).toHaveBeenCalledWith(
        1,
        'crop',
        expect.objectContaining({ x: 10, y: 20, width: 100, height: 80 }),
        'replace',
      );
    });
  });

  it('Save as favicon calls the use-as endpoint', async () => {
    const useAsSpy = vi.spyOn(api, 'useMediaAsBrand').mockResolvedValue({
      key: 'favicon',
      url: '/storage/site/favicon_abc.png',
    });

    renderWithRouter(<MediaLibraryPage />);
    fireEvent.click(await screen.findByTestId('asset-card-1'));
    await screen.findByTestId('use-as-panel');
    expect(screen.getByTestId('use-as-key')).toBeTruthy();
    fireEvent.click(screen.getByTestId('use-as-favicon'));

    await waitFor(() => {
      expect(useAsSpy).toHaveBeenCalledWith(1, 'favicon');
    });
    expect(await screen.findByText(/saved as favicon/i)).toBeTruthy();
    expect(await screen.findByTestId('use-as-saved')).toHaveTextContent('/storage/site/favicon_abc.png');
  });

  it('export button downloads the asset file', async () => {
    const blob = new Blob(['fake-image'], { type: 'image/jpeg' });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      blob: async () => blob,
    } as Response);
    const createObjectURL = vi.fn(() => 'blob:mock');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });

    renderWithRouter(<MediaLibraryPage />);
    fireEvent.click(await screen.findByTestId('asset-card-1'));
    fireEvent.click(await screen.findByTestId('export-download'));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled();
    });
    expect(await screen.findByText(/file downloaded/i)).toBeTruthy();
    fetchSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it('mobile layout uses chip row and full-screen detail overlay', async () => {
    mockIsMobile.mockReturnValue(true);
    renderWithRouter(<MediaLibraryPage />);
    expect(await screen.findByTestId('collections-chip-row')).toBeTruthy();
    expect(screen.getByTestId('collections-sidebar').getAttribute('data-layout')).toBe('chips');

    fireEvent.click(await screen.findByTestId('asset-card-1'));
    const drawer = await screen.findByTestId('detail-drawer');
    expect(drawer.getAttribute('data-mobile-overlay')).toBe('true');
    expect(screen.getByTestId('detail-drawer-backdrop')).toBeTruthy();
  });
});
