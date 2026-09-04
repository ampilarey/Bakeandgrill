import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChargeOverlay } from "./ChargeOverlay";

/**
 * Reproduction, 2026-09-04.
 *
 * Owner, on the phone POS: "In charge, when I click 10 it goes to card. And
 * gets stuck for a while. But when I restart it's ok."
 *
 * Earlier reports of the same thing — "when the payment was 3 and I click the
 * 100 note it enters as 10", "it changes to transfer and freez" — were never
 * reproduced from the tap side, because the tap is not the cause. The cause is
 * that the tender can be switched *out from under the cashier* by a permission
 * refresh, and switching tender wipes what they have already counted in.
 *
 * `/auth/me` re-fetches permissions on a timer after login and on unlock.
 * `allowedTenders` is derived from those permissions. If a refresh comes back
 * without `payments.cash` — a slow phone, a partial response, a re-auth — cash
 * leaves the allowed list while the Charge screen is open, and:
 *
 *   1. an effect moves the method to the first remaining tender, which is Card
 *   2. the `[total, method]` effect then clears Received and the tapped notes
 *
 * From behind the counter that is indistinguishable from "I tapped 10 and it
 * jumped to Card and lost my count".
 */
describe("ChargeOverlay — tender pulled out from under the cashier", () => {
  const base = {
    total: 35,
    submitting: false,
    onClose: () => undefined,
  };

  it("does not throw away a cash count when a permission refresh drops cash", () => {
    const { rerender } = render(
      <ChargeOverlay
        {...base}
        onConfirm={vi.fn(async () => undefined)}
        allowedTenders={{ cash: true, card: true, qr: true, digital_wallet: true, split: true }}
      />,
    );

    // The cashier taps the 10 note: it is now counted in.
    fireEvent.click(screen.getByTestId("charge-quick-note-10"));
    expect(screen.getByTestId("charge-quick-note-10").getAttribute("aria-pressed")).toBe("true");

    // A permissions refresh lands mid-count and cash is momentarily absent.
    rerender(
      <ChargeOverlay
        {...base}
        onConfirm={vi.fn(async () => undefined)}
        allowedTenders={{ cash: false, card: true, qr: true, digital_wallet: true, split: true }}
      />,
    );

    // The counted cash must survive: it is money already on the counter.
    const chip = screen.queryByTestId("charge-quick-note-10");
    expect(chip, "the cash quick-tenders vanished — the tender was switched").toBeTruthy();
    expect(chip!.getAttribute("aria-pressed")).toBe("true");
  });

  it("keeps the cashier on cash rather than jumping them to Card mid-payment", () => {
    const { rerender } = render(
      <ChargeOverlay
        {...base}
        onConfirm={vi.fn(async () => undefined)}
        allowedTenders={{ cash: true, card: true, qr: true, digital_wallet: true, split: true }}
      />,
    );

    fireEvent.click(screen.getByTestId("charge-quick-note-10"));

    rerender(
      <ChargeOverlay
        {...base}
        onConfirm={vi.fn(async () => undefined)}
        allowedTenders={{ cash: false, card: true, qr: true, digital_wallet: true, split: true }}
      />,
    );

    // Cash is still the active tender — the quick notes are still on screen.
    expect(screen.queryByTestId("charge-quick-note-10")).toBeTruthy();
  });
});

/**
 * Harm reduction, 2026-09-04.
 *
 * The mis-tap on the phone has outlived nine attempts to find its cause. What
 * can be fixed without knowing the cause is what it costs when it happens.
 *
 * Owner: "when i click upper row note transfer or credit is deleted and get
 * stuck". Landing on the wrong row used to wipe the count as well as the
 * tender, so a single stray tap meant counting the drawer again with a queue
 * waiting. It should cost one tap to undo.
 */
describe("ChargeOverlay — a mis-tapped tender costs one tap, not the count", () => {
  const base = {
    total: 35,
    submitting: false,
    onClose: () => undefined,
    allowedTenders: { cash: true, card: true, qr: true, digital_wallet: true, split: true },
  };

  it("keeps the counted notes when the tender is switched and switched back", () => {
    render(<ChargeOverlay {...base} onConfirm={vi.fn(async () => undefined)} />);

    fireEvent.click(screen.getByTestId("charge-quick-note-10"));
    fireEvent.click(screen.getByTestId("charge-quick-note-20"));
    expect(screen.getByTestId("charge-quick-note-10").getAttribute("aria-pressed")).toBe("true");

    // The stray tap: Card instead of a note.
    fireEvent.click(screen.getByRole("button", { name: "Card" }));
    // And the cashier taps straight back onto Cash.
    fireEvent.click(screen.getByRole("button", { name: "Cash" }));

    expect(screen.getByTestId("charge-quick-note-10").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("charge-quick-note-20").getAttribute("aria-pressed")).toBe("true");
  });

  it("still clears the count when the sale itself changes", () => {
    // The one case that must keep clearing: a different total is a different
    // sale, and last order's count must never stand in for this one's.
    const { rerender } = render(
      <ChargeOverlay {...base} onConfirm={vi.fn(async () => undefined)} />,
    );

    fireEvent.click(screen.getByTestId("charge-quick-note-10"));
    expect(screen.getByTestId("charge-quick-note-10").getAttribute("aria-pressed")).toBe("true");

    rerender(<ChargeOverlay {...base} total={60} onConfirm={vi.fn(async () => undefined)} />);

    expect(screen.getByTestId("charge-quick-note-10").getAttribute("aria-pressed")).toBe("false");
  });
});
