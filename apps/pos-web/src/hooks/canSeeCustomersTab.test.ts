import { describe, expect, it } from "vitest";
import { canSeeCustomersTab } from "./usePosPermissions";

describe("canSeeCustomersTab", () => {
  it("is for owners and managers, who hold customers.manage", () => {
    expect(canSeeCustomersTab(["customers.manage", "customers.lookup"])).toBe(true);
  });

  it("stays hidden from a cashier, who only looks customers up at the cart", () => {
    // The stock Staff role: what every cashier holds.
    expect(canSeeCustomersTab(["customers.view", "customers.lookup", "customers.create", "pos.ring_sales"])).toBe(false);
    expect(canSeeCustomersTab([])).toBe(false);
  });
});
