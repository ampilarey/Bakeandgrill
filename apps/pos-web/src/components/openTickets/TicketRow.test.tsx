import { fireEvent, render, screen } from "@testing-library/react";
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

describe("TicketRow paid badge", () => {
  it("says Paid online on a takeaway the customer paid by pay link or invoice", () => {
    renderRow(ticket({ type: "takeaway", status: "paid", payment_status: "paid", paid_online: true }));
    expect(screen.getByTestId("ticket-paid-badge")).toHaveTextContent("Paid online");
  });

  it("says Paid on one paid at the till", () => {
    renderRow(ticket({ type: "takeaway", status: "paid", payment_status: "paid" }));
    const badge = screen.getByTestId("ticket-paid-badge");
    expect(badge).toHaveTextContent("Paid");
    expect(badge).not.toHaveTextContent("online");
  });
});

describe("TicketRow bill link", () => {
  it("offers Copy bill link and Share bill link under More", () => {
    const handleBillLink = vi.fn();
    const noop = vi.fn();
    render(
      <TicketRow
        ticket={ticket({ type: "takeaway" })}
        busy={false} msg={null} mergeTargetId={null}
        canVoidOrders={false} canHoldResume canManageOrderStatus canSendBill={false} canSendPayLink={false}
        requirePosReceivingBeforeReady={false}
        smsNotifications={{ send_bill: false, send_pay_link: false }}
        onResume={noop} onVoid={noop} onSplit={noop}
        handleFireToKitchen={noop} handleSendPayLink={noop} handleStartCooking={noop} handleMarkReady={noop}
        handleMarkPickedUp={noop} handleSendBill={noop} handlePrintBill={noop} handleStartMerge={noop}
        handlePickMergeSource={noop} handleBillLink={handleBillLink}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Copy bill link/ }));
    expect(handleBillLink).toHaveBeenLastCalledWith(expect.objectContaining({ id: 5 }), true);
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Share bill link/ }));
    expect(handleBillLink).toHaveBeenLastCalledWith(expect.objectContaining({ id: 5 }), false);
  });

  it("Mark ready goes to the pop-up on the first tap (no tap-twice as well)", () => {
    const handleMarkReady = vi.fn();
    const noop = vi.fn();
    render(
      <TicketRow
        ticket={ticket({ type: "takeaway", status: "pending" })}
        busy={false} msg={null} mergeTargetId={null}
        canVoidOrders={false} canHoldResume canManageOrderStatus canSendBill={false} canSendPayLink={false}
        requirePosReceivingBeforeReady={false}
        smsNotifications={{ send_bill: false, send_pay_link: false }}
        onResume={noop} onVoid={noop} onSplit={noop}
        handleFireToKitchen={noop} handleSendPayLink={noop} handleStartCooking={noop} handleMarkReady={handleMarkReady}
        handleMarkPickedUp={noop} handleSendBill={noop} handlePrintBill={noop} handleStartMerge={noop}
        handlePickMergeSource={noop}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Mark ready" }));
    expect(handleMarkReady).toHaveBeenCalledTimes(1);
  });
});

describe("TicketRow customer message badge", () => {
  it("shows the customer's unread message so the cashier sees it (feature 9)", () => {
    renderRow(ticket({ customer_message: { count: 1, latest: "Running 10 min late" } }));
    expect(screen.getByTestId("ticket-message-badge")).toHaveTextContent("Customer: Running 10 min late");
  });

  it("shows nothing without one", () => {
    renderRow(ticket({}));
    expect(screen.queryByTestId("ticket-message-badge")).toBeNull();
  });
});
