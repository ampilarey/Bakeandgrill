import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ShiftHistoryPanel } from "./ShiftHistoryPanel";

const getShiftHistory = vi.fn();
const getShiftSummary = vi.fn();
const getLiveShifts = vi.fn();
const forceCloseShift = vi.fn();

vi.mock("../api", () => ({
  getShiftHistory: (...args: unknown[]) => getShiftHistory(...args),
  getShiftSummary: (...args: unknown[]) => getShiftSummary(...args),
  getLiveShifts: (...args: unknown[]) => getLiveShifts(...args),
  forceCloseShift: (...args: unknown[]) => forceCloseShift(...args),
}));

const emptySummary = {
  cash_drawer: { opening_cash: 0, cash_sales: 0, paid_in: 0, paid_out: 0, cash_refunds: 0, expected_cash: 0 },
  sales_summary: { order_count: 0, gross_sales: 0, discounts: 0, refunds: 0, net_sales: 0 },
  tenders: {},
};

describe("ShiftHistoryPanel", () => {
  beforeEach(() => {
    getShiftHistory.mockReset();
    getShiftSummary.mockReset();
    getLiveShifts.mockReset();
    forceCloseShift.mockReset();
    getLiveShifts.mockResolvedValue({ shifts: [] });
  });

  // Shift history audit, 2026-10-02 ──────────────────────────────────────

  it("shows who is on shift now, with cashier and till, for an owner", async () => {
    getLiveShifts.mockResolvedValue({
      shifts: [{
        id: 12, user_id: 4, device_id: 2, opened_at: "2026-10-02T04:15:00+00:00", closed_at: null,
        opening_cash: 200, closing_cash: null, expected_cash: 200, variance: null, notes: null,
        user: { id: 4, name: "Aisha" }, device: { id: 2, name: "Till 2" },
      }],
    });
    getShiftHistory.mockResolvedValue({
      shifts: [{
        id: 11, user_id: 5, device_id: 1, opened_at: "2026-10-01T04:00:00+00:00", closed_at: "2026-10-01T12:00:00+00:00",
        opening_cash: 100, closing_cash: 340, expected_cash: 350, variance: -10, notes: null,
        user: { id: 5, name: "Hassan" }, device: { id: 1, name: "Till 1" },
      }],
    });
    getShiftSummary.mockResolvedValue(emptySummary);

    render(<ShiftHistoryPanel onClose={vi.fn()} staffRole="owner" canViewAll />);

    await waitFor(() => expect(screen.getByTestId("shift-history-live")).toBeTruthy());
    expect(screen.getByTestId("shift-row-12").textContent).toMatch(/Aisha/);
    expect(screen.getByTestId("shift-row-12").textContent).toMatch(/Till 2/);
    expect(screen.getByTestId("shift-row-12").textContent).toMatch(/On shift/);
    expect(screen.getByTestId("shift-row-11").textContent).toMatch(/Hassan/);
    expect(screen.getByTestId("shift-row-11").textContent).toMatch(/−MVR 10\.00/);
    expect(screen.getByTestId("shift-history-filters")).toBeTruthy();
    expect(getShiftHistory).toHaveBeenCalledWith({});
  });

  it("does not call the live list or show filters for a cashier", async () => {
    getShiftHistory.mockResolvedValue({ shifts: [] });

    render(<ShiftHistoryPanel onClose={vi.fn()} staffRole="staff" />);

    await waitFor(() => expect(screen.getByText("No history yet")).toBeTruthy());
    expect(getLiveShifts).not.toHaveBeenCalled();
    expect(screen.queryByTestId("shift-history-filters")).toBeNull();
  });

  it("badges a force-closed shift as not counted instead of a perfect zero", async () => {
    getShiftHistory.mockResolvedValue({
      shifts: [{
        id: 3, user_id: 5, device_id: 1, opened_at: "2026-09-01T04:00:00+00:00", closed_at: "2026-09-07T12:54:00+00:00",
        opening_cash: 0, closing_cash: 120, expected_cash: 120, variance: 0, notes: "[Force closed by Ahmed]",
        force_closed_at: "2026-09-07T12:54:00+00:00", force_closer: { id: 1, name: "Ahmed" },
        user: { id: 5, name: "Hassan" },
      }],
    });
    getShiftSummary.mockResolvedValue(emptySummary);

    render(<ShiftHistoryPanel onClose={vi.fn()} staffRole="owner" canViewAll />);

    await waitFor(() => expect(screen.getByTestId("shift-history-forced")).toBeTruthy());
    expect(screen.getByTestId("shift-row-3").textContent).toMatch(/Force-closed/);
    expect(screen.getByTestId("shift-row-3").textContent).toMatch(/not counted/);
    expect(screen.getByTestId("shift-row-3").textContent).not.toMatch(/\+MVR 0\.00/);
    expect(screen.getByTestId("shift-history-forced").textContent).toMatch(/by Ahmed/);
    expect(screen.getByTestId("shift-history-variance").textContent).toMatch(/not counted/);
  });

  it("says no cash handled for a zero shift and drops the plus sign on zero", async () => {
    getShiftHistory.mockResolvedValue({
      shifts: [
        { id: 6, user_id: 5, device_id: 1, opened_at: "2026-09-30T17:15:00+00:00", closed_at: "2026-09-30T17:16:00+00:00", opening_cash: 0, closing_cash: 0, expected_cash: 0, variance: 0, notes: null },
        { id: 7, user_id: 5, device_id: 1, opened_at: "2026-09-29T04:00:00+00:00", closed_at: "2026-09-29T12:00:00+00:00", opening_cash: 100, closing_cash: 300, expected_cash: 300, variance: 0, notes: null },
      ],
    });
    getShiftSummary.mockResolvedValue(emptySummary);

    render(<ShiftHistoryPanel onClose={vi.fn()} staffRole="owner" canViewAll />);

    await waitFor(() => expect(screen.getByTestId("shift-history-variance")).toBeTruthy());
    expect(screen.getByTestId("shift-row-6").textContent).toMatch(/no cash/);
    expect(screen.getByTestId("shift-row-7").textContent).toMatch(/MVR 0\.00/);
    expect(screen.getByTestId("shift-row-7").textContent).not.toMatch(/\+MVR/);
    expect(screen.getByTestId("shift-history-variance").textContent).toMatch(/no cash handled/);
  });

  it("shows the opening float check in the detail", async () => {
    getShiftHistory.mockResolvedValue({
      shifts: [{
        id: 8, user_id: 5, device_id: 1, opened_at: "2026-09-29T04:00:00+00:00", closed_at: "2026-09-29T12:00:00+00:00",
        opening_cash: 440, closing_cash: 700, expected_cash: 700, variance: 0, notes: null,
        opening_float_expected: 500, opening_float_variance: -60,
      }],
    });
    getShiftSummary.mockResolvedValue(emptySummary);

    render(<ShiftHistoryPanel onClose={vi.fn()} staffRole="owner" canViewAll />);

    await waitFor(() => expect(screen.getByTestId("shift-history-float-check")).toBeTruthy());
    expect(screen.getByTestId("shift-history-float-check").textContent).toMatch(/Short MVR 60\.00 against the last close on this till \(MVR 500\.00\)/);
  });

  it("lets an owner force-close an open shift from the detail", async () => {
    const user = userEvent.setup();
    getLiveShifts.mockResolvedValue({
      shifts: [{
        id: 12, user_id: 4, device_id: 2, opened_at: "2026-10-02T04:15:00+00:00", closed_at: null,
        opening_cash: 200, closing_cash: null, expected_cash: 200, variance: null, notes: null,
        user: { id: 4, name: "Aisha" }, device: { id: 2, name: "Till 2" },
      }],
    });
    getShiftHistory.mockResolvedValue({ shifts: [] });
    getShiftSummary.mockResolvedValue(emptySummary);
    forceCloseShift.mockResolvedValue({ message: "ok" });
    const onShiftsChanged = vi.fn();

    render(<ShiftHistoryPanel onClose={vi.fn()} staffRole="owner" canViewAll onShiftsChanged={onShiftsChanged} />);

    await waitFor(() => expect(screen.getByTestId("shift-history-force-close")).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Force close this shift" }));
    await user.type(screen.getByLabelText("Force-close reason"), "Walked off");
    await user.click(screen.getByRole("button", { name: "Confirm force close" }));

    await waitFor(() => expect(forceCloseShift).toHaveBeenCalledWith(12, "Walked off"));
    await waitFor(() => expect(onShiftsChanged).toHaveBeenCalled());
  });

  it("applies the date and cashier filters to the history request", async () => {
    const user = userEvent.setup();
    getShiftHistory.mockResolvedValue({
      shifts: [{
        id: 11, user_id: 5, device_id: 1, opened_at: "2026-10-01T04:00:00+00:00", closed_at: "2026-10-01T12:00:00+00:00",
        opening_cash: 100, closing_cash: 340, expected_cash: 350, variance: -10, notes: null,
        user: { id: 5, name: "Hassan" },
      }],
    });
    getShiftSummary.mockResolvedValue(emptySummary);

    render(<ShiftHistoryPanel onClose={vi.fn()} staffRole="owner" canViewAll />);

    await waitFor(() => expect(screen.getByRole("option", { name: "Hassan" })).toBeTruthy());
    await user.selectOptions(screen.getByLabelText("Cashier"), "5");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => expect(getShiftHistory).toHaveBeenLastCalledWith({ user_id: 5 }));
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
