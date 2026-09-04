import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChargeOverlay } from "./ChargeOverlay";

/**
 * The overlay box must be the screen the cashier can see.
 *
 * Owner, 2026-09-04: "When i update the pos mobile the charge box is little
 * upper. When I scrolled down it come down and keep down. If its down no issue
 * is charge page. But if I don't bring the bar down same issue."
 *
 * That is Safari's toolbar. `inset: 0` on a fixed element resolves its bottom
 * against the LAYOUT viewport — the screen as it would be with no toolbar — so
 * with the toolbar up the box ran past the bottom of the glass. Modelled at
 * 440x956 with the toolbar taking 112px: the card centred at y478 against a
 * visible centre of y422, 56px low, on a 70px note-row pitch, with Confirm
 * already behind the toolbar. Anchored to the top at `--pos-vh` instead, the
 * same model puts the centre at y422 and Confirm on screen.
 */
describe("ChargeOverlay — the overlay box is the visible screen", () => {
  const overlayStyle = () => {
    render(
      <ChargeOverlay
        total={35}
        submitting={false}
        onClose={() => undefined}
        onConfirm={vi.fn(async () => undefined)}
        allowedTenders={{ cash: true, card: true, qr: true, digital_wallet: true, split: true }}
      />,
    );
    return document.querySelector<HTMLElement>(".pos-charge-overlay")!.style;
  };

  it("is anchored to the top and sized from the measured height", () => {
    const s = overlayStyle();

    expect(s.position).toBe("fixed");
    expect(s.top).toBe("0px");
    expect(s.height).toMatch(/var\(--pos-vh/);
  });

  it("never goes back to inset: 0, which is the layout viewport", () => {
    const s = overlayStyle();

    // `inset` would set bottom; the bottom is what iOS gets wrong.
    expect(s.bottom).toBe("");
  });

  it("keeps the card as the overlay's only child", () => {
    /*
     * For five days a diagnostic bar sat inside the card as its first child.
     * Measured at 440x956 it pushed every row down 45px against a 70px
     * note-row pitch, and since it appeared BECAUSE the tender had flipped,
     * every tap after the first fault landed a row high until a restart.
     * Instrumentation that moves the thing it measures. Nothing goes in here
     * beside the card.
     */
    overlayStyle();
    const overlay = document.querySelector(".pos-charge-overlay")!;

    expect([...overlay.children].map((el) => el.className)).toEqual(["pos-charge"]);
  });
});
