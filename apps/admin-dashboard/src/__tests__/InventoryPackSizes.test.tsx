import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import InventoryPage from '../pages/InventoryPage';

/*
 * Pack sizes, where somebody can find them.
 *
 * Owner, 2026-09-06: "i dont see pack size" — asking how to handle ghee that
 * comes in 100 ml and 500 ml tins. The feature was built on 5 September and
 * then hidden behind an unlabelled 📦 among five other emoji buttons on the
 * row, so an item with packs looked exactly like one without and nobody knew
 * the thing existed.
 *
 * It is a named section of Edit item now, and every row says what it buys as.
 * Since 2026-09-12 the section is brand-first — each brand's packs, prices
 * and picture under one card — and Add and Edit draw the very same editor.
 */

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }));
vi.mock('../hooks/usePermissions', () => ({
  useCurrentUserPermissions: () => ({ can: () => true, loading: false, user: null }),
}));
vi.mock('../components/ScanSheet', () => ({ ScanSheet: () => null }));

// The brand side of the editor reaches for operations directly; stub only
// those calls and leave brandKey — which the page itself uses — as the real thing.
const { getBrandPhotos, uploadBrandPhoto, deleteBrandPhoto } = vi.hoisted(() => ({
  getBrandPhotos: vi.fn(),
  uploadBrandPhoto: vi.fn(),
  deleteBrandPhoto: vi.fn(),
}));
vi.mock('../api/operations', async (importOriginal) => ({
  ...await importOriginal<typeof import('../api/operations')>(),
  getBrandPhotos: (...a: unknown[]) => getBrandPhotos(...a),
  uploadBrandPhoto: (...a: unknown[]) => uploadBrandPhoto(...a),
  deleteBrandPhoto: (...a: unknown[]) => deleteBrandPhoto(...a),
}));

const ghee = {
  id: 21,
  name: 'Ghee',
  sku: 'GHEE-1',
  barcode: null,
  unit: 'ml',
  quantity_on_hand: 2500,
  reorder_level: 1000,
  cost_per_unit: 0.19,
  category: { id: 3, name: 'Dry store' },
  is_active: true,
  requestable: false,
  last_counted_at: null,
  created_at: '2026-01-01T00:00:00Z',
  lead_days: 3,
  cover_days: 14,
  storage_location: 'Dry store',
  notes: null,
  preferred_supplier_id: null,
  purchase_units: [
    { id: 7, name: '500 ml tin', base_units: 500 },
    { id: 6, name: '100 ml tin', base_units: 100 },
  ],
};

const looseSalt = { ...ghee, id: 22, name: 'Salt', sku: 'SALT-1', unit: 'kg', quantity_on_hand: 8, purchase_units: [] };

/*
 * Owner, 2026-09-06: "water, 5 bottles per day … known by sale and quantity
 * bought, each day." The list says the rate and roughly when it runs out.
 */
const water = {
  ...ghee, id: 23, name: 'Water', sku: 'WTR-1', unit: 'bottle', quantity_on_hand: 15,
  purchase_units: [],
  usage_per_day: 5, bought_per_day: 4.5, usage_source: 'used', days_left: 3,
};
const gas = {
  ...ghee, id: 24, name: 'Gas cylinder', sku: 'GAS-1', unit: 'piece', quantity_on_hand: 2,
  purchase_units: [],
  usage_per_day: 0, bought_per_day: 0.1, usage_source: 'bought', days_left: 20,
};

const getPurchaseUnits = vi.fn();
const createPurchaseUnit = vi.fn();
const deletePurchaseUnit = vi.fn();
const fetchInventoryItems = vi.fn();
const createInventoryItem = vi.fn();
const updateInventoryItem = vi.fn().mockResolvedValue({ item: {} });

