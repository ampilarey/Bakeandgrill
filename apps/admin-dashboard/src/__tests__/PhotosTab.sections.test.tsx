import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { PhotosTab } from '../pages/MenuPage/PhotosTab';

/* Owner, 2026-10-01: "move pic in edit page to picture button page. And make
   it clear which pic is for pos and which is for menu and where more pic and
   video is shown and how is shown." */

const { getItemPhotos, getItemCutout } = vi.hoisted(() => ({
  getItemPhotos: vi.fn(),
  getItemCutout: vi.fn(),
}));

vi.mock('../api', () => ({
  getItemPhotos: (...a: unknown[]) => getItemPhotos(...a),
  uploadItemPhoto: vi.fn(),
  updateItemPhoto: vi.fn(),
  deleteItemPhoto: vi.fn(),
  reorderItemPhotos: vi.fn(),
  uploadItemVideo: vi.fn(),
}));
vi.mock('../api/menu', () => ({ addItemPhotoFromLibrary: vi.fn() }));
vi.mock('../api/cutout', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/cutout')>();
  return { ...actual, getItemCutout: (...a: unknown[]) => getItemCutout(...a) };
});
vi.mock('../components/MediaPicker', () => ({ MediaPicker: () => null }));
vi.mock('../pages/MenuPage/mediaUrl', () => ({
  resolveMediaUrl: (u: string) => u,
  prepareUploadFromFile: vi.fn(),
  prepareImageForCrop: vi.fn(),
  revokeCropSrc: vi.fn(),
}));
vi.mock('../pages/MenuPage/ImageCropModal', () => ({ ImageCropModal: () => null }));
vi.mock('../pages/MenuPage/menuFormPrimitives', () => ({
  ImageUploadField: ({ value }: { value: string }) => <div data-testid="main-photo-field">{value}</div>,
}));

describe('PhotosTab sections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getItemPhotos.mockResolvedValue({ photos: [] });
    getItemCutout.mockResolvedValue({
      cutout_url: null, cutout_webp_url: null, backdrop: null,
      effective: { color: '#F3EAE1', strength: 100, source: 'default' },
    });
  });

  it('shows the three pictures in order, each saying where it shows, for a saved item', async () => {
    render(
      <PhotosTab
        itemId={7}
        mainPhoto={{ image_url: '/storage/menu/cup.jpg', image_original_url: '' }}
        onMainPhotoChange={() => {}}
      />,
    );

    expect(screen.getByTestId('photos-where-table')).toHaveTextContent('POS tile');
    const main = screen.getByTestId('photos-main-section');
    expect(within(main).getByText('Main photo')).toBeInTheDocument();
    expect(main).toHaveTextContent(/Shows on:.*POS tile.*TV signage/);
    expect(within(main).getByTestId('main-photo-field')).toHaveTextContent('/storage/menu/cup.jpg');

    const cutout = screen.getByTestId('photos-cutout-section');
    expect(cutout).toHaveTextContent(/Shows on:.*menu cards.*POS tile, with no circle/);
    expect(await within(cutout).findByTestId('cutout-slot')).toBeInTheDocument();

    const gallery = screen.getByTestId('photos-gallery-section');
    expect(gallery).toHaveTextContent(/Shows on:.*after tapping the item/);
    expect(await within(gallery).findByText('Upload & crop photo')).toBeInTheDocument();

    const order = [main, cutout, gallery].map((el) => el.compareDocumentPosition(gallery));
    expect(order[0] & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('for an unsaved item only the main photo can be set', () => {
    render(
      <PhotosTab mainPhoto={{ image_url: '', image_original_url: '' }} onMainPhotoChange={() => {}} />,
    );

    expect(screen.getByTestId('photos-main-section')).toBeInTheDocument();
    expect(screen.getAllByTestId('photos-save-first')).toHaveLength(2);
    expect(screen.queryByTestId('cutout-slot')).toBeNull();
    expect(getItemPhotos).not.toHaveBeenCalled();
    expect(getItemCutout).not.toHaveBeenCalled();
  });
});
