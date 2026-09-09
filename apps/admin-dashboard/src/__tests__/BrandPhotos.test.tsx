import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrandPhotos, BrandThumb } from '../components/BrandPhotos';
import { brandKey } from '../api/operations';

/*
 * Owner, 2026-09-09: "can i upload a pic of different brand of item to know
 * which brand is this." Brand stays free text on the purchase line; this
 * only hangs a picture off the item-and-brand pair the data already has.
 */

const getBrandPhotos = vi.fn();
const uploadBrandPhoto = vi.fn();
const deleteBrandPhoto = vi.fn();

vi.mock('../api/operations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/operations')>();
  return {
    ...actual,
    getBrandPhotos: (...a: unknown[]) => getBrandPhotos(...a),
    uploadBrandPhoto: (...a: unknown[]) => uploadBrandPhoto(...a),
    deleteBrandPhoto: (...a: unknown[]) => deleteBrandPhoto(...a),
  };
});

const sunrise = { id: 1, brand: 'Sunrise', url: 'https://cdn.test/sunrise.jpg', note: null };

function show(canManage = true, knownBrands: string[] = []) {
  render(<BrandPhotos itemId={7} itemName="Egg" canManage={canManage} knownBrands={knownBrands} />);
}

describe('Brand photos on an ingredient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBrandPhotos.mockResolvedValue({ item_id: 7, photos: [sunrise] });
    uploadBrandPhoto.mockResolvedValue({ photo: sunrise });
    deleteBrandPhoto.mockResolvedValue({ deleted: true });
  });

  it('shows the packet beside the brand name', async () => {
    show();

    const shot = await screen.findByTestId('brand-thumb-Sunrise');
    expect(shot).toHaveAttribute('src', 'https://cdn.test/sunrise.jpg');
    expect(shot).toHaveAttribute('alt', 'Sunrise');
  });

  it('wants the brand named before it will take a picture', async () => {
    show();
    await screen.findByTestId('brand-thumb-Sunrise');

    fireEvent.click(screen.getByTestId('brand-photo-add'));

    expect(screen.getByText(/Type the brand first/)).toBeInTheDocument();
    expect(uploadBrandPhoto).not.toHaveBeenCalled();
  });

  it('uploads against the brand that was typed', async () => {
    show();
    await screen.findByTestId('brand-thumb-Sunrise');

    fireEvent.change(screen.getByLabelText('Brand for the picture'), { target: { value: ' Royal ' } });
    const file = new File(['x'], 'royal.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByTestId('brand-photo-file'), { target: { files: [file] } });

    await waitFor(() => expect(uploadBrandPhoto).toHaveBeenCalledTimes(1));
    // Trimmed, so the spelling matches what goes on a purchase line.
    expect(uploadBrandPhoto).toHaveBeenCalledWith(7, 'Royal', file);
    // Reloaded so the new packet appears.
    await waitFor(() => expect(getBrandPhotos).toHaveBeenCalledTimes(2));
  });

  it('points out the brands bought before that have no picture yet', async () => {
    show(true, ['Sunrise', 'Royal']);

    expect(await screen.findByText(/Bought before, no picture yet: Royal/)).toBeInTheDocument();
  });

  it('is read-only for somebody who cannot manage stock', async () => {
    show(false, ['Sunrise']);

    await screen.findByTestId('brand-thumb-Sunrise');
    expect(screen.queryByTestId('brand-photo-add')).toBeNull();
    expect(screen.queryByLabelText('Brand for the picture')).toBeNull();
  });

  it('removes a picture once, after asking', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    show();
    await screen.findByTestId('brand-thumb-Sunrise');

    fireEvent.click(screen.getByLabelText('Remove Sunrise picture'));

    await waitFor(() => expect(deleteBrandPhoto).toHaveBeenCalledWith(7, 1));
    confirm.mockRestore();
  });

  it('says so when there are none', async () => {
    getBrandPhotos.mockResolvedValue({ item_id: 7, photos: [] });
    show();

    expect(await screen.findByText('No brand pictures yet.')).toBeInTheDocument();
  });

  it('opens a bigger view when a packet is tapped', async () => {
    show();

    fireEvent.click(await screen.findByTestId('brand-thumb-Sunrise'));

    expect(screen.getByRole('dialog', { name: /Sunrise picture/ })).toBeInTheDocument();
  });
});

describe('Folding a brand to its key', () => {
  it('ignores case and stray spaces, the way a person would', () => {
    expect(brandKey('Sunrise')).toBe('sunrise');
    expect(brandKey('  SUNRISE  ')).toBe('sunrise');
    expect(brandKey('Sun   Rise')).toBe('sun rise');
    expect(brandKey(null)).toBe('');
    expect(brandKey(undefined)).toBe('');
  });
});

describe('The thumbnail on its own', () => {
  it('is not clickable unless something happens when you click it', () => {
    render(<BrandThumb photo={{ brand: 'Royal', url: 'https://cdn.test/r.jpg' }} />);

    expect(screen.getByTestId('brand-thumb-Royal')).not.toHaveStyle({ cursor: 'zoom-in' });
  });
});
