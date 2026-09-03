/**
 * How the ticket header is laid out.
 *
 * Owner, 2026-09-03: "how about now dine in, takeaway etc. appears when
 * clicked. But keep it always. Because it's used frequently. But keep select
 * tables and add customer in one row side by side to save space. And move
 * discount … tab to same row as save, order … rename to fit the box."
 *
 *   - the order-type row is always on show, ticket or no ticket
 *   - table and customer share one row
 *   - Discounts & rewards is a button beside Save and Orders, and its
 *     drawer takes no room at all while it is closed
 *   - the delivery address is the one block that still folds away
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { OrderCart } from "./OrderCart";
import type { CartItem, RestaurantTable } from "../types";
import { EMPTY_DELIVERY_DETAILS } from "../orderTypes";

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    fetchRecentCustomers: vi.fn().mockResolvedValue({ data: [], total: 0 }),
    searchCustomers: vi.fn().mockResolvedValue({ data: [] }),
    quickCreateCustomer: vi.fn(),
    updateCustomerFromPos: vi.fn(),
    fetchCustomerRewards: vi.fn().mockResolvedValue({}),
  };
});

const tables: RestaurantTable[] = [
  { id: 1, name: "T1", current_order_id: null } as unknown as RestaurantTable,
  { id: 2, name: "T2", current_order_id: null } as unknown as RestaurantTable,
];

const line: CartItem = { id: 10, name: "Bajiya", price: 10, quantity: 2, modifiers: [] };

function renderCart(over: Record<string, unknown> = {}) {
  const setOrderType = vi.fn();
  render(
    <OrderCart
      {...({
        orderType: "Dine-in",
        setOrderType,
        deliveryDetails: { ...EMPTY_DELIVERY_DETAILS },
        setDeliveryDetails: () => {},
        tables,
        selectedTableId: null,
        setSelectedTableId: () => {},
        cartItems: [line],
        setCartItems: () => {},
        cartSubtotal: 20,
        cartTax: 0,
        cartTotal: 20,
        chargeTotal: 20,
        taxableSubtotal: 20,
        discountValue: 0,
        rewardsDiscount: 0,
        payments: [],
        discountAmount: "",
        setDiscountAmount: () => {},
        appliedPromo: null,
        setAppliedPromo: () => {},
        appliedLoyalty: null,
        setAppliedLoyalty: () => {},
        appliedGiftCard: null,
        setAppliedGiftCard: () => {},
        isSubmitting: false,
        pendingPaymentForOrderId: null,
        lastCreatedOrderId: null,
        openTicketsCount: 0,
        attachedCustomer: null,
        onAttachCustomer: () => {},
        onDetachCustomer: () => {},
        resumedOrderId: null,
        onCancelResume: () => {},
        onClearCart: () => {},
        onSaveTicket: () => {},
        onOpenTickets: () => {},
        onCheckout: () => {},
        onRetryPayment: () => {},
        onOpenSendBill: () => {},
        quickNotes: [],
        ...over,
      } as never)}
    />,
  );
  return { setOrderType };
}

describe("Order type stays on show", () => {
  it("keeps every order type in reach with items on the ticket", () => {
    const { setOrderType } = renderCart();

    const row = screen.getByTestId("cart-order-types");
    for (const t of ["Dine-in", "Takeaway", "Pickup", "Delivery"]) {
      expect(within(row).getByRole("button", { name: t })).toBeInTheDocument();
    }
    // Nothing folds them away behind a chip any more.
    expect(screen.queryByTestId("cart-context-chip")).toBeNull();

    // With items on the ticket a switch still asks first — that is the
    // existing guard, not the fold.
    fireEvent.click(within(row).getByRole("button", { name: "Takeaway" }));
    expect(setOrderType).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Switch" }));
    expect(setOrderType).toHaveBeenCalledWith("Takeaway");
  });

  it("switches straight away on an empty ticket", () => {
    const { setOrderType } = renderCart({ cartItems: [] });
    fireEvent.click(within(screen.getByTestId("cart-order-types")).getByRole("button", { name: "Delivery" }));
    expect(setOrderType).toHaveBeenCalledWith("Delivery");
  });
});

describe("Table and customer share a row", () => {
  it("puts both in one row on a dine-in ticket", () => {
    renderCart();
    const row = screen.getByTestId("cart-table-customer-row");
    expect(within(row).getByRole("combobox", { name: "Table" })).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: /Customer/ })).toBeInTheDocument();
  });

  it("drops the table picker on a takeaway ticket, leaving the customer the row", () => {
    renderCart({ orderType: "Takeaway" });
    const row = screen.getByTestId("cart-table-customer-row");
    expect(within(row).queryByRole("combobox", { name: "Table" })).toBeNull();
    expect(within(row).getByRole("button", { name: /Customer/ })).toBeInTheDocument();
  });
});

describe("Discounts & rewards in the header row", () => {
  it("sits beside Save and Orders, and opens a dialog of its own", () => {
    renderCart();
    const toggle = screen.getByTestId("cart-adjust-toggle");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    // Closed, it costs nothing at all in the cart.
    expect(screen.queryByTestId("discounts-modal")).toBeNull();

    fireEvent.click(toggle);
    const modal = screen.getByTestId("discounts-modal");
    expect(modal).toBeInTheDocument();
    expect(screen.getByTestId("cart-adjust-toggle")).toHaveAttribute("aria-expanded", "true");
    // Owner, 2026-09-03: "can add a number pad to enter the number."
    expect(within(modal).getByTestId("discount-numpad")).toBeInTheDocument();

    fireEvent.click(within(modal).getByRole("button", { name: "Done" }));
    expect(screen.queryByTestId("discounts-modal")).toBeNull();
  });

  it("opens by itself when a discount was refused, so the reason is seen", () => {
    renderCart({ discountFieldError: "Over the 20% cap." });
    expect(screen.getByTestId("discounts-modal")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Over the 20% cap.");
  });

  it("counts what is applied, so a closed drawer still says so", () => {
    renderCart({ discountValue: 5, appliedLoyalty: { points: 10, discount: 2 } });
    expect(screen.getByTestId("cart-adjust-toggle")).toHaveTextContent("2");
  });

  it("is not offered on an empty ticket, nor where the till may not discount", () => {
    renderCart({ cartItems: [] });
    expect(screen.queryByTestId("cart-adjust-toggle")).toBeNull();

    renderCart({ canApplyDiscount: false, canUseRewards: false });
    expect(screen.queryByTestId("cart-adjust-toggle")).toBeNull();
  });
});

describe("The delivery address still folds", () => {
  const withAddress = {
    orderType: "Delivery",
    deliveryDetails: { ...EMPTY_DELIVERY_DETAILS, addressLine1: "Orchid Magu 12", island: "Male" },
  };

  it("shows the filled address as a chip once the ticket has items", () => {
    renderCart(withAddress);
    const chip = screen.getByTestId("cart-address-chip");
    expect(chip).toHaveTextContent("Orchid Magu 12");
    expect(screen.queryByPlaceholderText("Delivery address *")).toBeNull();

    fireEvent.click(chip);
    expect(screen.getByPlaceholderText("Delivery address *")).toBeInTheDocument();
  });

  it("stays open while the address is still missing", () => {
    renderCart({ orderType: "Delivery" });
    expect(screen.queryByTestId("cart-address-chip")).toBeNull();
    expect(screen.getByPlaceholderText("Delivery address *")).toBeInTheDocument();
  });
});
