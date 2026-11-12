/**
 * Owner, 2026-11-12: "Before it was 419 but when charge clicked it was 400." The cart of a
 * saved ticket showed the till's own sums while Charge took the server's total. A saved
 * ticket with nothing changed now hands over the server's total and lines to show.
 */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CartItem } from "../types";

const getOrder = vi.fn();
const resumeOrder = vi.fn();

vi.mock("../api", () => ({
  createOrder: vi.fn(),
  createDeliveryOrder: vi.fn(),
  createOrderPayments: vi.fn(),
  updateOrderItems: vi.fn(),
  getOrder: (...args: unknown[]) => getOrder(...args),
  resumeOrder: (...args: unknown[]) => resumeOrder(...args),
  releaseLoyaltyHold: vi.fn(),
  applyGiftCardToOrder: vi.fn(),
  applyPromoToOrder: vi.fn(),
  holdLoyaltyForOrder: vi.fn(),
  removeGiftCardFromOrder: vi.fn(),
  fireOrderToKitchen: vi.fn(),
  holdOrder: vi.fn(),
  lookupBarcode: vi.fn(),
  requestDiscountApproval: vi.fn(),
  confirmDiscountApproval: vi.fn(),
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

vi.mock("../offline/offlineOrderNumber", () => ({
  allocateOfflineOrderNumber: vi.fn(async () => "OFF-TEST-0001"),
}));

vi.mock("../offline/syncEngine", () => ({
  runOfflineSync: vi.fn(),
}));

vi.mock("../utils/applyStagedRewards", () => ({
  applyStagedRewards: vi.fn(async (_id: number, total: number) => ({
    total,
    failures: [],
  })),
}));

describe("useOrderCreation: a saved ticket shows the server's figures", () => {
  beforeEach(() => vi.clearAllMocks());

  it("hands over the saved total and lines until the ticket is changed", async () => {
    const { useOrderCreation } = await import("./useOrderCreation");
    let cartItems: CartItem[] = [];
    getOrder.mockResolvedValue({
      order: {
        id: 5, total: 400, subtotal: 381, tax_amount: 0, service_charge_amount: "19.00", packaging_fee_laar: 0,
        status: "held", payment_status: "unpaid", type: "dine_in", restaurant_table_id: null,
        discount_amount: 0, manual_discount_laar: 0,
        items: [{ item_id: 1, item_name: "Curry", unit_price: 381, quantity: 1, modifiers: [], tax_code: "standard_8", tax_rate: 8 }],
      },
    });
    resumeOrder.mockResolvedValue(undefined);

    const { result, rerender } = renderHook(() =>
      useOrderCreation({
        cartItems,
        setCartItems: (next: CartItem[]) => { cartItems = next; },
        clearCart: vi.fn(),
        setSelectedItem: vi.fn(),
        // The till's own sum, with a GST the server does not charge.
        cartTotal: 419,
        payments: [],
        orderType: "Dine-in",
        selectedTableId: null,
        customerId: null,
        customerName: null,
        customerPhone: null,
        discountAmount: "",
        deviceId: "POS-1",
        isOnline: true,
        isReachable: true,
      } as never),
    );

    await act(async () => { await result.current.handleResumeTicket(5); });
    rerender();
    expect(result.current.savedTicket).toEqual({
      total: 400,
      figures: { tax: 0, serviceCharge: 19, packaging: 0 },
    });

    // A change to the ticket puts the till's own sums back until it is saved again.
    cartItems = [{ ...cartItems[0], quantity: 2 }];
    rerender();
    expect(result.current.savedTicket).toBeNull();
  });
});
