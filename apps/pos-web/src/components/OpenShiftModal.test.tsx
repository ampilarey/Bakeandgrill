import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OpenShiftModal } from "./OpenShiftModal";

vi.mock("../api", () => ({
  getShiftHistory: vi.fn(),
  fetchCurrencyImages: vi.fn().mockResolvedValue({}),
  getApiBaseUrl: () => "https://example.test/api",
}));

import { getShiftHistory } from "../api";

const mockHistory = vi.mocked(getShiftHistory);

const closedHoursAgo = (hours: number, extra: Record<string, unknown> = {}) => {
  const closedAt = new Date(Date.now() - hours * 3600 * 1000).toISOString();
  return {
    shifts: [{
      id: 1, user_id: 1, device_id: null, opened_at: closedAt, closed_at: closedAt,
      opening_cash: 100, closing_cash: 1390, expected_cash: 1390, variance: 0, notes: null,
      ...extra,
    }],
  };
};

describe("OpenShiftModal", () => {
  beforeEach(() => {
    mockHistory.mockReset();
  });

  it("counts the float note by note, like the close, and sends the breakdown", async () => {
    // Owner, 2026-10-03: "in shift opening also add the shift-closing type of money counting."
    mockHistory.mockResolvedValue({ shifts: [] });
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<OpenShiftModal onConfirm={onConfirm} />);

    expect(screen.getByTestId("open-shift-denomination-grid")).toBeTruthy();
    // Two 500s by tapping the photo, then three 100s on the keypad.
    await user.click(screen.getByRole("button", { name: "Increase MVR 500" }));
    await user.click(screen.getByRole("button", { name: "Increase MVR 500" }));
    // Selecting a row (not its photo) points the keypad at it.
    fireEvent.click(screen.getByTestId("denom-row-10000"));
    await user.click(screen.getByRole("button", { name: "Digit 3" }));
    expect(screen.getByTestId("open-shift-running-total")).toHaveTextContent("MVR 1300.00");

    await user.click(screen.getByRole("button", { name: "Open shift" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith({
      openingCash: 1300,
      cashCountMethod: "denominations",
      denominations: { "50000": 2, "10000": 3 },
    }));
  });

  it("needs a count before opening, and takes 0 for an empty drawer", async () => {
    mockHistory.mockResolvedValue({ shifts: [] });
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<OpenShiftModal onConfirm={onConfirm} />);

    await user.click(screen.getByRole("button", { name: "Open shift" }));
    expect(await screen.findByText(/Count the notes and coins in the drawer/)).toBeTruthy();
    expect(onConfirm).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Digit 0" }));
    await user.click(screen.getByRole("button", { name: "Open shift" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith({ openingCash: 0, cashCountMethod: "denominations", denominations: {} }));
  });

  it("still takes a plain total through Enter total instead", async () => {
    mockHistory.mockResolvedValue({ shifts: [] });
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<OpenShiftModal onConfirm={onConfirm} />);

    await user.click(screen.getByRole("button", { name: "Enter total instead" }));
    await user.click(screen.getByRole("button", { name: "Open shift" }));
    expect(await screen.findByText("Enter the cash you counted in the drawer. Tap 0 if the drawer is empty.")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Digit 2" }));
    await user.click(screen.getByRole("button", { name: "Digit 5" }));
    await user.click(screen.getByRole("button", { name: "Digit 0" }));
    await user.type(screen.getByLabelText("Notes (optional)"), "Morning");
    await user.click(screen.getByRole("button", { name: "Open shift" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith({ openingCash: 250, cashCountMethod: "plain_total", notes: "Morning" }));
  });

  it("pre-fills each note from a recent close that was counted note by note", async () => {
    mockHistory.mockResolvedValue(closedHoursAgo(2, { cash_count_method: "denominations", cash_count_breakdown: { "50000": 2, "10000": 3, "2000": 4, "200": 5 } }));
    render(<OpenShiftModal onConfirm={vi.fn()} />);

    expect(await screen.findByTestId("open-shift-hint")).toHaveTextContent(/Pre-filled from the last close/);
    await waitFor(() => expect(screen.getByTestId("open-shift-running-total")).toHaveTextContent("MVR 1390.00"));
    expect(screen.getByTestId("denom-count-50000")).toHaveTextContent("2");
    expect(screen.getByTestId("denom-count-200")).toHaveTextContent("5");
  });

  it("falls back to the total for a recent close entered as a total", async () => {
    mockHistory.mockResolvedValue(closedHoursAgo(2, { cash_count_method: "plain_total" }));
    render(<OpenShiftModal onConfirm={vi.fn()} />);
    await waitFor(() => expect(screen.getByLabelText("Amount in MVR")).toHaveValue("1390.00"));
  });

  it("pre-fills nothing and warns when the last close is stale", async () => {
    mockHistory.mockResolvedValue(closedHoursAgo(40 * 24, { cash_count_method: "denominations", cash_count_breakdown: { "50000": 2 } }));
    render(<OpenShiftModal onConfirm={vi.fn()} />);

    expect(await screen.findByText(/too old to trust/i)).toBeTruthy();
    expect(screen.getByTestId("open-shift-running-total")).toHaveTextContent("MVR 0.00");
    expect(screen.getByTestId("denom-count-50000")).toHaveTextContent("0");
  });

  it("shows who has the till and offers a manager override on a 409", async () => {
    // Shift history audit, 2026-10-02: one drawer, one open shift.
    mockHistory.mockResolvedValue({ shifts: [] });
    const conflict = Object.assign(new Error("Aisha has shift #12 open on this till."), {
      status: 409,
      body: {
        message: "Aisha has shift #12 open on this till since Thu 2 Oct, 09:15. Ask them to close it, or open anyway as a manager.",
        open_shift: { id: 12, user_id: 4, user_name: "Aisha", opened_at: "2026-10-02T04:15:00+00:00" },
        can_override: true,
      },
    });
    const onConfirm = vi.fn().mockRejectedValueOnce(conflict).mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(<OpenShiftModal onConfirm={onConfirm} />);

    await user.click(screen.getByRole("button", { name: "Digit 0" }));
    await user.click(screen.getByRole("button", { name: "Open shift" }));
    expect((await screen.findByTestId("open-shift-conflict")).textContent).toMatch(/Aisha has shift #12 open/);
    await user.click(screen.getByRole("button", { name: "Open anyway (manager)" }));
    await waitFor(() => expect(onConfirm).toHaveBeenLastCalledWith(expect.objectContaining({ override: true, openingCash: 0 })));
  });
});
