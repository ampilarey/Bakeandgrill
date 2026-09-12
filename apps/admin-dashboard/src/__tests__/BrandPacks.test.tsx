import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { createRef } from 'react';
import {
  BrandPacks, type BrandPackRow, type BrandPackStore, type BrandPacksHandle, type BrandRow,
} from '../components/BrandPacks';

/*
 * Owner, 2026-09-12: "Each brand should have its default packaging, price,
 * photo options. More than one brand option." And: "New items and edit.
 * Should be same."
 *
 * One card per brand, its packs inside, the same editor on both forms. The
 * store is a fake here: what the editor sends it is the behaviour.
 */

vi.mock('../components/ScanSheet', () => ({ ScanSheet: () => null }));

const amul: BrandRow = { key: '1', id: 1, brand: 'Amul', photoUrl: 'https://cdn.test/amul.jpg' };

const tin: BrandPackRow = { key: '7', id: 7, brand: 'Amul', name: 'Tin', baseUnits: 1000, price: 185, pricedAt: '2026-09-01T00:00:00Z', barcode: '' };
const jar: BrandPackRow = { key: '8', id: 8, brand: 'Nestlé', name: 'Jar', baseUnits: 500, price: null, pricedAt: null, barcode: '' };
const loose: BrandPackRow = { key: '9', id: 9, brand: '', name: 'Loose kg', baseUnits: 1000, price: null, pricedAt: null, barcode: '' };

let store: { [K in keyof BrandPackStore]: ReturnType<typeof vi.fn> };

function show(props: Partial<Parameters<typeof BrandPacks>[0]> = {}) {
  const ref = createRef<BrandPacksHandle>();
  render(
    <BrandPacks
      ref={ref}
      testId="editor"
      unit="ml"
      brands={[amul]}
      packs={[tin, jar, loose]}
      canManage
      savesImmediately
      store={store as unknown as BrandPackStore}
      {...props}
    />,
  );
  return ref;
}

