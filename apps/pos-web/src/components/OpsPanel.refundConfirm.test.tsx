import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OpsPanel } from "./OpsPanel";
import type { useOps } from "../hooks/useOps";

vi.mock("../api", () => ({
  fetchPreparedStock: vi.fn().mockResolvedValue({ items: [] }),
  adjustPreparedStock: vi.fn(),
  fetchPosMenu: vi.fn().mockResolvedValue({ categories: [], items: [] }),
  snoozeItem: vi.fn(),
  REFUND_REASON_CATEGORIES: [
    { value: "wrong_item", label: "Wrong item" },
    { value: "quality_complaint", label: "Quality complaint" },
    { value: "order_cancelled", label: "Order cancelled" },
    { value: "duplicate_charge", label: "Duplicate charge" },
    { value: "other", label: "Other" },
  ],
}));

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
    suppliers: [{ id: 1, name: "Test Supplier" }],
    purchaseSupplierId: null,
    setPurchaseSupplierId: noop,
    purchaseDate: "2026-01-01",
    setPurchaseDate: noop,
    purchaseLines: [{ key: "1", name: "", quantity: "", unitCost: "" }],
    addPurchaseLine: noop,
    removePurchaseLine: noop,
    updatePurchaseLine: noop,
    refundOrderId: "42",
    refundAmount: "12.50",
    refundCategory: "wrong_item",
    setRefundCategory: noop,
    refundReason: "Wrong item",
    refundPhone: "",
    setRefundPhone: noop,
    setRefundOrderId: noop,
    setRefundAmount: noop,
    setRefundReason: noop,
    refundStatusFilter: "",
    setRefundStatusFilter: noop,
    refunds: [],
    refundCashOverride: true,
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

describe("OpsPanel refund confirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not call createRefund on the first Request click", async () => {
    const user = userEvent.setup();
    const handleCreateRefund = vi.fn();
    render(
      <OpsPanel
        {...makeOps({ handleCreateRefund })}
        permissions={{ refunds: true, shiftOpen: true }}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Refunds/i }));
    await user.click(screen.getByRole("button", { name: /^Request$/i }));

    expect(handleCreateRefund).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: /Confirm refund/i })).toBeTruthy();
    expect(screen.getByText(/MVR 12\.50/)).toBeTruthy();
    // Reason appears in the confirm dialog row (category option also says "Wrong item").
    expect(screen.getAllByText(/Wrong item/).length).toBeGreaterThan(0);
    expect(screen.getByText(/ON — card portion in cash/i)).toBeTruthy();
  });

  it("calls createRefund only after Yes, request refund", async () => {
    const user = userEvent.setup();
    const handleCreateRefund = vi.fn();
    render(
      <OpsPanel
        {...makeOps({ handleCreateRefund })}
        permissions={{ refunds: true, shiftOpen: true }}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Refunds/i }));
    await user.click(screen.getByRole("button", { name: /^Request$/i }));
    expect(handleCreateRefund).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /Yes, request refund/i }));
    expect(handleCreateRefund).toHaveBeenCalledTimes(1);
  });
});
