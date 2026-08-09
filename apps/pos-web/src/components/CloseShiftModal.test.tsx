import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CloseShiftModal } from "./CloseShiftModal";
import type { ShiftSummary } from "../hooks/useShift";

function summary(overrides: Partial<ShiftSummary["cash_drawer"]> = {}): ShiftSummary {
  return {
    cash_drawer: {
      opening_cash: 100,
      cash_sales: 250,
      paid_in: 0,
      paid_out: 0,
      cash_refunds: 0,
      credit_repayments_cash: 0,
      expected_cash: 350,
      ...overrides,
    },
    open_unpaid_orders: 0,
  } as ShiftSummary;
}

describe("CloseShiftModal denomination blind cash count", () => {
  it("starts with denomination entry and hides expected until a count is entered", () => {
    render(
      <CloseShiftModal
        summary={summary()}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByTestId("close-shift-denomination-grid")).toBeTruthy();
    expect(screen.queryByText("Expected in drawer")).toBeNull();
    expect(screen.queryByTestId("close-shift-variance")).toBeNull();
    expect(screen.queryByText(/\+ Cash sales/)).toBeNull();
    // Blind: expected 350 must not appear in rendered output yet.
    expect(document.body.textContent).not.toMatch(/350\.00/);
    expect(screen.getByTestId("close-shift-running-total").textContent).toContain("MVR 0.00");
  });

  it("reveals expected and variance after a denomination count is entered", async () => {
    const user = userEvent.setup();
    render(
      <CloseShiftModal
        summary={summary()}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    // 3×100 + 2×20 = 340 → variance −10
    await user.type(screen.getByTestId("denom-count-10000"), "3");
    await user.type(screen.getByTestId("denom-count-2000"), "2");

    expect(screen.getByText("Expected in drawer")).toBeTruthy();
    expect(screen.getByText("MVR 350.00")).toBeTruthy();
    const variance = screen.getByTestId("close-shift-variance");
    expect(variance.textContent).toContain("10.00");
    expect(screen.getByTestId("close-shift-running-total").textContent).toContain("MVR 340.00");
  });

  it("requires a variance note when the denomination total does not match expected", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <CloseShiftModal
        summary={summary()}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    await user.type(screen.getByTestId("denom-count-10000"), "3");
    await user.click(screen.getByRole("button", { name: "Close shift" }));

    expect(await screen.findByText(/reason for the cash variance/i)).toBeTruthy();
    expect(onConfirm).not.toHaveBeenCalled();

    await user.type(screen.getByPlaceholderText(/Short change/i), "Short change");
    await user.click(screen.getByRole("button", { name: "Close shift" }));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          closingCash: 300,
          notes: "Short change",
          cashCountMethod: "denominations",
          denominations: { "10000": 3 },
        }),
      );
    });
  });

  it("supports the plain-total fallback and records the method", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(
      <CloseShiftModal
        summary={summary()}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId("close-shift-method-toggle"));
    await user.click(screen.getByRole("button", { name: "Digit 3" }));
    await user.click(screen.getByRole("button", { name: "Digit 5" }));
    await user.click(screen.getByRole("button", { name: "Digit 0" }));
    await user.click(screen.getByRole("button", { name: "Close shift" }));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          closingCash: 350,
          cashCountMethod: "plain_total",
        }),
      );
    });
  });

  it("records foreign currency beside variance without changing the maths", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(
      <CloseShiftModal
        summary={summary()}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    await user.type(screen.getByTestId("denom-count-10000"), "3");
    await user.click(screen.getByTestId("close-shift-foreign-toggle"));
    await user.click(screen.getByRole("button", { name: /\+ Add foreign note/i }));
    await user.clear(screen.getByLabelText(/Foreign denomination 1/i));
    await user.type(screen.getByLabelText(/Foreign denomination 1/i), "50");
    await user.clear(screen.getByLabelText(/Accepted MVR 1/i));
    await user.type(screen.getByLabelText(/Accepted MVR 1/i), "770");

    expect(screen.getByTestId("close-shift-fx-beside-variance").textContent).toMatch(/Short MVR 50\.00/);
    expect(screen.getByTestId("close-shift-fx-beside-variance").textContent).toMatch(/USD 50 held/);

    await user.type(screen.getByPlaceholderText(/Short change/i), "USD in drawer");
    await user.click(screen.getByRole("button", { name: "Close shift" }));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          closingCash: 300,
          cashCountMethod: "denominations",
          foreignCurrency: [
            expect.objectContaining({
              currency: "USD",
              denomination: 50,
              count: 1,
              accepted_mvr: 770,
            }),
          ],
        }),
      );
    });
  });

  it("includes rare coins behind More coins and sums them in laari", async () => {
    const user = userEvent.setup();
    render(
      <CloseShiftModal
        summary={summary({ expected_cash: 0.01 })}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId("close-shift-more-coins"));
    await user.type(screen.getByTestId("denom-count-1"), "1");
    expect(screen.getByTestId("close-shift-running-total").textContent).toContain("MVR 0.01");
    expect(screen.getByTestId("close-shift-variance").textContent).toMatch(/0\.00/);
  });

  it("blocks closing while offline orders are unsynced", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <CloseShiftModal
        summary={summary()}
        pendingOfflineCount={2}
        pendingOfflineCashTotal={40}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText(/2 offline orders not synced/i)).toBeTruthy();

    await user.type(screen.getByTestId("denom-count-50000"), "1");
    await user.type(screen.getByPlaceholderText(/Short change|Found MVR/i), "x");
    await user.click(screen.getByRole("button", { name: "Close shift" }));

    expect(await screen.findByText(/Sync 2 offline orders before closing/i)).toBeTruthy();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
