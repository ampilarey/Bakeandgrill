import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PhotosTab } from '../pages/MenuPage/PhotosTab';

const updateItemPhoto = vi.fn();

vi.mock('../api', () => ({
  getItemPhotos: vi.fn().mockResolvedValue({
    photos: [{
      id: 11,
      item_id: 1,
      url: '/storage/item-photos/1/a.jpg',
      original_url: null,
      alt_text: '',
      sort_order: 1,
      is_primary: true,
      created_at: '2026-01-01T00:00:00Z',
    }],
  }),
  uploadItemPhoto: vi.fn(),
  updateItemPhoto: (...args: unknown[]) => updateItemPhoto(...args),
  deleteItemPhoto: vi.fn(),
  reorderItemPhotos: vi.fn(),
}));

vi.mock('../pages/MenuPage/mediaUrl', () => ({
  resolveMediaUrl: (u: string) => u,
  prepareUploadFromFile: vi.fn(),
  prepareImageForCrop: vi.fn(),
  revokeCropSrc: vi.fn(),
}));

vi.mock('../pages/MenuPage/ImageCropModal', () => ({
  ImageCropModal: () => null,
}));

describe('PhotosTab alt text', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateItemPhoto.mockResolvedValue({
      photo: {
        id: 11,
        item_id: 1,
        url: '/storage/item-photos/1/a.jpg',
        alt_text: 'Grilled chicken platter',
        sort_order: 1,
        is_primary: true,
        created_at: '2026-01-01T00:00:00Z',
      },
    });
  });

  it('persists alt text on blur', async () => {
    render(<PhotosTab itemId={1} />);
    const input = await screen.findByLabelText(/Alt text for photo 11/i);
    fireEvent.change(input, { target: { value: 'Grilled chicken platter' } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(updateItemPhoto).toHaveBeenCalledWith(1, 11, { alt_text: 'Grilled chicken platter' });
    });
  });
});
