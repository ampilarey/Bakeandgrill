import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, render } from '@testing-library/react';
import { MediaPicker } from '../components/MediaPicker';
import * as api from '../api';
import type { MediaAsset } from '../api';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const makeAsset = (id: number, overrides: Partial<MediaAsset> = {}): MediaAsset => ({
  id,
  url: `https://cdn.example.com/images/asset-${id}.jpg`,
  thumb_url: `https://cdn.example.com/images/asset-${id}-thumb.jpg`,
  media_type: 'image',
  mime_type: 'image/jpeg',
  file_size: 204800,
  width: 1200,
  height: 900,
  title: `Photo ${id}`,
  alt_text: null,
  tags: [],
  source: 'upload',
  collections: [],
  usage_count: 2,
  original_url: null,
  ...overrides,
});

const emptyMeta = { current_page: 1, last_page: 1, per_page: 24, total: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(api, 'getMediaCollections').mockResolvedValue({
    data: [{ id: 1, name: 'Menu Items', slug: 'menu-items' }],
  });
  vi.spyOn(api, 'getMedia').mockResolvedValue({
    data: [makeAsset(10), makeAsset(20), makeAsset(30)],
    meta: { current_page: 1, last_page: 1, per_page: 24, total: 3 },
  });
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('MediaPicker', () => {
  it('does not render when closed', () => {
    render(
      <MediaPicker open={false} onClose={() => {}} onPick={() => {}} />,
    );
    expect(screen.queryByTestId('media-picker-modal')).toBeNull();
  });

  it('renders modal and loads assets when open', async () => {
    render(
      <MediaPicker open onClose={() => {}} onPick={() => {}} title="Choose a file" />,
    );
    expect(await screen.findByTestId('media-picker-modal')).toBeTruthy();
    expect(screen.getByText('Choose a file')).toBeTruthy();
    await waitFor(() => expect(api.getMedia).toHaveBeenCalled());
    expect(await screen.findByTestId('picker-asset-10')).toBeTruthy();
    expect(screen.getByTestId('picker-asset-20')).toBeTruthy();
  });

  it('calls onPick with selected asset when "Use this file" is clicked', async () => {
    const onPick = vi.fn();
    render(
      <MediaPicker open onClose={() => {}} onPick={onPick} />,
    );

    // Click the first asset to highlight it
    const assetBtn = await screen.findByTestId('picker-asset-10');
    fireEvent.click(assetBtn);

    // Confirm button should now be active
    const confirmBtn = screen.getByTestId('media-picker-confirm');
    expect(confirmBtn).not.toBeDisabled();
    fireEvent.click(confirmBtn);

    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 10 }));
  });

  it('double-click on asset calls onPick and onClose immediately', async () => {
    const onPick = vi.fn();
    const onClose = vi.fn();
    render(
      <MediaPicker open onClose={onClose} onPick={onPick} />,
    );

    const assetBtn = await screen.findByTestId('picker-asset-20');
    fireEvent.dblClick(assetBtn);

    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 20 }));
    expect(onClose).toHaveBeenCalled();
  });

  it('filters by collection slug when pre-filter prop is set', async () => {
    render(
      <MediaPicker open onClose={() => {}} onPick={() => {}} collection="menu-items" />,
    );
    await waitFor(() => {
      expect(api.getMedia).toHaveBeenCalledWith(
        expect.objectContaining({ collection: 'menu-items' }),
      );
    });
  });

  it('filters by media type tab when mediaType prop is set', async () => {
    render(
      <MediaPicker open onClose={() => {}} onPick={() => {}} mediaType="image" />,
    );
    await waitFor(() => {
      expect(api.getMedia).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'image' }),
      );
    });
  });

  it('"Use this file" button is disabled until an asset is selected', async () => {
    render(
      <MediaPicker open onClose={() => {}} onPick={() => {}} />,
    );
    await screen.findByTestId('media-picker-confirm');
    const confirmBtn = screen.getByTestId('media-picker-confirm');
    expect(confirmBtn).toBeDisabled();
  });

  it('shows empty state when no assets found', async () => {
    vi.mocked(api.getMedia).mockResolvedValueOnce({ data: [], meta: emptyMeta });
    render(
      <MediaPicker open onClose={() => {}} onPick={() => {}} />,
    );
    expect(await screen.findByText(/no media found/i)).toBeTruthy();
  });

  it('cancels via cancel button without calling onPick', async () => {
    const onPick = vi.fn();
    const onClose = vi.fn();
    render(
      <MediaPicker open onClose={onClose} onPick={onPick} />,
    );
    await screen.findByTestId('media-picker-modal');
    const assetBtn = await screen.findByTestId('picker-asset-10');
    fireEvent.click(assetBtn);

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onPick).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});

// ─── "Pick from Library" integration with ImageUploadField ───────────────────

describe('Pick from Library button in ImageUploadField', () => {
  it('renders "Pick from Library" button alongside upload and re-crop buttons', async () => {
    // Lazy-import to avoid top-level module resolution issues in tests
    const { ImageUploadField } = await import('../pages/MenuPage/menuFormPrimitives');
    render(
      <ImageUploadField value="" onChange={() => {}} />,
    );
    const pickBtn = screen.getByTestId('pick-from-library-btn');
    expect(pickBtn).toBeTruthy();
    expect(pickBtn.textContent).toContain('Pick from Library');
  });

  it('Upload & crop button still exists alongside Pick from Library', async () => {
    const { ImageUploadField } = await import('../pages/MenuPage/menuFormPrimitives');
    render(
      <ImageUploadField value="" onChange={() => {}} />,
    );
    expect(screen.getByRole('button', { name: /upload.*crop/i })).toBeTruthy();
    expect(screen.getByTestId('pick-from-library-btn')).toBeTruthy();
  });

  it('clicking Pick from Library opens MediaPicker modal', async () => {
    vi.spyOn(api, 'getMedia').mockResolvedValue({
      data: [makeAsset(99)],
      meta: { current_page: 1, last_page: 1, per_page: 24, total: 1 },
    });

    const { ImageUploadField } = await import('../pages/MenuPage/menuFormPrimitives');
    render(
      <ImageUploadField value="" onChange={() => {}} />,
    );

    fireEvent.click(screen.getByTestId('pick-from-library-btn'));
    expect(await screen.findByTestId('media-picker-modal')).toBeTruthy();
  });

  it('selecting asset from picker fills the image field and does NOT remove upload button', async () => {
    vi.spyOn(api, 'getMedia').mockResolvedValue({
      data: [makeAsset(99)],
      meta: { current_page: 1, last_page: 1, per_page: 24, total: 1 },
    });

    const onChange = vi.fn();
    const { ImageUploadField } = await import('../pages/MenuPage/menuFormPrimitives');
    render(
      <ImageUploadField value="" onChange={onChange} />,
    );

    fireEvent.click(screen.getByTestId('pick-from-library-btn'));
    const assetBtn = await screen.findByTestId('picker-asset-99');
    fireEvent.click(assetBtn);
    fireEvent.click(screen.getByTestId('media-picker-confirm'));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ url: makeAsset(99).url }),
    );

    // Upload & crop button should still be present
    expect(screen.getByRole('button', { name: /upload.*crop/i })).toBeTruthy();
  });
});
