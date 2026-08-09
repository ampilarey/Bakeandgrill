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
