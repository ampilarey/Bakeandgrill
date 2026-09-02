/**
 * "Goes with" chips at the till.
 *
 * The rules that matter behind a counter, in order:
 *   - never suggest something already on the ticket, or something sold out
 *   - a chip behaves exactly like tapping the item on the menu grid
 *     (simple = straight on, configurable = open configure)
 *   - the ticket's newest line leads, because that is what the cashier is
 *     talking about right now
 *   - each set is reported as shown exactly once, or the take rate in the
 *     admin report is inflated into meaninglessness
 */
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

const trackPosSuggestion = vi.hoisted(() => vi.fn());
vi.mock("../api", () => ({ trackPosSuggestion }));

import { SuggestionChips } from "./SuggestionChips";

const burger = { id: 1, name: "Burger", base_price: 60, is_available: true, has_variants: false, modifiers: [] };
const fries = { id: 2, name: "Fries", base_price: 25, is_available: true, has_variants: false, modifiers: [] };
const coke = { id: 3, name: "Coke", base_price: 15, is_available: true, has_variants: false, modifiers: [] };
const shake = { id: 4, name: "Shake", base_price: 40, is_available: true, has_variants: true, modifiers: [] };
const soldOut = { id: 5, name: "Sold Out", base_price: 10, is_available: false, has_variants: false, modifiers: [] };

const items = [burger, fries, coke, shake, soldOut];
const pairings = { 1: [2, 3, 5], 2: [3], 3: [4] };

const addToCart = vi.fn();
const handleSelectItem = vi.fn();

function line(item: { id: number; name: string; base_price: number }) {
  return { id: item.id, name: item.name, price: item.base_price, quantity: 1, modifiers: [] };
}

function draw(cartItems: ReturnType<typeof line>[], extra: Record<string, unknown> = {}) {
  return render(
    <SuggestionChips
      {...({
        items,
        pairings,
        cartItems,
        addToCart,
        handleSelectItem,
        ...extra,
      } as never)}
    />,
  );
}

// Chips are the "Add …" buttons; the card's ✕ is not one of them.
const chipNames = () =>
  screen.queryAllByRole("button")
    .map((b) => b.getAttribute("aria-label") ?? "")
    .filter((label) => label.startsWith("Add "))
    .map((label) => label.slice(4));