describe('Brands and packs, brand first', () => {
  beforeEach(() => {
    store = {
      addBrand: vi.fn().mockResolvedValue(undefined),
      setBrandPhoto: vi.fn().mockResolvedValue(undefined),
      removeBrand: vi.fn().mockResolvedValue(undefined),
      addPack: vi.fn().mockResolvedValue(undefined),
      updatePack: vi.fn().mockResolvedValue(undefined),
      removePack: vi.fn().mockResolvedValue(undefined),
    };
  });

  it('puts each pack under its brand, and the shared ones under Any brand', () => {
    show();

    const amulCard = screen.getByTestId('brand-group-amul');
    expect(within(amulCard).getByTestId('pack-row-7')).toHaveTextContent('Tin');
    expect(within(amulCard).getByTestId('pack-row-7')).toHaveTextContent('MVR 185.00');
    expect(within(amulCard).getByTestId('brand-thumb-Amul')).toHaveAttribute('src', 'https://cdn.test/amul.jpg');

    expect(within(screen.getByTestId('brand-group-shared')).getByTestId('pack-row-9')).toHaveTextContent('Loose kg');
    expect(within(amulCard).queryByTestId('pack-row-9')).toBeNull();
  });

  it('gives a brand that so far only exists on a pack a card of its own, without a picture', () => {
    // Packs made before this screen named a brand nobody wrote down. They
    // are not lost, and the brand can be given a picture here rather than
    // typed a third time.
    show();

    const nestle = screen.getByTestId('brand-group-nestlé');
    expect(within(nestle).getByTestId('pack-row-8')).toHaveTextContent('Jar');
    expect(within(nestle).getByTestId('brand-no-photo-nestlé')).toBeInTheDocument();
    expect(within(nestle).getByLabelText('Add the picture for Nestlé')).toBeInTheDocument();
  });

  it('adds a brand and opens the pack boxes under it, so the next step is right there', async () => {
    const draw = (brands: BrandRow[]) => (
      <BrandPacks testId="editor" unit="ml" brands={brands} packs={[]} canManage savesImmediately store={store as unknown as BrandPackStore} />
    );
    const { rerender } = render(draw([]));

    fireEvent.change(screen.getByLabelText('Brand name'), { target: { value: ' Royal ' } });
    fireEvent.click(screen.getByText('Add brand'));

    await waitFor(() => expect(store.addBrand).toHaveBeenCalledWith('Royal', null));
    // The parent re-reads its brands and hands the new one down…
    rerender(draw([{ key: '2', id: 2, brand: 'Royal', photoUrl: null }]));
    // …and the pack boxes are already open under it.
    expect(await screen.findByText('Add a pack of Royal')).toBeInTheDocument();
    expect(screen.getByLabelText('Brand name')).toHaveValue('');
  });

  it('refuses a brand already on the list, however it is typed', async () => {
    show();

    fireEvent.change(screen.getByLabelText('Brand name'), { target: { value: 'AMUL' } });
    fireEvent.click(screen.getByText('Add brand'));

    expect(await screen.findByText('AMUL is already on the list.')).toBeInTheDocument();
    expect(store.addBrand).not.toHaveBeenCalled();
  });

  it("sends a new pack with the brand of the card it was typed under", async () => {
    show();

    fireEvent.click(screen.getByLabelText('Add a pack for Amul'));
    fireEvent.change(screen.getByLabelText('Pack name'), { target: { value: 'Sachet' } });
    fireEvent.change(screen.getByLabelText('Pack default price'), { target: { value: '12.5' } });
    fireEvent.change(screen.getByLabelText('Amount in the pack'), { target: { value: '50' } });
    fireEvent.click(screen.getByText('Add pack'));

    await waitFor(() => expect(store.addPack).toHaveBeenCalledWith({
      brand: 'Amul', name: 'Sachet', baseUnits: 50, price: 12.5, barcode: '',
    }));
    // The boxes stay open under Amul for the next one.
    expect(screen.getByText('Add a pack of Amul')).toBeInTheDocument();
    expect(screen.getByLabelText('Pack name')).toHaveValue('');
  });

  it('multiplies a case out against a pack of the same brand', async () => {
    show();

    fireEvent.click(screen.getByLabelText('Add a pack for Amul'));
    // Only Amul's packs and the shared ones are on offer — not Nestlé's jar.
    const measuredIn = screen.getByLabelText('Measured in') as HTMLSelectElement;
    const options = [...measuredIn.options].map((o) => o.textContent);
    expect(options).toContain('tin');
    expect(options).toContain('loose kg');
    expect(options).not.toContain('jar');

    fireEvent.change(screen.getByLabelText('Pack name'), { target: { value: 'Case' } });
    fireEvent.change(screen.getByLabelText('Amount in the pack'), { target: { value: '12' } });
    fireEvent.change(measuredIn, { target: { value: '7' } });
    fireEvent.click(screen.getByText('Add pack'));

    await waitFor(() => expect(store.addPack).toHaveBeenCalledWith(expect.objectContaining({ name: 'Case', baseUnits: 12000 })));
  });

  it('refuses a pack with no amount rather than sending a zero', async () => {
    show();

    fireEvent.click(screen.getByLabelText('Add a pack for any brand'));
    fireEvent.change(screen.getByLabelText('Pack name'), { target: { value: 'Carton' } });
    fireEvent.click(screen.getByText('Add pack'));

    expect(await screen.findByText('Say how much is in it.')).toBeInTheDocument();
    expect(store.addPack).not.toHaveBeenCalled();
  });

  /*
   * Owner, 2026-09-07: "sometimes we buy 6 pcs packets. And sometimes 10 pcs
   * packets." The store refuses a reused name at a different size, the way
   * the server does; the editor asks which was meant.
   */
  it('turns the store refusing a reused name into the correction-or-second-size question', async () => {
    store.addPack.mockRejectedValueOnce(Object.assign(new Error('Conflict'), {
      body: {
        conflict: 'pack_name_in_use',
        message: 'taken',
        existing: { id: 7, name: 'Tin', base_units: 1000 },
        requested_base_units: 500,
        suggested_name: 'Tin 500',
      },
    }));
    show();

    fireEvent.click(screen.getByLabelText('Add a pack for Amul'));
    fireEvent.change(screen.getByLabelText('Pack name'), { target: { value: 'tin' } });
    fireEvent.change(screen.getByLabelText('Amount in the pack'), { target: { value: '500' } });
    fireEvent.click(screen.getByText('Add pack'));

    const ask = await screen.findByTestId('pack-name-clash');
    expect(ask).toHaveTextContent('already holds 1000 ml');

    fireEvent.click(screen.getByTestId('pack-clash-keep-both'));
    await waitFor(() => expect(store.addPack).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'Tin 500', baseUnits: 500 })));
    expect(store.addPack.mock.calls[1][0]).not.toHaveProperty('replace');
    await waitFor(() => expect(screen.queryByTestId('pack-name-clash')).toBeNull());
  });

  it('sends replace when the reused name was a correction', async () => {
    store.addPack.mockRejectedValueOnce(Object.assign(new Error('Conflict'), {
      body: {
        conflict: 'pack_name_in_use', message: 'taken',
        existing: { id: 7, name: 'Tin', base_units: 1000 }, requested_base_units: 900, suggested_name: 'Tin 900',
      },
    }));
    show();

    fireEvent.click(screen.getByLabelText('Add a pack for Amul'));
    fireEvent.change(screen.getByLabelText('Pack name'), { target: { value: 'Tin' } });
    fireEvent.change(screen.getByLabelText('Amount in the pack'), { target: { value: '900' } });
    fireEvent.click(screen.getByText('Add pack'));
    await screen.findByTestId('pack-name-clash');

    fireEvent.click(screen.getByTestId('pack-clash-replace'));

    await waitFor(() => expect(store.addPack).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'Tin', baseUnits: 900, replace: true })));
  });

  it('corrects a pack in place — name, amount, price and barcode', async () => {
    show();

    fireEvent.click(screen.getByLabelText('Edit Tin'));
    fireEvent.change(screen.getByLabelText('Name of Tin'), { target: { value: '1 kg tin' } });
    fireEvent.change(screen.getByLabelText('Amount in Tin'), { target: { value: '1000' } });
    fireEvent.change(screen.getByLabelText('Price of Tin'), { target: { value: '190' } });
    fireEvent.change(screen.getByLabelText('Barcode of Tin'), { target: { value: '8901' } });
    fireEvent.click(within(screen.getByTestId('pack-row-7')).getByText('Save'));

    await waitFor(() => expect(store.updatePack).toHaveBeenCalledWith(tin, {
      name: '1 kg tin', baseUnits: 1000, price: 190, barcode: '8901',
    }));
  });

  it('clears a price when the box is emptied, rather than keeping a stale one', async () => {
    show();

    fireEvent.click(screen.getByLabelText('Edit Tin'));
    fireEvent.change(screen.getByLabelText('Price of Tin'), { target: { value: '' } });
    fireEvent.click(within(screen.getByTestId('pack-row-7')).getByText('Save'));

    await waitFor(() => expect(store.updatePack).toHaveBeenCalledWith(tin, expect.objectContaining({ price: null })));
  });

  it('asks before removing a brand, then hands over its packs too', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    show();

    fireEvent.click(screen.getByLabelText('Remove Amul'));

    expect(confirm).toHaveBeenCalledWith('Remove Amul and its pack?');
    await waitFor(() => expect(store.removeBrand).toHaveBeenCalledWith({ brand: 'Amul', row: amul, packs: [tin] }));
    confirm.mockRestore();
  });

  it('leaves the brand alone when the question is answered no', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    show();

    fireEvent.click(screen.getByLabelText('Remove Amul'));

    expect(store.removeBrand).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it('offers the brands bought before that are not on the list, one tap to add', async () => {
    show({ knownBrands: ['Amul', 'Royal'] });

    expect(screen.getByText(/Bought before, not on this list/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Add Royal'));

    await waitFor(() => expect(store.addBrand).toHaveBeenCalledWith('Royal', null));
  });

  it('takes a picture for a brand already on the list', async () => {
    show();

    fireEvent.click(screen.getByLabelText('Add the picture for Nestlé'));
    const file = new File(['x'], 'nestle.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByTestId('brand-photo-file'), { target: { files: [file] } });

    await waitFor(() => expect(store.setBrandPhoto).toHaveBeenCalledWith('Nestlé', file));
  });

  /*
   * Owner, 2026-09-09: "i dont see the previoulsly added pack size." The
   * boxes look like part of the form, so a pack typed there and never pushed
   * through "Add pack" is still meant when the form's own save is pressed.
   */
  it('flushes a half-typed pack and a half-typed brand when the form is saved', async () => {
    const ref = show();

    fireEvent.click(screen.getByLabelText('Add a pack for any brand'));
    fireEvent.change(screen.getByLabelText('Pack name'), { target: { value: 'Bag' } });
    fireEvent.change(screen.getByLabelText('Amount in the pack'), { target: { value: '5000' } });
    fireEvent.change(screen.getByLabelText('Brand name'), { target: { value: 'Royal' } });

    let result: 'done' | 'stuck' | undefined;
    await act(async () => { result = await ref.current!.flush(); });

    expect(result).toBe('done');
    expect(store.addPack).toHaveBeenCalledWith(expect.objectContaining({ brand: '', name: 'Bag', baseUnits: 5000 }));
    expect(store.addBrand).toHaveBeenCalledWith('Royal', null);
  });

  it('is stuck when the half-typed pack cannot be added, and says why', async () => {
    const ref = show();

    fireEvent.click(screen.getByLabelText('Add a pack for Amul'));
    fireEvent.change(screen.getByLabelText('Pack name'), { target: { value: 'Carton' } });

    let result: 'done' | 'stuck' | undefined;
    await act(async () => { result = await ref.current!.flush(); });

    expect(result).toBe('stuck');
    expect(screen.getByText('Say how much is in it.')).toBeInTheDocument();
    expect(store.addPack).not.toHaveBeenCalled();
  });

  it('has nothing to flush when nothing is typed', async () => {
    const ref = show();

    let result: 'done' | 'stuck' | undefined;
    await act(async () => { result = await ref.current!.flush(); });

    expect(result).toBe('done');
    expect(store.addPack).not.toHaveBeenCalled();
    expect(store.addBrand).not.toHaveBeenCalled();
  });

  it('shows the same words on both forms, differing only in when things save', () => {
    show({ savesImmediately: false });

    expect(screen.getByText(/These save with the item/)).toBeInTheDocument();
    expect(screen.getByText(/Brands and packs — whose you buy/)).toBeInTheDocument();
  });

  it('is read-only for somebody who cannot manage stock', () => {
    show({ canManage: false });

    expect(screen.getByTestId('pack-row-7')).toBeInTheDocument();
    expect(screen.queryByLabelText('Brand name')).toBeNull();
    expect(screen.queryByLabelText('Add a pack for Amul')).toBeNull();
    expect(screen.queryByLabelText('Edit Tin')).toBeNull();
    expect(screen.queryByLabelText('Remove Amul')).toBeNull();
  });

  it('says so when there is nothing yet', () => {
    show({ brands: [], packs: [] });

    expect(screen.getByText(/No brands or packs yet/)).toBeInTheDocument();
  });
});
