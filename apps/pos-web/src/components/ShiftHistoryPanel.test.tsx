import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ShiftHistoryPanel } from "./ShiftHistoryPanel";

const getShiftHistory = vi.fn();
const getShiftSummary = vi.fn();

vi.mock("../api", () => ({
  getShiftHistory: (...args: unknown[]) => getShiftHistory(...args),
  getShiftSummary: (...args: unknown[]) => getShiftSummary(...args),
}));

describe("ShiftHistoryPanel", () => {
  beforeEach(() => {
    getShiftHistory.mockReset();
    getShiftSummary.mockReset();
  });

  it("still shows Expected for closed shifts", async () => {
    getShiftHistory.mockResolvedValue({
      shifts: [{
        id: 9,
        opened_at: "2026-08-08T08:00:00+00:00",
        closed_at: "2026-08-08T16:00:00+00:00",
        opening_cash: 100,
        closing_cash: 340,
        expected_cash: 350,
        variance: -10,
        notes: null,
      }],
    });
    getShiftSummary.mockResolvedValue({
      cash_drawer: {
        opening_cash: 100,
        cash_sales: 250,
        paid_in: 0,
        paid_out: 0,
        cash_refunds: 0,
        expected_cash: 350,
      },
      sales_summary: {
        order_count: 3,
        gross_sales: 400,
        discounts: 0,
        refunds: 0,
        net_sales: 400,
      },
      tenders: { cash: 250 },
    });

    render(<ShiftHistoryPanel onClose={vi.fn()} staffRole="staff" />);

    await waitFor(() => {
      expect(screen.getByText("Expected")).toBeTruthy();
      expect(screen.getByText("MVR 350.00")).toBeTruthy();
      expect(screen.getByText("+ Cash sales")).toBeTruthy();
    });
  });

  it("shows denomination breakdown and foreign currency on closed shifts", async () => {
    getShiftHistory.mockResolvedValue({
      shifts: [{
        id: 11,
        opened_at: "2026-08-08T08:00:00+00:00",
        closed_at: "2026-08-08T16:00:00+00:00",
        opening_cash: 100,
        closing_cash: 300,
        expected_cash: 350,
        variance: -50,
        cash_count_method: "denominations",
        cash_count_breakdown: { "10000": 3 },
        foreign_currency_held: [
          { currency: "USD", denomination: 50, count: 1, accepted_mvr: 770 },
        ],
        notes: null,
      }],
    });
    getShiftSummary.mockResolvedValue({
      cash_drawer: {
        opening_cash: 100,
        cash_sales: 250,
        paid_in: 0,
        paid_out: 0,
        cash_refunds: 0,
        expected_cash: 350,
      },
      sales_summary: {
        order_count: 3,
        gross_sales: 400,
        discounts: 0,
        refunds: 0,
        net_sales: 400,
      },
      tenders: { cash: 250 },
    });

    render(<ShiftHistoryPanel onClose={vi.fn()} staffRole="staff" />);

    await waitFor(() => {
      expect(screen.getByTestId("shift-history-denom-breakdown").textContent).toMatch(/MVR 100 × 3/);
      expect(screen.getByTestId("shift-history-foreign-currency").textContent).toMatch(/USD 50/);
      expect(screen.getByTestId("shift-history-fx-beside-variance").textContent).toMatch(/Short MVR 50\.00/);
      expect(screen.getByTestId("shift-history-fx-beside-variance").textContent).toMatch(/USD 50 held/);
    });
  });

  it("hides Expected for an open shift in history when role is staff", async () => {
    getShiftHistory.mockResolvedValue({
      shifts: [{
        id: 10,
        opened_at: "2026-08-09T08:00:00+00:00",
        closed_at: null,
        opening_cash: 100,
        closing_cash: null,
        expected_cash: 350,
        variance: null,
        notes: null,
      }],
    });
    getShiftSummary.mockResolvedValue({
      cash_drawer: {
        opening_cash: 100,
        cash_sales: 250,
        paid_in: 0,
        paid_out: 0,
        cash_refunds: 0,
        expected_cash: 350,
      },
      sales_summary: {
        order_count: 2,
        gross_sales: 300,
        discounts: 0,
        refunds: 0,
        net_sales: 300,
      },
      tenders: { cash: 250, card: 50 },
    });

    render(<ShiftHistoryPanel onClose={vi.fn()} staffRole="staff" />);

    await waitFor(() => {
      expect(screen.getByText(/still open/i)).toBeTruthy();
    });
    expect(screen.queryByText("Expected")).toBeNull();
    expect(document.body.textContent).not.toMatch(/350\.00/);
    expect(screen.queryByText(/\+ Cash sales/)).toBeNull();
  });
});