describe("POS suggestion chips", () => {
  beforeEach(() => {
    addToCart.mockClear();
    handleSelectItem.mockClear();
    trackPosSuggestion.mockClear();
  });

  it("shows nothing for an empty ticket", () => {
    draw([]);
    expect(screen.queryByTestId("pos-suggestion-chips")).toBeNull();
    expect(trackPosSuggestion).not.toHaveBeenCalled();
  });

  it("suggests the burger's pairings, skipping the sold-out one", () => {
    draw([line(burger)]);
    const names = chipNames();

    expect(names).toContain("Fries");
    expect(names).toContain("Coke");
    // A chip that does nothing when tapped is worse than no chip.
    expect(names).not.toContain("Sold Out");
  });

  it("never suggests something already on the ticket", () => {
    draw([line(burger), line(fries)]);
    expect(chipNames()).not.toContain("Fries");
  });

  it("leads with the newest line, since that is what the cashier just rang up", () => {
    // Coke was added last, and Coke → Shake. Burger → Fries comes after.
    draw([line(burger), line(coke)]);
    expect(chipNames()[0]).toBe("Shake");
  });

  it("adds a simple item straight to the ticket", async () => {
    const user = userEvent.setup();
    draw([line(burger)]);

    await user.click(screen.getByLabelText("Add Fries"));

    expect(addToCart).toHaveBeenCalledWith(expect.objectContaining({ id: fries.id }));
    expect(handleSelectItem).not.toHaveBeenCalled();
  });

  it("opens configure for an item with variants, exactly like the menu tile", async () => {
    const user = userEvent.setup();
    draw([line(coke)]);

    await user.click(screen.getByLabelText("Add Shake"));

    expect(handleSelectItem).toHaveBeenCalledWith(expect.objectContaining({ id: shake.id }));
    expect(addToCart).not.toHaveBeenCalled();
  });

  it("reports the set as shown once, not once per render", () => {
    const { rerender } = draw([line(burger)]);
    // A fresh cartItems array each render is the normal case upstream.
    rerender(
      <SuggestionChips
        {...({ items, pairings, cartItems: [line(burger)], addToCart, handleSelectItem } as never)}
      />,
    );

    const shown = trackPosSuggestion.mock.calls.filter((c) => c[0] === "shown");
    expect(shown).toHaveLength(1);
    expect(shown[0][1]).toEqual([fries.id, coke.id]);
  });

  it("reports only the chip that was tapped", async () => {
    const user = userEvent.setup();
    draw([line(burger)]);

    await user.click(screen.getByLabelText("Add Coke"));

    const accepted = trackPosSuggestion.mock.calls.filter((c) => c[0] === "accepted");
    expect(accepted).toHaveLength(1);
    expect(accepted[0][1]).toEqual([coke.id]);
  });

  it("does not add anything while the ticket is locked", async () => {
    const user = userEvent.setup();
    draw([line(burger)], { readOnly: true });

    await user.click(screen.getByLabelText("Add Fries"));

    expect(addToCart).not.toHaveBeenCalled();
    expect(handleSelectItem).not.toHaveBeenCalled();
  });

  it("stays quiet when the menu has no pairings at all", () => {
    draw([line(burger)], { pairings: {} });
    expect(screen.queryByTestId("pos-suggestion-chips")).toBeNull();
  });

  // Owner, 2026-09-02: "goes with should be a popup msg". The card names
  // the item it pairs with, can be closed, closes itself, and comes back
  // only for a different set.
  describe("as a popup", () => {
    it("is named after the line it is pairing with", () => {
      draw([line(burger), line(coke)]);
      expect(screen.getByRole("status", { name: "Goes with Coke" })).toBeInTheDocument();
    });

    it("closes on ✕ and stays closed for the same set", async () => {
      const user = userEvent.setup();
      const { rerender } = draw([line(burger)]);

      await user.click(screen.getByLabelText("Hide suggestions"));
      expect(screen.queryByTestId("pos-suggestion-chips")).toBeNull();

      rerender(
        <SuggestionChips
          {...({ items, pairings, cartItems: [line(burger)], addToCart, handleSelectItem } as never)}
        />,
      );
      expect(screen.queryByTestId("pos-suggestion-chips")).toBeNull();
    });

    it("comes back when another item is rung up", async () => {
      const user = userEvent.setup();
      const { rerender } = draw([line(burger)]);
      await user.click(screen.getByLabelText("Hide suggestions"));

      rerender(
        <SuggestionChips
          {...({ items, pairings, cartItems: [line(burger), line(coke)], addToCart, handleSelectItem } as never)}
        />,
      );
      expect(screen.getByRole("status", { name: "Goes with Coke" })).toBeInTheDocument();
    });

    it("slides away on its own", () => {
      vi.useFakeTimers();
      try {
        draw([line(burger)], { autoHideMs: 5000 });
        expect(screen.getByTestId("pos-suggestion-chips")).toBeInTheDocument();
        act(() => { vi.advanceTimersByTime(5000); });
        expect(screen.queryByTestId("pos-suggestion-chips")).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it("sits just above the cart footer when there is one", () => {
      const footer = document.createElement("div");
      footer.className = "pos-cart-footer";
      footer.getBoundingClientRect = () => ({ left: 20, top: 500, width: 300, height: 100 } as DOMRect);
      footer.getClientRects = () => [{}] as unknown as DOMRectList;
      document.body.appendChild(footer);
      Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
      try {
        draw([line(burger)]);
        const card = screen.getByTestId("pos-suggestion-chips");
        expect(card.style.left).toBe("20px");
        expect(card.style.width).toBe("300px");
        expect(card.style.bottom).toBe("308px");
      } finally {
        footer.remove();
      }
    });
  });
});
