import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChargeOverlay } from "./ChargeOverlay";

describe("ChargeOverlay quick note photos", () => {
  it("shows Exact plus up to 5 note photos for notes >= total", () => {
    render(
      <ChargeOverlay
        total={8}
        submitting={false}
        onClose={() => undefined}
        onConfirm={vi.fn(async () => undefined)}
      />,
    );

    expect(screen.getByTestId("charge-quick-exact")).toBeTruthy();
    // Notes >= 8: 10, 20, 50, 100, 500 (cap 5) — 1000 stays off the list.
    expect(screen.getByTestId("charge-quick-note-10")).toBeTruthy();
    expect(screen.getByTestId("charge-quick-note-20")).toBeTruthy();
    expect(screen.getByTestId("charge-quick-note-50")).toBeTruthy();
    expect(screen.getByTestId("charge-quick-note-100")).toBeTruthy();
    expect(screen.getByTestId("charge-quick-note-500")).toBeTruthy();
    expect(screen.queryByTestId("charge-quick-note-1000")).toBeNull();
    expect(screen.queryByTestId("charge-quick-note-5")).toBeNull();
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
