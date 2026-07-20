import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EventsPanel } from "./EventsPanel";
import type { PosEvent } from "../api/events";

const fetchPosEvents = vi.fn();
const firePosEvent = vi.fn();
const cancelPosEvent = vi.fn();

vi.mock("../api/events", () => ({
  fetchPosEvents: (...args: unknown[]) => fetchPosEvents(...args),
  firePosEvent: (...args: unknown[]) => firePosEvent(...args),
  cancelPosEvent: (...args: unknown[]) => cancelPosEvent(...args),
}));

function makeEvent(overrides: Partial<PosEvent> = {}): PosEvent {
  return {
    id: 1,
    reference: "EV-20260720-AAAA",
    status: "confirmed",
    display_status: "confirmed",
    contact_name: "Aisha",
    phone: "7777001",
    event_date: "2026-07-20",
    fulfillment_method: "pickup",
    fulfillment_time: "12:00",
    setup_time: "11:30",
    venue_name: "Office Hall",
    delivery_address: null,
    delivery_island: null,
    headcount: 40,
    dietary_notes: "No nuts",
    handled_by: { id: 9, name: "Event Lead" },
    lines: [{ id: 1, name: "Fried Rice Tray", quantity: 2, unit_price: 450, is_custom: false, notes: null }],
    order: {
      id: 55,
      order_number: "BG-CAT-1",
      status: "payment_pending",
      fired_at: null,
      payment_status: "partial",
      payment_state: "partial",
      paid_laar: 22500,
      balance_laar: 22500,
      total_laar: 45000,
    },
    quote_is_deposit: true,
    quote_payment_laar: 22500,
    ...overrides,
  };
}

describe("EventsPanel", () => {
  beforeEach(() => {
    fetchPosEvents.mockReset();
    firePosEvent.mockReset();
    cancelPosEvent.mockReset();
    fetchPosEvents.mockResolvedValue({
      events: [
        makeEvent(),
        makeEvent({
          id: 2,
          reference: "EV-TOMORROW",
          event_date: "2026-07-21",
          dietary_notes: null,
          display_status: "awaiting_payment",
          status: "awaiting_customer",
          order: null,
        }),
      ],
      meta: { from: "2026-07-18", to: "2026-08-10", today: "2026-07-20" },
    });
  });

  it("groups Today first and shows fulfilment + dietary badge", async () => {
    render(
      <EventsPanel
        canManageEvents={false}
        shiftOpen={false}
        onClose={() => {}}
        onSettleBalance={() => {}}
      />,
    );

    await waitFor(() => expect(screen.getByTestId("events-group-today")).toBeTruthy());
    const todayCard = screen.getByTestId("event-card-1");
    expect(screen.getByText("Today")).toBeTruthy();
    expect(todayCard.querySelector('[data-testid="dietary-badge"]')).toBeTruthy();
    expect(todayCard.querySelector('[data-testid="handled-by"]')?.textContent).toContain("Event Lead");
    expect(screen.queryByTestId("event-actions")).toBeNull();
  });

  it("shows action buttons only when events.manage is granted", async () => {
    render(
      <EventsPanel
        canManageEvents
        shiftOpen
        onClose={() => {}}
        onSettleBalance={() => {}}
      />,
    );

    await waitFor(() => expect(screen.getByTestId("event-card-1")).toBeTruthy());
    const todayCard = screen.getByTestId("event-card-1");
    expect(todayCard.querySelector('[data-testid="event-actions"]')).toBeTruthy();
    expect(todayCard.querySelector('[data-testid="fire-to-kitchen"]')).toBeTruthy();
    expect(todayCard.querySelector('[data-testid="settle-balance"]')).toBeTruthy();
    expect(todayCard.querySelector('[data-testid="cancel-event"]')).toBeTruthy();
  });

  it("opens dietary modal when badge is tapped", async () => {
    const user = userEvent.setup();
    render(
      <EventsPanel
        canManageEvents={false}
        shiftOpen={false}
        onClose={() => {}}
        onSettleBalance={() => {}}
      />,
    );
    await waitFor(() => expect(screen.getByTestId("dietary-badge")).toBeTruthy());
    await user.click(screen.getByTestId("dietary-badge"));
    expect(screen.getByTestId("dietary-modal").textContent).toContain("No nuts");
  });
});
