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
