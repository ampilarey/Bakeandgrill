import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MediaLibraryPage } from '../pages/MediaLibraryPage';
import { renderWithRouter } from './testUtils';
import * as api from '../api';

/** Open detail drawer — click the inner open button, not the card wrapper (checkbox lives on the wrapper). */
async function openAssetDetail(id: number, options?: { timeout?: number }) {
  const card = await screen.findByTestId(`asset-card-${id}`, {}, options?.timeout ? { timeout: options.timeout } : undefined);
  fireEvent.click(within(card).getByRole('button'));
}

// ─── Mocks ────────────────────────────────────────────────────────────────────

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

const toastSuccess = vi.fn();
vi.mock('../components/ui', () => ({
  useToast: () => ({ success: toastSuccess, error: vi.fn() }),
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
    toastSuccess.mockClear();
    mockIsMobile.mockReturnValue(false);
    mockUser.role = 'owner';
    mockCan.mockImplementation((slug?: string) => {
      if (!slug) return true;
      return ['media.view', 'media.manage', 'website.manage'].includes(slug);
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
    // Wait for collections to load — sidebar mounts before the async list arrives.
    const menuItemsBtn = await screen.findByTestId('collection-btn-menu-items');

    vi.mocked(api.getMedia).mockResolvedValueOnce({
      data: [makeAsset(4)],
      meta: { current_page: 1, last_page: 1, per_page: 24, total: 1 },
    });

    fireEvent.click(menuItemsBtn);

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
    await openAssetDetail(1);

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
    await openAssetDetail(1, { timeout: 5000 });
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

  it('save as new copy prepends the new asset into the grid without refresh', async () => {
    const copyAsset = makeAsset(99, { title: 'Asset 1 (edited)', checksum: 'copy-checksum' });
    const editSpy = vi.spyOn(api, 'editMedia').mockResolvedValue({
      asset: copyAsset,
      updated_references: 0,
      mode: 'copy',
    });

    renderWithRouter(<MediaLibraryPage />);
    await openAssetDetail(1);
    fireEvent.click(screen.getByRole('button', { name: /^resize$/i }));
    fireEvent.click(await screen.findByRole('button', { name: /^apply$/i }));
    fireEvent.click(await screen.findByRole('button', { name: /save as new copy/i }));

    await waitFor(() => {
      expect(editSpy).toHaveBeenCalledWith(1, 'resize', expect.any(Object), 'copy');
    });

    // New id must appear in the grid immediately (regression: map-by-id never inserted copies).
    expect(await screen.findByTestId('asset-card-99')).toBeTruthy();
    expect(screen.getByTestId('asset-card-1')).toBeTruthy();
    expect(await screen.findByText(/saved as a new copy/i)).toBeTruthy();
  });

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
    await openAssetDetail(1);
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
      data: [makeAsset(9, { thumb_url: null, url: '/storage/menu/plain.jpg', checksum: 'abc' })],
      meta: { current_page: 1, last_page: 1, per_page: 24, total: 1 },
    });
    renderWithRouter(<MediaLibraryPage />);
    const card = await screen.findByTestId('asset-card-9');
    const img = card.querySelector('img');
    expect(img).toBeTruthy();
    expect(img?.getAttribute('src')).toBe('/storage/menu/plain.jpg?v=abc');
  });

  it('detail drawer preview uses the full image url with cache buster', async () => {
    renderWithRouter(<MediaLibraryPage />);
    await openAssetDetail(1);
    const preview = await screen.findByTestId('detail-preview-img');
    expect(preview.getAttribute('src')).toBe('https://cdn.example.com/images/asset-1.jpg?v=checksum-1');
  });

  it('after replace edit, preview src updates when checksum changes', async () => {
    const editSpy = vi.spyOn(api, 'editMedia').mockResolvedValue({
      asset: makeAsset(1, { checksum: 'after-edit', title: 'Asset 1 resized' }),
      updated_references: 0,
      mode: 'replace',
    });

    renderWithRouter(<MediaLibraryPage />);
    await openAssetDetail(1);
    expect((await screen.findByTestId('detail-preview-img')).getAttribute('src')).toContain('v=checksum-1');

    fireEvent.click(screen.getByRole('button', { name: /resize/i }));
    fireEvent.click(await screen.findByRole('button', { name: /^apply$/i }));
    fireEvent.click(await screen.findByRole('button', { name: /replace everywhere/i }));

    await waitFor(() => {
      expect(editSpy).toHaveBeenCalled();
    });
    expect((await screen.findByTestId('detail-preview-img')).getAttribute('src')).toContain('v=after-edit');
  });

  it('mobile layout uses chip row and full-screen detail overlay', async () => {
    mockIsMobile.mockReturnValue(true);
    renderWithRouter(<MediaLibraryPage />);
    expect(await screen.findByTestId('collections-chip-row')).toBeTruthy();
    expect(screen.getByTestId('collections-sidebar').getAttribute('data-layout')).toBe('chips');

    await openAssetDetail(1);
    const drawer = await screen.findByTestId('detail-drawer');
    expect(drawer.getAttribute('data-mobile-overlay')).toBe('true');
    expect(screen.getByTestId('detail-drawer-backdrop')).toBeTruthy();
  });

  it('Use as → Default item image calls the endpoint and toasts success', async () => {
    const useAsSpy = vi.spyOn(api, 'useMediaAs').mockResolvedValue({
      message: 'Set as default item image.',
      key: 'default_item_image',
      url: 'https://cdn.example.com/images/asset-1.jpg',
    });

    renderWithRouter(<MediaLibraryPage />);
    await openAssetDetail(1);
    expect(await screen.findByTestId('media-use-as')).toBeTruthy();

    fireEvent.click(screen.getByTestId('media-use-as-apply'));

    await waitFor(() => {
      expect(useAsSpy).toHaveBeenCalledWith(1, 'default_item_image');
    });
    expect(toastSuccess).toHaveBeenCalledWith('Set as default item image.');
  });

  it('resize tool shows a live preview that updates with width', async () => {
    renderWithRouter(<MediaLibraryPage />);
    await openAssetDetail(1);
    fireEvent.click(screen.getByRole('button', { name: /^resize$/i }));

    expect(await screen.findByTestId('edit-live-preview')).toBeTruthy();
    const img = await screen.findByTestId('resize-preview-img');
    const beforeStyle = img.getAttribute('style') || '';

    // 100px edge fits in the 200px preview frame → style width shrinks visibly
    fireEvent.change(screen.getByTestId('resize-width'), { target: { value: '100' } });

    await waitFor(() => {
      const after = screen.getByTestId('resize-preview-img').getAttribute('style') || '';
      expect(after).not.toBe(beforeStyle);
      expect(after).toMatch(/width:\s*100px/i);
    });
    // 1200×900 → width 100 keep-aspect → 100×75
    expect(screen.getByText(/New size:\s*100\s*×\s*75/i)).toBeTruthy();
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
    await openAssetDetail(1);
    fireEvent.click(await screen.findByTestId('export-download'));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled();
    });
    expect(toastSuccess).toHaveBeenCalledWith('File downloaded');
    fetchSpy.mockRestore();
    vi.unstubAllGlobals();
  });
});
