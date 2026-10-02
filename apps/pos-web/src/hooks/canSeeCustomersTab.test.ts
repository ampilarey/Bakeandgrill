import { describe, expect, it } from "vitest";
import { canSeeCustomersTab } from "./usePosPermissions";

describe("canSeeCustomersTab", () => {
  it("opens only with the dedicated permission", () => {
    expect(canSeeCustomersTab(["pos.customers_tab"])).toBe(true);
  });

  it("stays hidden from a manager by default, even with Manage customers", () => {
    expect(canSeeCustomersTab(["customers.manage", "customers.lookup", "customers.view"])).toBe(false);
  });

  it("stays hidden from a cashier, who only looks customers up at the cart", () => {
    expect(canSeeCustomersTab(["customers.view", "customers.lookup", "customers.create", "pos.ring_sales"])).toBe(false);
    expect(canSeeCustomersTab([])).toBe(false);
  });
});
