import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChargeOverlay, pickChargeQuickNotes } from "./ChargeOverlay";

describe("pickChargeQuickNotes", () => {
  it("always prefers 5 notes mixing below-total and covering faces", () => {
    // 35: old logic only offered 50/100/500/1000 (4). Now include
    // combine notes under 35 as well.
    expect(pickChargeQuickNotes(35, 5)).toEqual([5, 10, 20, 50, 100]);
  });

  it("for 605 includes 50/100/500 plus 1000 (not only 1000)", () => {
    expect(pickChargeQuickNotes(605, 5)).toEqual([20, 50, 100, 500, 1000]);
  });

  it("for small totals still returns 5 when enough faces exist", () => {
    expect(pickChargeQuickNotes(8, 5)).toEqual([5, 10, 20, 50, 100]);
  });

  it("returns empty when total is zero or negative", () => {
    expect(pickChargeQuickNotes(0, 5)).toEqual([]);
    expect(pickChargeQuickNotes(-1, 5)).toEqual([]);
  });
});

describe("ChargeOverlay quick note photos", () => {
  it("shows Exact plus 5 note photos for a mid-size total", () => {
    render(
      <ChargeOverlay
        total={35}
        submitting={false}
        onClose={() => undefined}
        onConfirm={vi.fn(async () => undefined)}
      />,
    );

    expect(screen.getByTestId("charge-quick-exact")).toBeTruthy();
    expect(screen.getByTestId("charge-quick-note-5")).toBeTruthy();
    expect(screen.getByTestId("charge-quick-note-10")).toBeTruthy();
    expect(screen.getByTestId("charge-quick-note-20")).toBeTruthy();
    expect(screen.getByTestId("charge-quick-note-50")).toBeTruthy();
    expect(screen.getByTestId("charge-quick-note-100")).toBeTruthy();
    expect(screen.queryByTestId("charge-quick-note-500")).toBeNull();
    expect(screen.queryByTestId("charge-quick-note-1000")).toBeNull();
  });

  it("for 605 shows combine notes (50/100/500) not only 1000", () => {
    render(
      <ChargeOverlay
        total={605}
        submitting={false}
        onClose={() => undefined}
        onConfirm={vi.fn(async () => undefined)}
      />,
    );

    expect(screen.getByTestId("charge-quick-note-20")).toBeTruthy();
    expect(screen.getByTestId("charge-quick-note-50")).toBeTruthy();
    expect(screen.getByTestId("charge-quick-note-100")).toBeTruthy();
    expect(screen.getByTestId("charge-quick-note-500")).toBeTruthy();
    expect(screen.getByTestId("charge-quick-note-1000")).toBeTruthy();
  });

  it("sums selected notes into Received and highlights both", async () => {
    const user = userEvent.setup();
    render(
      <ChargeOverlay
        total={8}
        submitting={false}
        onClose={() => undefined}
        onConfirm={vi.fn(async () => undefined)}
      />,
    );

    await user.click(screen.getByTestId("charge-quick-note-10"));
    expect(screen.getByTestId("charge-quick-note-10").getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByLabelText("Amount in MVR") as HTMLInputElement).value).toBe("10.00");

    await user.click(screen.getByTestId("charge-quick-note-20"));
    expect(screen.getByTestId("charge-quick-note-20").getAttribute("aria-pressed")).toBe("true");
    // 10 + 20 = 30
    expect((screen.getByLabelText("Amount in MVR") as HTMLInputElement).value).toBe("30.00");
  });

  it("Exact clears note selection and sets the bill total", async () => {
    const user = userEvent.setup();
    render(
      <ChargeOverlay
        total={12.5}
        submitting={false}
        onClose={() => undefined}
        onConfirm={vi.fn(async () => undefined)}
      />,
    );

    await user.click(screen.getByTestId("charge-quick-note-20"));
    await user.click(screen.getByTestId("charge-quick-exact"));
    expect(screen.getByTestId("charge-quick-note-20").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByDisplayValue("12.50")).toBeTruthy();
  });
});
