import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { POUCH_FALLBACK, PouchPicker, newPouch, pouchFits, pouchSummary } from './PouchPicker';
import { applyToCustom } from './labelTemplates';
import { customDraft, customPayload } from './labelDrafts';
import type { LabelTemplate } from '../../api';

describe('PouchPicker', () => {
  it('switches a label to a pouch label with the default picks, and back', () => {
    const onChange = vi.fn();
    const { rerender } = render(<PouchPicker value={null} onChange={onChange} />);
    expect(screen.queryByLabelText('How it is cooked')).toBeNull();
    fireEvent.click(screen.getByRole('switch', { name: 'Print as a pouch label' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ look: 'gold', method: 'microwave' }));

    rerender(<PouchPicker value={newPouch(POUCH_FALLBACK)} onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Print as a pouch label' }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('picks the pouch colour, the cooking method and the words', () => {
    const onChange = vi.fn();
    render(<PouchPicker value={newPouch(POUCH_FALLBACK)} onChange={onChange} />);
    expect(screen.getAllByRole('radio')).toHaveLength(POUCH_FALLBACK.looks.length);
    fireEvent.click(screen.getByRole('radio', { name: /Black or dark pouch/ }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ look: 'dark' }));
    fireEvent.change(screen.getByLabelText('How it is cooked'), { target: { value: 'steam' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ method: 'steam' }));
    fireEvent.change(screen.getByLabelText('Line under the name'), { target: { value: 'Frozen · Handmade' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ tagline: 'Frozen · Handmade' }));
    fireEvent.change(screen.getByLabelText('Size word'), { target: { value: 'Large' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ size_word: 'Large' }));
  });

  it("offers the method's wording only while How to use is blank", () => {
    const catalogue = { ...POUCH_FALLBACK, methods: [{ key: 'microwave', label: 'Microwave & Eat', how: 'Microwave for 2 to 3 minutes.' }] };
    const onUseHow = vi.fn();
    const { rerender } = render(<PouchPicker value={newPouch(catalogue)} onChange={() => {}} catalogue={catalogue} howToUse="" onUseHow={onUseHow} />);
    expect(screen.getByTestId('pouch-how').textContent).toContain('Microwave for 2 to 3 minutes.');
    fireEvent.click(screen.getByRole('button', { name: 'Put it in How to use to edit' }));
    expect(onUseHow).toHaveBeenCalledWith('Microwave for 2 to 3 minutes.');
    rerender(<PouchPicker value={newPouch(catalogue)} onChange={() => {}} catalogue={catalogue} howToUse="Steam it." onUseHow={onUseHow} />);
    expect(screen.queryByTestId('pouch-how')).toBeNull();
  });

  it('says when the size cannot hold a pouch label, and knows which sizes can', () => {
    render(<PouchPicker value={newPouch(POUCH_FALLBACK)} onChange={() => {}} sizeNote="This size prints the ordinary sticker." />);
    expect(screen.getByTestId('pouch-size-note').textContent).toContain('ordinary sticker');
    expect(pouchFits(POUCH_FALLBACK, 'rect', 140, 62)).toBe(true);
    expect(pouchFits(POUCH_FALLBACK, 'rect', 120, 53)).toBe(true);
    expect(pouchFits(POUCH_FALLBACK, 'rect', 60, 40)).toBe(false);
    expect(pouchFits(POUCH_FALLBACK, 'rect', 100, 150)).toBe(false);
    expect(pouchFits(POUCH_FALLBACK, 'circle', 120, 120)).toBe(false);
  });

  it('sums up the picks, and a template carries them to a new label', () => {
    expect(pouchSummary(null, null)).toBe('Off');
    expect(pouchSummary({ ...newPouch(POUCH_FALLBACK), look: 'kraft', method: 'pan_fry' }, null)).toBe('Brown paper (kraft) pouch · Pan Fry');
    expect(pouchSummary({ ...newPouch(POUCH_FALLBACK), method: 'none' }, null)).toBe('Gold or yellow pouch');

    const pouch = { ...newPouch(POUCH_FALLBACK), method: 'steam', tagline: 'Frozen · Handmade' };
    const template = { id: 'momo-pouch-steam', builtin: true, name: 'Frozen momo pouch (steam)', blurb: null, source: null, fields: { label_storage: 'frozen', label_pouch: pouch }, wrap_pictures: [], size: null, type_name: null, brand_name: null, footer_name: null, storage: 'frozen', created_by: null, created_at: null } as unknown as LabelTemplate;
    const draft = applyToCustom(customDraft(null), template);
    expect(draft.label_pouch).toEqual(pouch);
    expect(customPayload({ ...draft, name: 'Veg Momo' }).label_pouch).toEqual(pouch);
    expect(customPayload(customDraft(null)).label_pouch).toBeNull();
  });
});
