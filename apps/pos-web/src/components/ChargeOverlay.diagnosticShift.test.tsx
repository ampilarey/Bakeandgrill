import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChargeOverlay } from "./ChargeOverlay";

/**
 * The diagnostic must never move the buttons it is diagnosing.
 *
 * For five days the red anomaly bar was the first child of `.pos-charge`, in
 * the card's flex column. Measured in Chromium at 440x956 — the viewport the
 * till itself reported — it pushed the header, the tender row, the note rows
 * and the footer down by 45px, against a note-row pitch of 70px.
 *
 * The bar is rendered BECAUSE the tender flipped. So the first fault put it on
 * screen, and from then on every tap in that session landed 45px above what
 * the cashier was aiming at — the row above — until the app was restarted.
 * Owner, across several days: "when i click the pay, and click below row
 * notes, upper row note is clicked... but when I restart its ok."
 *
 * jsdom does no layout, so this cannot assert pixels. What it can assert is
 * the structural property that made the shift possible: the bar is not inside
 * the card, and it is out of flow.
 */
describe("ChargeOverlay — the diagnostic bar cannot shift the card", () => {
  const base = {
    total: 35,
    submitting: false,
    onClose: () => undefined,
    allowedTenders: { cash: true, card: true, qr: true, digital_wallet: true, split: true },
  };

  /**
   * Reproduce the fault the recorder exists to catch: the finger goes down on
   * a note chip, and the tender ends up on Credit.
   */
  const raiseAnomaly = () => {
    render(
      <ChargeOverlay
        {...base}
        onConfirm={vi.fn(async () => undefined)}
        creditEligible
        canPayCredit
        hasAttachedCustomer
      />,
    );

    fireEvent.pointerDown(screen.getByTestId("charge-quick-note-10"));
    fireEvent.click(screen.getByRole("button", { name: "Credit" }));

    return screen.getByTestId("charge-tender-anomaly");
  };

  it("fires on a press that was not on Credit", () => {
    // Guards the three assertions below from passing vacuously.
    expect(raiseAnomaly()).toBeTruthy();
  });

  it("renders the bar outside the card, never as one of its children", () => {
    const bar = raiseAnomaly();
    const card = document.querySelector(".pos-charge");

    expect(card, ".pos-charge not found").toBeTruthy();
    expect(card!.contains(bar)).toBe(false);
  });

  it("takes the bar out of flow so it displaces nothing", () => {
    expect(raiseAnomaly().style.position).toBe("fixed");
  });

  it("keeps the card as the only flex child of the overlay", () => {
    // The overlay centres its child. A second in-flow child would sit beside
    // the card and squash it.
    raiseAnomaly();
    const overlay = document.querySelector(".pos-charge-overlay");
    const inFlow = [...(overlay?.children ?? [])].filter(
      (el) => (el as HTMLElement).style.position !== "fixed",
    );

    expect(inFlow.map((el) => el.className)).toEqual(["pos-charge"]);
  });
});

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
});