vi.mock('../api', () => ({
  getPurchaseUnits: (...a: unknown[]) => getPurchaseUnits(...a),
  createPurchaseUnit: (...a: unknown[]) => createPurchaseUnit(...a),
  deletePurchaseUnit: (...a: unknown[]) => deletePurchaseUnit(...a),
  fetchInventoryItems: (...a: unknown[]) => fetchInventoryItems(...a),
  updateInventoryItem: (...a: unknown[]) => updateInventoryItem(...a),
  fetchLowStockItems: vi.fn().mockResolvedValue({ data: [] }),
  fetchInventoryCategories: vi.fn().mockResolvedValue({ categories: [{ id: 3, name: 'Dry store' }] }),
  fetchSuppliers: vi.fn().mockResolvedValue({ data: [] }),
  getUnitConversions: vi.fn().mockResolvedValue({ conversions: [] }),
  fetchPreparedStock: vi.fn().mockResolvedValue({ rows: [] }),
  adjustInventoryStock: vi.fn(),
  createInventoryCategory: vi.fn(),
  updateInventoryCategory: vi.fn(),
  createUnitConversion: vi.fn(),
  deleteUnitConversion: vi.fn(),
  getInventoryPriceHistory: vi.fn(),
  getInventoryCheapestSupplier: vi.fn(),
  submitStockCount: vi.fn(),
  adjustPreparedStock: vi.fn(),
  createInventoryItem: (...a: unknown[]) => createInventoryItem(...a),
  fetchInventoryItemDetail: vi.fn(),
}));

function renderPage() {
  render(<MemoryRouter><InventoryPage /></MemoryRouter>);
}

async function openEditor(title = 'Edit this item') {
  renderPage();
  const buttons = await screen.findAllByTitle(title);
  fireEvent.click(buttons[0]);
  return await screen.findByTestId('pack-sizes-section');
}

/** Open the pack boxes under "Any brand" if they are not open yet. */
function openSharedPackBoxes() {
  if (!screen.queryByLabelText('Pack name')) {
    fireEvent.click(screen.getByLabelText('Add a pack for any brand'));
  }
}

