import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ShiftPanel } from "./ShiftPanel";
import type { ShiftRow, ShiftSummary } from "../hooks/useShift";

function shift(): ShiftRow {
  return {
    id: 17,
    opened_at: "2026-08-09T08:15:00+00:00",
    closed_at: null,
    opening_cash: 100,
    closing_cash: null,
    expected_cash: 350,
    variance: null,
  };
}

function summary(): ShiftSummary {
  return {
    cash_drawer: {
      opening_cash: 100,
      cash_sales: 250,
      paid_in: 0,
      paid_out: 0,
      cash_refunds: 0,
      credit_repayments_cash: 0,
      expected_cash: 350,
    },
    sales_summary: {
      order_count: 4,
      gross_sales: 500,
      discounts: 0,
      refunds: 0,
      net_sales: 500,
    },
    tenders: { cash: 250, card: 250 },
    open_unpaid_orders: 0,
  } as ShiftSummary;
}

const noop = vi.fn();

describe("ShiftPanel open-shift blind drawer", () => {
  it("hides expected drawer total and cash-sales math for cashiers", () => {
    render(
      <ShiftPanel
        shift={shift()}
        summary={summary()}
        onCashMovement={noop}
        onClose={noop}
        onCloseShift={noop}
        staffRole="staff"
      />,
    );

    expect(screen.queryByText("Expected in drawer")).toBeNull();
    expect(screen.queryByText(/\+ Cash sales/)).toBeNull();
    expect(screen.queryByText("Cash")).toBeNull(); // tender cash line hidden
    expect(document.body.textContent).not.toMatch(/350\.00/);
    expect(screen.getByText("Opening cash")).toBeTruthy();
    expect(screen.getByText("MVR 100.00")).toBeTruthy();
    expect(screen.getByText("Orders")).toBeTruthy();
    expect(screen.getByText("Net sales")).toBeTruthy();
    expect(screen.getByText("Card")).toBeTruthy(); // non-cash tender still visible
    expect(screen.getByTestId("blind-drawer-note")).toBeTruthy();
  });

  it("still shows expected drawer math for managers", () => {
    render(
      <ShiftPanel
        shift={shift()}
        summary={summary()}
        onCashMovement={noop}
        onClose={noop}
        onCloseShift={noop}
        staffRole="manager"
      />,
    );

    expect(screen.getByText("Expected in drawer")).toBeTruthy();
    expect(screen.getByText(/\+ Cash sales/)).toBeTruthy();
    expect(screen.getAllByText("MVR 350.00").length).toBeGreaterThan(0);
  });
});
