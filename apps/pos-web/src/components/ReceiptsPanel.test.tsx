/**
 * The Receipts pane. Owner, 2026-09-02: "can u enhance the receipt page in
 * pos". What the redesign has to keep true:
 *
 *   - a row says how it was paid and where the money stands, not just a total
 *   - the list carries a running count and total for what is filtered
 *   - the receipt breaks out every money line, each payment with change,
 *     and any refund; sizes and notes ride on the item lines
 *   - a phone shows one pane at a time with a way back
 *   - a refund can never exceed what is still on the receipt
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchReceipts = vi.hoisted(() => vi.fn());
vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    fetchReceipts,
    getReceiptLink: vi.fn().mockResolvedValue({ link: "https://example.test/r/1" }),
    sendReceipt: vi.fn(),
    createRefund: vi.fn(),
  };
});

const matchMedia = vi.hoisted(() => ({ narrow: false }));
vi.mock("../hooks/useMediaQuery", () => ({
  useMediaQuery: (q: string) => (q.includes("760") ? matchMedia.narrow : false),
}));

import { ReceiptsPanel, paymentLabel, receiptState } from "./ReceiptsPanel";

const cashSale = {
  id: 1, order_number: "BG-101", type: "dine_in", status: "completed", payment_status: "paid",
  total: 40, subtotal: 40, discount_amount: 0, tax_amount: 2.96,
  created_at: "2026-09-02T09:15:00+05:00",
  customer: null, user: { id: 3, name: "Ariya" }, table: { id: 1, name: "T4" },
  items: [
    { id: 11, item_name: "Water", variant_name: "Small", notes: null, quantity: 2, unit_price: 5, total_price: 10 },
    { id: 12, item_name: "Nescafé", variant_name: "Milk", notes: "less sugar", quantity: 2, unit_price: 15, total_price: 30 },
  ],
  payments: [{ id: 21, method: "cash", amount: 40, tendered_amount: 50, change_given: 10, status: "completed" }],
  refunds: [],
};
const cardSale = {
  id: 2, order_number: "BG-102", type: "takeaway", status: "completed", payment_status: "paid",
  total: 100, subtotal: 100, discount_amount: 10, service_charge_amount: 5, service_charge_label: "Service 5%",
  created_at: "2026-09-02T10:00:00+05:00",
  customer: { id: 5, name: "Hassan", phone: "7771234" }, user: { id: 3, name: "Ariya" },
  items: [{ id: 13, item_name: "Platter", quantity: 1, unit_price: 100, total_price: 100 }],
  payments: [{ id: 22, method: "card", amount: 100, status: "completed" }],
  refunds: [{ id: 31, amount: 30, status: "approved", reason_category: "wrong_item", created_at: "2026-09-02T11:00:00+05:00" }],
};

function renderPanel(over: Record<string, unknown> = {}) {
  return render(
    <ReceiptsPanel onClose={() => {}} shiftId={9} initialOrderId={null} {...over} />,
  );
}

beforeEach(() => {
  matchMedia.narrow = false;
  fetchReceipts.mockReset();
  fetchReceipts.mockResolvedValue({ data: [cardSale, cashSale] });
});

describe("paymentLabel / receiptState", () => {
  it("reads methods as words", () => {
    expect(paymentLabel("cash")).toBe("Cash");
    expect(paymentLabel("bank_transfer")).toBe("Transfer");
    expect(paymentLabel("house_account")).toBe("Credit");
    expect(paymentLabel("something_new")).toBe("something new");
  });

  it("says where the money stands", () => {
    expect(receiptState(cashSale as never).label).toBe("Paid");
    expect(receiptState(cardSale as never).label).toBe("Part refunded");
    expect(receiptState({ ...cardSale, refunds: [{ ...cardSale.refunds[0], amount: 100 }] } as never).label).toBe("Refunded");
    expect(receiptState({ ...cashSale, status: "cancelled" } as never).label).toBe("Cancelled");
    expect(receiptState({ ...cashSale, payment_status: "unpaid" } as never).label).toBe("Unpaid");
  });
});

describe("ReceiptsPanel list", () => {
  it("shows how each receipt was paid and where the money stands", async () => {
    renderPanel();

    const row = await screen.findByTestId("receipt-row-1");
    expect(row).toHaveTextContent("BG-101");
    expect(row).toHaveTextContent("MVR 40.00");
    expect(row).toHaveTextContent("Cash");
    expect(row).toHaveTextContent("Paid");
    expect(row).toHaveTextContent("T4");
    // Safari squeezes shrinkable <button> rows in a column list until the
    // second line is painted over by the next row.
    expect(row).toHaveStyle({ flexShrink: "0" });

    const card = screen.getByTestId("receipt-row-2");
    expect(card).toHaveTextContent("Card");
    expect(card).toHaveTextContent("Part refunded");
    expect(card).toHaveTextContent("Hassan");
  });

  it("keeps a running count and total for what is shown, and filters by how it was paid", async () => {
    renderPanel();
    await screen.findByTestId("receipt-row-1");

    expect(screen.getByTestId("receipts-summary")).toHaveTextContent("2 receipts · MVR 140.00 · refunded MVR 30.00");

    fireEvent.click(screen.getByRole("button", { name: /^Cash/ }));
    expect(screen.queryByTestId("receipt-row-2")).toBeNull();
    expect(screen.getByTestId("receipts-summary")).toHaveTextContent("1 receipt · MVR 40.00");
  });

  it("asks the server for today, this shift, or everything", async () => {
    renderPanel();
    await screen.findByTestId("receipt-row-1");
    expect(fetchReceipts).toHaveBeenLastCalledWith(expect.objectContaining({ date: expect.any(String) }));

    fireEvent.click(screen.getByRole("button", { name: "This shift" }));
    await waitFor(() => expect(fetchReceipts).toHaveBeenLastCalledWith(expect.objectContaining({ shift_id: 9 })));

    fireEvent.click(screen.getByRole("button", { name: "All" }));
    await waitFor(() => expect(fetchReceipts).toHaveBeenLastCalledWith(expect.not.objectContaining({ date: expect.anything() })));
  });
});

describe("ReceiptsPanel paging", () => {
  it("says when more receipts remain, and loads them on request", async () => {
    const third = { ...cashSale, id: 3, order_number: "BG-103" };
    fetchReceipts.mockResolvedValueOnce({ data: [cardSale, cashSale], total: 3 });
    renderPanel();
    await screen.findByTestId("receipt-row-1");

    expect(screen.getByTestId("receipts-summary")).toHaveTextContent("first 2 of 3");

    fetchReceipts.mockResolvedValueOnce({ data: [third], total: 3 });
    fireEvent.click(screen.getByRole("button", { name: "Show more (1 left)" }));
    await screen.findByTestId("receipt-row-3");
    expect(fetchReceipts).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));
    expect(screen.getByTestId("receipts-summary")).not.toHaveTextContent("first");
    expect(screen.queryByRole("button", { name: /Show more/ })).toBeNull();
  });

  it("opens the just-charged receipt once, then keeps the cashier's own pick across reloads", async () => {
    renderPanel({ initialOrderId: 2 });
    await screen.findByTestId("receipt-row-1");
    expect(screen.getByTestId("receipt-row-2")).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByTestId("receipt-row-1"));
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    await waitFor(() => expect(fetchReceipts).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByTestId("receipt-row-1")).toHaveAttribute("aria-pressed", "true"));
    expect(screen.getByTestId("receipt-row-2")).toHaveAttribute("aria-pressed", "false");
  });
});

describe("ReceiptsPanel detail", () => {
  it("counts a refund still awaiting approval against what can be refunded", async () => {
    const awaiting = { id: 32, amount: 30, status: "pending", reason_category: "other", created_at: "2026-09-02T11:30:00+05:00" };
    fetchReceipts.mockResolvedValue({ data: [{ ...cardSale, refunds: [...cardSale.refunds, awaiting] }] });
    renderPanel();
    fireEvent.click(await screen.findByTestId("receipt-row-2"));

    fireEvent.click(screen.getByRole("button", { name: "Refund more" }));
    const form = screen.getByTestId("refund-form");
    expect(form).toHaveTextContent("Up to MVR 40.00 can be refunded");
    expect(form).toHaveTextContent("MVR 30.00 awaiting approval");
    expect(within(form).getByLabelText("Refund amount")).toHaveValue("40.00");
  });

  it("reads like the paper receipt: sizes, notes, money lines, payment and change", async () => {
    renderPanel();
    fireEvent.click(await screen.findByTestId("receipt-row-1"));

    const detail = screen.getByTestId("receipt-detail");
    expect(detail).toHaveTextContent("Water · Small");
    expect(detail).toHaveTextContent("less sugar");
    expect(detail).toHaveTextContent("Table T4");
    expect(detail).toHaveTextContent("by Ariya");
    expect(detail).toHaveTextContent("GST");
    expect(detail).toHaveTextContent("MVR 2.96");
    const pay = within(detail).getByTestId("receipt-payments");
    expect(pay).toHaveTextContent("Cash");
    expect(pay).toHaveTextContent("Tendered MVR 50.00");
    expect(pay).toHaveTextContent("Change MVR 10.00");
  });

  it("shows discount, service charge and refunds already made", async () => {
    renderPanel();
    fireEvent.click(await screen.findByTestId("receipt-row-2"));

    const detail = screen.getByTestId("receipt-detail");
    expect(detail).toHaveTextContent("Discount");
    expect(detail).toHaveTextContent("− MVR 10.00");
    expect(detail).toHaveTextContent("Service 5%");
    const refunds = within(detail).getByTestId("receipt-refunds");
    expect(refunds).toHaveTextContent("wrong item");
    expect(refunds).toHaveTextContent("− MVR 30.00");
  });

  it("caps a further refund at what is still on the receipt", async () => {
    renderPanel();
    fireEvent.click(await screen.findByTestId("receipt-row-2"));

    fireEvent.click(screen.getByRole("button", { name: "Refund more" }));
    const form = screen.getByTestId("refund-form");
    expect(form).toHaveTextContent("Up to MVR 70.00 can be refunded");
    expect(within(form).getByLabelText("Refund amount")).toHaveValue("70.00");

    fireEvent.change(within(form).getByLabelText("Refund amount"), { target: { value: "80" } });
    fireEvent.change(within(form).getByLabelText("Refund reason category"), { target: { value: "wrong_item" } });
    fireEvent.change(within(form).getByLabelText("Refund details"), { target: { value: "Cold" } });
    fireEvent.click(within(form).getByRole("button", { name: /Request refund/ }));

    expect(screen.getByRole("status")).toHaveTextContent("cannot exceed MVR 70.00");
  });

  it("hides the refund button when nothing is left to refund, or the cashier may not refund", async () => {
    fetchReceipts.mockResolvedValue({ data: [{ ...cardSale, refunds: [{ ...cardSale.refunds[0], amount: 100 }] }] });
    renderPanel();
    fireEvent.click(await screen.findByTestId("receipt-row-2"));
    expect(screen.queryByRole("button", { name: /^Refund/ })).toBeNull();

    fetchReceipts.mockResolvedValue({ data: [cashSale] });
    renderPanel({ canRefund: false });
    fireEvent.click(await screen.findByTestId("receipt-row-1"));
    expect(screen.queryByRole("button", { name: /^Refund/ })).toBeNull();
  });
});

describe("ReceiptsPanel on a phone", () => {
  it("shows the list alone, then the receipt with a way back", async () => {
    matchMedia.narrow = true;
    renderPanel();

    await screen.findByTestId("receipt-row-1");
    expect(screen.queryByTestId("receipt-detail")).toBeNull();

    fireEvent.click(screen.getByTestId("receipt-row-1"));
    expect(screen.getByTestId("receipt-detail")).toBeInTheDocument();
    expect(screen.queryByTestId("receipts-list")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Back to list" }));
    expect(screen.queryByTestId("receipt-detail")).toBeNull();
    expect(screen.getByTestId("receipts-list")).toBeInTheDocument();
  });
});
