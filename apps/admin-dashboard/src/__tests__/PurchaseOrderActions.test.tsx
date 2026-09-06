import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PurchaseOrdersPage } from '../pages/PurchaseOrdersPage';

/*
 * Editing, cancelling and deleting a purchase order.
 *
 * Owner, 2026-09-06: "how to cancel/delete or edit the po, admin must be able
 * to do that." Cancelling was here under the name "Reject", nothing edited a
 * line, and nothing deleted anything at all.
 *
 * Which of the three a given order allows is the server's answer, never a
 * guess from the status: an approved order with one crate already in cannot
 * be edited, and only its lines know that.
 */

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }));
vi.mock('../hooks/usePermissions', () => ({
  useCurrentUserPermissions: () => ({ can: () => true, loading: false, user: null }),
}));
vi.mock('../components/ScanSheet', () => ({ ScanSheet: () => null }));
vi.mock('../components/ItemSearch', () => ({ ItemSearch: () => null }));

/*
 * Phone or desk. Owner, 2026-09-06: "still i dont see po Del/edit option" —
 * the buttons were rendering all along, in the eighth column of a table 802px
 * wide inside a 356px scroller, starting 725px past the right edge with
 * nothing to suggest the table scrolled at all.
 */
let mobile = false;
vi.mock('../hooks/useIsMobile', () => ({ useIsMobile: () => mobile }));

const line = {
  id: 55,
  quantity: 10,
  received_quantity: 0,
  receive_status: 'pending',
  unit_cost: 5,
  pack_name: null,
  pack_size: null,
  pack_quantity: null,
  brand: null,
  inventory_item_id: 7,
  inventory_item: { id: 7, name: 'Rice' },
};

const draft = {
  id: 1,
  purchase_number: 'PO-0001',
  supplier_id: 1,
  supplier: { id: 1, name: 'Fahi Store' },
  status: 'draft',
  total: 50,
  subtotal: 50,
  purchase_date: '2026-09-06',
  created_at: '2026-09-06T00:00:00Z',
  items: [line],
  can_edit: true,
  can_cancel: true,
  can_delete: true,
  can_undo_receipt: false,
  edit_blocked_reason: null,
  cancel_blocked_reason: null,
  delete_blocked_reason: null,
  undo_receipt_blocked_reason: 'Nothing has been received against this order, so there is nothing to undo.',
};

const received = {
  ...draft,
  id: 2,
  purchase_number: 'PO-0002',
  status: 'received',
  items: [{ ...line, id: 66, received_quantity: 10, receive_status: 'complete' }],
  can_edit: false,
  can_cancel: false,
  can_delete: false,
  // A received order is not a dead end any more: the delivery can be undone,
  // and then all three come back.
  can_undo_receipt: true,
  edit_blocked_reason: 'This order has been received. Its stock and prices are already recorded, so the lines cannot be changed — undo the receipt first if the delivery was wrong.',
  cancel_blocked_reason: 'This order has been received in full. Cancelling it would not put the stock back — undo the receipt first, which does.',
  delete_blocked_reason: 'Stock arrived against this order, so it is part of the record and cannot be deleted. Undo the receipt first if it never really arrived.',
  undo_receipt_blocked_reason: null,
};

const fetchPurchases = vi.fn();
const cancelPurchase = vi.fn();
const deletePurchase = vi.fn();
const updatePurchaseLines = vi.fn();
const undoPurchaseReceipt = vi.fn();

vi.mock('../api', () => ({
  fetchPurchases: (...a: unknown[]) => fetchPurchases(...a),
  cancelPurchase: (...a: unknown[]) => cancelPurchase(...a),
  deletePurchase: (...a: unknown[]) => deletePurchase(...a),
  updatePurchaseLines: (...a: unknown[]) => updatePurchaseLines(...a),
  undoPurchaseReceipt: (...a: unknown[]) => undoPurchaseReceipt(...a),
  fetchSuppliers: vi.fn().mockResolvedValue({ data: [] }),
  getPurchaseSuggestions: vi.fn().mockResolvedValue({ suggestions: [] }),
  createPurchaseFromSuggest: vi.fn(),
  createPurchase: vi.fn(),
  approvePurchase: vi.fn(),
  receivePurchase: vi.fn(),
  updatePurchase: vi.fn(),
  importPurchaseCsv: vi.fn(),
  uploadPurchaseReceipt: vi.fn(),
  getPurchaseUnits: vi.fn().mockResolvedValue({ base_unit: 'kg', purchase_units: [] }),
  createPurchaseUnit: vi.fn(),
  createInventoryItem: vi.fn(),
}));

