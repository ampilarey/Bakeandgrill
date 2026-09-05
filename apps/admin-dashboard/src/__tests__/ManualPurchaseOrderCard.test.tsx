import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PurchaseOrdersPage } from '../pages/PurchaseOrdersPage';

/*
 * The Create Manual Purchase Order card.
 *
 * Owner, 2026-09-05: "where is price unit ect". Both number boxes were
 * labelled only by placeholder text, which disappears the moment you type, so
 * a filled-in line was two unlabelled numbers. The unit was shown while
 * searching and then vanished, and nothing anywhere added the money up — you
 * could save a purchase order without ever seeing what it cost.
 */

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }));
vi.mock('../components/ScanSheet', () => ({ ScanSheet: () => null }));

const flour = {
  id: 7,
  name: 'Flour',
  unit: 'kg',
  cost_per_unit: 12.5,
  sku: 'FLOUR-1',
  quantity_on_hand: 0,
  reorder_level: null,
  category: null,
};

// The picker is exercised by its own tests; here it just hands back an item.
vi.mock('../components/ItemSearch', () => ({
  ItemSearch: ({ onChange }: { onChange: (v: unknown) => void }) => (
    <button type="button" onClick={() => onChange({ id: flour.id, label: flour.name, item: flour })}>
      pick-flour
    </button>
  ),
}));

const getPurchaseUnits = vi.fn();
const createPurchase = vi.fn();
vi.mock('../api', () => ({
  getPurchaseUnits: (...a: unknown[]) => getPurchaseUnits(...a),
  createPurchase: (...a: unknown[]) => createPurchase(...a),
  fetchPurchases: vi.fn().mockResolvedValue({ data: [], meta: { current_page: 1, last_page: 1, total: 0 } }),
  fetchSuppliers: vi.fn().mockResolvedValue({ data: [{ id: 1, name: 'Island Wholesale', is_active: true }] }),
  getPurchaseSuggestions: vi.fn().mockResolvedValue({ suggestions: [] }),
  createPurchaseFromSuggest: vi.fn(),
  approvePurchase: vi.fn(),
  rejectPurchase: vi.fn(),
  receivePurchase: vi.fn(),
  updatePurchase: vi.fn(),
  importPurchaseCsv: vi.fn(),
  uploadPurchaseReceipt: vi.fn(),
}));

async function openCard() {
  render(<MemoryRouter><PurchaseOrdersPage /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: /Manual PO/i }));
  return await screen.findByLabelText('Bought from');
}

