import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TicketRow, type TicketRowProps } from "./TicketRow";
import type { OpenTicket } from "../../utils/openTicketUtils";
import { orderTypePalette } from "../../theme";

/**
 * Owner, 2026-10-11: "add more visual colors to differentiate between order
 * type in pos". Each ticket card leads with its type as a solid chip in the
 * type's colour and carries the same colour down its left edge.
 */
const ticket = (over: Record<string, unknown> = {}) => ({
  id: 5,
  order_number: "BG-0005",
  ticket_name: null,
  type: "delivery",
  status: "pending",
  payment_status: "unpaid",
  fired_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  total: "32.40",
  items: [{ id: 1, total_price: "32.40" }],
  user: { id: 3, name: "Aisha" },
  is_customer_placed: false,
  delivery_island: "Male",
  ...over,
}) as unknown as OpenTicket;

function renderRow(t: OpenTicket) {
  const noop = vi.fn();
  const props: TicketRowProps = {
    ticket: t,
    busy: false,
    msg: null,
    mergeTargetId: null,
    canVoidOrders: false,
    canHoldResume: true,
    canManageOrderStatus: true,
    canSendBill: false,
    canSendPayLink: false,
    requirePosReceivingBeforeReady: false,
    smsNotifications: { send_bill: false, send_pay_link: false },
    onResume: noop, onVoid: noop, onSplit: noop,
    handleFireToKitchen: noop, handleSendPayLink: noop, handleStartCooking: noop, handleMarkReady: noop,
    handleMarkPickedUp: noop, handleSendBill: noop, handlePrintBill: noop, handleStartMerge: noop, handlePickMergeSource: noop,
  };
  return render(<TicketRow {...props} />);
}

describe("TicketRow order type colour", () => {
  it.each([
    ["delivery", "delivery", "Delivery"],
    ["dine_in", "dine_in", "Dine-in"],
    ["takeaway", "takeaway", "Takeaway"],
    ["online_pickup", "pickup", "Pickup"],
  ] as const)("shows a %s ticket in its colour, with its word", (type, key, word) => {
    const { container } = renderRow(ticket({ type }));
    const chip = screen.getByTestId("order-type-chip");
    expect(chip).toHaveAttribute("data-order-type", key);
    expect(chip).toHaveTextContent(word);
    // The type leads the badges, before who rang it.
    expect(chip.nextElementSibling).toHaveAttribute("data-testid", "ticket-origin-badge");
    const card = container.firstElementChild as HTMLElement;
    const hex = orderTypePalette[key].solid;
    const rgb = `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`;
    expect(card.style.borderLeft).toBe(`5px solid ${rgb}`);
  });

  it("says Online Pickup on a pickup the customer placed, still in the pickup colour", () => {
    renderRow(ticket({ type: "online_pickup", user: null, is_customer_placed: true }));
    const chip = screen.getByTestId("order-type-chip");
    expect(chip).toHaveTextContent("Online Pickup");
    expect(chip).toHaveAttribute("data-order-type", "pickup");
  });
});
