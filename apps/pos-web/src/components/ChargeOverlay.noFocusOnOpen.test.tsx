import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChargeOverlay } from "./ChargeOverlay";

/**
 * Opening Charge on a phone must not focus a text field.
 *
 * Two things did, the moment the screen mounted: the Received field's
 * `autoFocus`, and the focus trap's "focus the first focusable element". On
 * iOS a programmatic focus() on an input inside a fixed overlay scrolls the
 * visual viewport to bring the field into view, with no keyboard coming
 * (`inputmode="none"`). After a reload, with the browser toolbar up and the
 * page holding that much slack, the scroll is real — and the overlay is then
 * painted against one viewport and hit-tested against the other, by the
 * amount scrolled, until a finger scroll makes Safari reconcile them.
 *
 * Owner, 2026-09-04: "When I scrolled down it come down and keep down. If its
 * down no issue is charge page. But if I don't bring the bar down same issue."
 *
 * jsdom does not scroll, so the assertion is on the cause: nothing in the
 * phone Charge screen may take focus into a field on open.
 */
function mockMedia(matches: (q: string) => boolean) {
  Object.defineProperty(window, "matchMedia", {
    value: (q: string) => ({
      matches: matches(q), media: q,
      addEventListener: () => {}, removeEventListener: () => {},
    }),
    configurable: true,
  });
}

const base = {
  total: 35,
  submitting: false,
  onClose: () => undefined,
  allowedTenders: { cash: true, card: true, qr: true, digital_wallet: true, split: true },
};

describe("ChargeOverlay — nothing takes focus into a field on open", () => {
  afterEach(() => {
    mockMedia(() => false);
  });

  it("on a phone, leaves every input unfocused after mount", () => {
    mockMedia((q) => q.includes("840px") || q.includes("coarse"));

    render(<ChargeOverlay {...base} onConfirm={vi.fn(async () => undefined)} />);

    const active = document.activeElement;
    expect(active).not.toBeInstanceOf(HTMLInputElement);
    expect(active).not.toBeInstanceOf(HTMLTextAreaElement);
    // The Received field is on screen and it is not the thing focused.
    expect(screen.getByLabelText(/amount in mvr/i)).not.toBe(active);
  });

  it("on a phone, the received field still takes a value from the numpad", () => {
    // Focus was cosmetic — the numpad drives the field, not the keyboard.
    mockMedia((q) => q.includes("840px") || q.includes("coarse"));
    render(<ChargeOverlay {...base} onConfirm={vi.fn(async () => undefined)} />);

    fireEvent.click(screen.getByRole("button", { name: "Digit 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Digit 0" }));

    expect((screen.getByLabelText(/amount in mvr/i) as HTMLInputElement).value).toBe("10");
  });

  it("on a wide till with a pointer, the received field still auto-focuses", () => {
    // No toolbar, no slack, and a keyboard user may be on it. Unchanged.
    mockMedia(() => false);

    render(<ChargeOverlay {...base} onConfirm={vi.fn(async () => undefined)} />);

    expect(document.activeElement).toBe(screen.getByLabelText(/amount in mvr/i));
  });
});
