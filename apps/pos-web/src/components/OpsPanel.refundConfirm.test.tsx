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
    refundReason: "Wrong item",
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
    setOpsMessage: noop,
    ...overrides,
  } as OpsState;
}

describe("OpsPanel refund confirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not call createRefund on the first Record refund click", async () => {
    const user = userEvent.setup();
    const handleCreateRefund = vi.fn();
    render(
      <OpsPanel
        {...makeOps({ handleCreateRefund })}
        permissions={{ refunds: true, shiftOpen: true }}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Refunds/i }));
    await user.click(screen.getByRole("button", { name: /^Record refund$/i }));

    expect(handleCreateRefund).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: /Confirm refund/i })).toBeTruthy();
    expect(screen.getByText(/MVR 12\.50/)).toBeTruthy();
    expect(screen.getByText(/Wrong item/)).toBeTruthy();
    expect(screen.getByText(/ON — card portion in cash/i)).toBeTruthy();
  });

  it("calls createRefund only after Yes, issue refund", async () => {
    const user = userEvent.setup();
    const handleCreateRefund = vi.fn();
    render(
      <OpsPanel
        {...makeOps({ handleCreateRefund })}
        permissions={{ refunds: true, shiftOpen: true }}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Refunds/i }));
    await user.click(screen.getByRole("button", { name: /^Record refund$/i }));
    expect(handleCreateRefund).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /Yes, issue refund/i }));
    expect(handleCreateRefund).toHaveBeenCalledTimes(1);
  });
});
