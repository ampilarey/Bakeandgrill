import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SupplierIntelligencePage } from '../pages/SupplierIntelligencePage';

/*
 * Owner, 2026-09-08: "add supplier acc number option."
 *
 * Kept with the bank and the name on the account: the number alone does not
 * pay anybody here, since two banks issue account numbers and a shop's
 * account is often in the shopkeeper's own name.
 */

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }));
vi.mock('../hooks/usePermissions', () => ({
  useCurrentUserPermissions: () => ({ can: () => true, loading: false, user: null }),
}));

const bakery = {
  id: 3,
  name: 'The Royal Bakery',
  contact_name: 'Ahmed',
  phone: '7771234',
  email: null,
  address: null,
  payment_terms: null,
  bank_name: 'BML',
  bank_account_name: 'Ahmed Hassan',
  bank_account_number: '7730000123456',
  lead_days: null,
  notes: null,
  is_active: true,
};

const cashOnly = { ...bakery, id: 4, name: 'Corner shop', bank_name: null, bank_account_name: null, bank_account_number: null };

const fetchSuppliers = vi.fn();
const createSupplier = vi.fn();
const updateSupplier = vi.fn();

vi.mock('../api', () => ({
  fetchSuppliers: (...a: unknown[]) => fetchSuppliers(...a),
  createSupplier: (...a: unknown[]) => createSupplier(...a),
  updateSupplier: (...a: unknown[]) => updateSupplier(...a),
  deleteSupplier: vi.fn(),
  getSupplierPerformance: vi.fn().mockResolvedValue({ suppliers: [] }),
  getSupplierRatings: vi.fn().mockResolvedValue({ data: [] }),
  getSupplierPerformanceSingle: vi.fn().mockResolvedValue({ performance: null }),
  refreshSupplierCache: vi.fn(),
  rateSupplier: vi.fn(),
  getSupplierPriceHistory: vi.fn().mockResolvedValue({ data: [] }),
  comparePrices: vi.fn().mockResolvedValue({ suppliers: [] }),
  fetchInventoryItems: vi.fn().mockResolvedValue({ data: [] }),
}));

function open() {
  render(<MemoryRouter><SupplierIntelligencePage /></MemoryRouter>);
}

describe('Supplier bank account', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchSuppliers.mockResolvedValue({ data: [bakery, cashOnly] });
    createSupplier.mockResolvedValue({ supplier: bakery });
    updateSupplier.mockResolvedValue({ supplier: bakery });
  });

  it('shows the account on the list, with the bank under it', async () => {
    open();

    const cell = await screen.findByTestId('supplier-bank-3');
    expect(cell).toHaveTextContent('7730000123456');
    expect(cell).toHaveTextContent('BML · Ahmed Hassan');
  });

  /*
   * Adding the column first put the account cell where the email cell was
   * rather than beside it, so every column past Phone was reading one to the
   * left and the owner saw the account under "Email" (2026-09-08). Counting
   * the cells is what catches that; a testid on the new cell does not.
   */
  it('keeps every column under its own heading', async () => {
    open();
    await screen.findByTestId('supplier-bank-3');

    const table = screen.getAllByRole('table')[0];
    const headings = within(table).getAllByRole('columnheader').map((h) => h.textContent);
    expect(headings).toEqual(['Name', 'Contact', 'Phone', 'Email', 'Bank account', 'Status', 'Actions']);

    const row = screen.getByTestId('supplier-bank-3').closest('tr') as HTMLElement;
    const cells = within(row).getAllByRole('cell');
    expect(cells).toHaveLength(headings.length);

    // Read by position, the way the eye does.
    expect(cells[0]).toHaveTextContent('The Royal Bakery');
    expect(cells[2]).toHaveTextContent('7771234');
    expect(cells[3]).toHaveTextContent('—');
    expect(cells[4]).toHaveTextContent('7730000123456');
    expect(cells[5]).toHaveTextContent('Active');
  });

  it('still shows an email where there is one', async () => {
    fetchSuppliers.mockResolvedValue({ data: [{ ...bakery, email: 'orders@royal.mv' }] });
    open();

    // The column the account cell displaced when it was first added.
    expect(await screen.findByText('orders@royal.mv')).toBeInTheDocument();
  });

  it('leaves a cash-only supplier blank', async () => {
    open();

    const cell = await screen.findByTestId('supplier-bank-4');
    expect(cell).toHaveTextContent('—');
    expect(cell).not.toHaveTextContent('BML');
  });

  it('opens the editor on what is already on file', async () => {
    open();
    await screen.findByTestId('supplier-bank-3');

    fireEvent.click(screen.getAllByText('Edit')[0]);
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).getByLabelText('Bank')).toHaveValue('BML');
    expect(within(dialog).getByLabelText('Account name')).toHaveValue('Ahmed Hassan');
    expect(within(dialog).getByLabelText('Account number')).toHaveValue('7730000123456');
  });

  it('saves an account typed against a new supplier', async () => {
    open();
    await screen.findByTestId('supplier-bank-3');

    fireEvent.click(screen.getByText('+ Add Supplier'));
    const dialog = await screen.findByRole('dialog');

    fireEvent.change(within(dialog).getByLabelText('Bank'), { target: { value: 'MIB' } });
    fireEvent.change(within(dialog).getByLabelText('Account name'), { target: { value: 'Bazaaru Pvt Ltd' } });
    // Copied off a card, spaces and all.
    fireEvent.change(within(dialog).getByLabelText('Account number'), { target: { value: '9001 2345 6789' } });
    // The name field is the first text box in the dialog.
    fireEvent.change(within(dialog).getAllByRole('textbox')[0], { target: { value: 'Bazaaru' } });
    fireEvent.click(within(dialog).getByText('Save'));

    await waitFor(() => expect(createSupplier).toHaveBeenCalled());
    expect(createSupplier.mock.calls[0][0]).toMatchObject({
      name: 'Bazaaru',
      bank_name: 'MIB',
      bank_account_name: 'Bazaaru Pvt Ltd',
      bank_account_number: '9001 2345 6789',
    });
  });

  it('clears an account that has changed hands', async () => {
    open();
    await screen.findByTestId('supplier-bank-3');

    fireEvent.click(screen.getAllByText('Edit')[0]);
    const dialog = await screen.findByRole('dialog');

    fireEvent.change(within(dialog).getByLabelText('Account number'), { target: { value: '' } });
    fireEvent.change(within(dialog).getByLabelText('Bank'), { target: { value: '' } });
    fireEvent.click(within(dialog).getByText('Save'));

    await waitFor(() => expect(updateSupplier).toHaveBeenCalled());
    // Empty strings, not undefined: an omitted field would leave the old
    // account sitting there.
    expect(updateSupplier.mock.calls[0][1]).toMatchObject({ bank_account_number: '', bank_name: '' });
  });
});
