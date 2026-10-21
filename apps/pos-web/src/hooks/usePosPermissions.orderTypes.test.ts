import { describe, expect, it } from "vitest";
import { allowedOrderTypes, startingOrderType } from "./usePosPermissions";

describe("allowedOrderTypes", () => {
  it("follows the order-type permissions", () => {
    expect(allowedOrderTypes(["pos.ring_sales", "pos.order_type.dine_in", "pos.order_type.takeaway"])).toEqual(["Dine-in", "Takeaway"]);
    expect(allowedOrderTypes(["pos.order_type.delivery"])).toEqual(["Delivery"]);
  });

  it("shows every type for a list saved before these permissions existed", () => {
    expect(allowedOrderTypes(["pos.ring_sales", "orders.create"])).toEqual(["Dine-in", "Takeaway", "Pickup", "Delivery"]);
  });
});

describe("startingOrderType", () => {
  it("starts a new ticket on nothing, so the first item asks (2026-10-21)", () => {
    expect(startingOrderType(["Dine-in", "Takeaway", "Pickup", "Delivery"])).toBeNull();
    expect(startingOrderType(["Dine-in", "Takeaway"])).toBeNull();
  });

  it("never asks someone allowed one type only", () => {
    expect(startingOrderType(["Takeaway"])).toBe("Takeaway");
  });

  it("starts on nothing with every type off", () => {
    expect(startingOrderType([])).toBeNull();
  });
});
