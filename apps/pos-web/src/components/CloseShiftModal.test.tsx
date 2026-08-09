import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CloseShiftModal, type CountAttemptResult } from "./CloseShiftModal";
import type { ShiftSummary } from "../hooks/useShift";

function summary(overrides: Partial<Record<string, unknown>> = {}): ShiftSummary {
  return {
    cash_drawer: {
      opening_cash: 100,
      cash_sales: 250,
      paid_in: 0,
      paid_out: 0,
      cash_refunds: 0,
      credit_repayments_cash: 0,
      // expected_cash intentionally absent — the server omits it for cashiers.
    },
    open_unpaid_orders: 0,
    ...overrides,
  } as ShiftSummary;
}

/** Owner/manager-shaped review stub reconciling against expected MVR. */
function reviewAgainst(expected: number) {
  return vi.fn(async (payload: { closingCash: number }): Promise<CountAttemptResult> => {
    const variance = Math.round((payload.closingCash - expected) * 100) / 100;
    return {
      matches: Math.abs(Math.round(variance * 100)) < 1,
      counted_cash: payload.closingCash,
      expected_cash: expected,
      variance,
      attempt_number: 1,
    };
  });
}

describe("CloseShiftModal two-step blind close", () => {
  it("starts on the count screen with denomination entry and the count pad", () => {
    render(
      <CloseShiftModal
        summary={summary()}
        onReviewCount={reviewAgainst(350)}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByTestId("close-shift-sheet")).toBeTruthy();
    expect(screen.getByTestId("close-shift-denomination-grid")).toBeTruthy();
    expect(screen.getByTestId("close-shift-count-pad")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Review & close" })).toBeTruthy();
    expect(screen.queryByTestId("close-shift-review")).toBeNull();
    expect(screen.getByTestId("close-shift-running-total").textContent).toContain("MVR 0.00");
  });

  it("supports +/- steppers and shows per-note count and line total", async () => {
    const user = userEvent.setup();
    render(
      <CloseShiftModal
        summary={summary()}
        onReviewCount={reviewAgainst(350)}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByTestId("denom-line-10000").textContent).toMatch(/0 notes/);

    await user.click(screen.getByRole("button", { name: "Increase MVR 100" }));
    await user.click(screen.getByRole("button", { name: "Increase MVR 100" }));
    expect(screen.getByTestId("denom-count-10000").textContent).toBe("2");
    expect(screen.getByTestId("denom-line-10000").textContent).toMatch(/2 notes/);
    expect(screen.getByTestId("denom-line-10000").textContent).toMatch(/MVR 200\.00/);
    expect(screen.getByTestId("close-shift-running-total").textContent).toContain("MVR 200.00");

    await user.click(screen.getByRole("button", { name: "Decrease MVR 100" }));
    expect(screen.getByTestId("denom-count-10000").textContent).toBe("1");
  });

  it("enters counts from the desktop pad after selecting a denomination", async () => {
    const user = userEvent.setup();
    render(
      <CloseShiftModal
        summary={summary()}
        onReviewCount={reviewAgainst(350)}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId("denom-row-2000"));
    await user.click(screen.getByRole("button", { name: "Digit 1" }));
    await user.click(screen.getByRole("button", { name: "Digit 2" }));
    expect(screen.getByTestId("denom-count-2000").textContent).toBe("12");
    expect(screen.getByTestId("close-shift-pad-count").textContent).toMatch(/12/);
    expect(screen.getByTestId("close-shift-running-total").textContent).toContain("MVR 240.00");
  });

  it("press-and-hold on + auto-repeats the count", async () => {
    vi.useFakeTimers();
    try {
      render(
        <CloseShiftModal
          summary={summary()}
          onReviewCount={reviewAgainst(350)}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );

      const plus = screen.getByRole("button", { name: "Increase MVR 100" });
      fireEvent.pointerDown(plus); // immediate single step
      expect(screen.getByTestId("denom-count-10000").textContent).toBe("1");

      // Hold: repeat starts after 450ms, then every 110ms.
      act(() => { vi.advanceTimersByTime(450 + 110 * 4); });
      const held = Number(screen.getByTestId("denom-count-10000").textContent);
      expect(held).toBeGreaterThanOrEqual(4);

      fireEvent.pointerUp(plus);
      fireEvent.click(plus); // trailing click after a press must not double-step
      act(() => { vi.advanceTimersByTime(1000); });
      expect(Number(screen.getByTestId("denom-count-10000").textContent)).toBe(held);
    } finally {
      vi.useRealTimers();
    }
  });

  it("review with a matching count shows the balanced message and no reason box", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(
      <CloseShiftModal
        summary={summary()}
        onReviewCount={reviewAgainst(300)}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId("denom-row-10000"));
    await user.click(screen.getByRole("button", { name: "Digit 3" }));
    await user.click(screen.getByRole("button", { name: "Review & close" }));

    expect(await screen.findByTestId("close-shift-review-balanced")).toBeTruthy();
    expect(screen.getByText(/Balanced — the cash matches\./)).toBeTruthy();
    expect(screen.queryByPlaceholderText(/Short change/i)).toBeNull();
    expect(screen.getByRole("button", { name: "Back to count" })).toBeTruthy();

    await user.click(screen.getByTestId("close-shift-confirm-btn"));
    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          closingCash: 300,
          cashCountMethod: "denominations",
          denominations: { "10000": 3 },
          notes: undefined,
        }),
      );
    });
  });

  it("review with a difference shows the plain mismatch wording and blocks closing until a reason is typed", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(
      <CloseShiftModal
        summary={summary()}
        onReviewCount={reviewAgainst(350)}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId("denom-row-10000"));
    await user.click(screen.getByRole("button", { name: "Digit 3" }));
    await user.click(screen.getByRole("button", { name: "Review & close" }));

    const popup = await screen.findByTestId("close-shift-review");
    expect(popup.textContent).toMatch(/The cash does not match/);
    // Round 3: never any cash figure in the popup, whatever the server sent.
    expect(popup.textContent).not.toMatch(/MVR/);

    await user.click(screen.getByTestId("close-shift-confirm-btn"));
    expect(await screen.findByText(/reason for the cash variance/i)).toBeTruthy();
    expect(onConfirm).not.toHaveBeenCalled();

    await user.type(screen.getByPlaceholderText(/Short change/i), "Short change at lunch");
    await user.click(screen.getByTestId("close-shift-confirm-btn"));
    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          closingCash: 300,
          notes: "Short change at lunch",
        }),
      );
    });
  });

  it("count again preserves the entered numbers and records a second attempt", async () => {
    const user = userEvent.setup();
    let attempt = 0;
    const onReviewCount = vi.fn(async (payload: { closingCash: number }): Promise<CountAttemptResult> => {
      attempt += 1;
      const variance = Math.round((payload.closingCash - 350) * 100) / 100;
      return {
        matches: Math.abs(Math.round(variance * 100)) < 1,
        counted_cash: payload.closingCash,
        expected_cash: 350,
        variance,
        attempt_number: attempt,
      };
    });
    render(
      <CloseShiftModal
        summary={summary()}
        onReviewCount={onReviewCount}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId("denom-row-10000"));
    await user.click(screen.getByRole("button", { name: "Digit 3" }));
    await user.click(screen.getByRole("button", { name: "Review & close" }));
    await screen.findByTestId("close-shift-review-mismatch");

    await user.click(screen.getByTestId("close-shift-count-again"));

    // Every entered number survives the round trip.
    expect(screen.getByTestId("denom-count-10000").textContent).toBe("3");
    expect(screen.getByTestId("close-shift-running-total").textContent).toContain("MVR 300.00");
    // The recount is not hidden.
    expect(screen.getByTestId("close-shift-recount-note").textContent).toMatch(/counted this drawer 2 times/i);

    await user.click(screen.getByTestId("denom-row-5000"));
    await user.click(screen.getByRole("button", { name: "Digit 1" }));
    await user.click(screen.getByRole("button", { name: "Review & close" }));
    await screen.findByTestId("close-shift-review-balanced");

    expect(onReviewCount).toHaveBeenCalledTimes(2);
    expect(onReviewCount).toHaveBeenLastCalledWith(
      expect.objectContaining({ closingCash: 350, denominations: { "10000": 3, "5000": 1 } }),
    );
  });

  it("Enter total instead shows the counted amount once — no duplicate readout", async () => {
    const user = userEvent.setup();
    render(
      <CloseShiftModal
        summary={summary()}
        onReviewCount={reviewAgainst(350)}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId("close-shift-method-toggle"));
    // The big input IS the counted amount — the footer readout must not
    // duplicate it.
    expect(screen.queryByTestId("close-shift-running-total")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Digit 3" }));
    await user.click(screen.getByRole("button", { name: "Digit 5" }));
    await user.click(screen.getByRole("button", { name: "Digit 0" }));
    expect(screen.queryByTestId("close-shift-running-total")).toBeNull();

    // Back on the denomination view the readout returns.
    await user.click(screen.getByTestId("close-shift-method-toggle"));
    expect(screen.getByTestId("close-shift-running-total")).toBeTruthy();
  });

  it("plain-total fallback goes through the same review step", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(
      <CloseShiftModal
        summary={summary()}
        onReviewCount={reviewAgainst(350)}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId("close-shift-method-toggle"));
    await user.click(screen.getByRole("button", { name: "Digit 3" }));
    await user.click(screen.getByRole("button", { name: "Digit 5" }));
    await user.click(screen.getByRole("button", { name: "Digit 0" }));
    await user.click(screen.getByRole("button", { name: "Review & close" }));

    expect(await screen.findByTestId("close-shift-review-balanced")).toBeTruthy();
    await user.click(screen.getByTestId("close-shift-confirm-btn"));
    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          closingCash: 350,
          cashCountMethod: "plain_total",
        }),
      );
    });
  });

  it("foreign currency is record-only: it never changes the counted total", async () => {
    const user = userEvent.setup();
    const onReviewCount = reviewAgainst(300);
    render(
      <CloseShiftModal
        summary={summary()}
        onReviewCount={onReviewCount}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId("denom-row-10000"));
    await user.click(screen.getByRole("button", { name: "Digit 3" }));
    await user.click(screen.getByTestId("close-shift-foreign-toggle"));
    await user.click(screen.getByRole("button", { name: /\+ Add foreign note/i }));
    await user.type(screen.getByLabelText(/Foreign denomination 1/i), "50");
    await user.type(screen.getByLabelText(/Accepted MVR 1/i), "770");

    // Counted stays the MVR count only.
    expect(screen.getByTestId("close-shift-running-total").textContent).toContain("MVR 300.00");

    await user.click(screen.getByRole("button", { name: "Review & close" }));
    await screen.findByTestId("close-shift-review");
    expect(onReviewCount).toHaveBeenCalledWith(
      expect.objectContaining({
        closingCash: 300,
        foreignCurrency: [
          expect.objectContaining({ currency: "USD", denomination: 50, count: 1, accepted_mvr: 770 }),
        ],
      }),
    );
  });

  it("includes rare coins behind More coins and sums them in laari", async () => {
    const user = userEvent.setup();
    render(
      <CloseShiftModal
        summary={summary()}
        onReviewCount={reviewAgainst(0.01)}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId("close-shift-more-coins"));
    await user.click(screen.getByTestId("denom-row-1"));
    await user.click(screen.getByRole("button", { name: "Digit 1" }));
    expect(screen.getByTestId("close-shift-running-total").textContent).toContain("MVR 0.01");
  });

  it("blocks the review while offline orders are unsynced", async () => {
    const user = userEvent.setup();
    const onReviewCount = vi.fn();
    render(
      <CloseShiftModal
        summary={summary()}
        pendingOfflineCount={2}
        pendingOfflineCashTotal={40}
        onReviewCount={onReviewCount}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText(/2 offline orders not synced/i)).toBeTruthy();

    await user.click(screen.getByTestId("denom-row-50000"));
    await user.click(screen.getByRole("button", { name: "Digit 1" }));
    await user.click(screen.getByRole("button", { name: "Review & close" }));

    expect(await screen.findByText(/Sync 2 offline orders before closing/i)).toBeTruthy();
    expect(onReviewCount).not.toHaveBeenCalled();
    expect(screen.queryByTestId("close-shift-review")).toBeNull();
  });

  it("blocks the review when no count has been entered", async () => {
    const user = userEvent.setup();
    const onReviewCount = vi.fn();
    render(
      <CloseShiftModal
        summary={summary()}
        onReviewCount={onReviewCount}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Review & close" }));
    expect(await screen.findByText(/Enter the count for each denomination/i)).toBeTruthy();
    expect(onReviewCount).not.toHaveBeenCalled();
  });
});
