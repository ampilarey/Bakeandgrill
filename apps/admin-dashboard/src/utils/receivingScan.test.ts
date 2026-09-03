import { describe, expect, it } from 'vitest';
import { countScannedItem, matchPurchaseItemByCode } from './receivingScan';

const items = [
  { id: 1, quantity: 10, received_quantity: 4, inventory_item: { id: 11, name: 'Flour 25kg', barcode: '8801234567890', sku: 'FLR-25' } },
  { id: 2, quantity: 2, received_quantity: 2, inventory_item: { id: 12, name: 'Butter', barcode: null, sku: 'BTR-1' } },
  { id: 3, quantity: 1, received_quantity: 0, inventory_item: null },
];

describe('matchPurchaseItemByCode', () => {
  it('matches the stored barcode first, then the SKU, and nothing else', () => {
    expect(matchPurchaseItemByCode(items, '8801234567890')?.id).toBe(1);
    expect(matchPurchaseItemByCode(items, ' flr-25 ')?.id).toBe(1);
    expect(matchPurchaseItemByCode(items, 'BTR-1')?.id).toBe(2);
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
