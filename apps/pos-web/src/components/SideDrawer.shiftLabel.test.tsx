import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SideDrawer } from "./SideDrawer";
import { formatOpenShiftLabel } from "../utils/shiftDisplay";

describe("POS shell shift label (open shift)", () => {
  it("identifies the open shift without showing expected drawer cash", () => {
    const label = formatOpenShiftLabel(17, "2026-08-09T08:15:00+00:00");
    render(
      <SideDrawer
        open
        onClose={vi.fn()}
        items={[]}
        active="sales"
        onSelect={vi.fn()}
        cashierName="Aisha"
        shiftLabel={label}
      />,
    );

    expect(screen.getByText(/Shift #17/)).toBeTruthy();
    expect(screen.getByText(/opened/i)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/in drawer/i);
    expect(document.body.textContent).not.toMatch(/expected/i);
    expect(document.body.textContent).not.toMatch(/MVR \d/);
  });
});
