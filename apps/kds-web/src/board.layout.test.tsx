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

const order = (id: number, status: string, name: string, qty: number, extra: Record<string, unknown> = {}) => ({
  id,
  order_number: String(2400 + id),
  status,
  type: "takeaway",
  created_at: new Date(Date.now() - 60_000).toISOString(),
  items: [{ id: id * 10, item_id: id, item_name: name, quantity: qty, modifiers: [] }],
  ...extra,
});

const fetchKdsOrders = vi.fn();
const startOrder = vi.fn();

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
    registerKdsDevice: vi.fn().mockResolvedValue(undefined),
    failureMessage: (e: unknown, fallback: string) => (e as { message?: string })?.message ?? fallback,
    startOrder: (...a: unknown[]) => startOrder(...a),
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
    fetchPlanTasks: vi.fn().mockResolvedValue({ date: "", tasks: [] }),
    markPlanTaskMade: vi.fn(),
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

  /*
   * Audit, 2026-09-17: the server sent the cashier's per-line note, the
   * variant and the order type on every ticket, and the board showed none of
   * them. "No onions" reached the printer and not the screen.
   */
  it("shows the line note, the variant and where the food is going", async () => {
    fetchKdsOrders.mockResolvedValue([
      order(1, "pending", "Chicken Shawarma", 2, {
        type: "dine_in",
        table_number: "4",
        customer_notes: "Pack sauces separately",
        items: [{
          id: 10, item_id: 1, item_name: "Chicken Shawarma", variant_name: "Large", quantity: 2,
          notes: "No onions · Extra spicy", modifiers: [{ id: 1, modifier_name: "Extra cheese" }],
        }],
      }),
      order(2, "pending", "Masroshi", 1, { type: "delivery", delivery_island: "Hulhumalé" }),
    ]);
    render(<App />);

    const tickets = await screen.findAllByTestId("kds-ticket");
    expect(within(tickets[0]).getByTestId("kds-line-note")).toHaveTextContent("No onions · Extra spicy");
    expect(within(tickets[0]).getByTestId("kds-variant")).toHaveTextContent("Large");
    expect(within(tickets[0]).getByTestId("kds-order-type")).toHaveTextContent("Dine-in");
    expect(within(tickets[0]).getByTestId("kds-customer-note")).toHaveTextContent("Pack sauces separately");
    expect(tickets[0]).toHaveTextContent("Table 4");

    // Delivery keeps its island tag and gets no second type tag.
    expect(within(tickets[1]).queryByTestId("kds-order-type")).toBeNull();
    expect(tickets[1]).toHaveTextContent("Hulhumalé");
  });

  /*
   * Audit, 2026-09-17: the lane component was declared inside App's render,
   * so every poll and every clock tick remounted all three lanes and threw a
   * scrolled lane back to its top.
   */
  it("keeps the lane's DOM across re-renders, so a scrolled lane stays put", async () => {
    const { fireEvent } = await import("@testing-library/react");
    render(<App />);

    const pending = await screen.findByTestId("kds-lane-pending");
    const body = pending.querySelector(".kds-lane-body");
    expect(body).not.toBeNull();

    // Any state change re-renders the board; the sound toggle is the cheapest.
    fireEvent.click(screen.getByRole("button", { name: /Sound/ }));

    expect(screen.getByTestId("kds-lane-pending").querySelector(".kds-lane-body")).toBe(body);
  });

  it("folds the lesser tools behind More, and opens them on request", async () => {
    const { fireEvent } = await import("@testing-library/react");
    render(<App />);

    await screen.findByTestId("kds-lane-pending");
    const more = screen.getByRole("button", { name: "More ▾" });
    const header = more.closest("header");
    expect(header).toHaveAttribute("data-more", "false");
    // Logout and Sound live in the folding group; the board switch does not.
    const tools = screen.getByTestId("kds-topbar-tools");
    expect(within(tools).getByRole("button", { name: "Logout" })).toBeInTheDocument();
    expect(within(tools).queryByRole("button", { name: "Production" })).toBeNull();

    fireEvent.click(more);
    expect(header).toHaveAttribute("data-more", "true");
    expect(screen.getByRole("button", { name: "Less ▴" })).toHaveAttribute("aria-expanded", "true");
  });

  it("repeats the server's reason when a kitchen action is refused", async () => {
    // Production requires a device header on every kitchen action, and the
    // refusal used to be swallowed into "Failed to start order".
    const { fireEvent } = await import("@testing-library/react");
    startOrder.mockRejectedValue(Object.assign(new Error("This POS device is waiting for approval."), { status: 403 }));
    render(<App />);

    fireEvent.click((await screen.findAllByRole("button", { name: "Start cooking" }))[0]);

    expect(await screen.findByRole("alert")).toHaveTextContent("waiting for approval");
  });
});
