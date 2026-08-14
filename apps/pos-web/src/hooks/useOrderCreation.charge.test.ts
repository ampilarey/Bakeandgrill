/**
 * FIX 1 / 2 / 3 / 6 — charge path: resumed total after save, pending-payment
 * retry (no second create), discount dirty/save, zero-total settle filler abort.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CartItem } from "../types";

const createOrder = vi.fn();
const createOrderPayments = vi.fn();
const updateOrderItems = vi.fn();
const getOrder = vi.fn();
const resumeOrder = vi.fn();
const releaseLoyaltyHold = vi.fn();

vi.mock("../api", () => ({
  createOrder: (...args: unknown[]) => createOrder(...args),
  createDeliveryOrder: vi.fn(),
  createOrderPayments: (...args: unknown[]) => createOrderPayments(...args),
  updateOrderItems: (...args: unknown[]) => updateOrderItems(...args),
  getOrder: (...args: unknown[]) => getOrder(...args),
  resumeOrder: (...args: unknown[]) => resumeOrder(...args),
  releaseLoyaltyHold: (...args: unknown[]) => releaseLoyaltyHold(...args),
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

function item(partial: Partial<CartItem> & Pick<CartItem, "id" | "name" | "price">): CartItem {
  return {
    quantity: 1,
    variant_id: null,
    variant_name: null,
    packaging_fee: 0,
    packaging_fee_mode: "per_unit",
    packaging_option_id: null,
    packaging_option_name: null,
    modifiers: [],
    tax_rate: 0,
    tax_code: "out_of_scope",
    notes: [],
    ...partial,
  };
}

async function importHook() {
  const mod = await import("./useOrderCreation");
  return mod.useOrderCreation;
}

describe("useOrderCreation charge path (FIX 1/2/3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createOrderPayments.mockResolvedValue({ ok: true });
    releaseLoyaltyHold.mockResolvedValue(undefined);
  });

  it("FIX 1: resumed edit-down saves then settles at new total without fabricated cash", async () => {
    const useOrderCreation = await importHook();
    let cartItems = [
      item({ id: 1, name: "A", price: 40 }),
      item({ id: 2, name: "B", price: 60 }),
    ];
    let discountAmount = "";
    const setCartItems = vi.fn((next: CartItem[]) => {
      cartItems = next;
    });

    getOrder.mockResolvedValue({
      order: {
        id: 77,
        total: 100,
        status: "held",
        payment_status: "unpaid",
        type: "takeaway",
        restaurant_table_id: null,
        discount_amount: 0,
        manual_discount_laar: 0,
        items: cartItems.map((c) => ({
          item_id: c.id,
          item_name: c.name,
          unit_price: c.price,
          quantity: c.quantity,
          modifiers: [],
        })),
      },
    });
    resumeOrder.mockResolvedValue(undefined);
    updateOrderItems.mockResolvedValue({
      order: { id: 77, total: 60, subtotal: 60, tax_amount: 0, type: "takeaway" },
    });

    const { result, rerender } = renderHook(() =>
      useOrderCreation({
        cartItems,
        setCartItems,
        clearCart: vi.fn(),
        setSelectedItem: vi.fn(),
        cartTotal: cartItems.reduce((s, i) => s + i.price * i.quantity, 0),
        payments: [],
        orderType: "Takeaway",
        selectedTableId: null,
        customerId: null,
        customerName: null,
        customerPhone: null,
        discountAmount,
        deviceId: "POS-1",
        isOnline: true,
        isReachable: true,
        setDiscountAmount: (v) => {
          discountAmount = v;
        },
      }),
    );

    await act(async () => {
      await result.current.handleResumeTicket(77);
    });

    // Edit down: remove item B → live cart 40… but we simulate 60 after save
    // by dropping one line then charging with 60 tender (server returns 60).
    cartItems = [item({ id: 1, name: "A", price: 60 })];
    rerender();

    await act(async () => {
      const ok = await result.current.handleCharge([{ method: "cash", amount: 60 }]);
      expect(ok).toBe(true);
    });

    expect(updateOrderItems).toHaveBeenCalled();
    expect(createOrder).not.toHaveBeenCalled();
    expect(createOrderPayments).toHaveBeenCalledTimes(1);
    const payPayload = createOrderPayments.mock.calls[0][1];
    expect(createOrderPayments.mock.calls[0][0]).toBe(77);
    const methods = payPayload.payments.map((p: { method: string; amount: number }) => p.method);
    const amounts = payPayload.payments.map((p: { method: string; amount: number }) => p.amount);
    expect(methods).toEqual(["cash"]);
    expect(amounts).toEqual([60]);
  });

  it("FIX 1: >1-laari shortfall aborts without fabricating cash", async () => {
    const useOrderCreation = await importHook();
    const cartItems = [item({ id: 1, name: "A", price: 60 })];

    getOrder.mockResolvedValue({
      order: {
        id: 88,
        total: 100,
        status: "pending",
        payment_status: "unpaid",
        type: "takeaway",
        restaurant_table_id: null,
        manual_discount_laar: 0,
        items: cartItems.map((c) => ({
          item_id: c.id,
          item_name: c.name,
          unit_price: c.price,
          quantity: 1,
          modifiers: [],
        })),
      },
    });

    const { result } = renderHook(() =>
      useOrderCreation({
        cartItems,
        setCartItems: vi.fn(),
        clearCart: vi.fn(),
        setSelectedItem: vi.fn(),
        cartTotal: 60,
        payments: [],
        orderType: "Takeaway",
        selectedTableId: null,
        customerId: null,
        customerName: null,
        customerPhone: null,
        discountAmount: "",
        deviceId: "POS-1",
        isOnline: true,
        isReachable: true,
      }),
    );

    await act(async () => {
      await result.current.handleResumeTicket(88);
    });

    // Force settle against stale 100 with only 60 tendered (no dirty save).
    // Fingerprint matches so save is skipped; resumedOrderTotal is still 100.
    await act(async () => {
      const ok = await result.current.handleCharge([{ method: "cash", amount: 60 }]);
      expect(ok).toBe(false);
    });

    expect(createOrderPayments).not.toHaveBeenCalled();
    expect(result.current.statusMessage).toMatch(/Order total changed to MVR 100/);
  });

  it("FIX 2: settle failure then re-Confirm does not call createOrder again", async () => {
    const useOrderCreation = await importHook();
    const cartItems = [item({ id: 1, name: "A", price: 50 })];
    createOrder.mockResolvedValue({ order: { id: 501, total: 50 } });
    createOrderPayments
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ ok: true });

    const { result } = renderHook(() =>
      useOrderCreation({
        cartItems,
        setCartItems: vi.fn(),
        clearCart: vi.fn(),
        setSelectedItem: vi.fn(),
        cartTotal: 50,
        payments: [],
        orderType: "Takeaway",
        selectedTableId: null,
        customerId: null,
        customerName: null,
        customerPhone: null,
        discountAmount: "",
        deviceId: "POS-1",
        isOnline: true,
        isReachable: true,
      }),
    );

    await act(async () => {
      const ok = await result.current.handleCharge([{ method: "cash", amount: 50 }]);
      expect(ok).toBe(false);
    });

    expect(createOrder).toHaveBeenCalledTimes(1);
    expect(result.current.pendingPaymentForOrderId).toBe(501);

    await act(async () => {
      const ok = await result.current.handleCharge([{ method: "cash", amount: 50 }]);
      expect(ok).toBe(true);
    });

    expect(createOrder).toHaveBeenCalledTimes(1);
    expect(createOrderPayments).toHaveBeenCalledTimes(2);
    expect(createOrderPayments.mock.calls[1][0]).toBe(501);
  });

  it("clearPendingPayment dismisses stuck retry mode", async () => {
    const useOrderCreation = await importHook();
    const cartItems = [item({ id: 1, name: "A", price: 50 })];
    createOrder.mockResolvedValue({ order: { id: 502, total: 50 } });
    createOrderPayments.mockRejectedValueOnce(new Error("network"));

    const { result } = renderHook(() =>
      useOrderCreation({
        cartItems,
        setCartItems: vi.fn(),
        clearCart: vi.fn(),
        setSelectedItem: vi.fn(),
        cartTotal: 50,
        payments: [],
        orderType: "Takeaway",
        selectedTableId: null,
        customerId: null,
        customerName: null,
        customerPhone: null,
        discountAmount: "",
        deviceId: "POS-1",
        isOnline: true,
        isReachable: true,
      }),
    );

    await act(async () => {
      await result.current.handleCharge([{ method: "cash", amount: 50 }]);
    });
    expect(result.current.pendingPaymentForOrderId).toBe(502);

    act(() => {
      result.current.clearPendingPayment();
    });
    expect(result.current.pendingPaymentForOrderId).toBeNull();
    expect(result.current.pendingPaymentTotalDue).toBeNull();
  });

  it("zero-due pending with live cart creates a new order instead of retrying", async () => {
    const useOrderCreation = await importHook();
    const cartItems = [item({ id: 1, name: "A", price: 40 })];
    createOrder
      .mockResolvedValueOnce({ order: { id: 503, total: 0 } })
      .mockResolvedValueOnce({ order: { id: 504, total: 40 } });
    createOrderPayments
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ ok: true });

    const { result } = renderHook(() =>
      useOrderCreation({
        cartItems,
        setCartItems: vi.fn(),
        clearCart: vi.fn(),
        setSelectedItem: vi.fn(),
        cartTotal: 40,
        payments: [],
        orderType: "Takeaway",
        selectedTableId: null,
        customerId: null,
        customerName: null,
        customerPhone: null,
        discountAmount: "",
        deviceId: "POS-1",
        isOnline: true,
        isReachable: true,
      }),
    );

    await act(async () => {
      const ok = await result.current.handleCharge([{ method: "cash", amount: 40 }]);
      expect(ok).toBe(false);
    });
    expect(result.current.pendingPaymentForOrderId).toBe(503);
    expect(result.current.pendingPaymentTotalDue).toBe(0);

    await act(async () => {
      const ok = await result.current.handleCharge([{ method: "cash", amount: 40 }]);
      expect(ok).toBe(true);
    });
    expect(createOrder).toHaveBeenCalledTimes(2);
    expect(createOrderPayments.mock.calls[1][0]).toBe(504);
    expect(result.current.pendingPaymentForOrderId).toBeNull();
  });

  it("FIX 3: discount-only edit marks dirty and PATCH carries discount_amount", async () => {
    const useOrderCreation = await importHook();
    const cartItems = [item({ id: 1, name: "A", price: 100 })];
    let discountAmount = "";

    getOrder.mockResolvedValue({
      order: {
        id: 91,
        total: 100,
        status: "pending",
        payment_status: "unpaid",
        type: "takeaway",
        restaurant_table_id: null,
        manual_discount_laar: 0,
        items: [{
          item_id: 1,
          item_name: "A",
          unit_price: 100,
          quantity: 1,
          modifiers: [],
        }],
      },
    });
    updateOrderItems.mockResolvedValue({
      order: { id: 91, total: 80, subtotal: 100, tax_amount: 0, type: "takeaway" },
    });

    const { result, rerender } = renderHook(() =>
      useOrderCreation({
        cartItems,
        setCartItems: vi.fn(),
        clearCart: vi.fn(),
        setSelectedItem: vi.fn(),
        cartTotal: 80,
        payments: [],
        orderType: "Takeaway",
        selectedTableId: null,
        customerId: null,
        customerName: null,
        customerPhone: null,
        discountAmount,
        deviceId: "POS-1",
        isOnline: true,
        isReachable: true,
        setDiscountAmount: (v) => {
          discountAmount = v;
        },
      }),
    );

    await act(async () => {
      await result.current.handleResumeTicket(91);
    });

    discountAmount = "20.00";
    rerender();
    expect(result.current.hasUnsavedTicketChanges).toBe(true);

    await act(async () => {
      const ok = await result.current.handleCharge([{ method: "cash", amount: 80 }]);
      expect(ok).toBe(true);
    });

    expect(updateOrderItems).toHaveBeenCalledWith(
      91,
      expect.objectContaining({ discount_amount: 20 }),
    );
    const pay = createOrderPayments.mock.calls[0][1].payments;
    expect(pay).toHaveLength(1);
    expect(pay[0].amount).toBe(80);
  });
});