describe('Pack sizes on the inventory list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBrandPhotos.mockResolvedValue({ item_id: 21, photos: [] });
    getPurchaseUnits.mockResolvedValue({
      base_unit: 'ml',
      purchase_units: [
        { id: 6, name: '100 ml tin', base_units: 100 },
        { id: 7, name: '500 ml tin', base_units: 500 },
      ],
    });
    fetchInventoryItems.mockResolvedValue({
      data: [ghee, looseSalt],
      meta: { current_page: 1, last_page: 1, total: 2 },
    });
  });

  it('offers the same sort on the desk and the phone, and both obey it', async () => {
    // Owner, 2026-09-07: "Add inventory sort option in both desktop and
    // mobile view." One control; the order it produces must match.
    fetchInventoryItems.mockResolvedValue({
      data: [water, gas],
      meta: { current_page: 1, last_page: 1, total: 2 },
      units: [],
    });
    renderPage();
    const sort = await screen.findByLabelText('Sort items');

    // Default: alphabetical — Gas cylinder before Water.
    let rows = screen.getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('Gas cylinder');

    fireEvent.change(sort, { target: { value: 'days_left' } });
    rows = screen.getAllByRole('row').slice(1);
    // Water runs out in 3 days, gas in 20.
    expect(rows[0]).toHaveTextContent('Water');
    expect(localStorage.getItem('bg_inventory_sort')).toBe('days_left');
  });

  it('shows the whole store, not the first page of it', async () => {
    // The list stopped after page one, so item fifty-one never appeared
    // unless somebody searched for it by name.
    fetchInventoryItems.mockImplementation(async ({ page }: { page?: number }) =>
      (page ?? 1) === 1
        ? { data: [ghee], meta: { current_page: 1, last_page: 2, total: 2 }, units: ['ml'] }
        : { data: [looseSalt], meta: { current_page: 2, last_page: 2, total: 2 }, units: [] });
    renderPage();

    await screen.findByText('Ghee');
    expect(await screen.findByText('Salt')).toBeInTheDocument();
    expect(fetchInventoryItems).toHaveBeenCalledWith(expect.objectContaining({ page: 1, per_page: 200 }));
    expect(fetchInventoryItems).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }));
  });

  it('narrows to the buying list on the desk and the phone alike', async () => {
    // Water is under its level with 3 days left; gas has 20 days and no level.
    fetchInventoryItems.mockResolvedValue({
      data: [water, { ...gas, reorder_level: null }],
      meta: { current_page: 1, last_page: 1, total: 2 },
      units: [],
    });
    renderPage();
    const toggle = await screen.findByRole('button', { name: /Reorder soon \(1\)/ });
    expect(screen.getByText('Gas cylinder')).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Water')).toBeInTheDocument();
    expect(screen.queryByText('Gas cylinder')).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(screen.getByText('Gas cylinder')).toBeInTheDocument();
  });

  it('says how fast an item goes, and when it runs out', async () => {
    fetchInventoryItems.mockResolvedValue({
      data: [water, gas],
      meta: { current_page: 1, last_page: 1, total: 2 },
      units: [],
    });
    renderPage();

    expect(await screen.findByText('~5 /day')).toBeInTheDocument();
    expect(screen.getByText(/≈ 3 days left/)).toBeInTheDocument();
    // An untracked item stands on its buying rate, and says so.
    expect(screen.getByText('~0.1 /day')).toBeInTheDocument();
    expect(screen.getByText(/≈ 20 days left · from buying/)).toBeInTheDocument();
  });

  it('says what an item buys as, without opening anything', async () => {
    renderPage();

    // Smallest first, so it reads up from the loose unit.
    expect(await screen.findByText(/Buys as 100 ml tin \(100 ml\) · 500 ml tin \(500 ml\)/)).toBeInTheDocument();
  });

  it('reads the stock back in whole tins', async () => {
    // 2500 ml is five 500 ml tins — the number somebody at the shelf counts.
    renderPage();

    expect(await screen.findByText('5 × 500 ml tin')).toBeInTheDocument();
  });

  it('claims no tins when the stock does not divide into whole ones', async () => {
    // 2300 ml is 4.6 tins, which is not a thing anybody has on a shelf.
    fetchInventoryItems.mockResolvedValue({
      data: [{ ...ghee, quantity_on_hand: 2300 }],
      meta: { current_page: 1, last_page: 1, total: 1 },
    });
    renderPage();

    await screen.findByText(/Buys as/);
    expect(screen.queryByText(/× 500 ml tin/)).toBeNull();
  });

  it('says nothing at all for an item bought loose', async () => {
    renderPage();

    const rows = await screen.findAllByText('Salt');
    expect(rows[0].closest('td')?.textContent).not.toMatch(/Buys as/);
  });
});

