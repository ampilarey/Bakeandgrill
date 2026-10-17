import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/*
 * Owner, 2026-10-17: "why no option to add new label type here". The + beside
 * a Label type box opens the type editor and hands the new type back.
 */
const api = vi.hoisted(() => ({
  fetchLabelBrands: vi.fn(async () => ({ data: [{ id: 1, name: 'Bake & Grill', is_default: true, logo_url: null }] })),
  fetchLabelFooters: vi.fn(async () => ({ data: [] })),
  createLabelType: vi.fn(async (body: Record<string, unknown>) => ({ data: { id: 9, ...body } })),
  fetchLabelTypes: vi.fn(), updateLabelType: vi.fn(), deleteLabelType: vi.fn(), createLabelBrand: vi.fn(), updateLabelBrand: vi.fn(),
  deleteLabelBrand: vi.fn(), deleteLabelFooter: vi.fn(), uploadLabelBrandLogo: vi.fn(),
}));
vi.mock('../../api', () => api);
vi.mock('./LabelTemplatesCard', () => ({ LabelTemplatesCard: () => null }));
vi.mock('./FooterPicker', () => ({ FooterPicker: () => null, FooterModal: () => null, describeFooter: () => '' }));
vi.mock('../ui', async () => {
  const actual = await vi.importActual<typeof import('../ui')>('../ui');
  return { ...actual, useToast: () => ({ toast: vi.fn() }) };
});

import { NewTypeButton } from './TypesAndBrands';

describe('NewTypeButton', () => {
  it('opens the type editor and hands back the saved type', async () => {
    const onSaved = vi.fn();
    render(<NewTypeButton onSaved={onSaved} />);
    fireEvent.click(screen.getByRole('button', { name: 'New label type' }));
    const name = await screen.findByLabelText('Type name (for the list)');
    fireEvent.change(name, { target: { value: 'Chilled Sauce' } });
    fireEvent.change(screen.getByLabelText('Heading on the sticker'), { target: { value: 'HOMEMADE SAUCE' } });
    fireEvent.click(screen.getByTestId('label-type-save'));
    await waitFor(() => expect(api.createLabelType).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 9, name: 'Chilled Sauce' })));
    expect(screen.queryByLabelText('Type name (for the list)')).toBeNull();
  });
});
