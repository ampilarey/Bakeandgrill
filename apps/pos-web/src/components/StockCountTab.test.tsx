import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StockCountTab } from "./StockCountTab";
import * as api from "../api";

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    fetchActiveStockCount: vi.fn(),
    openStockCount: vi.fn(),
    saveStockCounts: vi.fn(),
    submitStockCount: vi.fn(),
    postStockCount: vi.fn(),
    reopenStockCount: vi.fn(),
    cancelStockCount: vi.fn(),
  };
});

const fn = (k: keyof typeof api) => api[k] as unknown as ReturnType<typeof vi.fn>;

const openSheet = {
  session: { id: 7, reference: "SC-2026-0007", status: "open", note: null, opened_at: "", submitted_at: null, posted_at: null },
  lines: [
    { id: 1, inventory_item_id: 11, name: "Rice", unit: "kg", sku: "R1", counted_qty: null, note: null, counted_at: null },
    { id: 2, inventory_item_id: 12, name: "Saffron", unit: "kg", sku: "S1", counted_qty: null, note: null, counted_at: null },
  ],
  can_review: false,
  variance_value_mvr: null,
};

describe("POS stock count — blind entry", () => {
  beforeEach(() => vi.clearAllMocks());

  it("offers to start a count when there is none", async () => {
    fn("fetchActiveStockCount").mockResolvedValue({ session: null });
    render(<StockCountTab setOpsMessage={vi.fn()} />);

    expect(await screen.findByTestId("stock-count-open")).toBeTruthy();
  });

  it("never shows the expected quantity while counting", async () => {
    /*
     * The whole point. The server does not send it, so there is nothing here
     * to leak — this pins that the screen does not invent one either.
     */
    fn("fetchActiveStockCount").mockResolvedValue(openSheet);
    render(<StockCountTab setOpsMessage={vi.fn()} />);

    await screen.findByTestId("stock-count-lines");
    const sheet = screen.getByTestId("stock-count-lines");

    expect(sheet.textContent).toContain("Rice");
    expect(sheet.textContent).not.toMatch(/expected/i);
    expect(screen.queryByTestId("stock-count-review")).toBeNull();
  });

  it("saves a line when the field is left, not on every keystroke", async () => {
    // A half-typed "1" on the way to "12" is a real number to the server.
    fn("fetchActiveStockCount").mockResolvedValue(openSheet);
    fn("saveStockCounts").mockResolvedValue(openSheet);
    render(<StockCountTab setOpsMessage={vi.fn()} />);

    const input = await screen.findByTestId("stock-count-input-1");
    fireEvent.change(input, { target: { value: "37.5" } });
    expect(fn("saveStockCounts")).not.toHaveBeenCalled();

    fireEvent.blur(input);
    await waitFor(() => expect(fn("saveStockCounts")).toHaveBeenCalledWith(7, [
      { line_id: 1, counted_qty: 37.5 },
    ]));
  });

  it("sends an emptied field as nothing counted, not as zero", async () => {
    // "I did not get to the flour" is not "there is no flour".
    fn("fetchActiveStockCount").mockResolvedValue({
      ...openSheet,
      lines: [{ ...openSheet.lines[0], counted_qty: 12 }, openSheet.lines[1]],
    });
    fn("saveStockCounts").mockResolvedValue(openSheet);
    render(<StockCountTab setOpsMessage={vi.fn()} />);

    const input = await screen.findByTestId("stock-count-input-1");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);

    await waitFor(() => expect(fn("saveStockCounts")).toHaveBeenCalledWith(7, [
      { line_id: 1, counted_qty: null },
    ]));
  });

  it("keeps a failed entry on screen to retry", async () => {
    // Losing the number the moment the wifi drops is how a count gets counted
    // twice.
    fn("fetchActiveStockCount").mockResolvedValue(openSheet);
    fn("saveStockCounts").mockRejectedValue(new Error("Network request failed"));
    const setOpsMessage = vi.fn();
    render(<StockCountTab setOpsMessage={setOpsMessage} />);

    const input = await screen.findByTestId("stock-count-input-1");
    fireEvent.change(input, { target: { value: "37" } });
    fireEvent.blur(input);

    await waitFor(() => expect(setOpsMessage).toHaveBeenCalled());
    expect((screen.getByTestId("stock-count-input-1") as HTMLInputElement).value).toBe("37");
  });

  it("will not hand over a sheet with nothing counted", async () => {
    fn("fetchActiveStockCount").mockResolvedValue(openSheet);
    render(<StockCountTab setOpsMessage={vi.fn()} />);

    expect((await screen.findByTestId("stock-count-submit") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("POS stock count — review", () => {
  const submitted = {
    session: { id: 7, reference: "SC-2026-0007", status: "submitted", note: null, opened_at: "", submitted_at: "x", posted_at: null },
    lines: [
      {
        id: 1, inventory_item_id: 11, name: "Rice", unit: "kg", sku: "R1",
        counted_qty: 37, note: null, counted_at: "x",
        snapshot_qty: 40, variance: -3, variance_value_mvr: 36, needs_reason: false,
      },
      {
        id: 2, inventory_item_id: 12, name: "Saffron", unit: "kg", sku: "S1",
        counted_qty: 2, note: null, counted_at: "x",
        snapshot_qty: 3, variance: -1, variance_value_mvr: 900, needs_reason: true,
      },
    ],
    can_review: true,
    variance_value_mvr: 936,
  };

  beforeEach(() => vi.clearAllMocks());

  it("shows the differences and what they are worth", async () => {
    fn("fetchActiveStockCount").mockResolvedValue(submitted);
    render(<StockCountTab setOpsMessage={vi.fn()} />);

    const panel = await screen.findByTestId("stock-count-review");
    expect(panel.textContent).toContain("MVR 936.00");
    expect(panel.textContent).toContain("Saffron");
    expect(panel.textContent).toContain("expected 3");
  });

  it("blocks posting until a costly difference has a reason", async () => {
    fn("fetchActiveStockCount").mockResolvedValue(submitted);
    render(<StockCountTab setOpsMessage={vi.fn()} />);

    const post = await screen.findByTestId("stock-count-post");
    expect((post as HTMLButtonElement).disabled).toBe(true);
    expect(post.textContent).toContain("reason");
  });

  it("posts once every costly difference is explained", async () => {
    fn("fetchActiveStockCount").mockResolvedValue({
      ...submitted,
      lines: [submitted.lines[0], { ...submitted.lines[1], note: "Spilled at prep." }],
    });
    fn("postStockCount").mockResolvedValue({ ...submitted, session: { ...submitted.session, status: "posted" } });
    render(<StockCountTab setOpsMessage={vi.fn()} />);

    const post = await screen.findByTestId("stock-count-post");
    expect((post as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(post);
    await waitFor(() => expect(fn("postStockCount")).toHaveBeenCalledWith(7));
  });

  it("tells a counter without review rights that nothing has moved", async () => {
    fn("fetchActiveStockCount").mockResolvedValue({
      ...submitted,
      can_review: false,
      variance_value_mvr: null,
      lines: submitted.lines.map(({ snapshot_qty: _s, variance: _v, variance_value_mvr: _vv, needs_reason: _n, ...rest }) => rest),
    });
    render(<StockCountTab setOpsMessage={vi.fn()} />);

    expect(await screen.findByText(/nothing has moved yet/i)).toBeTruthy();
    expect(screen.queryByTestId("stock-count-review")).toBeNull();
  });
});
