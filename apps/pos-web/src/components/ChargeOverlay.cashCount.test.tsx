import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChargeOverlay } from "./ChargeOverlay";

/**
 * Cash has to be counted before it can be taken.
 *
 * Cash is the preselected tender and Received used to arrive pre-filled with
 * the order total, so Charge → Confirm went through on two taps with nobody
 * saying what came in. A card sale recorded as cash costs nothing to make and
 * shows up first as a drawer over at close. Owner, 2026-09-01: "before confirm
 * payment cashier at least must click exact amount in quick amount or enter
 * amount manually".
 */
function renderCharge(onConfirm = vi.fn(async () => undefined)) {
  render(
    <ChargeOverlay
      total={120}
      submitting={false}
      onClose={() => undefined}
      onConfirm={onConfirm}
    />,
  );

  return onConfirm;
}

const confirmButton = () => screen.getByRole("button", { name: /confirm payment/i });

describe("ChargeOverlay — cash must be counted", () => {
  it("opens with nothing entered and Confirm locked", () => {
    renderCharge();

    expect(confirmButton()).toBeDisabled();
    expect(screen.getByTestId("charge-needs-count")).toBeInTheDocument();
  });

  it("says what to do rather than leaving a dead button", () => {
    // A greyed Confirm with no reason is how a cashier gets stuck mid-queue.
    renderCharge();

    expect(screen.getByTestId("charge-needs-count").textContent)
      .toMatch(/Enter how much cash you took/i);
  });

  it("unlocks on EXACT and takes the full total", async () => {
    const user = userEvent.setup();
    const onConfirm = renderCharge();

    await user.click(screen.getByTestId("charge-quick-exact"));

    expect(confirmButton()).not.toBeDisabled();
    expect(screen.queryByTestId("charge-needs-count")).toBeNull();

    await user.click(confirmButton());
    expect(onConfirm).toHaveBeenCalledWith([{ method: "cash", amount: 120 }]);
  });

  it("still records the tendered amount when a bigger note is used", async () => {
    // Overpay has to survive the gate — change due depends on it.
    const user = userEvent.setup();
    const onConfirm = renderCharge();

    await user.click(screen.getByTestId("charge-quick-note-500"));
    await user.click(confirmButton());

    expect(onConfirm).toHaveBeenCalledWith([
      { method: "cash", amount: 120, tendered_amount: 500 },
    ]);
  });

  it("leaves card alone — there is no cash to count", async () => {
    // The gate is about cash. Making a card sale ask for an amount would push
    // cashiers back towards the tender that does not.
    const user = userEvent.setup();
    const onConfirm = renderCharge();

    await user.click(screen.getByRole("button", { name: /^Card$/i }));

    expect(confirmButton()).not.toBeDisabled();
    expect(screen.queryByTestId("charge-needs-count")).toBeNull();

    await user.click(confirmButton());
    expect(onConfirm).toHaveBeenCalledWith([{ method: "card", amount: 120 }]);
  });

  it("asks again when the cashier switches back to cash", async () => {
    // Otherwise a count entered for one tender would carry into another.
    const user = userEvent.setup();
    renderCharge();

    await user.click(screen.getByTestId("charge-quick-exact"));
    expect(confirmButton()).not.toBeDisabled();

    await user.click(screen.getByRole("button", { name: /^Card$/i }));
    await user.click(screen.getByRole("button", { name: /^Cash$/i }));

    expect(confirmButton()).toBeDisabled();
    expect(screen.getByTestId("charge-needs-count")).toBeInTheDocument();
  });
});
