import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../ui';

const createLabelFooter = vi.fn();
const updateLabelFooter = vi.fn();
const deleteLabelFooter = vi.fn();

vi.mock('../../api', () => ({
  createLabelFooter: (...a: unknown[]) => createLabelFooter(...a),
  updateLabelFooter: (...a: unknown[]) => updateLabelFooter(...a),
  deleteLabelFooter: (...a: unknown[]) => deleteLabelFooter(...a),
}));

import { FooterPicker, describeFooter } from './FooterPicker';
import type { LabelFooter } from '../../api';

// A footer is always the business's (owner, 2026-10-12): no brand, no by-line.
const effective = (tagline: string, website = 'bakeandgrill.mv'): LabelFooter['effective'] => ({
  name: 'Bake & Grill', name_dv: '', tagline, tagline_dv: '', phone: '+960 912 0011', ways: '', ways_dv: '', website,
  address: 'Kalaafaanu Hingun, Malé', address_dv: '', landmark: '', landmark_dv: '', show_qr: true, show_mark: true,
});
const footer = (id: number, name: string, eff: LabelFooter['effective'], extra: Partial<LabelFooter> = {}): LabelFooter => ({
  id, name, style: 'dark', heading: null, heading_dv: null, tagline: null, tagline_dv: null,
  phone: null, ways: null, ways_dv: null, website: null, address: null, address_dv: null, landmark: null, landmark_dv: null,
  show_qr: true, show_mark: true, is_default: id === 1, sort: id, effective: eff, custom_labels_count: 0, types_count: 0, ...extra,
});
const STANDARD = footer(1, 'Standard', effective('Fresh Baked, Fire Grilled'));
const STAMP = footer(2, 'Kitchen stamp', effective('Hand-made daily', 'amma.mv'), { tagline: 'Hand-made daily', website: 'amma.mv' });

function Harness({ value, canManage = true, footers = [STANDARD, STAMP], fallback = null, onChange = () => {}, onFootersChange = () => {} }: {
  value: number | null; canManage?: boolean; footers?: LabelFooter[]; fallback?: LabelFooter | null; onChange?: (id: number | null) => void; onFootersChange?: (f: LabelFooter[]) => void;
}) {
  return (
    <ToastProvider>
      <label htmlFor="t-footer">Footer</label>
      <FooterPicker id="t-footer" footers={footers} value={value} onChange={onChange} onFootersChange={onFootersChange} noneLabel="Follow the type (Standard)" fallback={fallback} canManage={canManage} />
    </ToastProvider>
  );
}

