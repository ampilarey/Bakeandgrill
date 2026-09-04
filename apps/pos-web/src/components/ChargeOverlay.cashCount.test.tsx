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
    // The dim button is the whole prompt — a line of text explaining it was
    // tried and removed at the owner's request, so nothing else says so.
    renderCharge();

    expect(confirmButton()).toBeDisabled();
  });

  it("unlocks on EXACT and takes the full total", async () => {
    const user = userEvent.setup();
    const onConfirm = renderCharge();

    await user.click(screen.getByTestId("charge-quick-exact"));

    expect(confirmButton()).not.toBeDisabled();

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

    await user.click(confirmButton());
    expect(onConfirm).toHaveBeenCalledWith([{ method: "card", amount: 120 }]);
  });

  it("keeps the count when the cashier comes straight back to cash", async () => {
    /*
     * This used to assert the opposite — a switch away from cash and back
     * cleared the count and locked Confirm again, so that "a count entered for
     * one tender would [not] carry into another".
     *
     * Changed deliberately on 2026-09-04, and it is worth saying why, because
     * it softens a rule the owner asked for on 2026-09-01.
     *
     * The gate exists because Received used to arrive pre-filled with the
     * order total, so a card sale could be rung as cash without anyone saying
     * what came in. That is untouched: nothing pre-fills, and Confirm still
     * opens only on a deliberate EXACT / note / typed amount.
     *
     * What changed is the cost of a stray tap. The phone POS has been landing
     * taps a row high for a week — owner: "when i click upper row note
     * transfer or credit is deleted" — and clearing on every tender change
     * meant one wrong tap threw away a count that was made seconds earlier,
     * for this same sale, with a queue waiting. The count belongs to the sale,
     * not to the tender: it survives a switch, and it is still cleared the
     * moment the total changes (see ChargeOverlay.tenderFlip.test.tsx).
     */
    const user = userEvent.setup();
    renderCharge();

    await user.click(screen.getByTestId("charge-quick-exact"));
    expect(confirmButton()).not.toBeDisabled();

    await user.click(screen.getByRole("button", { name: /^Card$/i }));
    await user.click(screen.getByRole("button", { name: /^Cash$/i }));

    expect(confirmButton()).not.toBeDisabled();
  });
});
