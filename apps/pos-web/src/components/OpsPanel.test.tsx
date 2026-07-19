import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
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
    suppliers: [{ id: 1, name: "Test Supplier" }],
    purchaseSupplierId: null,
    setPurchaseSupplierId: noop,
    purchaseDate: "2026-01-01",
    setPurchaseDate: noop,
    purchaseLines: [{ key: "1", name: "", quantity: "", unitCost: "" }],
    addPurchaseLine: noop,
    removePurchaseLine: noop,
    updatePurchaseLine: noop,
    refundOrderId: "",
    setRefundOrderId: noop,
    refundAmount: "",
    setRefundAmount: noop,
    refundReason: "",
    setRefundReason: noop,
    refundStatusFilter: "",
    setRefundStatusFilter: noop,
    refunds: [],
    handleOpenShift: noop,
    handleCloseShift: noop,
    handleCashMovement: noop,
    handleAdjustInventory: noop,
    handleCreatePurchase: noop,
    handleCreateRefund: noop,
    setOpsMessage: noop,
    ...overrides,
  };
}

describe("OpsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows operational tabs and hides back-office tabs", () => {
    render(
      <OpsPanel
        {...makeOps()}
        permissions={{
          inventory: true,
          preparedStock: true,
          refunds: true,
          shiftOpen: true,
        }}
      />,
    );

    expect(screen.getByRole("button", { name: /Inventory/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Menu stock/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /86 today/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Refunds/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Suppliers/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Reports/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Marketing/i })).toBeNull();
  });

  it("shows admin dashboard pointer for moved features", () => {
    render(
      <OpsPanel
        {...makeOps()}
        permissions={{ inventory: true }}
      />,
    );

    expect(screen.getByText(/Suppliers, full Reports, and SMS marketing are in the/i)).toBeTruthy();
    expect(screen.getByText(/Admin dashboard/i)).toBeTruthy();
  });

  it("hides Refunds tab when shift is not open", () => {
    render(
      <OpsPanel
        {...makeOps()}
        permissions={{
          inventory: true,
          refunds: true,
          shiftOpen: false,
        }}
      />,
    );

    expect(screen.getByRole("button", { name: /Inventory/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Refunds/i })).toBeNull();
  });
});
