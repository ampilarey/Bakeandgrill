import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../ui';

const createLabelFooter = vi.fn();
const updateLabelFooter = vi.fn();
const deleteLabelFooter = vi.fn();

vi.mock('../../api', () => ({
  fetchLabelBrands: () => Promise.resolve({ data: [
    { id: 1, name: 'Bake & Grill', is_default: true, logo_url: null },
    { id: 2, name: 'Amma', is_default: false, logo_url: '/storage/amma.png' },
  ] }),
  createLabelFooter: (...a: unknown[]) => createLabelFooter(...a),
  updateLabelFooter: (...a: unknown[]) => updateLabelFooter(...a),
  deleteLabelFooter: (...a: unknown[]) => deleteLabelFooter(...a),
}));

import { FooterPicker, describeFooter } from './FooterPicker';
import type { LabelFooter } from '../../api';

const effective = (name: string, tagline: string, by = ''): LabelFooter['effective'] => ({
  name, name_dv: '', tagline, tagline_dv: '', by, phone: '+960 912 0011', ways: '', ways_dv: '', website: 'bakeandgrill.mv',
  address: 'Kalaafaanu Hingun, Malé', address_dv: '', landmark: '', landmark_dv: '', show_qr: true, show_mark: true,
});
const footer = (id: number, name: string, brand_id: number | null, eff: LabelFooter['effective'], extra: Partial<LabelFooter> = {}): LabelFooter => ({
  id, name, brand_id, brand_name: brand_id ? 'Amma' : null, heading: null, heading_dv: null, tagline: null, tagline_dv: null, by_line: null, show_by: true,
  phone: null, ways: null, ways_dv: null, website: null, address: null, address_dv: null, landmark: null, landmark_dv: null,
  show_qr: true, show_mark: true, is_default: brand_id === null && id === 1, sort: id, effective: eff, custom_labels_count: 0, types_count: 0, ...extra,
});
const STANDARD = footer(1, 'Standard', null, effective('Bake & Grill', 'Fresh Baked, Fire Grilled'));
const AMMA = footer(2, 'Amma', 2, effective('Amma', 'Home-made, the Amma way', 'by Bake & Grill'));