describe('Create Manual Purchase Order card', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Most items are bought loose; the pack tests override this.
    getPurchaseUnits.mockResolvedValue({ base_unit: 'piece', purchase_units: [] });
    createPurchase.mockResolvedValue({ purchase: { id: 1 } });
  });

  it('labels both number boxes, so a filled-in line is still readable', async () => {
    await openCard();

    // Labels, not placeholders: still there after the boxes hold values.
    expect(screen.getByText(/^Quantity/)).toBeInTheDocument();
    expect(screen.getByText(/^Unit cost/)).toBeInTheDocument();
    expect(screen.getByLabelText('Quantity for item 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Unit cost for item 1')).toBeInTheDocument();
  });

  it('shows the item unit next to the quantity once an item is picked', async () => {
    await openCard();

    // Before picking there is no unit to name.
    expect(screen.getByText('Quantity')).toBeInTheDocument();

    fireEvent.click(screen.getByText('pick-flour'));

    // "4" now reads as 4 kg, and the cost box says what it is per.
    expect(await screen.findByText('Quantity (kg)')).toBeInTheDocument();
    expect(screen.getByText('Unit cost (MVR per kg)')).toBeInTheDocument();
  });

  it('totals the line as you type, and leaves it blank until it is a real line', async () => {
    await openCard();

    // No item yet: unknown, not free.
    expect(screen.getByTestId('manual-po-line-total-0')).toHaveTextContent('—');

    fireEvent.click(screen.getByText('pick-flour'));
    // Picking prefills the cost from the item, so this is 1 × 12.50.
    await waitFor(() => expect(screen.getByTestId('manual-po-line-total-0')).toHaveTextContent('MVR 12.50'));

    fireEvent.change(screen.getByLabelText('Quantity for item 1'), { target: { value: '4' } });
    await waitFor(() => expect(screen.getByTestId('manual-po-line-total-0')).toHaveTextContent('MVR 50.00'));

    fireEvent.change(screen.getByLabelText('Unit cost for item 1'), { target: { value: '10' } });
    await waitFor(() => expect(screen.getByTestId('manual-po-line-total-0')).toHaveTextContent('MVR 40.00'));
  });

  it('adds the lines up before you save, and says how many are not counted', async () => {
    await openCard();

    expect(screen.getByTestId('manual-po-order-total')).toHaveTextContent('MVR 0.00');
    expect(screen.getByText('1 line not counted yet')).toBeInTheDocument();

    fireEvent.click(screen.getByText('pick-flour'));
    fireEvent.change(screen.getByLabelText('Quantity for item 1'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Unit cost for item 1'), { target: { value: '10' } });

    await waitFor(() => expect(screen.getByTestId('manual-po-order-total')).toHaveTextContent('MVR 40.00'));
    expect(screen.queryByText(/not counted yet/)).not.toBeInTheDocument();

    // A second, empty line is excluded from the total and called out.
    fireEvent.click(screen.getByRole('button', { name: /Add line/i }));
    await waitFor(() => expect(screen.getByText('1 line not counted yet')).toBeInTheDocument());
    expect(screen.getByTestId('manual-po-order-total')).toHaveTextContent('MVR 40.00');
  });

  it('a half-typed number does not silently count as zero', async () => {
    await openCard();
    fireEvent.click(screen.getByText('pick-flour'));
    fireEvent.change(screen.getByLabelText('Quantity for item 1'), { target: { value: '' } });

    await waitFor(() => expect(screen.getByTestId('manual-po-line-total-0')).toHaveTextContent('—'));
    expect(screen.getByText('1 line not counted yet')).toBeInTheDocument();
  });

  it('still refuses to save without a seller', async () => {
    await openCard();
    fireEvent.click(screen.getByText('pick-flour'));
    fireEvent.click(screen.getByRole('button', { name: /Create PO/i }));

    expect(await screen.findByText('Say who you bought from.')).toBeInTheDocument();
  });

  it('offers the suppliers on file as suggestions for one seller field', async () => {
    const seller = await openCard();
    expect(seller).toHaveAttribute('list', 'manual-po-seller-options');

    const options = document.getElementById('manual-po-seller-options')!;
    expect(within(options as HTMLElement).getByRole('option', { hidden: true })).toHaveValue('Island Wholesale');
  });

  /*
   * Packs. Owner, 2026-09-05: "when i buy 1 egg case, its 7 tray, each tray 30
   * egg, so total 210 egg, automatically calculate unit price for each egg".
   */

  it('offers no pack picker for something bought loose', async () => {
    await openCard();
    fireEvent.click(screen.getByText('pick-flour'));

    await waitFor(() => expect(getPurchaseUnits).toHaveBeenCalledWith(flour.id));
    expect(screen.queryByLabelText('Pack for item 1')).not.toBeInTheDocument();
    expect(screen.getByText('Quantity (kg)')).toBeInTheDocument();
  });

  it('lets you buy by the case and works out the price of one egg', async () => {
    getPurchaseUnits.mockResolvedValue({
      base_unit: 'kg',
      purchase_units: [
        { id: 5, name: 'Tray', base_units: 30 },
        { id: 9, name: 'Case', base_units: 210 },
      ],
    });
    await openCard();
    fireEvent.click(screen.getByText('pick-flour'));

    const picker = await screen.findByLabelText('Pack for item 1');
    fireEvent.change(picker, { target: { value: '9' } });

    // The boxes now say what they mean in pack terms.
    expect(await screen.findByText('Quantity (case)')).toBeInTheDocument();
    expect(screen.getByText('Price per case (MVR)')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Quantity for item 1'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Unit cost for item 1'), { target: { value: '415' } });

    // 210 on the shelf, and 415 / 210 = 1.97619 per egg.
    const preview = await screen.findByTestId('manual-po-conversion-0');
    expect(preview).toHaveTextContent('210 kg');
    expect(preview).toHaveTextContent('MVR 1.9762');

    // The money is the pack arithmetic, untouched by the division.
    expect(screen.getByTestId('manual-po-line-total-0')).toHaveTextContent('MVR 415.00');
    expect(screen.getByTestId('manual-po-order-total')).toHaveTextContent('MVR 415.00');
  });

  it('sends the pack to the server rather than converting behind its back', async () => {
    getPurchaseUnits.mockResolvedValue({
      base_unit: 'kg',
      purchase_units: [{ id: 9, name: 'Case', base_units: 210 }],
    });
    await openCard();

    fireEvent.change(screen.getByLabelText('Bought from'), { target: { value: 'Fahi Store' } });
    fireEvent.click(screen.getByText('pick-flour'));
    fireEvent.change(await screen.findByLabelText('Pack for item 1'), { target: { value: '9' } });
    fireEvent.change(screen.getByLabelText('Quantity for item 1'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Unit cost for item 1'), { target: { value: '415' } });
    fireEvent.click(screen.getByRole('button', { name: /Create PO/i }));

    await waitFor(() => expect(createPurchase).toHaveBeenCalled());
    const payload = createPurchase.mock.calls[0][0] as { items: Record<string, unknown>[] };
    // Packs and the pack price, exactly as typed. One authority for the maths.
    expect(payload.items[0]).toMatchObject({ quantity: 2, unit_cost: 415, purchase_unit_id: 9 });
  });

  it('drops the chosen pack when the item changes', async () => {
    // A case of eggs applied to a sack of flour would multiply the wrong stock.
    getPurchaseUnits.mockResolvedValue({
      base_unit: 'kg',
      purchase_units: [{ id: 9, name: 'Case', base_units: 210 }],
    });
    await openCard();
    fireEvent.click(screen.getByText('pick-flour'));
    fireEvent.change(await screen.findByLabelText('Pack for item 1'), { target: { value: '9' } });
    await screen.findByText('Quantity (case)');

    getPurchaseUnits.mockResolvedValue({ base_unit: 'kg', purchase_units: [] });
    fireEvent.click(screen.getByText('pick-flour'));

    await waitFor(() => expect(screen.queryByLabelText('Pack for item 1')).not.toBeInTheDocument());
    expect(screen.getByText('Quantity (kg)')).toBeInTheDocument();
  });
});
