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

describe("CloseShiftModal blind cash count", () => {
  it("starts with an empty counted-cash field and hides expected until a count is entered", () => {
    render(
      <CloseShiftModal
        summary={summary()}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const input = screen.getByLabelText("Amount in MVR");
    expect(input).toHaveValue("");
    expect(screen.queryByText("Expected in drawer")).toBeNull();
    expect(screen.queryByText(/MVR 350\.00/)).toBeNull();
    expect(screen.queryByTestId("close-shift-variance")).toBeNull();
    expect(screen.queryByText(/\+ Cash sales/)).toBeNull();
    expect(document.body.textContent).not.toMatch(/350\.00/);
  });

  it("reveals expected and variance after a count is entered", async () => {
    const user = userEvent.setup();
    render(
      <CloseShiftModal
        summary={summary()}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    // Type 340 via keypad → variance −10.00
    await user.click(screen.getByRole("button", { name: "Digit 3" }));
    await user.click(screen.getByRole("button", { name: "Digit 4" }));
    await user.click(screen.getByRole("button", { name: "Digit 0" }));

    expect(screen.getByText("Expected in drawer")).toBeTruthy();
    expect(screen.getByText("MVR 350.00")).toBeTruthy();
    const variance = screen.getByTestId("close-shift-variance");
    expect(variance.textContent).toMatch(/−?MVR -?10\.00|MVR -10\.00/);
    expect(variance.textContent).toContain("10.00");
  });

  it("requires a variance note when the count does not match expected", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <CloseShiftModal
        summary={summary()}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Digit 3" }));
    await user.click(screen.getByRole("button", { name: "Digit 0" }));
    await user.click(screen.getByRole("button", { name: "Digit 0" }));
    await user.click(screen.getByRole("button", { name: "Close shift" }));

    expect(await screen.findByText(/reason for the cash variance/i)).toBeTruthy();
    expect(onConfirm).not.toHaveBeenCalled();

    await user.type(screen.getByPlaceholderText(/Short change/i), "Short change");
    await user.click(screen.getByRole("button", { name: "Close shift" }));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith(300, "Short change");
    });
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

    await user.click(screen.getByRole("button", { name: "Digit 3" }));
    await user.click(screen.getByRole("button", { name: "Digit 5" }));
    await user.click(screen.getByRole("button", { name: "Digit 0" }));
    await user.click(screen.getByRole("button", { name: "Close shift" }));

    expect(await screen.findByText(/Sync 2 offline orders before closing/i)).toBeTruthy();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
