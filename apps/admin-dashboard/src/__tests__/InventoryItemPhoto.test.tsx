import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { InventoryItemPhoto, ItemThumb } from '../components/InventoryItemPhoto';

/*
 * Owner, 2026-09-18: "is there any option to add inventory item photo - not
 * brand". One picture of the thing itself, replaced by uploading again.
 */

const uploadInventoryPhoto = vi.fn();
const deleteInventoryPhoto = vi.fn();
vi.mock('../api/operations', () => ({
  uploadInventoryPhoto: (...a: unknown[]) => uploadInventoryPhoto(...a),
  deleteInventoryPhoto: (...a: unknown[]) => deleteInventoryPhoto(...a),
}));

describe('InventoryItemPhoto', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uploadInventoryPhoto.mockResolvedValue({ item_id: 5, photo_url: '/storage/inventory-photos/5/flour.jpg' });
    deleteInventoryPhoto.mockResolvedValue({ item_id: 5, photo_url: null });
  });

  it('uploads a picture and hands the new address back', async () => {
    const onChanged = vi.fn();
    render(<InventoryItemPhoto itemId={5} itemName="Flour" photoUrl={null} canManage onChanged={onChanged} />);

    expect(screen.getByText('No picture yet')).toBeInTheDocument();
    const file = new File(['x'], 'flour.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText('Choose a picture of Flour'), { target: { files: [file] } });

    await waitFor(() => expect(uploadInventoryPhoto).toHaveBeenCalledWith(5, file));
    expect(onChanged).toHaveBeenCalledWith('/storage/inventory-photos/5/flour.jpg');
  });

  it('shows the picture it has and can remove it', async () => {
    const onChanged = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<InventoryItemPhoto itemId={5} itemName="Flour" photoUrl="/storage/x.jpg" canManage onChanged={onChanged} />);

    expect(screen.getByAltText('Flour')).toHaveAttribute('src', '/storage/x.jpg');
    expect(screen.getByText('Replace picture')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Remove'));

    await waitFor(() => expect(deleteInventoryPhoto).toHaveBeenCalledWith(5));
    expect(onChanged).toHaveBeenCalledWith(null);
  });

  it('is read-only without the stock permission', () => {
    render(<InventoryItemPhoto itemId={5} itemName="Flour" photoUrl="/storage/x.jpg" canManage={false} onChanged={() => {}} />);

    expect(screen.queryByText('Replace picture')).toBeNull();
    expect(screen.queryByText('Remove')).toBeNull();
  });

  it('draws nothing for an item with no picture', () => {
    const { container } = render(<ItemThumb url={null} name="Flour" />);
    expect(container).toBeEmptyDOMElement();
  });
});
