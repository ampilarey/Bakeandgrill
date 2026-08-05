import { describe, expect, it } from "vitest";
import { ticketStage } from "./openTicketUtils";

/** Prepaid dine-in (customer paid online, user_id null) parks until fired. */
describe("ticketStage — prepaid dine-in", () => {
  it("parks an unfired prepaid dine-in ticket so Fire shows", () => {
    expect(ticketStage({
      status: "pending",
      fired_at: null,
      type: "dine_in",
      user: null,
    })).toBe("parked");
  });

  it("parks while payment_status partial (add-ons rung, balance due)", () => {
    expect(ticketStage({
      status: "partial",
      fired_at: null,
      type: "dine_in",
      user: null,
    })).toBe("parked");
  });

  it("moves to queued once fired", () => {
    expect(ticketStage({
      status: "pending",
      fired_at: "2026-08-05T12:45:00Z",
      type: "dine_in",
      user: null,
    })).toBe("queued");
  });

  it("staff-created dine-in tickets keep existing behaviour", () => {
    expect(ticketStage({
      status: "pending",
      fired_at: null,
      type: "dine_in",
      user: { id: 7, name: "Cashier" },
    })).toBe("queued");
  });

  it("collect-tomorrow still wins over the dine-in rule", () => {
    expect(ticketStage({
      status: "pending",
      fired_at: null,
      fulfil_date: "2099-01-01",
      type: "dine_in",
      user: null,
    })).toBe("tomorrow");
  });
});
