/**
 * Scanning a size.
 *
 * A large bottle and a small bottle carry different barcodes. Ringing up the
 * dish alone lets addToCart fall back to the first active size — a coin toss
 * between Large and Small, at the wrong price half the time.
 */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Item } from "../types";

const lookupBarcode = vi.fn();

vi.mock("../api", () => ({
  createOrder: vi.fn(),
  createDeliveryOrder: vi.fn(),
  createOrderPayments: vi.fn(),
  updateOrderItems: vi.fn(),
  getOrder: vi.fn(),
  resumeOrder: vi.fn(),
  releaseLoyaltyHold: vi.fn(),
  applyGiftCardToOrder: vi.fn(),
  applyPromoToOrder: vi.fn(),
  holdLoyaltyForOrder: vi.fn(),
  removeGiftCardFromOrder: vi.fn(),
  fireOrderToKitchen: vi.fn(),
  holdOrder: vi.fn(),
  lookupBarcode: (...args: unknown[]) => lookupBarcode(...args),
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

vi.mock("../offline/syncEngine", () => ({ runOfflineSync: vi.fn() }));

vi.mock("../utils/applyStagedRewards", () => ({
  applyStagedRewards: vi.fn(async (_id: number, total: number) => ({ total, failures: [] })),
}));

const SMALL = { id: 11, name: "Small", price: 10, is_active: true, barcode: "5011" };
const LARGE = { id: 12, name: "Large", price: 20, is_active: true, barcode: "5012" };

function water(): Item {
  return {
    id: 1,
    name: "Water",
    base_price: 0,
    has_variants: true,
    variants: [SMALL, LARGE],
    barcode: "7001",
  } as unknown as Item;
}

async function makeHook(isOnline: boolean) {
  const mod = await import("./useOrderCreation");
  const addToCart = vi.fn();
  const { result } = renderHook(() =>
    mod.useOrderCreation({
      cartItems: [],
      setCartItems: vi.fn(),
      clearCart: vi.fn(),
      setSelectedItem: vi.fn(),
      cartTotal: 0,
      payments: [],
      orderType: "Takeaway",
      selectedTableId: null,
      customerId: null,
      customerName: null,
      customerPhone: null,
      discountAmount: "",
      deviceId: "POS-1",
      isOnline,
      isReachable: isOnline,
    }),
  );

  return { result, addToCart };
}

const submit = { preventDefault: vi.fn() } as unknown as React.FormEvent<HTMLFormElement>;

describe("scanning a barcode", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rings up the size the code belongs to, not the first one listed", async () => {
    const { result, addToCart } = await makeHook(true);
    lookupBarcode.mockResolvedValue({ item: water(), variant: LARGE });

    await act(async () => {
      result.current.setBarcode("5012");
    });
    await act(async () => {
      result.current.handleBarcodeSubmit(submit, [water()], addToCart);
    });

    expect(addToCart).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1 }),
      { variant: LARGE },
    );
  });

  it("passes no size when the code belongs to the dish itself", async () => {
    const { result, addToCart } = await makeHook(true);
    lookupBarcode.mockResolvedValue({ item: water(), variant: null });

    await act(async () => {
      result.current.setBarcode("7001");
    });
    await act(async () => {
      result.current.handleBarcodeSubmit(submit, [water()], addToCart);
    });

    expect(addToCart).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), undefined);
  });

  it("finds a size in the cached menu when the till is offline", async () => {
    // The lookup never runs offline, so the cached copy is all there is —
    // and it carries the sizes' codes for exactly this.
    const { result, addToCart } = await makeHook(false);

    await act(async () => {
      result.current.setBarcode("5011");
    });
    await act(async () => {
      result.current.handleBarcodeSubmit(submit, [water()], addToCart);
    });

    expect(lookupBarcode).not.toHaveBeenCalled();
    expect(addToCart).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1 }),
      { variant: SMALL },
    );
  });

  it("falls back to the cached size when the lookup fails", async () => {
    const { result, addToCart } = await makeHook(true);
    lookupBarcode.mockRejectedValue(new Error("network"));

    await act(async () => {
      result.current.setBarcode("5012");
    });
    await act(async () => {
      result.current.handleBarcodeSubmit(submit, [water()], addToCart);
    });

    expect(addToCart).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1 }),
      { variant: LARGE },
    );
  });

  it("does nothing for a code that matches nothing", async () => {
    const { result, addToCart } = await makeHook(false);

    await act(async () => {
      result.current.setBarcode("9999");
    });
    await act(async () => {
      result.current.handleBarcodeSubmit(submit, [water()], addToCart);
    });

    expect(addToCart).not.toHaveBeenCalled();
  });
});
