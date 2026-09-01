import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HeaderShortcuts } from "./HeaderShortcuts";

/**
 * Tap goes there; press and hold offers to remove.
 *
 * The distinction is the whole feature and it is invisible, so it is exactly
 * the kind of thing that breaks without anyone noticing until a cashier is
 * bounced to Receipts every time they try to unpin it.
 */
const items = [
  { id: "receipts" as const, label: "Receipts", icon: "🧾" },
  { id: "open_tickets" as const, label: "Active Orders", icon: "🎫" },
];

function setup() {
  const onSelect = vi.fn();
  const onRequestRemove = vi.fn();
  render(
    <HeaderShortcuts
      items={items}
      active="sales"
      onSelect={onSelect}
      onRequestRemove={onRequestRemove}
    />,
  );

  return { onSelect, onRequestRemove };
}

const receipts = () => screen.getByTestId("header-shortcut-receipts");

/** A real press: down, hold past the threshold, up, then the click. */
function press(el: HTMLElement, holdMs: number, opts: { moveTo?: [number, number] } = {}) {
  fireEvent.pointerDown(el, { button: 0, pointerType: "touch", clientX: 20, clientY: 20 });
  if (opts.moveTo) {
    fireEvent.pointerMove(el, { clientX: opts.moveTo[0], clientY: opts.moveTo[1] });
  }
  act(() => { vi.advanceTimersByTime(holdMs); });
  fireEvent.pointerUp(el);
  fireEvent.click(el);
}

describe("HeaderShortcuts", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("navigates on a tap", () => {
    const { onSelect, onRequestRemove } = setup();

    press(receipts(), 50);

    expect(onSelect).toHaveBeenCalledWith("receipts");
    expect(onRequestRemove).not.toHaveBeenCalled();
  });

  it("offers to remove on a hold, and does not also navigate", () => {
    // Holding "Receipts" to unpin it must not dump the cashier into Receipts.
    const { onSelect, onRequestRemove } = setup();

    press(receipts(), 600);

    expect(onRequestRemove).toHaveBeenCalledWith(items[0]);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("treats a drag as a scroll, not a hold", () => {
    // The row scrolls sideways when it overflows; dragging it must not pop a
    // remove prompt.
    const { onSelect, onRequestRemove } = setup();

    press(receipts(), 600, { moveTo: [120, 24] });

    expect(onRequestRemove).not.toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledWith("receipts");
  });

  it("recovers for the next tap after a hold", () => {
    // The click swallowed by a hold must not swallow the following one too.
    const { onSelect } = setup();

    press(receipts(), 600);
    press(receipts(), 50);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("receipts");
  });

  it("tells a screen reader about the gesture it cannot see", () => {
    setup();

    expect(receipts().getAttribute("aria-label"))
      .toMatch(/press and hold to remove from header/i);
  });

  it("renders nothing when nothing is pinned", () => {
    render(
      <HeaderShortcuts items={[]} active="sales" onSelect={vi.fn()} onRequestRemove={vi.fn()} />,
    );

    expect(screen.queryByRole("group", { name: "Shortcuts" })).toBeNull();
  });
});
