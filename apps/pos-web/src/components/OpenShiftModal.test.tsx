import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OpenShiftModal } from "./OpenShiftModal";

vi.mock("../api", () => ({
  getShiftHistory: vi.fn(),
}));

import { getShiftHistory } from "../api";

const mockHistory = vi.mocked(getShiftHistory);

describe("OpenShiftModal", () => {
  beforeEach(() => {
    mockHistory.mockReset();
  });

  it("rejects submit when starting cash was never entered (empty looks like placeholder)", async () => {
    mockHistory.mockResolvedValue({ shifts: [] });
    const onConfirm = vi.fn();
    const user = userEvent.setup();

    render(<OpenShiftModal onConfirm={onConfirm} />);

    await user.click(screen.getByRole("button", { name: "Open shift" }));

    expect(await screen.findByText(/Enter the cash you counted/i)).toBeTruthy();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("accepts an explicit 0 after the cashier taps 0", async () => {
    mockHistory.mockResolvedValue({ shifts: [] });
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(<OpenShiftModal onConfirm={onConfirm} />);

    await user.click(screen.getByRole("button", { name: "Digit 0" }));
    await user.click(screen.getByRole("button", { name: "Open shift" }));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith(0, undefined);
    });
  });

  it("leaves the field empty and warns when the last close is stale", async () => {
    const closedAt = new Date(Date.now() - 40 * 24 * 3600 * 1000).toISOString();
    mockHistory.mockResolvedValue({
      shifts: [{
        id: 1,
        user_id: 1,
        device_id: null,
        opened_at: closedAt,
        closed_at: closedAt,
        opening_cash: 100,
        closing_cash: 100,
        expected_cash: 100,
        variance: 0,
        notes: null,
      }],
    });

    render(<OpenShiftModal onConfirm={vi.fn()} />);

    expect(await screen.findByText(/too old to trust/i)).toBeTruthy();
    expect(screen.getByLabelText("Amount in MVR")).toHaveValue("");
    expect(screen.getByPlaceholderText("Enter amount")).toBeTruthy();
  });
});
