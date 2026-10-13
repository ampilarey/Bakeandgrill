import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LabelWrap } from '../../api';
import { EMPTY_WRAP, WRAP_FALLBACK, WrapParts } from './WrapParts';

/*
 * The wrap-around label's editor (2026-10-12; round 2 of the usability work,
 * 2026-10-13, put the parts on a board of strips): the strips with their
 * count picker and sheet, the flavour band and its words, the recycling
 * marks as chips, the mark pictures, the free text, and whether the
 * nutrition values are per 100 g or 100 ml.
 */
function mount(value: LabelWrap = EMPTY_WRAP, pictures: { id: number; url: string | null }[] = []) {
  const onChange = vi.fn();
  const onAddPicture = vi.fn();
  const onNutritionPer = vi.fn();
  render(<WrapParts value={value} onChange={onChange} catalogue={WRAP_FALLBACK} pictures={pictures} onAddPicture={onAddPicture} nutritionPer="g" onNutritionPer={onNutritionPer} productName="Cranberry Juice" netWeight="0.2 L" />);
  return { onChange, onAddPicture, onNutritionPer };
}

describe('WrapParts', () => {
  it('shows the parts as strips, with the count picker, the sheet and Reset', () => {
    const { onChange } = mount();
    const board = screen.getByRole('group', { name: 'Strips' });
    expect(within(board).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      'Strip 1: Brand and name', 'Strip 2: Ingredients and legal text', 'Strip 3: Nutrition per 100 g or ml', 'Strip 4: Dates and batch', 'Strip 5: Barcode', 'Strip 6: QR code', 'Strip 7: Recycling marks and pictures', 'Add a strip',
    ]);

    fireEvent.click(within(screen.getByRole('group', { name: 'How many strips' })).getByRole('button', { name: '3' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ parts: ['brand', 'legal', 'nutrition'] }));

    fireEvent.click(within(board).getByRole('button', { name: 'Strip 6: QR code' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove this strip' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ parts: ['brand', 'legal', 'nutrition', 'dates', 'barcode', 'marks'] }));

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ parts: WRAP_FALLBACK.default_parts, marks: WRAP_FALLBACK.default_marks }));
  });

  it('keeps the band, its words, the marks, the pictures and the free text', () => {
    const { onChange, onAddPicture, onNutritionPer } = mount({ ...EMPTY_WRAP, pictures: [41] }, [{ id: 41, url: '/storage/halal.png' }]);
    expect(screen.getByText(/and the net content \(0\.2 L\)/)).toBeInTheDocument();
    expect(screen.getByLabelText('Band words')).toHaveAttribute('placeholder', 'Cranberry Juice');
    fireEvent.change(screen.getByLabelText('Band words'), { target: { value: 'Cranberry' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ band_text: 'Cranberry' }));
    fireEvent.click(screen.getByTestId('wrap-band'));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ band: false }));

    const pet = screen.getByRole('button', { name: 'Plastic 1 · PET' });
    expect(pet).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(pet);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ marks: ['recycle', 'dispose', 'pet'] }));
    fireEvent.click(screen.getByRole('button', { name: 'Recycling loop' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ marks: ['dispose'] }));

    expect(within(screen.getByTestId('wrap-pictures')).getByRole('img')).toHaveAttribute('src', '/storage/halal.png');
    fireEvent.click(screen.getByRole('button', { name: 'Remove picture 41' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ pictures: [] }));
    fireEvent.click(screen.getByTestId('wrap-add-picture'));
    expect(onAddPicture).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText('Free text heading'), { target: { value: 'Fruit content 29%' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ text_heading: 'Fruit content 29%' }));
    fireEvent.change(screen.getByLabelText('Nutrition values are'), { target: { value: 'ml' } });
    expect(onNutritionPer).toHaveBeenCalledWith('ml');
  });

  it('says no more pictures once the four are picked', () => {
    mount({ ...EMPTY_WRAP, pictures: [1, 2, 3, 4] });
    expect(screen.getByTestId('wrap-add-picture')).toBeDisabled();
    expect(screen.queryByLabelText('Band words in Dhivehi')).toBeInTheDocument();
  });
});
