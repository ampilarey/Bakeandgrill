import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ToReceivePanel } from "./ToReceivePanel";

const fetchItemsToReceive = vi.fn();
const receivePurchaseRequestItem = vi.fn();

vi.mock("../api", () => ({
  fetchItemsToReceive: () => fetchItemsToReceive(),
  receivePurchaseRequestItem: (...a: unknown[]) => receivePurchaseRequestItem(...a),
}));

const line = (over: Record<string, unknown> = {}) => ({
  id: 11, request_id: 4, request_no: "PR-118",
  name: "Flour", qty: 25, unit: "kg", shop: "Fahi Store",
  bought_at: "2026-09-05T04:00:00Z", bought_by: "Ahmed",
  partial: false, requested_by: "Sana", priority: "normal",
  can_receive: true, blocked_reason: null,
  ...over,
});

/**
 * The screen at the back door. Accepting is what raises stock, so the button
 * has to say so — and the person who bought a line must not see a live button
 * on it at all.
 */
describe("ToReceivePanel", () => {
  beforeEach(() => {
    fetchItemsToReceive.mockReset().mockResolvedValue({ items: [line()] });
    receivePurchaseRequestItem.mockReset().mockResolvedValue({});
  });

  it("shows what arrived, how much, and from where", async () => {
    render(<ToReceivePanel onClose={vi.fn()} />);

    const list = await screen.findByTestId("to-receive-list");
    expect(list).toHaveTextContent("25 kg · Flour");
    expect(list).toHaveTextContent("From Fahi Store");
    expect(list).toHaveTextContent("bought by Ahmed");
  });

  /* Audit, 2026-09-18: the row named the item and the shop but not the brand
     the buyer recorded, so the box in hand could not be checked against it. */
  it("shows the item's picture, the brand bought and its packet", async () => {
    fetchItemsToReceive.mockResolvedValue({
      items: [line({ photo_url: "/storage/inventory-photos/1/flour.jpg", brand: "Sunrise", brand_photo_url: "/storage/brand-photos/1/sunrise.jpg" })],
    });
    render(<ToReceivePanel onClose={vi.fn()} />);

    const list = await screen.findByTestId("to-receive-list");
    expect(screen.getByTestId("to-receive-item-thumb")).toHaveAttribute("src", "/storage/inventory-photos/1/flour.jpg");
    expect(screen.getByTestId("to-receive-brand")).toHaveTextContent("Brand: Sunrise");
    expect(screen.getByAltText("Sunrise packet")).toHaveAttribute("src", "/storage/brand-photos/1/sunrise.jpg");
    expect(list).toHaveTextContent("25 kg · Flour");
  });

  it("says nothing about a brand when none was recorded", async () => {
    render(<ToReceivePanel onClose={vi.fn()} />);

    await screen.findByTestId("to-receive-list");
    expect(screen.queryByTestId("to-receive-brand")).toBeNull();
    expect(screen.queryByTestId("to-receive-item-thumb")).toBeNull();
  });

  it("says the accept button adds to stock, because that is what it does", async () => {
    render(<ToReceivePanel onClose={vi.fn()} />);

    expect(await screen.findByRole("button", { name: /add to stock/i })).toBeInTheDocument();
  });

  it("accepts a line, tells the caller, and drops it from the list", async () => {
    const onReceived = vi.fn();
    render(<ToReceivePanel onClose={vi.fn()} onReceived={onReceived} />);

    fireEvent.click(await screen.findByRole("button", { name: /add to stock/i }));

    await waitFor(() => expect(receivePurchaseRequestItem).toHaveBeenCalledWith(4, 11, { verified_notes: undefined }));
    expect(onReceived).toHaveBeenCalled();
    // Gone from the list without a refetch — a reload on a slow connection
    // makes the tap feel lost.
    expect(await screen.findByTestId("to-receive-empty")).toBeInTheDocument();
    expect(fetchItemsToReceive).toHaveBeenCalledTimes(1);
  });

  it("sends a note when one is typed", async () => {
    render(<ToReceivePanel onClose={vi.fn()} />);
    await screen.findByTestId("to-receive-list");

    fireEvent.change(screen.getByRole("textbox", { name: /Note for Flour/i }), {
      target: { value: "One bag torn" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add to stock/i }));

    await waitFor(() =>
      expect(receivePurchaseRequestItem).toHaveBeenCalledWith(4, 11, { verified_notes: "One bag torn" }));
  });

  it("gives the buyer no button, and says who has to accept instead", async () => {
    /*
     * The server refuses it either way. Showing a live button that fails on
     * press would just teach staff the screen is broken.
     */
    fetchItemsToReceive.mockResolvedValue({
      items: [line({ can_receive: false, blocked_reason: "You bought this one — somebody else has to accept it." })],
    });
    render(<ToReceivePanel onClose={vi.fn()} />);

    expect(await screen.findByText(/somebody else has to accept it/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add to stock/i })).not.toBeInTheDocument();
  });

  it("marks a part delivery as such", async () => {
    fetchItemsToReceive.mockResolvedValue({ items: [line({ partial: true })] });
    render(<ToReceivePanel onClose={vi.fn()} />);

    expect(await screen.findByText("Part only")).toBeInTheDocument();
  });

  it("keeps the line and shows why when accepting fails", async () => {
    receivePurchaseRequestItem.mockRejectedValue(new Error("You bought this one, so somebody else has to accept it."));
    render(<ToReceivePanel onClose={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: /add to stock/i }));

    expect(await screen.findByText(/somebody else has to accept it/)).toBeInTheDocument();
    expect(screen.getByTestId("to-receive-list")).toHaveTextContent("Flour");
  });

  it("says plainly when nothing is waiting", async () => {
    fetchItemsToReceive.mockResolvedValue({ items: [] });
    render(<ToReceivePanel onClose={vi.fn()} />);

    expect(await screen.findByTestId("to-receive-empty")).toBeInTheDocument();
  });
});
