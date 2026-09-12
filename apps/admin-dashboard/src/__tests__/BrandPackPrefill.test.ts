import { describe, it, expect } from 'vitest';
import { packsForBrand } from '../pages/PurchaseOrdersPage';
import type { InventoryPurchaseUnit } from '../api/operations';

/*
 * Owner, 2026-09-12: "when that brand is selected in manual po and every
 * thing, its default values appear automatically."
 *
 * Which pack a brand opens on decides which price appears with it, so the
 * ordering here is the behaviour rather than a detail of it. It has to match
 * BrandPackDefaults::packsFor on the server: pick a different box on the
 * screen than the server would and the price written back lands on the wrong
 * pack.
 */

const pack = (p: Partial<InventoryPurchaseUnit> & { id: number; name: string }): InventoryPurchaseUnit => ({
  base_units: 1,
  brand: null,
  brand_key: '',
  default_unit_cost: null,
  ...p,
});

const packs: InventoryPurchaseUnit[] = [
  pack({ id: 1, name: 'Loose kg' }),
  pack({ id: 2, name: 'Tin', brand: 'Amul', brand_key: 'amul', default_unit_cost: 185 }),
  pack({ id: 3, name: 'Jar', brand: 'Nestlé', brand_key: 'nestlé', default_unit_cost: 120 }),
  pack({ id: 4, name: 'Sack', brand: 'Amul', brand_key: 'amul' }),
];

describe('packs offered for a brand', () => {
  it("leaves out another brand's box", () => {
    const names = packsForBrand(packs, 'Amul').map((p) => p.name);

    expect(names).toContain('Tin');
    expect(names).not.toContain('Jar');
  });

  it('still offers the packs that belong to the item', () => {
    // Most ingredients come in the same box whoever made them; only some need
    // splitting out, and the shared ones must not disappear when they do.
    expect(packsForBrand(packs, 'Amul').map((p) => p.name)).toContain('Loose kg');
  });

  it("opens on the brand's own priced pack", () => {
    const [first] = packsForBrand(packs, 'Amul');

    expect(first.name).toBe('Tin');
    expect(first.default_unit_cost).toBe(185);
  });

  it('prefers a pack that carries a price over one that does not', () => {
    // An unpriced pack tells the line nothing, so it cannot be the one the
    // screen opens on while a priced alternative exists.
    const order = packsForBrand(packs, 'Amul').map((p) => p.name);

    expect(order.indexOf('Tin')).toBeLessThan(order.indexOf('Sack'));
  });

  it('reads a brand the same however it was typed', () => {
    expect(packsForBrand(packs, '  amul ').map((p) => p.name)).toContain('Tin');
  });

  it('offers only the shared packs when no brand is chosen', () => {
    const names = packsForBrand(packs, '').map((p) => p.name);

    expect(names).toEqual(['Loose kg']);
  });
});
