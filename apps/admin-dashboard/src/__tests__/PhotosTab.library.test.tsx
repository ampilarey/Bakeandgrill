import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PhotosTab } from '../pages/MenuPage/PhotosTab';

/* Owner, 2026-09-30: "there is no option to pic from the library" on the Photos tab. */

const { getItemPhotos, addItemPhotoFromLibrary } = vi.hoisted(() => ({
  getItemPhotos: vi.fn(),
  addItemPhotoFromLibrary: vi.fn(),
}));

vi.mock('../api', () => ({
  getItemPhotos: (...a: unknown[]) => getItemPhotos(...a),
  uploadItemPhoto: vi.fn(),
  updateItemPhoto: vi.fn(),
  deleteItemPhoto: vi.fn(),
  reorderItemPhotos: vi.fn(),
  uploadItemVideo: vi.fn(),
}));
vi.mock('../api/menu', () => ({
  addItemPhotoFromLibrary: (...a: unknown[]) => addItemPhotoFromLibrary(...a),
}));
vi.mock('../components/MediaPicker', () => ({
  MediaPicker: ({ open, onPick }: { open: boolean; onPick: (a: unknown) => void }) =>
    open ? <button type="button" onClick={() => onPick({ id: 42, url: '/storage/library/a.jpg' })}>choose-42</button> : null,
}));
vi.mock('../pages/MenuPage/mediaUrl', () => ({
  resolveMediaUrl: (u: string) => u,
  prepareUploadFromFile: vi.fn(),
  prepareImageForCrop: vi.fn(),
  revokeCropSrc: vi.fn(),
}));
vi.mock('../pages/MenuPage/ImageCropModal', () => ({ ImageCropModal: () => null }));

describe('PhotosTab — pick from library', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getItemPhotos.mockResolvedValue({ photos: [] });
    addItemPhotoFromLibrary.mockResolvedValue({ photo: { id: 1 } });
  });

  it('adds the picked library photo to the gallery and reloads it', async () => {
    render(<PhotosTab itemId={7} />);

    fireEvent.click(await screen.findByTestId('gallery-pick-from-library-btn'));
    fireEvent.click(screen.getByText('choose-42'));

    await waitFor(() => expect(addItemPhotoFromLibrary).toHaveBeenCalledWith(7, 42));
    await waitFor(() => expect(getItemPhotos).toHaveBeenCalledTimes(2));
  });
});
