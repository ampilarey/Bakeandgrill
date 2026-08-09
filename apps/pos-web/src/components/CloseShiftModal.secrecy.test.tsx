import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CloseShiftModal, type CountAttemptResult } from "./CloseShiftModal";
import type { ShiftSummary } from "../hooks/useShift";

/**
 * Round 2 of the blind count:
 * - A cashier's review response carries only {matches, attempt_number}; the
 *   mismatch popup must show NO expected total, NO variance amount, and not
 *   even the direction (over/short). Only their own counted total is theirs.
 * - MVR 1000 is rare → lives behind "More notes & coins" with the rare
 *   coins, and a count there is never silently dropped.
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
    },
    open_unpaid_orders: 0,
  } as ShiftSummary;
}

function renderModal(onReviewCount: (payload: unknown) => Promise<CountAttemptResult>, onConfirm = vi.fn()) {
  return render(
    <CloseShiftModal
      summary={summary()}
      onReviewCount={onReviewCount as never}
      onConfirm={onConfirm}
      onCancel={vi.fn()}
    />,
  );
}

describe("CloseShiftModal cashier secrecy (review popup)", () => {
  it("mismatch popup shows no expected, no variance, no over/short — only plain words", async () => {
    const user = userEvent.setup();
    // Cashier-shaped response: the server withheld every number.
    const onReviewCount = vi.fn().mockResolvedValue({ matches: false, attempt_number: 1 });
    renderModal(onReviewCount);

    await user.click(screen.getByTestId("denom-row-10000"));
    await user.click(screen.getByRole("button", { name: "Digit 3" }));
    await user.click(screen.getByRole("button", { name: "Review & close" }));

    const popup = await screen.findByTestId("close-shift-review");
    expect(popup.textContent).toMatch(/The cash does not match/);
    expect(popup.textContent).toMatch(/different from what the drawer should hold/i);
    expect(popup.textContent).toMatch(/write what happened/i);
    // No digits other than nothing at all: no expected (350), no variance
    // (50), no counted echo, no over/short direction.
    expect(popup.textContent).not.toMatch(/\d/);
    expect(popup.textContent).not.toMatch(/expected/i);
    expect(popup.textContent).not.toMatch(/over|short/i);
    // Reason still required.
    expect(screen.getByPlaceholderText(/Short change/i)).toBeTruthy();
  });

  it("mismatch popup still requires a reason before closing", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    renderModal(vi.fn().mockResolvedValue({ matches: false, attempt_number: 1 }), onConfirm);

    await user.click(screen.getByTestId("denom-row-10000"));
    await user.click(screen.getByRole("button", { name: "Digit 3" }));
    await user.click(screen.getByRole("button", { name: "Review & close" }));
    await screen.findByTestId("close-shift-review");

    await user.click(screen.getByTestId("close-shift-confirm-btn"));
    expect(await screen.findByText(/reason for the cash variance/i)).toBeTruthy();
    expect(onConfirm).not.toHaveBeenCalled();

    await user.type(screen.getByPlaceholderText(/Short change/i), "Drawer bumped");
    await user.click(screen.getByTestId("close-shift-confirm-btn"));
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ notes: "Drawer bumped" }));
  });

  it("match popup shows the cashier's own counted total and no reason box", async () => {
    const user = userEvent.setup();
    renderModal(vi.fn().mockResolvedValue({ matches: true, attempt_number: 1 }));

    await user.click(screen.getByTestId("denom-row-10000"));
    await user.click(screen.getByRole("button", { name: "Digit 3" }));
    await user.click(screen.getByRole("button", { name: "Review & close" }));

    const popup = await screen.findByTestId("close-shift-review");
    expect(popup.textContent).toMatch(/Balanced — you counted MVR 300\.00 and that matches the drawer/);
    expect(screen.queryByPlaceholderText(/Short change/i)).toBeNull();
  });

  it("owner-shaped response (with numbers) still shows the full breakdown", async () => {
    const user = userEvent.setup();
    renderModal(vi.fn().mockResolvedValue({
      matches: false,
      attempt_number: 1,
      counted_cash: 300,
      expected_cash: 350,
      variance: -50,
    }));

    await user.click(screen.getByTestId("denom-row-10000"));
    await user.click(screen.getByRole("button", { name: "Digit 3" }));
    await user.click(screen.getByRole("button", { name: "Review & close" }));

    const popup = await screen.findByTestId("close-shift-review");
    expect(popup.textContent).toMatch(/Short MVR 50\.00/);
    expect(screen.getByTestId("close-shift-review-counted").textContent).toContain("MVR 300.00");
    expect(screen.getByTestId("close-shift-review-expected").textContent).toContain("MVR 350.00");
  });
});

describe("CloseShiftModal MVR 1000 behind More notes & coins", () => {
  it("does not show MVR 1000 in the default list; it lives inside More", async () => {
    const user = userEvent.setup();
    renderModal(vi.fn());

    expect(screen.queryByTestId("denom-row-100000")).toBeNull();
    expect(screen.getByTestId("denom-row-50000")).toBeTruthy(); // MVR 500 stays default

    await user.click(screen.getByTestId("close-shift-more-coins"));
    expect(screen.getByTestId("denom-row-100000")).toBeTruthy();
    expect(screen.getByTestId("denom-row-1")).toBeTruthy(); // rare coin beside it
  });

  it("a count against MVR 1000 keeps More open and is included in the total", async () => {
    const user = userEvent.setup();
    renderModal(vi.fn());

    await user.click(screen.getByTestId("close-shift-more-coins"));
    await user.click(screen.getByTestId("denom-row-100000"));
    await user.click(screen.getByRole("button", { name: "Digit 2" }));

    expect(screen.getByTestId("close-shift-running-total").textContent).toContain("MVR 2000.00");
    // The section cannot be collapsed away while it holds a count.
    expect(screen.queryByTestId("close-shift-more-coins")).toBeNull();
    expect(screen.getByTestId("denom-row-100000")).toBeTruthy();
  });

  it("a rare-coin count also keeps More open and counts", async () => {
    const user = userEvent.setup();
    renderModal(vi.fn());

    await user.click(screen.getByTestId("close-shift-more-coins"));
    await user.click(screen.getByTestId("denom-row-1"));
    await user.click(screen.getByRole("button", { name: "Digit 5" }));

    expect(screen.getByTestId("close-shift-running-total").textContent).toContain("MVR 0.05");
    expect(screen.queryByTestId("close-shift-more-coins")).toBeNull();
    expect(screen.getByTestId("denom-row-1")).toBeTruthy();
  });
});
