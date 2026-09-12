import { describe, it, expect } from 'vitest';
import { lineOpening, packsForBrand } from '../pages/PurchaseOrdersPage';
import type { InventoryPurchaseUnit, LastPurchase } from '../api/operations';

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

/*
 * What a line opens on. Owner, 2026-09-12: "In po, when brand is selected,
 * its defaults should appear." The register — each brand's packs and what
 * they usually cost — comes first; what was last paid is the fallback.
 */
const lastAmulTin: LastPurchase = {
  brand: 'Amul', unit_cost: 0.2, pack_cost: 200, purchase_unit_id: 2,
  pack_name: 'Tin', pack_size: 1, pack_quantity: 3, purchase_date: '2026-09-01', supplier: 'Fahi',
};

describe('what a line opens on for a brand', () => {
  it("opens on the brand's own priced pack when nothing of it has been bought", () => {
    expect(lineOpening(packs, 'Nestlé', null)).toEqual({ pack: packs[2], price: 120 });
  });

  it('prices the box last bought at what the register says for it, not what was paid then', () => {
    // The last purchase already corrected the register, and the owner may
    // have edited it since — so the register is the newer of the two.
    expect(lineOpening(packs, 'Amul', lastAmulTin)).toEqual({ pack: packs[1], price: 185 });
  });

  it('falls back to what was paid when the box last bought carries no price', () => {
    const unpriced = packs.map((p) => (p.id === 2 ? { ...p, default_unit_cost: null } : p));

    expect(lineOpening(unpriced, 'Amul', lastAmulTin)).toEqual({ pack: unpriced[1], price: 200 });
  });

  it("switching to another brand brings that brand's box and price, not the last purchase's", () => {
    // The last purchase was Amul's tin; picking Nestlé must not leave the
    // line priced at Amul's tin.
    expect(lineOpening(packs, 'Nestlé', lastAmulTin)).toEqual({ pack: packs[2], price: 120 });
  });

  it('opens loose at the last price when that is how this brand was last bought', () => {
    const loose: LastPurchase = { ...lastAmulTin, brand: 'Royal', purchase_unit_id: null, pack_name: null, pack_size: null, pack_cost: null };

    expect(lineOpening(packs, 'Royal', loose)).toEqual({ pack: null, price: 0.2 });
  });

  it('has nothing to say about a brand never bought and never set up', () => {
    expect(lineOpening(packs, 'Royal', lastAmulTin)).toBeNull();
    expect(lineOpening(packs, 'Royal', null)).toBeNull();
  });

  it('falls back to a shared priced pack for a brand with none of its own', () => {
    const shared = [pack({ id: 1, name: 'Loose kg', default_unit_cost: 40 })];

    expect(lineOpening(shared, 'Royal', null)).toEqual({ pack: shared[0], price: 40 });
  });
});