function Harness({ value, canManage = true, footers = [STANDARD, AMMA], onChange = () => {}, onFootersChange = () => {} }: {
  value: number | null; canManage?: boolean; footers?: LabelFooter[]; onChange?: (id: number | null) => void; onFootersChange?: (f: LabelFooter[]) => void;
}) {
  return (
    <ToastProvider>
      <label htmlFor="t-footer">Footer</label>
      <FooterPicker id="t-footer" footers={footers} value={value} onChange={onChange} onFootersChange={onFootersChange} noneLabel="Amma's own footer" canManage={canManage} />
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
    // Without a tagline the by-line stands in.
    expect(describeFooter(footer(3, 'Plain', 2, effective('Amma', '', 'by Bake & Grill')))).toBe('Amma · by Bake & Grill · +960 912 0011 · bakeandgrill.mv');
  });

  it('picks a footer by name and says what it prints; Edit and New need Manage label settings', () => {
    const onChange = vi.fn();
    const { rerender } = render(<Harness value={null} canManage={false} onChange={onChange} />);
    const select = screen.getByLabelText('Footer');
    expect(within(select).getByRole('option', { name: "Amma's own footer" })).toBeInTheDocument();
    expect(within(select).getByRole('option', { name: 'Standard (standard)' })).toBeInTheDocument();
    expect(screen.queryByTestId('t-footer-lines')).toBeNull();
    expect(screen.queryByRole('button', { name: 'New footer' })).toBeNull();
    fireEvent.change(select, { target: { value: '2' } });
    expect(onChange).toHaveBeenCalledWith(2);
    fireEvent.change(select, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith(null);

    rerender(<Harness value={2} canManage={false} onChange={onChange} />);
    expect(screen.getByTestId('t-footer-lines')).toHaveTextContent('Amma · Home-made, the Amma way · +960 912 0011 · bakeandgrill.mv');
    expect(screen.queryByRole('button', { name: 'Edit the footer Amma' })).toBeNull();

    rerender(<Harness value={2} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Edit the footer Amma' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New footer' })).toBeInTheDocument();
  });

  it('changes the picked footer in place: blanks show what they print, Save keeps the list in step', async () => {
    const onChange = vi.fn();
    const onFootersChange = vi.fn();
    updateLabelFooter.mockResolvedValue({ data: { ...AMMA, tagline: 'Hand-made daily', effective: effective('Amma', 'Hand-made daily', 'by Bake & Grill') } });
    render(<Harness value={2} onChange={onChange} onFootersChange={onFootersChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit the footer Amma' }));
    const form = await screen.findByTestId('label-footer-form');
    expect(screen.getByText('Edit footer: Amma')).toBeInTheDocument();
    expect(within(form).getByLabelText('Footer name (for the list)')).toHaveValue('Amma');
    expect(within(form).getByLabelText('Whose lines fill the blanks')).toHaveValue('2');
    // Each empty box shows its live value in grey.
    expect(within(form).getByLabelText('Name printed big')).toHaveAttribute('placeholder', 'Amma');
    expect(within(form).getByLabelText('Tagline, or your own words')).toHaveAttribute('placeholder', 'Home-made, the Amma way');
    expect(within(form).getByLabelText('Phone')).toHaveAttribute('placeholder', '+960 912 0011');
    expect(within(form).getByLabelText('Address')).toHaveAttribute('placeholder', 'Kalaafaanu Hingun, Malé');
    expect(within(form).getByLabelText('By-line')).toHaveAttribute('placeholder', 'by Bake & Grill');

    fireEvent.change(within(form).getByLabelText('Tagline, or your own words'), { target: { value: '  Hand-made daily ' } });
    fireEvent.click(within(form).getByLabelText('Print the complaints QR'));
    fireEvent.click(screen.getByTestId('label-footer-save'));
    await waitFor(() => expect(updateLabelFooter).toHaveBeenCalledTimes(1));
    expect(updateLabelFooter.mock.calls[0]).toEqual([2, expect.objectContaining({ name: 'Amma', brand_id: 2, tagline: 'Hand-made daily', heading: null, show_qr: false, show_by: true })]);
    await waitFor(() => expect(screen.queryByTestId('label-footer-form')).toBeNull());
    expect(onFootersChange).toHaveBeenCalledWith([STANDARD, expect.objectContaining({ id: 2, tagline: 'Hand-made daily' })]);
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('adds a footer and picks it; a name is needed', async () => {
    const onChange = vi.fn();
    const onFootersChange = vi.fn();
    createLabelFooter.mockResolvedValue({ data: footer(3, 'Kitchen stamp', null, effective('Bake & Grill', 'Hand-made daily'), { tagline: 'Hand-made daily', sort: 3 }) });
    render(<Harness value={null} onChange={onChange} onFootersChange={onFootersChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'New footer' }));
    const form = await screen.findByTestId('label-footer-form');
    expect(screen.getByRole('heading', { name: 'New footer' })).toBeInTheDocument();
    // Nothing is removed from a footer that is not saved yet.
    expect(screen.queryByTestId('label-footer-remove')).toBeNull();
    fireEvent.click(screen.getByTestId('label-footer-save'));
    expect(createLabelFooter).not.toHaveBeenCalled();
    expect(await screen.findByText('Give the footer a name.')).toBeInTheDocument();

    fireEvent.change(within(form).getByLabelText('Footer name (for the list)'), { target: { value: 'Kitchen stamp' } });
    fireEvent.change(within(form).getByLabelText('Tagline, or your own words'), { target: { value: 'Hand-made daily' } });
    fireEvent.click(screen.getByTestId('label-footer-save'));
    await waitFor(() => expect(createLabelFooter).toHaveBeenCalledWith(expect.objectContaining({ name: 'Kitchen stamp', brand_id: null, tagline: 'Hand-made daily', show_qr: true, show_mark: true })));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(3));
    expect(onFootersChange).toHaveBeenCalledWith([STANDARD, AMMA, expect.objectContaining({ id: 3, name: 'Kitchen stamp' })]);
  });

  it('removes a footer after asking, and the picked one falls back to the brand\'s own; the standard one has no Remove', async () => {
    const onChange = vi.fn();
    const onFootersChange = vi.fn();
    deleteLabelFooter.mockResolvedValue({ ok: true });
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { rerender } = render(<Harness value={2} onChange={onChange} onFootersChange={onFootersChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit the footer Amma' }));
    await screen.findByTestId('label-footer-form');
    fireEvent.click(screen.getByTestId('label-footer-remove'));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Remove the footer "Amma"?'));
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
