/**
 * The Discounts & rewards bar above the totals. Owner, 2026-09-02: the
 * discount block and the rewards drawer folded into one closed bar.
 *
 *   - closed, it says what is applied, or that nothing is
 *   - it opens on a tap and shows what it was given
 *   - a field error opens it by itself, so the alert is never hidden
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TicketAdjustments } from "./TicketAdjustments";

describe("TicketAdjustments", () => {
  it("says nothing is applied, and opens on a tap", () => {
    render(
      <TicketAdjustments summary={[]}>
        <div data-testid="inner">fields</div>
      </TicketAdjustments>,
    );

    expect(screen.getByTestId("ticket-adjustments-summary")).toHaveTextContent("None — tap to add");
    expect(screen.queryByTestId("inner")).toBeNull();

    fireEvent.click(screen.getByTestId("ticket-adjustments-toggle"));
    expect(screen.getByTestId("inner")).toBeInTheDocument();
    expect(screen.getByTestId("ticket-adjustments-toggle")).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(screen.getByTestId("ticket-adjustments-toggle"));
    expect(screen.queryByTestId("inner")).toBeNull();
  });

  it("lists what is on the ticket while closed", () => {
    render(
      <TicketAdjustments summary={["Discount MVR 15.00", "Gift card MVR 50.00"]}>
        <div />
      </TicketAdjustments>,
    );
    expect(screen.getByTestId("ticket-adjustments-summary")).toHaveTextContent("Discount MVR 15.00 · Gift card MVR 50.00");
  });

  it("opens by itself when a field has an error to show", () => {
    const { rerender } = render(
      <TicketAdjustments summary={[]}><div data-testid="inner" /></TicketAdjustments>,
    );
    expect(screen.queryByTestId("inner")).toBeNull();

    rerender(<TicketAdjustments summary={[]} forceOpen><div data-testid="inner" /></TicketAdjustments>);
    expect(screen.getByTestId("inner")).toBeInTheDocument();
  });
});
