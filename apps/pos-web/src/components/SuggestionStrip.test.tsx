/**
 * The suggestions row above the menu (owner, 2026-10-11).
 *
 * It replaced a "Goes with" card that popped up over the ticket's footer and
 * caught taps meant for Charge. What matters:
 *   - the row is always there: Popular now with nothing to pair, Goes with
 *     once an item with pairings is on the ticket
 *   - never suggest something already on the ticket, or sold out
 *   - a chip behaves like tapping the item on the menu
 *   - a fresh set ignores taps for a moment, so a tap on its way adds nothing
 *   - each Goes-with set is reported as shown once
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const trackPosSuggestion = vi.hoisted(() => vi.fn());
vi.mock("../api", () => ({ trackPosSuggestion }));

import { SuggestionStrip } from "./SuggestionStrip";

const burger = { id: 1, name: "Burger", base_price: 60, is_available: true, has_variants: false, modifiers: [] };
const fries = { id: 2, name: "Fries", base_price: 25, is_available: true, has_variants: false, modifiers: [] };
const coke = { id: 3, name: "Coke", base_price: 15, is_available: true, has_variants: false, modifiers: [] };
const shake = { id: 4, name: "Shake", base_price: 40, is_available: true, has_variants: true, modifiers: [] };
const soldOut = { id: 5, name: "Sold Out", base_price: 10, is_available: false, has_variants: false, modifiers: [] };

const items = [burger, fries, coke, shake, soldOut];
const pairings = { 1: [2, 3, 5], 3: [4] };
const popularNow = [3, 1, 5, 4];

const addToCart = vi.fn();
const handleSelectItem = vi.fn();

function line(item: { id: number; name: string; base_price: number }) {
  return { id: item.id, name: item.name, price: item.base_price, quantity: 1, modifiers: [] };
}

function strip(cartItems: ReturnType<typeof line>[], extra: Record<string, unknown> = {}) {
  return (
    <SuggestionStrip
      {...({ items, pairings, popularNow, cartItems, addToCart, handleSelectItem, armMs: 0, ...extra } as never)}
    />
  );
}

const chipNames = () =>
  screen.queryAllByRole("button").map((b) => (b.getAttribute("aria-label") ?? "").replace(/^Add /, ""));

beforeEach(() => {
  addToCart.mockReset();
  handleSelectItem.mockReset();
  trackPosSuggestion.mockReset();
});

describe("Suggestions row", () => {
  it("shows what sells now on an empty ticket, without sold-out items", () => {
    render(strip([]));
    const row = screen.getByTestId("pos-suggestion-strip");
    expect(row).toHaveAttribute("data-mode", "popular");
    expect(row).toHaveTextContent("Popular now");
    expect(chipNames()).toEqual(["Coke", "Burger", "Shake"]);
    // Popular is not a suggestion for the take-rate report.
    expect(trackPosSuggestion).not.toHaveBeenCalled();
  });

  it("switches to what goes with the item just rung up", () => {
    render(strip([line(burger)]));
    const row = screen.getByTestId("pos-suggestion-strip");
    expect(row).toHaveAttribute("data-mode", "goes");
    expect(row).toHaveAccessibleName("Goes with Burger");
    expect(chipNames()).toEqual(["Fries", "Coke"]);
    expect(trackPosSuggestion).toHaveBeenCalledWith("shown", [2, 3]);
  });

  it("leaves out what is already on the ticket, newest line first", () => {
    render(strip([line(burger), line(coke)]));
    expect(screen.getByTestId("pos-suggestion-strip")).toHaveAccessibleName("Goes with Coke");
    expect(chipNames()).toEqual(["Shake", "Fries"]);
  });

  it("falls back to Popular now when nothing pairs", () => {
    render(strip([line(fries)]));
    expect(screen.getByTestId("pos-suggestion-strip")).toHaveAttribute("data-mode", "popular");
    expect(chipNames()).toEqual(["Coke", "Burger", "Shake"]);
  });

  it("adds a simple item and opens a configurable one, like the menu", () => {
    render(strip([line(burger), line(coke)]));
    fireEvent.click(screen.getByRole("button", { name: "Add Fries" }));
    expect(addToCart).toHaveBeenCalledWith(fries);
    expect(trackPosSuggestion).toHaveBeenCalledWith("accepted", [2]);
    fireEvent.click(screen.getByRole("button", { name: "Add Shake" }));
    expect(handleSelectItem).toHaveBeenCalledWith(shake);
    expect(addToCart).toHaveBeenCalledTimes(1);
  });

  it("ignores taps on a set that has just changed", () => {
    vi.useFakeTimers();
    try {
      const { rerender } = render(strip([], { armMs: 600 }));
      act(() => { vi.advanceTimersByTime(600); });
      expect(screen.getByRole("button", { name: "Add Burger" })).toBeEnabled();

      rerender(strip([line(burger)], { armMs: 600 }));
      const fresh = screen.getByRole("button", { name: "Add Fries" });
      expect(fresh).toBeDisabled();
      fireEvent.click(fresh);
      expect(addToCart).not.toHaveBeenCalled();

      act(() => { vi.advanceTimersByTime(600); });
      expect(screen.getByRole("button", { name: "Add Fries" })).toBeEnabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports a set once, however often the ticket redraws", () => {
    const { rerender } = render(strip([line(burger)]));
    rerender(strip([{ ...line(burger), quantity: 2 }]));
    expect(trackPosSuggestion.mock.calls.filter(([kind]) => kind === "shown")).toHaveLength(1);
  });

  it("locks its chips on a view-only ticket", () => {
    render(strip([], { readOnly: true }));
    for (const b of screen.getAllByRole("button")) expect(b).toBeDisabled();
  });

  it("says why it is empty before there are sales", () => {
    render(strip([], { popularNow: [] }));
    expect(screen.getByTestId("pos-suggestion-strip")).toHaveTextContent("The most sold items show here");
  });

  it("says so when every popular item is already on the ticket", () => {
    render(strip([line(coke), line(burger), line(shake)], { pairings: {} }));
    expect(screen.getByTestId("pos-suggestion-strip")).toHaveTextContent("Everything popular is already on the ticket.");
  });
});
