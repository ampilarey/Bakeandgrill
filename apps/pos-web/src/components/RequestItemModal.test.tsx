import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RequestItemModal } from "./RequestItemModal";

const createPurchaseRequest = vi.fn();
const fetchRequestCatalog = vi.fn();

vi.mock("../api", () => ({
  createPurchaseRequest: (...a: unknown[]) => createPurchaseRequest(...a),
  fetchRequestCatalog: () => fetchRequestCatalog(),
  uploadPurchaseRequestAttachment: vi.fn(),
}));

const catalog = {
  items: [
    { id: 7, name: "Chicken box", unit: "pcs", category_id: 1, category: "Packaging", current_stock: 40, reorder_point: 100, suggested_qty: 500 },
    { id: 8, name: "Mozzarella", unit: "kg", category_id: 2, category: "Dairy", current_stock: 6, reorder_point: 2, suggested_qty: null },
  ],
  categories: [{ id: 1, name: "Packaging" }, { id: 2, name: "Dairy" }],
};

/**
 * The owner's rule for this screen: staff pick, they do not write. These tests
 * hold that line — a picked line must carry the inventory item's id and the
 * item's own unit, never a typed name.
 */
describe("RequestItemModal", () => {
  beforeEach(() => {
    createPurchaseRequest.mockReset().mockResolvedValue({ request: { id: 1 } });
    fetchRequestCatalog.mockReset().mockResolvedValue(catalog);
  });

  const open = () => render(<RequestItemModal onClose={vi.fn()} />);

  it("offers the list, and asking for one sends its id and its unit", async () => {
    open();
    fireEvent.click(await screen.findByRole("button", { name: /Chicken box/ }));
    fireEvent.click(screen.getByRole("button", { name: /Send request/ }));

    await waitFor(() => expect(createPurchaseRequest).toHaveBeenCalled());
    const payload = createPurchaseRequest.mock.calls[0][0];
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0].inventory_item_id).toBe(7);
    // The unit is the item's own, so nobody can send "pcs" as "packs".
    expect(payload.items[0].requested_unit).toBe("pcs");
    expect(payload.items[0].free_text_name).toBeUndefined();
  });

  it("starts a line at the reorder quantity when the list suggests one", async () => {
    // 40 left against a reorder point of 100 — the useful ask is 500, not 1.
    open();
    fireEvent.click(await screen.findByRole("button", { name: /Chicken box/ }));

    expect(screen.getByTestId("request-basket")).toHaveTextContent("500 pcs");
  });

  it("tapping the same item again asks for one more of it", async () => {
    open();
    const row = await screen.findByRole("button", { name: /Mozzarella/ });
    fireEvent.click(row);
    fireEvent.click(row);

    expect(screen.getByTestId("request-basket")).toHaveTextContent("2 kg");
  });

  it("takes a line off the list when its quantity reaches zero", async () => {
    open();
    fireEvent.click(await screen.findByRole("button", { name: /Mozzarella/ }));
    fireEvent.click(screen.getByRole("button", { name: /Less Mozzarella/ }));

    expect(screen.queryByTestId("request-basket")).not.toBeInTheDocument();
  });

  it("will not send an empty request", async () => {
    open();
    await screen.findByRole("button", { name: /Chicken box/ });

    expect(screen.getByRole("button", { name: /Send request/ })).toBeDisabled();
    expect(createPurchaseRequest).not.toHaveBeenCalled();
  });

  it("filters by search and by category without touching the basket", async () => {
    open();
    fireEvent.click(await screen.findByRole("button", { name: /Chicken box/ }));

    fireEvent.change(screen.getByRole("textbox", { name: /Search items/i }), { target: { value: "mozz" } });
    expect(screen.getByTestId("request-catalog")).not.toHaveTextContent("Chicken box");
    // Already-picked lines are unaffected by what the list is showing.
    expect(screen.getByTestId("request-basket")).toHaveTextContent("Chicken box");

    fireEvent.change(screen.getByRole("textbox", { name: /Search items/i }), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Dairy" }));
    expect(screen.getByTestId("request-catalog")).not.toHaveTextContent("Chicken box");
    expect(screen.getByTestId("request-catalog")).toHaveTextContent("Mozzarella");
  });

  it("keeps a way to ask for something not on the list, and flags it", async () => {
    /*
     * A hard block would not stop the request — it would move it to a phone
     * call the system never sees. So the fallback stays, folded away, and the
     * line says plainly that it needs adding to the list.
     */
    open();
    await screen.findByRole("button", { name: /Chicken box/ });

    fireEvent.click(screen.getByRole("button", { name: /Can.t find it/ }));
    fireEvent.change(screen.getByRole("textbox", { name: /Item not on the list/i }), { target: { value: "Blue roll" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.click(screen.getByRole("button", { name: /Send request/ }));

    await waitFor(() => expect(createPurchaseRequest).toHaveBeenCalled());
    const line = createPurchaseRequest.mock.calls[0][0].items[0];
    expect(line.free_text_name).toBe("Blue roll");
    expect(line.inventory_item_id).toBeUndefined();
    expect(line.notes).toMatch(/add to inventory/i);
  });

  it("says so rather than showing an empty list when the catalogue fails", async () => {
    fetchRequestCatalog.mockRejectedValue(new Error("Offline"));
    open();

    expect(await screen.findByText("Offline")).toBeInTheDocument();
  });

  it("sends several items as one request", async () => {
    open();
    fireEvent.click(await screen.findByRole("button", { name: /Chicken box/ }));
    fireEvent.click(screen.getByRole("button", { name: /Mozzarella/ }));
    fireEvent.click(screen.getByRole("button", { name: /Send 2 items/ }));

    await waitFor(() => expect(createPurchaseRequest).toHaveBeenCalled());
    expect(createPurchaseRequest.mock.calls[0][0].items).toHaveLength(2);
  });
});