describe('Brands and packs inside Edit item', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBrandPhotos.mockResolvedValue({ item_id: 21, photos: [] });
    getPurchaseUnits.mockResolvedValue({
      base_unit: 'ml',
      purchase_units: [{ id: 7, name: '500 ml tin', base_units: 500 }],
    });
    fetchInventoryItems.mockResolvedValue({
      data: [ghee],
      meta: { current_page: 1, last_page: 1, total: 1 },
    });
  });

  it('is a named section, not an emoji nobody finds', async () => {
    const section = await openEditor();

    expect(within(section).getByText(/Brands and packs — whose you buy/)).toBeInTheDocument();
    // The unit it is measured against, said out loud.
    expect(section.textContent).toMatch(/Stock is counted in\s*ml/);
  });

  it("loads the item's packs when the editor opens", async () => {
    const section = await openEditor();

    await waitFor(() => expect(getPurchaseUnits).toHaveBeenCalledWith(21));
    expect(await within(section).findByTestId('pack-row-7')).toHaveTextContent('500 ml tin');
    expect(within(section).getByTestId('pack-row-7')).toHaveTextContent('500 ml');
  });

  it('adds a second tin size from inside the editor', async () => {
    createPurchaseUnit.mockResolvedValue({ purchase_unit: { id: 6, name: '100 ml tin', base_units: 100 } });
    const section = await openEditor();
    await within(section).findByTestId('pack-row-7');

    openSharedPackBoxes();
    fireEvent.change(screen.getByLabelText('Pack name'), { target: { value: '100 ml tin' } });
    fireEvent.change(screen.getByLabelText('Amount in the pack'), { target: { value: '100' } });
    fireEvent.click(screen.getByText('Add pack'));

    await waitFor(() => expect(createPurchaseUnit).toHaveBeenCalledWith(21, {
      name: '100 ml tin',
      base_units: 100,
    }));
  });

  it('refuses a pack with no amount rather than storing a zero', async () => {
    const section = await openEditor();
    await within(section).findByTestId('pack-row-7');

    openSharedPackBoxes();
    fireEvent.change(screen.getByLabelText('Pack name'), { target: { value: 'Carton' } });
    fireEvent.click(screen.getByText('Add pack'));

    expect(await screen.findByText('Say how much is in it.')).toBeInTheDocument();
    expect(createPurchaseUnit).not.toHaveBeenCalled();
  });

  /*
   * Owner, 2026-09-09: "i dont see the previoulsly added pack size." The
   * boxes look like part of the form, so filling them and pressing the form's
   * own save button is the obvious thing to do. Treat it as meant.
   */
  it('takes a pack still sitting in the boxes when Save changes is pressed', async () => {
    createPurchaseUnit.mockResolvedValue({ purchase_unit: { id: 6, name: '100 ml tin', base_units: 100 } });
    const section = await openEditor();
    await within(section).findByTestId('pack-row-7');

    openSharedPackBoxes();
    fireEvent.change(screen.getByLabelText('Pack name'), { target: { value: '100 ml tin' } });
    fireEvent.change(screen.getByLabelText('Amount in the pack'), { target: { value: '100' } });
    // Straight to the form's own save, without "Add pack".
    fireEvent.click(screen.getByText('Save changes'));

    await waitFor(() => expect(createPurchaseUnit).toHaveBeenCalledWith(21, {
      name: '100 ml tin',
      base_units: 100,
    }));
    await waitFor(() => expect(updateInventoryItem).toHaveBeenCalled());
  });

  it('holds the item open when the leftover pack cannot be saved', async () => {
    const section = await openEditor();
    await within(section).findByTestId('pack-row-7');

    openSharedPackBoxes();
    fireEvent.change(screen.getByLabelText('Pack name'), { target: { value: 'Carton' } });
    fireEvent.click(screen.getByText('Save changes'));

    expect(await screen.findByText(/has not been added yet/)).toBeInTheDocument();
    expect(updateInventoryItem).not.toHaveBeenCalled();
  });

  /*
   * Owner, 2026-09-12: "Each brand should have its default packaging, price,
   * photo options." One card per brand: its picture, its packs with their
   * prices, and a place to add the next pack under it.
   */
  it("shows each brand's picture and packs together, and offers the brands bought before", async () => {
    getBrandPhotos.mockResolvedValue({
      item_id: 21,
      photos: [{ id: 1, brand: 'Sunrise', url: 'https://cdn.test/sunrise.jpg', note: null }],
    });
    getPurchaseUnits.mockResolvedValue({
      base_unit: 'ml',
      purchase_units: [
        { id: 7, name: '500 ml tin', base_units: 500, brand: 'Sunrise', brand_key: 'sunrise', default_unit_cost: 185 },
        { id: 8, name: 'Loose', base_units: 1 },
      ],
      brands: ['Sunrise', 'Royal'],
    });
    const section = await openEditor();

    const sunrise = await within(section).findByTestId('brand-group-sunrise');
    expect(within(sunrise).getByTestId('brand-thumb-Sunrise')).toHaveAttribute('src', 'https://cdn.test/sunrise.jpg');
    expect(within(sunrise).getByTestId('pack-row-7')).toHaveTextContent('500 ml tin');
    expect(within(sunrise).getByTestId('pack-row-7')).toHaveTextContent('MVR 185.00');
    // The shared pack is not Sunrise's.
    expect(within(section).getByTestId('brand-group-shared')).toHaveTextContent('Loose');
    // Royal has been bought but never written down — one tap adds it.
    expect(within(section).getByLabelText('Add Royal')).toBeInTheDocument();
  });

  it('writes a brand down against the item the moment it is added', async () => {
    uploadBrandPhoto.mockResolvedValue({ photo: { id: 2, brand: 'Royal', url: null, note: null } });
    const section = await openEditor();
    await within(section).findByTestId('pack-row-7');

    fireEvent.change(screen.getByLabelText('Brand name'), { target: { value: 'Royal' } });
    fireEvent.click(screen.getByText('Add brand'));

    await waitFor(() => expect(uploadBrandPhoto).toHaveBeenCalledWith(21, 'Royal', null));
    // Re-read, so the card shows what was stored.
    await waitFor(() => expect(getBrandPhotos).toHaveBeenCalledTimes(2));
  });

  it("sends a pack added under a brand's card with that brand and its price", async () => {
    getBrandPhotos.mockResolvedValue({
      item_id: 21,
      photos: [{ id: 1, brand: 'Sunrise', url: null, note: null }],
    });
    createPurchaseUnit.mockResolvedValue({ purchase_unit: { id: 9, name: 'Jar', base_units: 250 } });
    const section = await openEditor();
    await within(section).findByTestId('brand-group-sunrise');

    fireEvent.click(screen.getByLabelText('Add a pack for Sunrise'));
    fireEvent.change(screen.getByLabelText('Pack name'), { target: { value: 'Jar' } });
    fireEvent.change(screen.getByLabelText('Pack default price'), { target: { value: '95' } });
    fireEvent.change(screen.getByLabelText('Amount in the pack'), { target: { value: '250' } });
    fireEvent.click(screen.getByText('Add pack'));

    await waitFor(() => expect(createPurchaseUnit).toHaveBeenCalledWith(21, {
      name: 'Jar', base_units: 250, brand: 'Sunrise', default_unit_cost: 95,
    }));
  });

  it('removes a brand with its packs, after asking', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    getBrandPhotos.mockResolvedValue({
      item_id: 21,
      photos: [{ id: 1, brand: 'Sunrise', url: null, note: null }],
    });
    getPurchaseUnits.mockResolvedValue({
      base_unit: 'ml',
      purchase_units: [{ id: 7, name: '500 ml tin', base_units: 500, brand: 'Sunrise', brand_key: 'sunrise' }],
    });
    deletePurchaseUnit.mockResolvedValue(undefined);
    deleteBrandPhoto.mockResolvedValue({ deleted: true });
    const section = await openEditor();
    await within(section).findByTestId('brand-group-sunrise');

    fireEvent.click(screen.getByLabelText('Remove Sunrise'));

    await waitFor(() => expect(deletePurchaseUnit).toHaveBeenCalledWith(21, 7));
    await waitFor(() => expect(deleteBrandPhoto).toHaveBeenCalledWith(21, 1));
    confirm.mockRestore();
  });

  it('offers the camera for the item barcode, the way Add Item does', async () => {
    // Add Item has had the camera since 2026-09-02 and Edit never did, so the
    // one place a mistyped barcode gets corrected was the one place you had
    // to retype it by hand.
    renderPage();
    fireEvent.click((await screen.findAllByTitle('Edit this item'))[0]);

    expect(await screen.findByLabelText('Scan the item barcode with the camera')).toBeInTheDocument();
  });

  it('reloads the list after a pack changes, so the row catches up', async () => {
    createPurchaseUnit.mockResolvedValue({ purchase_unit: { id: 6, name: '100 ml tin', base_units: 100 } });
    const section = await openEditor();
    await within(section).findByTestId('pack-row-7');
    const before = fetchInventoryItems.mock.calls.length;

    openSharedPackBoxes();
    fireEvent.change(screen.getByLabelText('Pack name'), { target: { value: '100 ml tin' } });
    fireEvent.change(screen.getByLabelText('Amount in the pack'), { target: { value: '100' } });
    fireEvent.click(screen.getByText('Add pack'));

    await waitFor(() => expect(fetchInventoryItems.mock.calls.length).toBeGreaterThan(before));
  });
});

