import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { KitchenProductionPanel } from "./KitchenProductionPanel";

vi.mock("../../api", () => ({
  markOrderItemCooked: vi.fn(),
  createKitchenProductionBatch: vi.fn(),
  submitKitchenProductionBatch: vi.fn(),
}));

describe("KitchenProductionPanel", () => {
  it("shows order production tab with cook progress", () => {
    render(
      <KitchenProductionPanel
        token="tok"
        canProduce
        canPreparedStock
        onRefresh={() => undefined}
        orders={[{
          id: 1,
          order_number: "T-1",
          status: "in_progress",
          created_at: new Date().toISOString(),
          items: [{
            id: 10,
            item_name: "Burger",
            quantity: 2,
            kitchen_produced_qty: 1,
          }],
        }]}
      />,
    );
    expect(screen.getByText(/Order production/i)).toBeTruthy();
    expect(screen.getByText(/Burger/)).toBeTruthy();
    expect(screen.getByText(/1\/2 cooked/)).toBeTruthy();
  });
});
