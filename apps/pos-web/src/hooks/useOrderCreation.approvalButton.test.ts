/**
 * Discount approval by button (owner, 2026-10-07): while the code screen is
 * open the till asks every few seconds whether the approver tapped Approve
 * on Telegram, and finishes the charge with no code when they did.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CartItem } from "../types";

const createOrder = vi.fn();
const createOrderPayments = vi.fn();
const requestDiscountApproval = vi.fn();
const confirmDiscountApproval = vi.fn();
const getDiscountApprovalStatus = vi.fn();

vi.mock("../api", () => ({
  createOrder: (...args: unknown[]) => createOrder(...args),
  createDeliveryOrder: vi.fn(),
  createOrderPayments: (...args: unknown[]) => createOrderPayments(...args),
  updateOrderItems: vi.fn(),
  getOrder: vi.fn(),
  resumeOrder: vi.fn(),
  releaseLoyaltyHold: vi.fn(async () => undefined),
  applyGiftCardToOrder: vi.fn(),
  applyPromoToOrder: vi.fn(),
  holdLoyaltyForOrder: vi.fn(),
  removeGiftCardFromOrder: vi.fn(),
  fireOrderToKitchen: vi.fn(),
  holdOrder: vi.fn(),
  lookupBarcode: vi.fn(),
  requestDiscountApproval: (...args: unknown[]) => requestDiscountApproval(...args),
  confirmDiscountApproval: (...args: unknown[]) => confirmDiscountApproval(...args),
  getDiscountApprovalStatus: (...args: unknown[]) => getDiscountApprovalStatus(...args),
  validateManualDiscountInput: () => null,
  DEFAULT_POS_DISCOUNT_CONTROLS: {
    manual_enabled: true,
    max_percent: 100,
    max_fixed_mvr: 0,
    effective_cap_percent: 100,
    reason_required: false,
    reasons: [],
    approval_required: false,
  },
}));

vi.mock("../offline/db", () => ({
  countPendingOfflineOrders: vi.fn(async () => 0),
  initOfflineDb: vi.fn(async () => undefined),
  loadCachedShift: vi.fn(async () => null),
  MAX_OFFLINE_ORDERS: 50,
  saveOfflineOrder: vi.fn(),
}));
vi.mock("../offline/offlineOrderNumber", () => ({ allocateOfflineOrderNumber: vi.fn(async () => "OFF-TEST-0001") }));
vi.mock("../offline/syncEngine", () => ({ runOfflineSync: vi.fn() }));
vi.mock("../utils/applyStagedRewards", () => ({
  applyStagedRewards: vi.fn(async (_id: number, total: number) => ({ total, failures: [] })),
}));

const burger: CartItem = {
  id: 1, name: "Burger", price: 100, quantity: 1, variant_id: null, variant_name: null,
  packaging_fee: 0, packaging_fee_mode: "per_unit", packaging_option_id: null, packaging_option_name: null,
  modifiers: [], tax_rate: 0, tax_code: "out_of_scope", notes: [],
};

describe("discount approval by button", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createOrder.mockResolvedValue({ order: { id: 5, total: 100, type: "takeaway" } });
    createOrderPayments.mockResolvedValue({ ok: true });
    requestDiscountApproval.mockResolvedValue({ approval_id: 9 });
    confirmDiscountApproval.mockResolvedValue({ order: { id: 5, total: 90 } });
  });

  async function renderCharge() {
    const { useOrderCreation } = await import("./useOrderCreation");
    return renderHook(() =>
      useOrderCreation({
        cartItems: [burger],
        setCartItems: vi.fn(),
        clearCart: vi.fn(),
        setSelectedItem: vi.fn(),
        cartTotal: 100,
        payments: [],
        orderType: "Takeaway",
        selectedTableId: null,
        customerId: null,
        customerName: null,
        customerPhone: null,
        discountAmount: "10",
        deviceId: "POS-1",
        isOnline: true,
        isReachable: true,
        setDiscountAmount: vi.fn(),
        discountControls: {
          manual_enabled: true, max_percent: 100, max_fixed_mvr: 0, effective_cap_percent: 100,
          reason_required: false, reasons: [], approval_required: true,
        },
      }),
    );
  }

  it("finishes the charge without a code once the approver taps Approve", async () => {
    getDiscountApprovalStatus
      .mockResolvedValueOnce({ status: "pending", decided_by_name: null })
      .mockResolvedValue({ status: "granted", decided_by_name: "Hassan" });
    const { result } = await renderCharge();

    let charged: Promise<boolean> | undefined;
    act(() => {
      charged = result.current.handleCharge([{ method: "cash", amount: 90 }]);
    });
    await waitFor(() => expect(result.current.discountApproval).not.toBeNull());

    await waitFor(() => expect(confirmDiscountApproval).toHaveBeenCalled(), { timeout: 8000 });
    expect(confirmDiscountApproval).toHaveBeenCalledWith(5, { approval_id: 9, discount_amount: 10 });
    await act(async () => {
      expect(await charged).toBe(true);
    });
    expect(result.current.discountApproval).toBeNull();
    expect(createOrderPayments).toHaveBeenCalledTimes(1);
  }, 15000);

  it("shows who declined and stops asking", async () => {
    getDiscountApprovalStatus.mockResolvedValue({ status: "declined", decided_by_name: "Hassan" });
    const { result } = await renderCharge();

    act(() => {
      void result.current.handleCharge([{ method: "cash", amount: 90 }]);
    });
    await waitFor(() => expect(result.current.discountApproval?.error).toBe("Hassan declined this discount."), { timeout: 8000 });
    const calls = getDiscountApprovalStatus.mock.calls.length;
    await new Promise((r) => setTimeout(r, 3000));
    expect(getDiscountApprovalStatus.mock.calls.length).toBe(calls);
    expect(confirmDiscountApproval).not.toHaveBeenCalled();
  }, 15000);
});
