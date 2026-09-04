import { useState } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OpsPanel } from "./OpsPanel";
import type { useOps } from "../hooks/useOps";
import * as api from "../api";

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    fetchPreparedStock: vi.fn().mockResolvedValue({ items: [] }),
    adjustPreparedStock: vi.fn(),
    fetchPosMenu: vi.fn().mockResolvedValue({ categories: [], items: [] }),
    fetchReceipts: vi.fn(),
    snoozeItem: vi.fn(),
  };
});

type OpsState = ReturnType<typeof useOps>;

function makeOps(overrides: Partial<OpsState> = {}): OpsState {
  const noop = () => undefined;
  return {
    shift: null,
    openingCash: "",
    setOpeningCash: noop,
    closingCash: "",
    setClosingCash: noop,
    cashMoveType: "cash_in",
    setCashMoveType: noop,
    cashMoveAmount: "",
    setCashMoveAmount: noop,
    cashMoveReason: "",
    setCashMoveReason: noop,
    opsMessage: "",
    inventoryItems: [],
    adjustItemId: null,
    setAdjustItemId: noop,
    adjustType: "adjustment",
    setAdjustType: noop,
    adjustQuantity: "",
    setAdjustQuantity: noop,
    adjustNotes: "",
    setAdjustNotes: noop,
    wasteReason: "spoilage",
    setWasteReason: noop,
    suppliers: [],
    purchaseSupplierId: null,
    setPurchaseSupplierId: noop,
    purchaseDate: "2026-01-01",
    setPurchaseDate: noop,
    purchaseLines: [],
    addPurchaseLine: noop,
    removePurchaseLine: noop,
    updatePurchaseLine: noop,
    refundOrderId: "",
    refundAmount: "",
    refundCategory: "",
    setRefundCategory: noop,
    refundReason: "",
    refundPhone: "",
    setRefundPhone: noop,
    setRefundOrderId: vi.fn(),
    setRefundAmount: vi.fn(),
    setRefundReason: noop,
    refundStatusFilter: "",
    setRefundStatusFilter: noop,
    refunds: [],
    refundCashOverride: false,
    setRefundCashOverride: noop,
    handleOpenShift: noop,
    handleCloseShift: noop,
    handleCashMovement: noop,
    handleAdjustInventory: noop,
    handleRecordWaste: noop,
    handleCreatePurchase: noop,
    handleCreateRefund: noop,
    handleApproveRefund: noop,
    handleRejectRefund: noop,
    setOpsMessage: noop,
    ...overrides,
  } as OpsState;
}

