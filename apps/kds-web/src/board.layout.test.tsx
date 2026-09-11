import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import App from "./App";

/*
 * The board is three lanes, and each lane scrolls on its own.
 *
 * It was meant to be that before too — `grid grid-cols-1 md:grid-cols-2
 * lg:grid-cols-3` said so. But Tailwind had moved to v4 while index.css still
 * carried the v3 `@tailwind` directives, so not one utility was generated and
 * every className in the app was inert. The kitchen got a single full-width
 * stack, three screens tall, with no padding on anything. Nothing failed —
 * the classes were simply absent from the stylesheet.
 *
 * That is the failure these tests exist for: a layout that is asserted in
 * markup and not delivered. They check the structure the CSS keys off, and
 * that the CSS is not waiting on a framework that is no longer installed.
 */

const order = (id: number, status: string, name: string, qty: number) => ({
  id,
  order_number: String(2400 + id),
  status,
  created_at: new Date(Date.now() - 60_000).toISOString(),
  items: [{ id: id * 10, item_id: id, item_name: name, quantity: qty, modifiers: [] }],
});

const fetchKdsOrders = vi.fn();

vi.mock("./api", async () => {
  const { createTokenStore } = await import("@shared/auth");
  return {
    kdsToken: createTokenStore("kds_token"),
    kdsUsername: createTokenStore("kds_username"),
    KDS_DEVICE_ID_KEY: "kds_device_id",
    staffLogin: vi.fn(),
    fetchMe: vi.fn().mockResolvedValue({
      id: 1,
      name: "Cook",
      role: "kitchen_staff",
      permissions: ["kds.view", "kds.start_order", "kds.mark_kitchen_done", "kds.bump_order"],
    }),
    fetchKdsOrders: (...a: unknown[]) => fetchKdsOrders(...a),
    fetchKdsMenuGroups: vi.fn().mockResolvedValue([]),
    fetchKdsActivity: vi.fn().mockResolvedValue([]),
    startOrder: vi.fn(),
    kitchenDoneOrder: vi.fn(),
    printKitchenTicket: vi.fn(),
    bumpOrder: vi.fn(),
    recallOrder: vi.fn(),
    markItem86: vi.fn(),
    markOrderItemCooked: vi.fn(),
    createPurchaseRequest: vi.fn(),
    fetchMyPurchaseRequests: vi.fn(),
    fetchAssignedPurchaseRequests: vi.fn(),
    markPurchaseRequestItemBought: vi.fn(),
    markPurchaseRequestItemPartial: vi.fn(),
    markPurchaseRequestItemNotAvailable: vi.fn(),
    hasKdsPermission: (perms: string[], slug: string) => perms.includes(slug),
  };
});

describe("the kitchen board", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    localStorage.setItem("kds_token", "test-token");
    fetchKdsOrders.mockResolvedValue([
      order(1, "pending", "Chicken Shawarma", 2),
      order(2, "pending", "Garlic Naan", 4),
      order(3, "in_progress", "Mixed Grill Platter", 1),
      order(4, "ready", "Masroshi", 3),
    ]);
  });

  it("sorts tickets into three lanes", async () => {
    render(<App />);

    const pending = await screen.findByTestId("kds-lane-pending");
    expect(within(pending).getAllByTestId("kds-ticket")).toHaveLength(2);
    expect(within(screen.getByTestId("kds-lane-cooking")).getAllByTestId("kds-ticket")).toHaveLength(1);
    expect(within(screen.getByTestId("kds-lane-ready")).getAllByTestId("kds-ticket")).toHaveLength(1);
  });

  it("shows the quantity apart from the dish, so neither is read as the other", async () => {
    render(<App />);

    const line = (await screen.findAllByTestId("kds-line"))[0];

    // Two separate blocks: "4×" is not buried inside the sentence.
    expect(line.querySelector(".kds-qty")?.textContent).toMatch(/^\d+×$/);
    expect(line.querySelector(".kds-dish")?.textContent).toBeTruthy();
  });

  it("marks how old a ticket is on the ticket itself", async () => {
    render(<App />);

    const ticket = (await screen.findAllByTestId("kds-ticket"))[0];

    // CSS colours the card's left edge from this; without it every ticket
    // looks equally urgent, which is the same as none of them being urgent.
    expect(["ok", "warn", "late"]).toContain(ticket.getAttribute("data-urgency"));
  });

});
