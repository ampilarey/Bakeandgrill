import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PoInvoiceModal } from './PoInvoiceModal';

/*
 * Owner, 2026-11-15: "a place where I can upload PO and generate invoice".
 * Pick the PO, check what was read, create: the invoice carries the PO's
 * number, delivery and file.
 */

const api = vi.hoisted(() => ({
  checkInvoicePo: vi.fn(),
  createInvoice: vi.fn(),
  generateInvoicePdf: vi.fn(),
  uploadInvoicePoFile: vi.fn(),
}));
vi.mock('../../api/finance', () => api);

const pdf = vi.hoisted(() => ({ pdfLines: vi.fn() }));
vi.mock('./pdfText', () => pdf);

const ocr = vi.hoisted(() => ({ ocrLines: vi.fn() }));
vi.mock('./ocrText', () => ocr);

const LINES = [
  'Sample Resorts Maldives Private Limited',
  'Purchase Order',
  'Order No.  HKUD-M30300000524  Page 1 of 1',
  'Supplier:  A Supplier  Ship To:  Sample Island Resort',
  'Delivery Date: 20-Nov-2026',
  '1  MASROSHI  200.00  Piece  HKUD-FB Administration  3.75  750.00',
  '2  BAJIYAA  200.00  Piece  HKUD-FB Administration  3.00  600.00',
  'Currency  Taxable Amount  1,350.00',
  'MVR  GST/VAT  0.00',
  'Total Amount  1,350.00',
  'Please issue Tax Invoice/Receipt to :',
  'Sample Resorts Maldives Private Limited',
  'G. Building, Some Magu, K. Male, Maldives',
  'Tax ID: 1183895 Branch:',
];

const poFile = () => new File(['%PDF-1.4'], 'PO_M30300000524.pdf', { type: 'application/pdf' });

async function pickFile(file: File) {
  fireEvent.change(screen.getByTestId('po-file'), { target: { files: [file] } });
}

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  pdf.pdfLines.mockReset();
  ocr.ocrLines.mockReset();
  // A file nothing can be made of, unless a test says otherwise.
  ocr.ocrLines.mockResolvedValue([]);
  api.checkInvoicePo.mockResolvedValue({ invoices: [] });
  api.uploadInvoicePoFile.mockResolvedValue({ path: 'invoice-pos/2026/11/abc.pdf' });
  api.createInvoice.mockResolvedValue({ invoice: { id: 9, invoice_number: 'INV-0009', total: 1350, po_number: 'HKUD-M30300000524', items: [] } });
});