describe("OpsPanel refund order picker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.fetchReceipts as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        {
          id: 91,
          order_number: "BG-1001",
          type: "takeaway",
          status: "completed",
          payment_status: "paid",
          total: 85.5,
          subtotal: 85.5,
          discount_amount: 0,
          created_at: "2026-08-14T10:15:00+05:00",
          customer: { id: 3, name: "Aisha" },
        },
        {
          id: 92,
          order_number: "BG-1002",
          type: "dine_in",
          status: "completed",
          payment_status: "unpaid",
          total: 40,
          subtotal: 40,
          discount_amount: 0,
          created_at: "2026-08-14T10:20:00+05:00",
        },
      ],
    });
  });

  it("lets cashier pick a paid order from today’s list", async () => {
    const user = userEvent.setup();
    const setRefundOrderId = vi.fn();
    const setRefundAmount = vi.fn();

    render(
      <OpsPanel
        {...makeOps({ setRefundOrderId, setRefundAmount })}
        permissions={{ refunds: true, shiftOpen: true }}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Refunds/i }));

    await waitFor(() => {
      expect(screen.getByTestId("refund-order-picker")).toBeTruthy();
    });
    expect(await screen.findByRole("button", { name: /#BG-1001/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /#BG-1002/i })).toBeNull();

    await user.click(screen.getByRole("button", { name: /#BG-1001/i }));
    expect(setRefundOrderId).toHaveBeenCalledWith("91");
    expect(setRefundAmount).toHaveBeenCalledWith("85.50");
  });
});

/**
 * Whose sales the picker lists.
 *
 * Owner, 2026-09-04: "to write the order number is v difficult... cashier
 * sees his only orders in refund, but admin sees all orders, so easily can
 * pick the order."
 */
describe("OpsPanel refund order picker — scope", () => {
  const receipts = () => api.fetchReceipts as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    receipts().mockResolvedValue({ data: [] });
  });

  it("a cashier who can only request sees just their own sales", async () => {
    const user = userEvent.setup();
    render(<OpsPanel {...makeOps()} permissions={{ refunds: true, shiftOpen: true }} />);

    await user.click(screen.getByRole("button", { name: /Refunds/i }));
    await waitFor(() => expect(receipts()).toHaveBeenCalled());

    expect(receipts().mock.calls[0][0]).toMatchObject({ created_by_me: true });
    // No way to widen it from here.
    expect(screen.queryByRole("group", { name: /whose sales/i })).toBeNull();
  });

  it("an authoriser opens on every sale of the day and can narrow to their own", async () => {
    const user = userEvent.setup();
    render(
      <OpsPanel
        {...makeOps()}
        permissions={{ refunds: true, refundApprove: true, shiftOpen: true }}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Refunds/i }));
    await waitFor(() => expect(receipts()).toHaveBeenCalled());

    expect(receipts().mock.calls[0][0]).not.toHaveProperty("created_by_me");

    await user.click(screen.getByRole("button", { name: /My sales/i }));
    await waitFor(() => expect(receipts()).toHaveBeenCalledTimes(2));
    expect(receipts().mock.calls[1][0]).toMatchObject({ created_by_me: true });

    await user.click(screen.getByRole("button", { name: /All sales/i }));
    await waitFor(() => expect(receipts()).toHaveBeenCalledTimes(3));
    expect(receipts().mock.calls[2][0]).not.toHaveProperty("created_by_me");
  });

  it("tells a cashier with no sales yet why the list is empty", async () => {
    const user = userEvent.setup();
    render(<OpsPanel {...makeOps()} permissions={{ refunds: true, shiftOpen: true }} />);

    await user.click(screen.getByRole("button", { name: /Refunds/i }));

    expect(await screen.findByText(/You have no paid sales today yet/i)).toBeTruthy();
  });
});

/**
 * Invoice details, and looking further back than today.
 *
 * Owner, 2026-09-04: "need option to see invoice details, in pos, operation,
 * refund, and option to filter invoice, now see the same day invoice only,
 * add option to see his older sales also."
 */
