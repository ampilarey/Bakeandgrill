import { makeCartKey } from "./useCart";
import type { PlatterSelection } from "../types";

/**
 * Two differently filled platters are two orders.
 *
 * Owner's audit, 2026-09-06, F2. Before the till could sell a platter at all
 * this could not come up; now that it can, the cart key has to tell them
 * apart or the kitchen gets one set of picks for a line of quantity two.
 */

const rice: PlatterSelection = {
  group_id: 10, item_id: 1, item_name: "Fried Rice", quantity: 1, surcharge: 0,
};
const naan: PlatterSelection = {
  group_id: 10, item_id: 2, item_name: "Garlic Naan", quantity: 1, surcharge: 15,
};

describe("makeCartKey with platter picks", () => {
  it("keeps two differently filled platters as separate lines", () => {
    expect(makeCartKey(7, [], null, [], null, [rice]))
      .not.toBe(makeCartKey(7, [], null, [], null, [naan]));
  });

  it("merges two identically filled platters", () => {
    expect(makeCartKey(7, [], null, [], null, [rice, naan]))
      .toBe(makeCartKey(7, [], null, [], null, [rice, naan]));
  });

  it("does not care what order the picks came in", () => {
    // The cashier tapping naan before rice is the same platter.
    expect(makeCartKey(7, [], null, [], null, [rice, naan]))
      .toBe(makeCartKey(7, [], null, [], null, [naan, rice]));
  });

  it("separates a filled platter from the same item with no picks", () => {
    expect(makeCartKey(7, [], null, [], null, [rice]))
      .not.toBe(makeCartKey(7, [], null, [], null, []));
  });

  it("leaves an ordinary line's key alone", () => {
    // Everything that is not a platter passes nothing here, so the key must
    // be what it always was for those.
    expect(makeCartKey(7, [], null, [], null)).toBe(makeCartKey(7, [], null, [], null, []));
  });
});
