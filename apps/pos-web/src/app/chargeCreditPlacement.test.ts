/**
 * Where the Credit tender sits on a phone.
 *
 * Owner, over several weeks: "when I click 10 it goes to card" · "it changes
 * to transfer and freez" · "still tender jump to credit and freez for a
 * while" · "it's not happening always, sometimes".
 *
 * Measured in Chromium at 390px on 2026-09-04, with Credit squeezed into the
 * tender row as a fifth chip:
 *
 *     Credit   y 233–273   x 311–380
 *     note 10  y 301–361   x 261–380
 *
 * Twenty-eight pixels apart, sharing a right edge. Nothing overlapped and
 * nothing shifted — every chip hit-tested to itself — so this was never a
 * z-index or a reflow. It was simply a destructive button one thumb-width
 * above the most-tapped chip on the screen, and Credit is the one tender
 * there that switches the payment *and* fires a customer-credit fetch.
 *
 * "Sometimes" was the bill. The chip in that cell is the second-smallest note
 * offered, so the trap is the 10 under MVR 50, the 20 up to MVR 100, and the
 * 50 above that — which is why it never looked reproducible from the tap side.
 *
 * After moving Credit to its own row the same measurement gives:
 *
 *     Credit   y 279–319   x  10– 98
 *     note 10  y 408–468   x 261–380
 *
 * — 89px apart with no shared horizontal span at all.
 *
 * jsdom cannot lay out a grid, so this holds the stylesheet to the shape that
 * produced those numbers: on phones the inline chip is off and the row button
 * is on. If someone puts Credit back in that row, this fails.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "..", "index.css"), "utf8");

/** The phone block that owns the Charge tender layout. */
function phoneBlock(): string {
  const start = css.indexOf(".pos-charge-credit-inline {\n    display: none !important;");
  expect(start, "the phone Charge tender rules moved — re-point this test").toBeGreaterThan(-1);
  return css.slice(start, start + 900);
}

describe("Charge tenders on a phone", () => {
  it("keeps Credit out of the Cash/Card/Transfer/QR row", () => {
    const block = phoneBlock();
    expect(block).toMatch(/\.pos-charge-credit-inline \{\s*display: none !important;/);
  });

  it("gives Credit its own row instead", () => {
    const block = phoneBlock();
    expect(block).toMatch(/\.pos-charge-credit-row-btn \{\s*display: inline-flex !important;/);
  });

  it("no longer squeezes the tender row to five columns", () => {
    // The five-column rule existed only to fit Credit in. With Credit out of
    // the row, four wider targets remain (88px each, measured, up from 69px).
    expect(css).not.toMatch(/:has\(\.pos-charge-credit-inline\)/);
  });

  it("keeps the note photos clear of the tenders above them", () => {
    expect(phoneBlock()).toMatch(/\.pos-charge-quick-amounts \{\s*margin-top: 14px !important;/);
  });

  it("still hides the inline chip everywhere else", () => {
    // Its default is display:none; only the phone block ever turned it on.
    const first = css.indexOf(".pos-charge-credit-inline");
    expect(css.slice(first, first + 120)).toMatch(/display: none !important/);
  });
});