describe('an invoice from a PO', () => {
  it('fills the boxes from the PO and says the totals match', async () => {
    pdf.pdfLines.mockResolvedValue(LINES);
    render(<PoInvoiceModal onClose={() => {}} onCreated={() => {}} />);

    // Nothing to create until a PO is chosen.
    expect(screen.getByTestId('po-create')).toBeDisabled();

    await pickFile(poFile());

    await waitFor(() => expect(screen.getByTestId('po-read')).toBeInTheDocument());
    expect(screen.getByTestId('po-number')).toHaveValue('HKUD-M30300000524');
    expect(screen.getByTestId('po-bill-to')).toHaveValue('Sample Resorts Maldives Private Limited');
    expect(screen.getByTestId('po-tin')).toHaveValue('1183895');
    expect(screen.getAllByTestId('po-item')).toHaveLength(2);
    expect(screen.getByLabelText('Item 1 name')).toHaveValue('MASROSHI');
    expect(screen.getByLabelText('Item 1 price')).toHaveValue(3.75);
    expect(screen.getByTestId('po-totals')).toHaveTextContent('Total MVR 1,350.00');
    expect(screen.getByTestId('po-match')).toHaveTextContent('Matches the PO’s total.');
  });

  it('keeps the file and makes the invoice with the PO on it', async () => {
    pdf.pdfLines.mockResolvedValue(LINES);
    const onCreated = vi.fn();
    render(<PoInvoiceModal onClose={() => {}} onCreated={onCreated} />);
    await pickFile(poFile());
    await waitFor(() => expect(screen.getByTestId('po-read')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('po-create'));

    await waitFor(() => expect(screen.getByTestId('po-done')).toHaveTextContent('INV-0009'));
    expect(api.uploadInvoicePoFile).toHaveBeenCalledTimes(1);
    expect(api.createInvoice).toHaveBeenCalledWith(expect.objectContaining({
      type: 'sale',
      recipient_name: 'Sample Resorts Maldives Private Limited',
      customer_tin: '1183895',
      po_number: 'HKUD-M30300000524',
      po_file: 'invoice-pos/2026/11/abc.pdf',
      deliver_to: 'Sample Island Resort',
      delivery_date: '2026-11-20',
      tax_rate_bp: 0,
      items: [
        { description: 'MASROSHI', quantity: 200, unit_price: 3.75, unit: 'Piece' },
        { description: 'BAJIYAA', quantity: 200, unit_price: 3, unit: 'Piece' },
      ],
    }));
    expect(onCreated).toHaveBeenCalledTimes(1);
  });

  it('says when the changed items no longer add up to the PO', async () => {
    pdf.pdfLines.mockResolvedValue(LINES);
    render(<PoInvoiceModal onClose={() => {}} onCreated={() => {}} />);
    await pickFile(poFile());
    await waitFor(() => expect(screen.getByTestId('po-read')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Item 1 quantity'), { target: { value: '100' } });

    expect(screen.getByTestId('po-match')).toHaveTextContent('The PO says MVR 1,350.00');
  });

  it('names an invoice already made for this PO', async () => {
    pdf.pdfLines.mockResolvedValue(LINES);
    api.checkInvoicePo.mockResolvedValue({ invoices: [{ id: 4, invoice_number: 'INV-0004', issue_date: '2026-11-15', total: 1350, status: 'draft' }] });
    render(<PoInvoiceModal onClose={() => {}} onCreated={() => {}} />);
    await pickFile(poFile());

    await waitFor(() => expect(screen.getByTestId('po-before')).toHaveTextContent('INV-0004'));
  });

  it('leaves the boxes for typing when the file cannot be read, and still keeps it', async () => {
    render(<PoInvoiceModal onClose={() => {}} onCreated={() => {}} />);
    await pickFile(new File(['x'], 'po-photo.jpg', { type: 'image/jpeg' }));

    await waitFor(() => expect(screen.getByTestId('po-unreadable')).toBeInTheDocument());
    expect(pdf.pdfLines).not.toHaveBeenCalled();

    fireEvent.change(screen.getByTestId('po-bill-to'), { target: { value: 'A Resort' } });
    fireEvent.change(screen.getByLabelText('Item 1 name'), { target: { value: 'Bajiya' } });
    fireEvent.change(screen.getByLabelText('Item 1 price'), { target: { value: '3' } });
    fireEvent.click(screen.getByTestId('po-create'));

    await waitFor(() => expect(api.createInvoice).toHaveBeenCalled());
    expect(api.uploadInvoicePoFile).toHaveBeenCalledTimes(1);
  });

  /* Owner, 2026-11-15: "what if I get a scanned PO" → "yes add it". */
  it('reads a photo of a PO from the picture, and says a scan can be misread', async () => {
    ocr.ocrLines.mockResolvedValue(LINES);
    render(<PoInvoiceModal onClose={() => {}} onCreated={() => {}} />);
    await pickFile(new File(['x'], 'po-photo.jpg', { type: 'image/jpeg' }));

    await waitFor(() => expect(screen.getByTestId('po-scanned')).toHaveTextContent('Read from a scan'));
    expect(pdf.pdfLines).not.toHaveBeenCalled();
    expect(screen.queryByTestId('po-read')).toBeNull();
    expect(screen.getByTestId('po-number')).toHaveValue('HKUD-M30300000524');
    expect(screen.getAllByTestId('po-item')).toHaveLength(2);
    expect(screen.getByTestId('po-match')).toHaveTextContent('Matches the PO’s total.');
  });

  it('reads a scanned PDF from its picture when the PDF holds no text', async () => {
    pdf.pdfLines.mockResolvedValue([]);
    ocr.ocrLines.mockResolvedValue(LINES);
    render(<PoInvoiceModal onClose={() => {}} onCreated={() => {}} />);
    await pickFile(poFile());

    await waitFor(() => expect(screen.getByTestId('po-scanned')).toBeInTheDocument());
    expect(ocr.ocrLines).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Item 2 name')).toHaveValue('BAJIYAA');
  });

  it('never reads a computer-made PDF as a scan', async () => {
    pdf.pdfLines.mockResolvedValue(LINES);
    render(<PoInvoiceModal onClose={() => {}} onCreated={() => {}} />);
    await pickFile(poFile());

    await waitFor(() => expect(screen.getByTestId('po-read')).toBeInTheDocument());
    expect(ocr.ocrLines).not.toHaveBeenCalled();
    expect(screen.queryByTestId('po-scanned')).toBeNull();
  });

  it('refuses a tax invoice without the customer’s TIN', async () => {
    render(<PoInvoiceModal onClose={() => {}} onCreated={() => {}} />);
    await pickFile(new File(['x'], 'po-photo.jpg', { type: 'image/jpeg' }));
    await waitFor(() => expect(screen.getByTestId('po-unreadable')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('po-bill-to'), { target: { value: 'A Resort' } });
    fireEvent.change(screen.getByLabelText('Item 1 name'), { target: { value: 'Bajiya' } });
    fireEvent.change(screen.getByLabelText('Item 1 price'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('switch', { name: 'Tax invoice' }));
    fireEvent.click(screen.getByTestId('po-create'));

    expect(await screen.findByText('A tax invoice needs the customer’s TIN.')).toBeInTheDocument();
    expect(api.createInvoice).not.toHaveBeenCalled();
  });
});
