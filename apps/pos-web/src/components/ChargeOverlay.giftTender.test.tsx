import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChargeOverlay } from "./ChargeOverlay";

/**
 * FIX 5 — breakdown lines (Subtotal, Discount, Service, Packaging,
 * Delivery, GST, Gift card) MUST sum exactly to the headline "Amount
 * due" both with and without a staged gift-card tender.
 */
describe("ChargeOverlay FIX 5 — gift-card tender line", () => {
  function readMvr(text: string): number {
    const match = text.match(/MVR\s*([\d.]+)/i);
    if (!match) throw new Error(`No MVR value in "${text}"`);
    const abs = Number.parseFloat(match[1]);
    // The Line helper prepends "− " (real minus) for negative values.
    return /−|-/.test(text) ? -abs : abs;
  }

  function sumBreakdownLines(): number {
    // Every breakdown row uses a two-column flex layout with a label
    // span + a value span. Grab the last span in each row.
    const container = document.querySelector<HTMLElement>(".pos-charge-breakdown");
    if (!container) throw new Error("no breakdown");
    const rows = Array.from(container.querySelectorAll<HTMLElement>(":scope > div"));
    return rows.reduce((sum, row) => {
      const spans = row.querySelectorAll("span");
      const valueSpan = spans[spans.length - 1];
      return sum + readMvr(valueSpan.textContent ?? "");
    }, 0);
  }

  it("breakdown sums to Amount due WITHOUT a gift-card tender", () => {
    render(
      <ChargeOverlay
        total={108}
        subtotal={100}
        tax={8}
        submitting={false}
        onClose={() => undefined}
        onConfirm={async () => undefined}
      />,
    );

    expect(screen.queryByText(/Gift card/i)).toBeNull();
    const sum = sumBreakdownLines();
    expect(Math.round(sum * 100)).toBe(Math.round(108 * 100));
  });

  it("shows a Gift card line and breakdown still sums to Amount due", () => {
    render(
      <ChargeOverlay
        total={58}
        subtotal={100}
        tax={8}
        giftTender={50}
        submitting={false}
        onClose={() => undefined}
        onConfirm={async () => undefined}
      />,
    );

    const line = screen.getByText(/Gift card/i);
    expect(line).toBeTruthy();
    // Line is rendered inside the last row before "Amount due" — sibling
    // holding the −MVR value.
    const row = line.closest("div");
    expect(row).not.toBeNull();
    const value = within(row!).getByText(/MVR/);
    expect(value.textContent).toMatch(/−/);

    const sum = sumBreakdownLines();
    expect(Math.round(sum * 100)).toBe(Math.round(58 * 100));
  });
});
