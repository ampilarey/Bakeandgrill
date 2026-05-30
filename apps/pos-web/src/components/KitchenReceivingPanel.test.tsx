import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { KitchenReceivingPanel } from "./KitchenReceivingPanel";

vi.mock("../api", () => ({
  fetchKitchenReceivingPending: vi.fn().mockResolvedValue({ data: [] }),
  receiveKitchenBatchAll: vi.fn(),
}));

describe("KitchenReceivingPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders empty queue state", async () => {
    render(<KitchenReceivingPanel onClose={() => undefined} />);
    expect(await screen.findByText(/Nothing waiting/i)).toBeTruthy();
  });
});
