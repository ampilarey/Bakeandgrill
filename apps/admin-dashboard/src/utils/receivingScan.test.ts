import { describe, expect, it } from 'vitest';
import { countScannedItem, matchPurchaseItemByCode } from './receivingScan';

const items = [
  { id: 1, quantity: 10, received_quantity: 4, inventory_item: { id: 11, name: 'Flour 25kg', barcode: '8801234567890', sku: 'FLR-25' } },
  { id: 2, quantity: 2, received_quantity: 2, inventory_item: { id: 12, name: 'Butter', barcode: null, sku: 'BTR-1' } },
  { id: 3, quantity: 1, received_quantity: 0, inventory_item: null },
];

describe('matchPurchaseItemByCode', () => {
  it('matches the stored barcode first, then the SKU, and nothing else', () => {
    expect(matchPurchaseItemByCode(items, '8801234567890')?.item.id).toBe(1);
    expect(matchPurchaseItemByCode(items, ' flr-25 ')?.item.id).toBe(1);
    expect(matchPurchaseItemByCode(items, 'BTR-1')?.item.id).toBe(2);
    expect(matchPurchaseItemByCode(items, '')).toBeNull();
    expect(matchPurchaseItemByCode(items, '999')).toBeNull();
  });
});

describe('countScannedItem', () => {
  it('counts one more of the scanned line, up to what is still due', () => {
    const first = countScannedItem(items, {}, '8801234567890');
    expect(first.qtys).toEqual({ 1: 1 });
    expect(first.message).toBe('Flour 25kg: 1 of 6 received.');

    const capped = countScannedItem(items, { 1: 6 }, '8801234567890');
    expect(capped.qtys).toEqual({ 1: 6 });
    expect(capped.message).toContain('already at 6');

    const done = countScannedItem(items, {}, 'BTR-1');
    expect(done.qtys).toEqual({});
    expect(done.message).toContain('already at 0');
  });

  it('says so when nothing matches', () => {
    const r = countScannedItem(items, { 1: 2 }, 'nope');
    expect(r.matched).toBeNull();
    expect(r.qtys).toEqual({ 1: 2 });
    expect(r.message).toContain('"nope"');
  });
});


describe('pack barcodes', () => {
  /*
   * The 100 ml and 500 ml tins carry different EANs. A pack scan counts the
   * whole tin in base units, so ten scans of a 500 ml tin receives 5000 ml —
   * not ten lonely millilitres.
   */
  const ghee = {
    id: 7,
    quantity: 1000,
    received_quantity: 0,
    inventory_item: {
      id: 3, name: 'Ghee', barcode: '4444', sku: 'GHEE-1',
      purchase_units: [
        { id: 11, name: '100 ml tin', base_units: 100, barcode: '1001' },
        { id: 12, name: '500 ml tin', base_units: 500, barcode: '5005' },
      ],
    },
  };

  it('resolves a pack code to the line and the pack', () => {
    const m = matchPurchaseItemByCode([ghee], '5005');
    expect(m?.item.id).toBe(7);
    expect(m?.pack?.name).toBe('500 ml tin');
  });

  it('counts a whole tin per scan', () => {
    const first = countScannedItem([ghee], {}, '5005');
    expect(first.qtys[7]).toBe(500);
    expect(first.message).toContain('1 × 500 ml tin');

    const second = countScannedItem([ghee], first.qtys, '1001');
    expect(second.qtys[7]).toBe(600);
  });

  it('tops up to what is due instead of overshooting', () => {
    // 1000 ml due, 800 already counted: the next 500 ml tin lands at 1000.
    const res = countScannedItem([ghee], { 7: 800 }, '5005');
    expect(res.qtys[7]).toBe(1000);
  });

  it('still counts one base unit on the item code', () => {
    const res = countScannedItem([ghee], {}, '4444');
    expect(res.qtys[7]).toBe(1);
  });
});