describe('FooterPicker', () => {
  beforeEach(() => {
    [createLabelFooter, updateLabelFooter, deleteLabelFooter].forEach((f) => f.mockReset());
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('describes a footer in one line', () => {
    expect(describeFooter(STANDARD)).toBe('Bake & Grill · Fresh Baked, Fire Grilled · +960 912 0011 · bakeandgrill.mv');
    expect(describeFooter(footer(3, 'Plain', effective('', '')))).toBe('Bake & Grill · +960 912 0011');
    // A look other than the dark band is named.
    expect(describeFooter({ ...STANDARD, style: 'light' })).toBe('Bake & Grill · Fresh Baked, Fire Grilled · +960 912 0011 · bakeandgrill.mv · Light look');
  });

  it('picks a footer by name and says what it prints; Edit and New need Manage label settings', () => {
    const onChange = vi.fn();
    const { rerender } = render(<Harness value={null} canManage={false} onChange={onChange} />);
    const select = screen.getByLabelText('Footer');
    expect(within(select).getByRole('option', { name: 'Follow the type (Standard)' })).toBeInTheDocument();
    expect(within(select).getByRole('option', { name: 'Standard (standard)' })).toBeInTheDocument();
    expect(screen.queryByTestId('t-footer-lines')).toBeNull();
    expect(screen.queryByRole('button', { name: 'New footer' })).toBeNull();
    fireEvent.change(select, { target: { value: '2' } });
    expect(onChange).toHaveBeenCalledWith(2);
    fireEvent.change(select, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith(null);

    rerender(<Harness value={2} canManage={false} onChange={onChange} />);
    expect(screen.getByTestId('t-footer-lines')).toHaveTextContent('Bake & Grill · Hand-made daily · +960 912 0011 · amma.mv');
    expect(screen.queryByRole('button', { name: 'Edit the footer Kitchen stamp' })).toBeNull();

    rerender(<Harness value={2} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Edit the footer Kitchen stamp' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New footer' })).toBeInTheDocument();
  });

  // Owner, 2026-10-12: the footer is always the business's. With nothing
  // picked the footer that prints anyway shows its lines, and the pencil
  // changes it without picking it.
  it('with nothing picked shows the footer that prints instead and edits it in place without picking it', async () => {
    const onChange = vi.fn();
    const onFootersChange = vi.fn();
    updateLabelFooter.mockResolvedValue({ data: { ...STANDARD, tagline: 'Hand-made in Malé', effective: effective('Hand-made in Malé') } });
    render(<Harness value={null} fallback={STANDARD} onChange={onChange} onFootersChange={onFootersChange} />);
    expect(screen.getByTestId('t-footer-lines')).toHaveTextContent('Bake & Grill · Fresh Baked, Fire Grilled');
    fireEvent.click(screen.getByRole('button', { name: 'Edit the footer Standard' }));
    const form = await screen.findByTestId('label-footer-form');
    expect(form).toHaveTextContent("The footer is always Bake & Grill's branding");
    // No brand to choose, no by-line: a food brand is on the header only.
    expect(within(form).queryByLabelText('Whose lines fill the blanks')).toBeNull();
    expect(within(form).queryByLabelText('By-line')).toBeNull();
    fireEvent.change(within(form).getByLabelText('Tagline, or your own words'), { target: { value: 'Hand-made in Malé' } });
    fireEvent.click(screen.getByTestId('label-footer-save'));
    await waitFor(() => expect(updateLabelFooter).toHaveBeenCalledWith(1, expect.objectContaining({ tagline: 'Hand-made in Malé' })));
    await waitFor(() => expect(onFootersChange).toHaveBeenCalledWith([expect.objectContaining({ id: 1, tagline: 'Hand-made in Malé' }), STAMP]));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('changes the picked footer in place: blanks show what they print, Save keeps the list in step', async () => {
    const onChange = vi.fn();
    const onFootersChange = vi.fn();
    updateLabelFooter.mockResolvedValue({ data: { ...STAMP, tagline: 'Hand-made every morning', effective: effective('Hand-made every morning', 'amma.mv') } });
    render(<Harness value={2} onChange={onChange} onFootersChange={onFootersChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit the footer Kitchen stamp' }));
    const form = await screen.findByTestId('label-footer-form');
    expect(screen.getByText('Edit footer: Kitchen stamp')).toBeInTheDocument();
    expect(within(form).getByLabelText('Footer name (for the list)')).toHaveValue('Kitchen stamp');
    expect(within(form).getByLabelText('Tagline, or your own words')).toHaveValue('Hand-made daily');
    // Each empty box shows its live value in grey: the business's.
    expect(within(form).getByLabelText('Name printed big')).toHaveAttribute('placeholder', 'Bake & Grill');
    expect(within(form).getByLabelText('Phone')).toHaveAttribute('placeholder', '+960 912 0011');
    expect(within(form).getByLabelText('Address')).toHaveAttribute('placeholder', 'Kalaafaanu Hingun, Malé');
    expect(within(form).getByLabelText('Website')).toHaveValue('amma.mv');

    fireEvent.change(within(form).getByLabelText('Tagline, or your own words'), { target: { value: '  Hand-made every morning ' } });
    fireEvent.click(within(form).getByLabelText('Print the complaints QR'));
    // The look: five swatches, the dark band picked until another is.
    const looks = within(form).getByTestId('label-footer-looks');
    expect(within(looks).getAllByRole('radio')).toHaveLength(5);
    expect(within(looks).getByRole('radio', { name: /^Dark/ })).toBeChecked();
    fireEvent.click(within(looks).getByRole('radio', { name: /^Rust/ }));
    expect(within(looks).getByRole('radio', { name: /^Rust/ })).toBeChecked();
    fireEvent.click(screen.getByTestId('label-footer-save'));
    await waitFor(() => expect(updateLabelFooter).toHaveBeenCalledTimes(1));
    expect(updateLabelFooter.mock.calls[0]).toEqual([2, expect.objectContaining({ name: 'Kitchen stamp', style: 'rust', tagline: 'Hand-made every morning', heading: null, website: 'amma.mv', show_qr: false })]);
    expect(updateLabelFooter.mock.calls[0][1]).not.toHaveProperty('brand_id');
    await waitFor(() => expect(screen.queryByTestId('label-footer-form')).toBeNull());
    expect(onFootersChange).toHaveBeenCalledWith([STANDARD, expect.objectContaining({ id: 2, tagline: 'Hand-made every morning' })]);
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('adds a footer and picks it; a name is needed', async () => {
    const onChange = vi.fn();
    const onFootersChange = vi.fn();
    createLabelFooter.mockResolvedValue({ data: footer(3, 'Gift box', effective('With love'), { tagline: 'With love', sort: 3 }) });
    render(<Harness value={null} fallback={STANDARD} onChange={onChange} onFootersChange={onFootersChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'New footer' }));
    const form = await screen.findByTestId('label-footer-form');
    expect(screen.getByRole('heading', { name: 'New footer' })).toBeInTheDocument();
    // A new footer's blanks show the standard footer's lines; nothing is removed from one not saved yet.
    expect(within(form).getByLabelText('Tagline, or your own words')).toHaveAttribute('placeholder', 'Fresh Baked, Fire Grilled');
    expect(screen.queryByTestId('label-footer-remove')).toBeNull();
    fireEvent.click(screen.getByTestId('label-footer-save'));
    expect(createLabelFooter).not.toHaveBeenCalled();
    expect(await screen.findByText('Give the footer a name.')).toBeInTheDocument();

    fireEvent.change(within(form).getByLabelText('Footer name (for the list)'), { target: { value: 'Gift box' } });
    fireEvent.change(within(form).getByLabelText('Tagline, or your own words'), { target: { value: 'With love' } });
    fireEvent.click(screen.getByTestId('label-footer-save'));
    await waitFor(() => expect(createLabelFooter).toHaveBeenCalledWith(expect.objectContaining({ name: 'Gift box', tagline: 'With love', show_qr: true, show_mark: true })));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(3));
    expect(onFootersChange).toHaveBeenCalledWith([STANDARD, STAMP, expect.objectContaining({ id: 3, name: 'Gift box' })]);
  });

  it('removes a footer after asking, and the picked one falls back; the standard one has no Remove', async () => {
    const onChange = vi.fn();
    const onFootersChange = vi.fn();
    deleteLabelFooter.mockResolvedValue({ ok: true });
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { rerender } = render(<Harness value={2} onChange={onChange} onFootersChange={onFootersChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit the footer Kitchen stamp' }));
    await screen.findByTestId('label-footer-form');
    fireEvent.click(screen.getByTestId('label-footer-remove'));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Remove the footer "Kitchen stamp"?'));
    expect(deleteLabelFooter).not.toHaveBeenCalled();

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByTestId('label-footer-remove'));
    await waitFor(() => expect(deleteLabelFooter).toHaveBeenCalledWith(2));
    await waitFor(() => expect(onFootersChange).toHaveBeenCalledWith([STANDARD]));
    expect(onChange).toHaveBeenCalledWith(null);
    await waitFor(() => expect(screen.queryByTestId('label-footer-form')).toBeNull());

    rerender(<Harness value={1} onChange={onChange} onFootersChange={onFootersChange} footers={[STANDARD]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit the footer Standard' }));
    await screen.findByTestId('label-footer-form');
    expect(screen.queryByTestId('label-footer-remove')).toBeNull();
  });
});
