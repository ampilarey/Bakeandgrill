import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChargeOverlay } from "./ChargeOverlay";

/**
 * Tapping Credit must select Credit.
 *
 * Owner, 2026-09-04: "now its ok. But now credit button not working."
 *
 * Self-inflicted. Chasing the freeze I added a guard that put the cashier back
 * on cash whenever the tender was Credit and `creditEligible` was false — the
 * idea being that a failed credit lookup should not strand them on a tender
 * they cannot use. But eligibility is not known at the moment of the tap: the
 * button sets the tender AND fires the summary fetch, so for that first render
 * `creditEligible` is still false and the guard bounced it straight back. The
 * button looked dead.
 *
 * The guard was written for a freeze that turned out to be uncached note
 * photos, so it was never needed. These hold the button to its job.
 */
describe("Charge — the Credit tender", () => {
  const base = {
    total: 120,
    submitting: false,
    onClose: () => undefined,
    allowedTenders: { cash: true, card: true, qr: true, digital_wallet: true, split: true },
  };

  const creditButton = () =>
    Array.from(document.querySelectorAll("button")).find((b) => /Credit/i.test(b.textContent ?? ""))!;

  it("stays on Credit when eligibility has not come back yet", () => {
    render(
      <ChargeOverlay
        {...base}
        onConfirm={vi.fn(async () => undefined)}
        canPayCredit
        creditEligible={false}
        hasAttachedCustomer
        onSelectCredit={() => {}}
      />,
    );

    const credit = creditButton();
    expect(credit, "the Credit tender should be on screen").toBeTruthy();

    fireEvent.click(credit);

    // Cash quick-tenders disappear once the tender is no longer cash, so their
    // absence is how we know Credit actually took.
    expect(
      screen.queryByTestId("charge-quick-note-50"),
      "bounced back to cash — the Credit tap did nothing",
    ).toBeNull();
  });

  it("asks the parent for a fresh credit summary on the tap", () => {
    const onSelectCredit = vi.fn();
    render(
      <ChargeOverlay
        {...base}
        onConfirm={vi.fn(async () => undefined)}
        canPayCredit
        creditEligible
        creditAvailableMvr={500}
        hasAttachedCustomer
        onSelectCredit={onSelectCredit}
      />,
    );

    fireEvent.click(creditButton());
    expect(onSelectCredit).toHaveBeenCalledOnce();
  });

  it("stays on Credit once eligibility arrives", () => {
    const { rerender } = render(
      <ChargeOverlay
        {...base}
        onConfirm={vi.fn(async () => undefined)}
        canPayCredit
        creditEligible={false}
        hasAttachedCustomer
        onSelectCredit={() => {}}
      />,
    );

    fireEvent.click(creditButton());

    // The summary lands a moment later and says yes.
    rerender(
      <ChargeOverlay
        {...base}
        onConfirm={vi.fn(async () => undefined)}
        canPayCredit
        creditEligible
        creditAvailableMvr={500}
        hasAttachedCustomer
        onSelectCredit={() => {}}
      />,
    );

    expect(screen.queryByTestId("charge-quick-note-50")).toBeNull();
  });
});
