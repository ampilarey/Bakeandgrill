import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import App from "./App";

/*
 * Kitchen audit, 2026-09-26: the lane comes from the server's kitchen_lane.
 * (Header, order helper and API mock copied from board.layout.test.tsx.)
 *
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
const markItem86 = vi.fn();

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
      permissions: ["kds.view", "kds.start_order", "kds.mark_kitchen_done", "kds.bump_order", "kds.manage_availability"],
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
    markItem86: (...a: unknown[]) => markItem86(...a),
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

describe("kitchen audit, 2026-09-26", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    localStorage.setItem("kds_token", "test-token");
    markItem86.mockResolvedValue({ is_available: false });
  });

  it("keeps a ticket paid mid-cook in Cooking, without a start button", async () => {
    fetchKdsOrders.mockResolvedValue([
      order(1, "paid", "Mixed Grill", 1, { kitchen_lane: "cooking", kitchen_started_at: new Date().toISOString() }),
      order(2, "paid", "Masroshi", 1, { kitchen_lane: "new" }),
    ]);
    render(<App />);

    const cooking = await screen.findByTestId("kds-lane-cooking");
    expect(within(cooking).getAllByTestId("kds-ticket")).toHaveLength(1);
    expect(within(cooking).queryByText("Start cooking")).toBeNull();
    expect(within(screen.getByTestId("kds-lane-pending")).getByText("Start cooking")).toBeTruthy();
  });

  it("flags a cancelled ticket and offers no actions", async () => {
    fetchKdsOrders.mockResolvedValue([
      order(1, "cancelled", "Burger", 1, { kitchen_lane: "cancelled", kitchen_started_at: new Date().toISOString() }),
    ]);
    render(<App />);

    const cooking = await screen.findByTestId("kds-lane-cooking");
    expect(within(cooking).getByTestId("kds-cancelled").textContent).toMatch(/CANCELLED/);
    expect(within(cooking).queryByText("Kitchen done")).toBeNull();
  });

  it("shows the pickup time and times the ticket from the kitchen clock", async () => {
    const clock = new Date(Date.now() - 3 * 60_000).toISOString();
    fetchKdsOrders.mockResolvedValue([
      order(1, "pending", "Burger", 1, {
        type: "online_pickup",
        created_at: new Date(Date.now() - 5 * 60 * 60_000).toISOString(),
        kitchen_clock_at: clock,
        pickup_slot_at: new Date(Date.now() + 27 * 60_000).toISOString(),
        kitchen_lane: "new",
      }),
    ]);
    render(<App />);

    expect((await screen.findByTestId("kds-pickup-time")).textContent).toMatch(/^For /);
    const ticket = screen.getByTestId("kds-ticket");
    // Five hours since it was placed would be late; three minutes since the
    // kitchen's clock started is not.
    expect(ticket.getAttribute("data-overdue")).toBe("false");
  });

  it("sends the sold-out state it shows rather than a toggle", async () => {
    fetchKdsOrders.mockResolvedValue([order(1, "pending", "Burger", 1, { kitchen_lane: "new" })]);
    render(<App />);

    const button = await screen.findByText("Sold out");
    button.click();
    await vi.waitFor(() => expect(markItem86).toHaveBeenCalledWith("test-token", 1, false));
  });
});
