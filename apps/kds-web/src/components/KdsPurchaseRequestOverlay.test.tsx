import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { KdsPurchaseRequestOverlay } from "./KdsPurchaseRequestOverlay";

const createPurchaseRequest = vi.fn();
const fetchRequestCatalog = vi.fn();
const fetchItemsToReceive = vi.fn();
const receivePurchaseRequestItem = vi.fn();

vi.mock("../api", () => ({
  createPurchaseRequest: (...a: unknown[]) => createPurchaseRequest(...a),
  fetchRequestCatalog: (...a: unknown[]) => fetchRequestCatalog(...a),
  fetchItemsToReceive: (...a: unknown[]) => fetchItemsToReceive(...a),
  receivePurchaseRequestItem: (...a: unknown[]) => receivePurchaseRequestItem(...a),
  fetchMyPurchaseRequests: vi.fn().mockResolvedValue({ data: [] }),
  fetchAssignedPurchaseRequests: vi.fn().mockResolvedValue({ data: [] }),
  markPurchaseRequestItemBought: vi.fn(),
  markPurchaseRequestItemNotAvailable: vi.fn(),
  markPurchaseRequestItemPartial: vi.fn(),
}));

const catalog = {
  items: [
    { id: 3, name: "Chicken thigh", unit: "kg", category_id: 1, category: "Meat", current_stock: 2, reorder_point: 10, suggested_qty: 20 },
    { id: 4, name: "Cooking oil", unit: "L", category_id: 2, category: "Dry goods", current_stock: 30, reorder_point: 5, suggested_qty: null },
  ],
  categories: [{ id: 1, name: "Meat" }, { id: 2, name: "Dry goods" }],
};

/**
 * The kitchen gets the same deal as the counter: pick, don't type. And the
 * cook at the kitchen door can take a delivery in — unless they bought it.
 */
describe("KdsPurchaseRequestOverlay", () => {
  beforeEach(() => {
    createPurchaseRequest.mockReset().mockResolvedValue({ request: { id: 1 } });
    fetchRequestCatalog.mockReset().mockResolvedValue(catalog);
    fetchItemsToReceive.mockReset().mockResolvedValue({ items: [] });
    receivePurchaseRequestItem.mockReset().mockResolvedValue({});
  });

  it("requests by picking, sending the item id and its unit", async () => {
    render(<KdsPurchaseRequestOverlay token="t" mode="request" onClose={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: /Chicken thigh/ }));
    fireEvent.click(screen.getByRole("button", { name: /Send request/ }));

    await waitFor(() => expect(createPurchaseRequest).toHaveBeenCalled());
    const line = createPurchaseRequest.mock.calls[0][1].items[0];
    expect(line.inventory_item_id).toBe(3);
    expect(line.requested_unit).toBe("kg");
    expect(line.free_text_name).toBeUndefined();
    // 2kg left against a reorder point of 10 — the useful ask is 20.
    expect(line.requested_qty).toBe(20);
  });

  it("has no free-text item field at all", async () => {
    // The owner's rule for this screen: they don't write anything. Search is
    // looking, not naming.
    render(<KdsPurchaseRequestOverlay token="t" mode="request" onClose={vi.fn()} />);
    await screen.findByRole("button", { name: /Chicken thigh/ });

    const boxes = screen.getAllByRole("textbox").map((el) => el.getAttribute("aria-label") ?? el.getAttribute("placeholder"));
    expect(boxes).not.toContain("Item name");
    expect(boxes).toContain("Search items");
  });

  it("filters by category", async () => {
    render(<KdsPurchaseRequestOverlay token="t" mode="request" onClose={vi.fn()} />);
    await screen.findByRole("button", { name: /Chicken thigh/ });

    fireEvent.click(screen.getByRole("button", { name: "Dry goods" }));
    const list = screen.getByTestId("kds-request-catalog");
    expect(list).toHaveTextContent("Cooking oil");
    expect(list).not.toHaveTextContent("Chicken thigh");
  });

  it("sends several items as one request", async () => {
    render(<KdsPurchaseRequestOverlay token="t" mode="request" onClose={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: /Chicken thigh/ }));
    fireEvent.click(screen.getByRole("button", { name: /Cooking oil/ }));
    fireEvent.click(screen.getByRole("button", { name: /Send 2 items/ }));

    await waitFor(() => expect(createPurchaseRequest).toHaveBeenCalled());
    expect(createPurchaseRequest.mock.calls[0][1].items).toHaveLength(2);
  });

  it("lets the cook accept a delivery at the kitchen door", async () => {
    fetchItemsToReceive.mockResolvedValue({
      items: [{
        id: 9, request_id: 2, request_no: "PR-9", name: "Chicken thigh", qty: 20, unit: "kg",
        shop: "Agora", bought_by: "Ahmed", partial: false, requested_by: "Cook",
        can_receive: true, blocked_reason: null,
      }],
    });
    render(<KdsPurchaseRequestOverlay token="t" mode="receive" onClose={vi.fn()} />);

    const row = await screen.findByTestId("kds-to-receive-row");
    expect(row).toHaveTextContent("20 kg · Chicken thigh");
    expect(row).toHaveTextContent("From Agora");

    fireEvent.click(screen.getByRole("button", { name: /add to stock/i }));
    await waitFor(() => expect(receivePurchaseRequestItem).toHaveBeenCalledWith("t", 2, 9));
    expect(await screen.findByTestId("kds-to-receive-empty")).toBeInTheDocument();
  });

  it("gives the buyer no accept button", async () => {
    fetchItemsToReceive.mockResolvedValue({
      items: [{
        id: 9, request_id: 2, request_no: "PR-9", name: "Chicken thigh", qty: 20, unit: "kg",
        shop: "Agora", bought_by: "Me", partial: false, requested_by: "Cook",
        can_receive: false, blocked_reason: "You bought this one — somebody else has to accept it.",
      }],
    });
    render(<KdsPurchaseRequestOverlay token="t" mode="receive" onClose={vi.fn()} />);

    expect(await screen.findByText(/somebody else has to accept it/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add to stock/i })).not.toBeInTheDocument();
  });
});
