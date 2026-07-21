import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChargeOverlay } from "./ChargeOverlay";

describe("ChargeOverlay FIX 6 — zero-total finalise", () => {
  it("enables FINALISE when total is 0 and confirm emits zero-cash row", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn(async () => undefined);

    render(
      <ChargeOverlay
        total={0}
        subtotal={100}
        discount={100}
        submitting={false}
        onClose={() => undefined}
        onConfirm={onConfirm}
      />,
    );

    const btn = screen.getByRole("button", { name: /FINALISE — FULLY COVERED/i });
    expect(btn).not.toBeDisabled();

    await user.click(btn);
    expect(onConfirm).toHaveBeenCalledWith([{ method: "cash", amount: 0 }]);
  });
});