describe("OpsPanel refund picker — invoice and date range", () => {
  const receipts = () => api.fetchReceipts as unknown as ReturnType<typeof vi.fn>;

  const sale = {
    id: 91,
    order_number: "BG-1001",
    type: "takeaway",
    status: "completed",
    payment_status: "paid",
    total: 85.5,
    subtotal: 80,
    discount_amount: 0,
    tax_amount: 5.5,
    created_at: "2026-08-14T10:15:00+05:00",
    customer: { id: 3, name: "Aisha" },
    user: { id: 7, name: "Ahmed" },
    items: [
      {
        id: 1, item_name: "Chicken Burger", variant_name: "Large", notes: "no onion",
        quantity: 2, unit_price: 30, total_price: 60,
      },
      {
        id: 2, item_name: "Cold Coffee", variant_name: null, notes: null,
        quantity: 1, unit_price: 20, total_price: 20,
      },
    ],
    payments: [{ id: 11, method: "cash", amount: 85.5, status: "completed" }],
    refunds: [{ id: 5, amount: 20, status: "approved", created_at: "2026-08-14T12:00:00+05:00" }],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    receipts().mockResolvedValue({ data: [sale] });
  });

  /*
   * The picked-order card is driven by state the parent owns, so a bare mock
   * setter leaves the panel showing the list forever. This wires the two
   * fields the picker writes, the way PosShellLayout does.
   */
  function Harness({ onAmount }: { onAmount?: (v: string) => void }) {
    const [orderId, setOrderId] = useState("");
    const [amount, setAmount] = useState("");
    return (
      <OpsPanel
        {...makeOps({
          refundOrderId: orderId,
          refundAmount: amount,
          setRefundOrderId: setOrderId,
          setRefundAmount: (v: string) => { onAmount?.(v); setAmount(v); },
        })}
        permissions={{ refunds: true, shiftOpen: true }}
      />
    );
  }

  const openRefunds = async (user: ReturnType<typeof userEvent.setup>, onAmount?: (v: string) => void) => {
    render(<Harness onAmount={onAmount} />);
    await user.click(screen.getByRole("button", { name: /Refunds/i }));
    await waitFor(() => expect(receipts()).toHaveBeenCalled());
  };

  it("shows the invoice lines and money breakdown for the picked sale", async () => {
    const user = userEvent.setup();
    await openRefunds(user);

    await user.click(await screen.findByRole("button", { name: /#BG-1001/i }));
    // Hidden until asked for — the cashier is picking, not reading, most of the time.
    expect(screen.queryByTestId("refund-invoice")).toBeNull();

    await user.click(screen.getByTestId("refund-invoice-toggle"));

    const invoice = screen.getByTestId("refund-invoice");
    expect(invoice.textContent).toContain("Chicken Burger");
    expect(invoice.textContent).toContain("Large");
    expect(invoice.textContent).toContain("no onion");
    expect(invoice.textContent).toContain("2 ×");
    expect(invoice.textContent).toContain("Cold Coffee");
    expect(invoice.textContent).toContain("MVR 60.00");
    expect(invoice.textContent).toContain("GST");
    expect(invoice.textContent).toContain("MVR 85.50");
    expect(invoice.textContent).toContain("rung by Ahmed");
  });

  it("shows what is already refunded and what is left", async () => {
    const user = userEvent.setup();
    await openRefunds(user);

    await user.click(await screen.findByRole("button", { name: /#BG-1001/i }));
    await user.click(screen.getByTestId("refund-invoice-toggle"));

    const invoice = screen.getByTestId("refund-invoice");
    expect(invoice.textContent).toContain("Already refunded");
    expect(invoice.textContent).toContain("MVR 20.00");
    expect(invoice.textContent).toContain("Still refundable");
    expect(invoice.textContent).toContain("MVR 65.50");
  });

  it("prefills the amount with what is still refundable, not the whole ticket", async () => {
    // 85.50 total, 20.00 already approved. Asking for 85.50 again would be
    // refused by the server's cap with nothing on this screen explaining why.
    const user = userEvent.setup();
    const setRefundAmount = vi.fn();
    await openRefunds(user, setRefundAmount);

    await user.click(await screen.findByRole("button", { name: /#BG-1001/i }));

    expect(setRefundAmount).toHaveBeenCalledWith("65.50");
  });

  it("asks for one day by default and a range when a wider scope is chosen", async () => {
    const user = userEvent.setup();
    await openRefunds(user);

    expect(receipts().mock.calls[0][0]).toHaveProperty("date");
    expect(receipts().mock.calls[0][0]).not.toHaveProperty("date_from");

    await user.click(screen.getByRole("button", { name: /Last 7 days/i }));
    await waitFor(() => expect(receipts()).toHaveBeenCalledTimes(2));

    const ranged = receipts().mock.calls[1][0];
    expect(ranged).not.toHaveProperty("date");
    expect(ranged.date_from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(ranged.date_to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(ranged.date_from < ranged.date_to).toBe(true);
  });

  it("lets the cashier pick their own two dates", async () => {
    const user = userEvent.setup();
    await openRefunds(user);

    await user.click(screen.getByRole("button", { name: /Pick dates/i }));
    const from = screen.getByLabelText(/Sales from date/i);
    await user.clear(from);
    await user.type(from, "2026-08-01");

    await waitFor(() => {
      const last = receipts().mock.calls[receipts().mock.calls.length - 1][0];
      expect(last.date_from).toBe("2026-08-01");
    });
  });
});
