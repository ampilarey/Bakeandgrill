import { describe, expect, it } from 'vitest';
import { countScanIntoQtys } from './stockCountScan';

/*
 * Counting the shelf with a camera: an item code adds one, a pack code adds
 * the whole pack, and there is no ceiling — the count IS the truth being
 * established.
 */
const items = [
  {
    id: 3, name: 'Ghee', unit: 'ml', barcode: '4444', sku: 'GHEE-1',
    purchase_units: [
      { id: 11, name: '100 ml tin', base_units: 100, barcode: '1001' },
      { id: 12, name: '500 ml tin', base_units: 500, barcode: '5005' },
    ],
  },
  { id: 4, name: 'Rice', unit: 'kg', barcode: null, sku: 'RICE-1', purchase_units: [] },
];

describe('countScanIntoQtys', () => {
  it('adds a whole tin per pack scan', () => {
    const first = countScanIntoQtys(items, {}, '5005');
    expect(first.qtys[3]).toBe('500');
    expect(first.message).toContain('1 × 500 ml tin');

    const second = countScanIntoQtys(items, first.qtys, '1001');
    expect(second.qtys[3]).toBe('600');
  });

  it('adds one on the item code, on top of a typed value', () => {
    // Somebody typed 2.5 kg of loose rice, then scanned a labelled bag.
    const res = countScanIntoQtys(items, { 4: '2.5' }, 'RICE-1');
    expect(res.qtys[4]).toBe('3.5');
  });

  it('says when nothing answers to the code', () => {
    const res = countScanIntoQtys(items, {}, '999');
    expect(res.matchedId).toBeNull();
    expect(res.message).toContain('999');
  });

  it('has no ceiling — a count can exceed what the system thought', () => {
    const res = countScanIntoQtys(items, { 3: '10000' }, '5005');
    expect(res.qtys[3]).toBe('10500');
  });
});
