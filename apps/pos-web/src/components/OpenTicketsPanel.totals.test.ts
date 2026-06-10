import { describe, expect, it } from "vitest";
import { ticketDisplayTotal } from "../utils/openTicketUtils";

describe("ticketDisplayTotal", () => {
  it("uses persisted total when positive", () => {
    expect(
      ticketDisplayTotal({
        id: 1,
        total: "42.50",
        items: [{ total_price: "10.00" }],
      } as never),
    ).toBe(42.5);
  });

  it("falls back to summed line items when total is zero", () => {
    expect(
      ticketDisplayTotal({
        id: 2,
        total: 0,
        items: [
          { total_price: "15.00" },
          { total_price: "10.50" },
        ],
      } as never),
    ).toBe(25.5);
  });
});
