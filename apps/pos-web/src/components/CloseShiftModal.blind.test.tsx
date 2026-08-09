import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CloseShiftModal } from "./CloseShiftModal";
import type { ShiftSummary } from "../hooks/useShift";

/**
 * The blind count must be blind: nothing on the COUNT screen may reveal the
 * expected drawer total or the variance — with a count entered or without.
 * (Expected = 350 in this fixture; the string "350.00" must never render.)
 */

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
    open_unpaid_orders: 0,
  } as ShiftSummary;
}

function renderModal() {
  return render(
    <CloseShiftModal
      summary={summary()}
      onConfirm={vi.fn()}
      onCancel={vi.fn()}
      onReviewCount={vi.fn().mockResolvedValue({
        counted_cash: 200,
        expected_cash: 350,
        variance: -150,
        attempt_number: 1,
      })}
    />,
  );
}

describe("CloseShiftModal blind count screen", () => {
  it("shows no expected cash or variance before any count is entered", () => {
    renderModal();

    expect(document.body.textContent).not.toMatch(/350\.00/);
    expect(document.body.textContent).not.toMatch(/expected/i);
    expect(screen.queryByTestId("close-shift-variance")).toBeNull();
    expect(screen.queryByPlaceholderText(/Short change/i)).toBeNull();
  });

  it("shows no expected cash or variance after a count is entered", async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole("button", { name: "Increase MVR 100" }));
    await user.click(screen.getByRole("button", { name: "Increase MVR 100" }));

    expect(screen.getByTestId("close-shift-running-total").textContent).toContain("MVR 200.00");
    // Blind: the expected total (350) and any variance hint must NOT render.
    expect(document.body.textContent).not.toMatch(/350\.00/);
    expect(document.body.textContent).not.toMatch(/expected/i);
    expect(document.body.textContent).not.toMatch(/short|over|balanced/i);
    expect(screen.queryByTestId("close-shift-variance")).toBeNull();
    expect(screen.queryByPlaceholderText(/Short change/i)).toBeNull();
  });
});
