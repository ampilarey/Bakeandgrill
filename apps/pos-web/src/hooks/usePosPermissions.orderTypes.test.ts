import { describe, expect, it } from "vitest";
import { allowedOrderTypes } from "./usePosPermissions";

describe("allowedOrderTypes", () => {
  it("follows the order-type permissions", () => {
    expect(allowedOrderTypes(["pos.ring_sales", "pos.order_type.dine_in", "pos.order_type.takeaway"])).toEqual(["Dine-in", "Takeaway"]);
    expect(allowedOrderTypes(["pos.order_type.delivery"])).toEqual(["Delivery"]);
  });

  it("shows every type for a list saved before these permissions existed", () => {
    expect(allowedOrderTypes(["pos.ring_sales", "orders.create"])).toEqual(["Dine-in", "Takeaway", "Pickup", "Delivery"]);
  });
});
