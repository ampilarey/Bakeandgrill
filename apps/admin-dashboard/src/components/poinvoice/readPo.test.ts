import { describe, expect, it } from 'vitest';
import { isoDate, linesOf, readPo, sumOf } from './readPo';

/*
 * Owner, 2026-11-15: "a place where I can upload PO and generate invoice".
 * The lines below are a resort's purchase order as pdf.js hands it over, with
 * the supplier's own details changed.
 */
const RESORT_PO = [
  'Sample Resorts Maldives Private Limited',
  'Purchase Order',
  'Project No.  Task No.  Order No.  HKUD-M30300000524  Page 1 of 1',
  'Order Date  14-Nov-2026',
  'Supplier:  A Supplier  210254 Ship To:  Sample Island Resort  M3030',
  'Address:  H. Somewhere  Address:  G. Building, Some Magu',
  'Male  K. Male',
  'Tel:  960 7000000  Tel:',
  "Supplier's E-Mail:  supplier@example.com  Buyer's Email: buyer@example.com",
  'Contact Person:  A Supplier  Buyer:  A Buyer',
  'Payment Term:  1 -31 Next 1 Mth Fix 15',
  'Tax ID:  BP00000000  Branch:  Payment Method: MEDIA CLEARING',
  'Line  Item  Description  Qty  Purchase  Delivery To  Unit Price  Amount',
  'UOM  (Excl. GST/VAT)',
  'Delivery Date: 20-Nov-2026',
  'Requester/Contact Person:  Someone, Else',
  '1  MASROSHI  200.00  Piece  HKUD-FB Administration  3.75  750.00',
  '2  BAJIYAA  200.00  Piece  HKUD-FB Administration  3.00  600.00',
  '3  SHORT EAT - H -GULHA  200.00  Piece  HKUD-FB Administration  2.50  500.00',
  '4  SHORT EAT - PATTIES  200.00  Piece  HKUD-FB Administration  2.50  500.00',
  '5  SHORT EAT - KEEMIYA  200.00  Piece  HKUD-FB Administration  3.75  750.00',
  'Note To Supplier :',
  'Currency  Taxable Amount  3,100.00',
  'MVR  GST/VAT  0.00',
  'Total Amount  3,100.00',
  'Please issue Tax Invoice/Receipt to :',
  'Sample Resorts Maldives Private Limited',
  'G. Building, Some Magu, K. Male, Maldives',
  'Tax ID: 1183895 Branch:',
  'Note  1. The Supplier has read, understood, and agrees to be bound by all terms and conditions outlined in the General Terms of',
  '2. Please attach the purchase order with invoice for delivery',
];

describe('reading a purchase order', () => {
  const po = readPo(RESORT_PO);

  it('finds the PO number and its dates', () => {
    expect(po.po_number).toBe('HKUD-M30300000524');
    expect(po.order_date).toBe('2026-11-14');
    expect(po.delivery_date).toBe('2026-11-20');
  });

  it('bills the company the PO says to bill, with its own TIN and not the supplier\'s', () => {
    expect(po.bill_to).toBe('Sample Resorts Maldives Private Limited');
    expect(po.bill_address).toBe('G. Building, Some Magu, K. Male, Maldives');
    expect(po.bill_tin).toBe('1183895');
    expect(po.bill_email).toBe('buyer@example.com');
  });

  it('knows where to deliver and the payment term', () => {
    expect(po.deliver_to).toBe('Sample Island Resort, G. Building, Some Magu');
    expect(po.payment_term).toBe('1 -31 Next 1 Mth Fix 15');
    expect(po.currency).toBe('MVR');
  });

  it('reads every row of goods and nothing else as a row', () => {
    expect(po.lines).toEqual([
      { description: 'MASROSHI', quantity: 200, unit: 'Piece', unit_price: 3.75, amount: 750 },
      { description: 'BAJIYAA', quantity: 200, unit: 'Piece', unit_price: 3, amount: 600 },
      { description: 'SHORT EAT - H -GULHA', quantity: 200, unit: 'Piece', unit_price: 2.5, amount: 500 },
      { description: 'SHORT EAT - PATTIES', quantity: 200, unit: 'Piece', unit_price: 2.5, amount: 500 },
      { description: 'SHORT EAT - KEEMIYA', quantity: 200, unit: 'Piece', unit_price: 3.75, amount: 750 },
    ]);
    expect(sumOf(po.lines)).toBe(3100);
  });

  it('takes the totals, and the taxable amount is not the tax', () => {
    expect(po.subtotal).toBe(3100);
    expect(po.tax).toBe(0);
    expect(po.total).toBe(3100);
    expect(po.missing).toEqual([]);
  });

  it('says what it could not find instead of guessing', () => {
    const empty = readPo(['Hello', 'Nothing useful here']);
    expect(empty.lines).toEqual([]);
    expect(empty.missing).toEqual(['the PO number', 'the items']);
  });

  it('reads a plainer PO too', () => {
    const plain = readPo([
      'ACME TRADING PVT LTD',
      'PURCHASE ORDER',
      'PO Number: PO-2291    Date: 03/12/2026',
      'Deliver to: Acme Warehouse, Hulhumale',
      'Chicken Momo (Small)   40   pkt   55.00   2,200.00',
      'Theluli Rihaakuru      12   btl   85.00   1,020.00',
      'Sub Total   3,220.00',
      'GST 8%   257.60',
      'Total   3,477.60',
    ]);
    expect(plain.po_number).toBe('PO-2291');
    expect(plain.order_date).toBe('2026-12-03');
    expect(plain.bill_to).toBe('ACME TRADING PVT LTD');
    expect(plain.deliver_to).toBe('Acme Warehouse, Hulhumale');
    expect(plain.lines.map((l) => [l.description, l.quantity, l.unit, l.unit_price])).toEqual([
      ['Chicken Momo (Small)', 40, 'pkt', 55],
      ['Theluli Rihaakuru', 12, 'btl', 85],
    ]);
    expect(plain.subtotal).toBe(3220);
    expect(plain.tax).toBe(257.6);
    expect(plain.total).toBe(3477.6);
  });
});

describe('dates on a PO', () => {
  it('reads the ways a date is written', () => {
    expect(isoDate('14-Nov-2026')).toBe('2026-11-14');
    expect(isoDate('3 December 2026')).toBe('2026-12-03');
    expect(isoDate('03/12/2026')).toBe('2026-12-03');
    expect(isoDate('2026-11-20')).toBe('2026-11-20');
    expect(isoDate('soon')).toBe('');
  });
});

describe('words back into lines', () => {
  it('keeps a row together and its columns apart', () => {
    const w = (str: string, x: number, y: number, width: number) => ({ str, x, y, width, height: 8 });
    expect(linesOf([
      w('Amount', 500, 700, 30), w('Description', 100, 700, 50),
      w('750.00', 500, 680.4, 28), w('MASROSHI', 100, 680, 45), w('1', 40, 680, 4),
    ])).toEqual(['Description  Amount', '1  MASROSHI  750.00']);
  });
});
