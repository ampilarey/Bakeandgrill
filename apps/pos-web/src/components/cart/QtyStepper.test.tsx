/**
 * The quantity pill on a ticket line. Owner, 2026-09-02: the old −/+ were
 * "small and difficult to use". What has to stay true:
 *
 *   - a tap steps by one, and the pill swallows its own clicks so the row
 *     underneath (which also adds one) does not step twice
 *   - holding a button repeats after half a second
 *   - a hold on − stops at 1; only a tap takes the line off the ticket
 *   - a resumed ticket is read-only
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QtyStepper } from "./QtyStepper";

function renderPill(quantity: number, over: Partial<React.ComponentProps<typeof QtyStepper>> = {}) {
  const onDelta = vi.fn();
  const onRow = vi.fn();
  render(
    <div onClick={onRow}>
      <QtyStepper quantity={quantity} onDelta={onDelta} itemName="Masroshi" {...over} />
    </div>,
  );
  return { onDelta, onRow };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("QtyStepper", () => {
  it("steps by one on a tap and keeps the click from the row", () => {
    const { onDelta, onRow } = renderPill(2);

    fireEvent.click(screen.getByRole("button", { name: "Increase quantity Masroshi" }));
    fireEvent.click(screen.getByRole("button", { name: "Decrease quantity Masroshi" }));

    expect(onDelta.mock.calls).toEqual([[1], [-1]]);
    expect(onRow).not.toHaveBeenCalled();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("repeats while held, and the release click is not another step", () => {
    const { onDelta } = renderPill(2);
    const plus = screen.getByRole("button", { name: "Increase quantity Masroshi" });

    fireEvent.pointerDown(plus, { button: 0, pointerType: "touch" });
    vi.advanceTimersByTime(499);
    expect(onDelta).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onDelta).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(140 * 3);
    expect(onDelta).toHaveBeenCalledTimes(4);

    fireEvent.pointerUp(plus);
    fireEvent.click(plus);
    vi.advanceTimersByTime(1000);
    expect(onDelta).toHaveBeenCalledTimes(4);
  });

  it("holding − walks down to 1 and no further", () => {
    const { onDelta } = renderPill(1);
    const minus = screen.getByRole("button", { name: "Decrease quantity Masroshi" });

    fireEvent.pointerDown(minus, { button: 0, pointerType: "touch" });
    vi.advanceTimersByTime(2000);
    expect(onDelta).not.toHaveBeenCalled();

    // Letting go of the hold is not a tap either. A fresh tap is what
    // takes the line off the ticket.
    fireEvent.pointerUp(minus);
    fireEvent.click(minus);
    expect(onDelta).not.toHaveBeenCalled();

    fireEvent.pointerDown(minus, { button: 0, pointerType: "touch" });
    fireEvent.pointerUp(minus);
    fireEvent.click(minus);
    expect(onDelta).toHaveBeenCalledWith(-1);
    expect(minus).toHaveAttribute("title", "Remove from ticket");
    // At 1 the − end turns red, since the next tap takes the line off.
    expect(minus).toHaveStyle({ background: "#FEE2E2" });
  });

  it("− is quiet grey above 1 and + is always the brand orange", () => {
    renderPill(3);
    expect(screen.getByRole("button", { name: "Decrease quantity Masroshi" })).toHaveStyle({ background: "#FFFFFF" });
    expect(screen.getByRole("button", { name: "Increase quantity Masroshi" })).toHaveStyle({ background: "#D4813A" });
  });

  it("does nothing on a resumed ticket", () => {
    const { onDelta } = renderPill(2, { disabled: true, disabledTitle: "Cancel resume to edit items" });
    const plus = screen.getByRole("button", { name: "Increase quantity Masroshi" });

    expect(plus).toBeDisabled();
    expect(plus).toHaveAttribute("title", "Cancel resume to edit items");
    fireEvent.pointerDown(plus, { button: 0, pointerType: "touch" });
    vi.advanceTimersByTime(2000);
    expect(onDelta).not.toHaveBeenCalled();
  });
});