function renderPage() {
  render(<MemoryRouter><PurchaseOrdersPage /></MemoryRouter>);
}

/**
 * The "Undo delivery" inside the confirm dialog, as opposed to the one on the
 * row that opened it — they share a name on purpose, so the button you press
 * is the thing you were promised.
 */
function confirmUndoButton() {
  return [...document.querySelectorAll('button')]
    .find((b) => b.textContent?.trim() === 'Undo delivery' && b.closest('[role="dialog"]'));
}

async function rowFor(number: string) {
  const cell = await screen.findByText(number);
  return cell.closest('tr') as HTMLElement;
}

describe('Purchase order actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mobile = false;
    fetchPurchases.mockResolvedValue({
      purchases: { data: [draft, received], current_page: 1, last_page: 1, total: 2 },
    });
    updatePurchaseLines.mockResolvedValue({ purchase: draft });
    cancelPurchase.mockResolvedValue({ purchase: { ...draft, status: 'cancelled' } });
    deletePurchase.mockResolvedValue({ message: 'Purchase order deleted.' });
    undoPurchaseReceipt.mockResolvedValue({ purchase: { ...received, status: 'ordered' }, warnings: [] });
  });

  it('offers all three on an order nothing has arrived against', async () => {
    renderPage();
    const row = await rowFor('PO-0001');

    expect(within(row).getByText('Edit')).toBeInTheDocument();
    expect(within(row).getByText('Cancel')).toBeInTheDocument();
    expect(within(row).getByText('Delete')).toBeInTheDocument();
  });

  it('offers a way out on a received order rather than a dead end', async () => {
    /*
     * The stock and the price history are already recorded, so the lines
     * cannot be rewritten underneath them — but "Received — locked" and
     * nothing else was every order this business has. Undoing the delivery
     * reverses it properly, and then the other three come back.
     */
    renderPage();
    const row = await rowFor('PO-0002');

    expect(within(row).queryByText('Edit')).toBeNull();
    expect(within(row).queryByText('Cancel')).toBeNull();
    expect(within(row).queryByText('Delete')).toBeNull();
    expect(within(row).queryByText('Received — locked')).toBeNull();
    expect(within(row).getByText('Undo delivery')).toBeInTheDocument();
  });

  it('will not undo a delivery without a reason', async () => {
    renderPage();
    fireEvent.click(within(await rowFor('PO-0002')).getByText('Undo delivery'));
    await screen.findByLabelText('Reason for undoing the delivery');

    expect(confirmUndoButton()).toBeDisabled();
  });

  it('sends the reason and reverses the delivery', async () => {
    renderPage();
    fireEvent.click(within(await rowFor('PO-0002')).getByText('Undo delivery'));

    fireEvent.change(await screen.findByLabelText('Reason for undoing the delivery'), {
      target: { value: 'Counted into the wrong PO' },
    });
    fireEvent.click(confirmUndoButton()!);

    await waitFor(() => expect(undoPurchaseReceipt).toHaveBeenCalledWith(2, 'Counted into the wrong PO'));
  });

  it('says plainly what the undo will do before it does it', async () => {
    renderPage();
    fireEvent.click(within(await rowFor('PO-0002')).getByText('Undo delivery'));

    expect(await screen.findByText(/stock comes off the shelf/i)).toBeInTheDocument();
    expect(screen.getByText(/Nothing is erased/i)).toBeInTheDocument();
  });

  it('holds anything it could not put right on screen', async () => {
    // A stock count to do, or GST already filed — too important for a toast.
    undoPurchaseReceipt.mockResolvedValue({
      purchase: { ...received, status: 'ordered' },
      warnings: ['Rice goes to -6 kg: some of this delivery has already been used. Do a stock count.'],
    });
    renderPage();
    fireEvent.click(within(await rowFor('PO-0002')).getByText('Undo delivery'));
    fireEvent.change(await screen.findByLabelText('Reason for undoing the delivery'), {
      target: { value: 'Wrong order' },
    });
    fireEvent.click(confirmUndoButton()!);

    expect(await screen.findByText(/Do a stock count/)).toBeInTheDocument();
  });

  it('sends the edited quantity and price back as the order', async () => {
    renderPage();
    fireEvent.click(within(await rowFor('PO-0001')).getByText('Edit'));

    fireEvent.change(await screen.findByLabelText('Quantity for Rice'), { target: { value: '25' } });
    fireEvent.change(screen.getByLabelText('Unit cost for Rice'), { target: { value: '6.5' } });
    fireEvent.click(screen.getByText('Save changes'));

    await waitFor(() => expect(updatePurchaseLines).toHaveBeenCalledWith(1, [
      { inventory_item_id: 7, quantity: 25, unit_cost: 6.5 },
    ]));
  });

  it('drops a line the admin removed', async () => {
    renderPage();
    fireEvent.click(within(await rowFor('PO-0001')).getByText('Edit'));
    fireEvent.click(await screen.findByText('Remove'));
    fireEvent.click(screen.getByText('Save changes'));

    // An empty order is refused rather than sent: cancel it instead.
    await waitFor(() => expect(screen.getByText(/at least one line/i)).toBeInTheDocument());
    expect(updatePurchaseLines).not.toHaveBeenCalled();
  });

  it('edits a packed line by the pack, the way it was entered', async () => {
    // Showing 420 eggs where somebody typed "2 cases" would invite them to
    // retype it wrong.
    fetchPurchases.mockResolvedValue({
      purchases: {
        data: [{
          ...draft,
          items: [{
            ...line, quantity: 420, unit_cost: 1.97619,
            pack_name: 'Case', pack_size: 210, pack_quantity: 2,
            inventory_item: { id: 7, name: 'Egg' },
          }],
        }],
        current_page: 1, last_page: 1, total: 1,
      },
    });
    renderPage();
    fireEvent.click(within(await rowFor('PO-0001')).getByText('Edit'));

    expect(await screen.findByLabelText('Quantity for Egg')).toHaveValue(2);
    // 1.97619 × 210 is the MVR 415 somebody actually paid for the case.
    expect(Number((screen.getByLabelText('Unit cost for Egg') as HTMLInputElement).value))
      .toBeCloseTo(415, 2);
  });

  it('asks for a reason before cancelling', async () => {
    renderPage();
    fireEvent.click(within(await rowFor('PO-0001')).getByText('Cancel'));

    const confirm = await screen.findByText('Cancel Order');
    expect(confirm.closest('button')).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText(/Supplier out of stock/i), {
      target: { value: 'Ordered twice' },
    });
    fireEvent.click(confirm);

    await waitFor(() => expect(cancelPurchase).toHaveBeenCalledWith(1, 'Ordered twice'));
  });

  it('says cancelling leaves whatever already arrived alone', async () => {
    renderPage();
    fireEvent.click(within(await rowFor('PO-0001')).getByText('Cancel'));

    expect(await screen.findByText(/stays received/i)).toBeInTheDocument();
  });

  it('confirms a delete, and is honest that the record is kept', async () => {
    renderPage();
    fireEvent.click(within(await rowFor('PO-0001')).getByText('Delete'));

    expect(await screen.findByText(/hidden,\s*not shredded/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText('Delete order'));
    await waitFor(() => expect(deletePurchase).toHaveBeenCalledWith(1));
  });

  it('does not delete when the confirm is dismissed', async () => {
    renderPage();
    fireEvent.click(within(await rowFor('PO-0001')).getByText('Delete'));
    fireEvent.click(await screen.findByText('Keep it'));

    expect(deletePurchase).not.toHaveBeenCalled();
  });

  describe('on a phone', () => {
    beforeEach(() => { mobile = true; });

    it('drops the table so the actions are on screen, not four columns to the right', async () => {
      renderPage();
      await screen.findByText('PO-0001');

      // No table at all — the eight columns are the whole problem.
      expect(document.querySelector('table')).toBeNull();
      expect(screen.getByText('Edit')).toBeInTheDocument();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
      expect(screen.getByText('Delete')).toBeInTheDocument();
    });

    it('still says what an order is, not only what can be done to it', async () => {
      renderPage();

      expect(await screen.findByText('PO-0001')).toBeInTheDocument();
      expect(screen.getAllByText(/Fahi Store/).length).toBeGreaterThan(0);
      expect(screen.getAllByText('MVR 50.00').length).toBeGreaterThan(0);
    });

    it('offers the same way out of a received order here too', async () => {
      renderPage();
      await screen.findByText('PO-0002');

      expect(screen.getByText('Undo delivery')).toBeInTheDocument();
    });

    it('deletes from the card', async () => {
      renderPage();
      await screen.findByText('PO-0001');
      fireEvent.click(screen.getByText('Delete'));
      fireEvent.click(await screen.findByText('Delete order'));

      await waitFor(() => expect(deletePurchase).toHaveBeenCalledWith(1));
    });
  });
});
