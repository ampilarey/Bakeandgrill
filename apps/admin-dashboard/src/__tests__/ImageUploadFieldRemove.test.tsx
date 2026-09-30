import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ImageUploadField } from '../pages/MenuPage/menuFormPrimitives';

vi.mock('../components/MediaPicker', () => ({ MediaPicker: () => null }));

/* Owner, 2026-09-30: "i have added a photo to menu item. but no way to remove this". */
describe('ImageUploadField — remove photo', () => {
  it('clears the photo and every size made from it', () => {
    const onChange = vi.fn();
    render(<ImageUploadField value="/storage/menu/a.jpg" originalValue="/storage/menu-masters/a.jpg" onChange={onChange} />);

    fireEvent.click(screen.getByTestId('remove-image-btn'));

    expect(onChange).toHaveBeenCalledWith({
      url: '', original_url: '', thumb_url: '', image_webp_url: '', thumb_webp_url: '',
    });
  });

  it('is not offered when there is no photo', () => {
    render(<ImageUploadField value="" onChange={() => {}} />);
    expect(screen.queryByTestId('remove-image-btn')).toBeNull();
  });
});
