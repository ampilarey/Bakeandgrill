/**
 * The Discounts & rewards bar above the totals. Owner, 2026-09-02: the
 * discount block and the rewards drawer folded into one closed bar.
 *
 *   - closed, it says what is applied, or that nothing is
 *   - it opens on a tap and shows what it was given
 *   - a field error opens it by itself, so the alert is never hidden
 *   - given `open`, the caller owns the state (its button is in the cart
 *     header) and the drawer takes no room while closed
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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

  /** Owner, 2026-09-03: the toggle moved to the header row beside Save. */
  it("hands its open state over, and takes no room while closed", () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <TicketAdjustments summary={["Discount MVR 15.00"]} open={false} onOpenChange={onOpenChange}>
        <div data-testid="inner" />
      </TicketAdjustments>,
    );
    // Nothing at all — not even the bar that used to say what is applied.
    expect(screen.queryByTestId("ticket-adjustments")).toBeNull();

    rerender(
      <TicketAdjustments summary={["Discount MVR 15.00"]} open onOpenChange={onOpenChange}>
        <div data-testid="inner" />
      </TicketAdjustments>,
    );
    expect(screen.getByTestId("inner")).toBeInTheDocument();
    expect(screen.getByTestId("ticket-adjustments-summary")).toHaveTextContent("Discount MVR 15.00");

    // The bar at the top of the open drawer closes it through the caller.
    fireEvent.click(screen.getByTestId("ticket-adjustments-toggle"));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it("asks the caller to open it when a field has an error", () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <TicketAdjustments summary={[]} open={false} onOpenChange={onOpenChange}><div /></TicketAdjustments>,
    );
    rerender(
      <TicketAdjustments summary={[]} forceOpen open={false} onOpenChange={onOpenChange}><div /></TicketAdjustments>,
    );
    expect(onOpenChange).toHaveBeenCalledWith(true);
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
