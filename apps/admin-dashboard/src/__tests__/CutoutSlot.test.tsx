import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CutoutSlot } from '../pages/MenuPage/CutoutSlot';

/* Owner, 2026-10-01: a see-through PNG for the cards, over a circle the item can own. */

const api = vi.hoisted(() => ({
  getItemCutout: vi.fn(),
  uploadItemCutout: vi.fn(),
  deleteItemCutout: vi.fn(),
  updateItemCutoutBackdrop: vi.fn(),
}));

vi.mock('../api/cutout', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/cutout')>();
  return {
    ...actual,
    getItemCutout: (...a: unknown[]) => api.getItemCutout(...a),
    uploadItemCutout: (...a: unknown[]) => api.uploadItemCutout(...a),
    deleteItemCutout: (...a: unknown[]) => api.deleteItemCutout(...a),
    updateItemCutoutBackdrop: (...a: unknown[]) => api.updateItemCutoutBackdrop(...a),
  };
});
vi.mock('../pages/MenuPage/mediaUrl', () => ({ resolveMediaUrl: (u: string) => u }));

const empty = {
  cutout_url: null,
  cutout_webp_url: null,
  backdrop: null,
  effective: { color: '#F3EAE1', strength: 100, source: 'default' as const },
};
const withCutout = {
  cutout_url: '/storage/menu-cutouts/cup.png',
  cutout_webp_url: '/storage/menu-cutouts/cup.webp',
  backdrop: null,
  effective: { color: '#FFEEDD', strength: 80, source: 'category' as const },
};

describe('CutoutSlot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uploads a PNG and shows it over the resolved circle', async () => {
    api.getItemCutout.mockResolvedValue(empty);
    api.uploadItemCutout.mockResolvedValue(withCutout);
    render(<CutoutSlot itemId={7} />);

    expect(await screen.findByText('Upload cut-out PNG')).toBeInTheDocument();
    const file = new File(['png'], 'cup.png', { type: 'image/png' });
    fireEvent.change(screen.getByTestId('cutout-file-input'), { target: { files: [file] } });

    await waitFor(() => expect(api.uploadItemCutout).toHaveBeenCalledWith(7, file));
    expect(await screen.findByText('Replace cut-out PNG')).toBeInTheDocument();
    const previews = screen.getAllByTestId('cutout-preview');
    expect(previews[0].dataset.color).toBe('#FFEEDD');
    expect(previews[0].dataset.strength).toBe('80');
    expect(screen.getByText(/Showing #FFEEDD at 80% from the category/)).toBeInTheDocument();
  });

  it('shows the server reason when a flat image is refused', async () => {
    api.getItemCutout.mockResolvedValue(empty);
    api.uploadItemCutout.mockRejectedValue(new Error('That file has no see-through background.'));
    render(<CutoutSlot itemId={7} />);
    await screen.findByText('Upload cut-out PNG');

    fireEvent.change(screen.getByTestId('cutout-file-input'), { target: { files: [new File(['x'], 'flat.png', { type: 'image/png' })] } });

    expect(await screen.findByText('That file has no see-through background.')).toBeInTheDocument();
  });

  it('saves the item\'s own circle and offers to go back to the category\'s', async () => {
    api.getItemCutout.mockResolvedValue(withCutout);
    api.updateItemCutoutBackdrop.mockResolvedValue({
      ...withCutout,
      backdrop: { color: '#FFEEDD', strength: 30 },
      effective: { color: '#FFEEDD', strength: 30, source: 'item' },
    });
    render(<CutoutSlot itemId={7} />);
    await screen.findByText('Replace cut-out PNG');

    expect(screen.getByText(/Same as the category/)).toBeInTheDocument();
    expect(screen.getByTestId('cutout-backdrop-save')).toBeDisabled();

    fireEvent.click(screen.getByTestId('cutout-backdrop-own'));
    fireEvent.change(screen.getByTestId('cutout-backdrop-strength'), { target: { value: '30' } });
    expect(screen.getByTestId('cutout-backdrop-save')).toBeEnabled();
    fireEvent.click(screen.getByTestId('cutout-backdrop-save'));

    await waitFor(() => expect(api.updateItemCutoutBackdrop).toHaveBeenCalledWith(7, { color: '#FFEEDD', strength: 30 }));
    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(screen.getByText(/from this item/)).toBeInTheDocument();
  });

  it('removes the cut-out', async () => {
    api.getItemCutout.mockResolvedValue(withCutout);
    api.deleteItemCutout.mockResolvedValue(empty);
    render(<CutoutSlot itemId={7} />);

    fireEvent.click(await screen.findByTestId('cutout-remove-btn'));

    await waitFor(() => expect(api.deleteItemCutout).toHaveBeenCalledWith(7));
    expect(await screen.findByText('No cut-out yet. Cards use the main photo.')).toBeInTheDocument();
  });
});