/*
 * Owner, 2026-09-09: "Add Inventory SKU, no add pack" — asked while working
 * out how to enter turmeric powder that comes in 100g and 500g.
 *
 * A pack row belongs to an item id, so nothing can be saved while the create
 * form is open. The packs are collected as drafts and written the instant
 * Create returns an id. Without that, somebody who cannot enter 100g and 500g
 * at the moment they are adding turmeric adds two items instead — and from
 * then on the stock is split, the recipe points at one of them, and the
 * per-gram comparison Cost & usage exists to make has nothing to compare.
 */
describe('Brands and packs for an item that does not exist yet', () => {
  const turmeric = {
    ...ghee, id: 31, name: 'Turmeric Powder', sku: 'TUR-1', unit: 'g',
    quantity_on_hand: 0, purchase_units: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    getBrandPhotos.mockResolvedValue({ item_id: 31, photos: [] });
    getPurchaseUnits.mockResolvedValue({ base_unit: 'g', purchase_units: [] });
    fetchInventoryItems.mockResolvedValue({
      data: [ghee],
      meta: { current_page: 1, last_page: 1, total: 1 },
    });
    createInventoryItem.mockResolvedValue({ item: turmeric });
    createPurchaseUnit.mockResolvedValue({ purchase_unit: { id: 1, name: 'x', base_units: 1 } });
    uploadBrandPhoto.mockResolvedValue({ photo: { id: 1, brand: 'x', url: null, note: null } });
  });

  async function openCreate(unit?: string) {
    renderPage();
    fireEvent.click(await screen.findByText('+ Add Item'));
    fireEvent.change(screen.getByLabelText('Name *'), { target: { value: 'Turmeric Powder' } });
    if (unit) fireEvent.change(screen.getByLabelText('New item unit'), { target: { value: unit } });
    return screen.getByTestId('new-item-pack-sizes');
  }

  /** Type a pack into the boxes under "Any brand" and add it. */
  async function addPack(name: string, qty: string, measuredIn?: string) {
    openSharedPackBoxes();
    fireEvent.change(screen.getByLabelText('Pack name'), { target: { value: name } });
    fireEvent.change(screen.getByLabelText('Amount in the pack'), { target: { value: qty } });
    if (measuredIn) {
      fireEvent.change(screen.getByLabelText('Measured in'), { target: { value: measuredIn } });
    }
    // The button reads "Saving…" while an add is in flight, and the boxes
    // are cleared when it lands — so wait for it both before and after.
    fireEvent.click(await screen.findByText('Add pack'));
    await screen.findByText('Add pack');
  }

  /** The draft rows on screen, in order. */
  const draftRows = () => screen.queryAllByTestId(/^pack-row-d/);

  it('is the same named section the editor has, not a thing you find later', async () => {
    const section = await openCreate();

    expect(within(section).getByText(/Brands and packs — whose you buy/)).toBeInTheDocument();
    expect(within(section).getByText(/No brands or packs yet/)).toBeInTheDocument();
    expect(within(section).getByText(/These save with the item/)).toBeInTheDocument();
  });

  it('holds the sizes as drafts, then writes them against the new item', async () => {
    await openCreate();
    await addPack('100g pack', '100');
    await addPack('500g pack', '500');

    expect(draftRows()[0]).toHaveTextContent('100g pack');
    expect(draftRows()[1]).toHaveTextContent('500g pack');
    // Nothing is saved while there is no item to save it against.
    expect(createPurchaseUnit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => expect(createPurchaseUnit).toHaveBeenCalledTimes(2));
    expect(createPurchaseUnit).toHaveBeenNthCalledWith(1, 31, { name: '100g pack', base_units: 100 });
    expect(createPurchaseUnit).toHaveBeenNthCalledWith(2, 31, { name: '500g pack', base_units: 500 });
  });

  /*
   * Owner, 2026-09-12: "Each brand should have its default packaging, price,
   * photo options … Edit and add new option should be same." A brand typed
   * here, with its tin and its price, reaches the item the moment it exists.
   */
  it('holds a brand with its pack and price, and writes the brand before the pack', async () => {
    await openCreate();

    fireEvent.change(screen.getByLabelText('Brand name'), { target: { value: 'Amul' } });
    fireEvent.click(screen.getByText('Add brand'));
    // The pack boxes open under the new brand.
    expect(await screen.findByText('Add a pack of Amul')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Pack name'), { target: { value: 'Tin' } });
    fireEvent.change(screen.getByLabelText('Pack default price'), { target: { value: '185' } });
    fireEvent.change(screen.getByLabelText('Amount in the pack'), { target: { value: '1000' } });
    fireEvent.click(screen.getByText('Add pack'));

    expect(within(screen.getByTestId('brand-group-amul')).getByText('Tin')).toBeInTheDocument();
    expect(uploadBrandPhoto).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => expect(createPurchaseUnit).toHaveBeenCalledWith(31, {
      name: 'Tin', base_units: 1000, brand: 'Amul', default_unit_cost: 185,
    }));
    expect(uploadBrandPhoto).toHaveBeenCalledWith(31, 'Amul', null);
    expect(uploadBrandPhoto.mock.invocationCallOrder[0]).toBeLessThan(createPurchaseUnit.mock.invocationCallOrder[0]);
  });

  it('multiplies a carton out against a pack already added', async () => {
    // "A case is 12 of the 500g packs" — a draft has no id for the server to
    // resolve against, so the arithmetic happens here.
    await openCreate();
    await addPack('500g pack', '500');
    await addPack('Carton', '12', 'd1');

    expect(draftRows()[1]).toHaveTextContent('6000');

    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => expect(createPurchaseUnit).toHaveBeenCalledTimes(2));
    expect(createPurchaseUnit).toHaveBeenNthCalledWith(2, 31, { name: 'Carton', base_units: 6000 });
  });

  it('carries a pack barcode through', async () => {
    await openCreate();
    openSharedPackBoxes();
    fireEvent.change(screen.getByLabelText('Pack barcode'), { target: { value: '8901234' } });
    await addPack('500g pack', '500');
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => expect(createPurchaseUnit).toHaveBeenCalledWith(
      31, { name: '500g pack', base_units: 500, barcode: '8901234' },
    ));
  });

  /*
   * Owner, 2026-09-07: "sometimes we buy 6 pcs packets. And sometimes 10 pcs
   * packets." Edit asks whether a reused name is a correction or a second
   * size; the drafts have to ask the same question, or the one form that can
   * enter both sizes at once is the one that silently picks an answer.
   */
  it('asks whether a reused name is a correction or a second size', async () => {
    await openCreate();
    await addPack('Packet', '6');
    await addPack('packet', '10');

    expect(await screen.findByTestId('pack-name-clash')).toHaveTextContent(/already holds 6/);
    // Neither answer has been taken yet.
    expect(draftRows()).toHaveLength(1);
  });

  it('keeps both sizes under a name the list has not used', async () => {
    await openCreate();
    await addPack('Packet', '6');
    await addPack('packet', '10');
    await screen.findByTestId('pack-name-clash');

    fireEvent.click(screen.getByTestId('pack-clash-keep-both'));

    await waitFor(() => expect(draftRows()).toHaveLength(2));
    expect(draftRows()[0]).toHaveTextContent('Packet');
    expect(draftRows()[1]).toHaveTextContent('packet 10');
    expect(screen.queryByTestId('pack-name-clash')).toBeNull();
  });

  it('resizes the pack already listed when it was a correction', async () => {
    await openCreate();
    await addPack('Packet', '6');
    await addPack('Packet', '10');
    await screen.findByTestId('pack-name-clash');

    fireEvent.click(screen.getByTestId('pack-clash-replace'));

    await waitFor(() => expect(draftRows()[0]).toHaveTextContent('10'));
    expect(draftRows()).toHaveLength(1);
  });

  it('does not ask when the name and the size both already match', async () => {
    await openCreate();
    await addPack('500g pack', '500');
    await addPack('500g pack', '500');

    await waitFor(() => expect(draftRows()).toHaveLength(1));
    expect(screen.queryByTestId('pack-name-clash')).toBeNull();
  });

  it('refuses a pack with no amount rather than storing a zero', async () => {
    await openCreate();
    openSharedPackBoxes();
    fireEvent.change(screen.getByLabelText('Pack name'), { target: { value: 'Carton' } });
    fireEvent.click(screen.getByText('Add pack'));

    expect(await screen.findByText('Say how much is in it.')).toBeInTheDocument();
    expect(draftRows()).toHaveLength(0);
  });

  it('takes a draft back off the list', async () => {
    await openCreate();
    await addPack('500g pack', '500');
    await waitFor(() => expect(draftRows()).toHaveLength(1));

    fireEvent.click(screen.getByLabelText('Remove 500g pack'));

    await waitFor(() => expect(draftRows()).toHaveLength(0));
    expect(screen.getByText(/No brands or packs yet/)).toBeInTheDocument();
  });

  /*
   * Owner, 2026-09-09: "i dont see the previoulsly added pack size."
   *
   * The boxes look like part of the form, so filling them and pressing the
   * form's own save button is the obvious move — and it used to throw the
   * pack away, with the item saved around it, leaving no trace but a pack
   * that was not there afterwards.
   */
  it('takes a pack still sitting in the boxes when Create is pressed', async () => {
    await openCreate();
    openSharedPackBoxes();
    fireEvent.change(screen.getByLabelText('Pack name'), { target: { value: '500g pack' } });
    fireEvent.change(screen.getByLabelText('Amount in the pack'), { target: { value: '500' } });
    // Deliberately not pressing "Add pack".
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => expect(createPurchaseUnit).toHaveBeenCalledWith(
      31, { name: '500g pack', base_units: 500 },
    ));
  });

  it('takes the half-typed pack as well as the ones already listed', async () => {
    await openCreate();
    await addPack('100g pack', '100');
    fireEvent.change(screen.getByLabelText('Pack name'), { target: { value: '500g pack' } });
    fireEvent.change(screen.getByLabelText('Amount in the pack'), { target: { value: '500' } });
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => expect(createPurchaseUnit).toHaveBeenCalledTimes(2));
    expect(createPurchaseUnit).toHaveBeenNthCalledWith(2, 31, { name: '500g pack', base_units: 500 });
  });

  it('takes a brand still sitting in its box when Create is pressed', async () => {
    await openCreate();
    fireEvent.change(screen.getByLabelText('Brand name'), { target: { value: 'Amul' } });
    // Deliberately not pressing "Add brand".
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => expect(uploadBrandPhoto).toHaveBeenCalledWith(31, 'Amul', null));
  });

  it('stops rather than creating the item when the leftover pack is unusable', async () => {
    await openCreate();
    openSharedPackBoxes();
    fireEvent.change(screen.getByLabelText('Pack name'), { target: { value: 'Carton' } });
    // No amount, so there is nothing to save it as.
    fireEvent.click(screen.getByText('Create'));

    expect(await screen.findByText('Say how much is in it.')).toBeInTheDocument();
    expect(await screen.findByText(/has not been added yet/)).toBeInTheDocument();
    expect(createInventoryItem).not.toHaveBeenCalled();
  });

  it('offers the camera for a pack barcode, the way Edit does', async () => {
    // Different sizes carry different EANs and the gun is how they get typed
    // correctly. Both forms draw the same editor now, so both have it.
    await openCreate();
    openSharedPackBoxes();

    expect(screen.getByLabelText('Scan the pack barcode')).toBeInTheDocument();
  });

  it('says which pack did not save, and opens the item so it can be added', async () => {
    // The item is already made by then, so losing the rest silently would be
    // the worst of both: an item with some of its sizes and no word of it.
    createPurchaseUnit
      .mockResolvedValueOnce({ purchase_unit: { id: 1, name: '100g pack', base_units: 100 } })
      .mockRejectedValueOnce(new Error('nope'));
    await openCreate();
    await addPack('100g pack', '100');
    await addPack('500g pack', '500');

    fireEvent.click(screen.getByText('Create'));

    expect(await screen.findByText(/500g pack did not save/)).toBeInTheDocument();
    expect(await screen.findByTestId('pack-sizes-section')).toBeInTheDocument();
    await waitFor(() => expect(getPurchaseUnits).toHaveBeenCalledWith(31));
  });
});
