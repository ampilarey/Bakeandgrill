import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AssignedBuyingListPanel } from "./AssignedBuyingListPanel";

vi.mock("../api", () => ({
  fetchAssignedPurchaseRequests: vi.fn().mockResolvedValue({
    data: [{
      id: 1,
      request_no: "PR-20260522-0001",
      priority: "normal",
      items: [{ id: 10, name: "Gas", requested_qty: 1, requested_unit: "tank", approved_qty: 1, status: "assigned" }],
    }],
  }),
  markPurchaseRequestItemBought: vi.fn(),
  markPurchaseRequestItemPartial: vi.fn(),
  markPurchaseRequestItemNotAvailable: vi.fn(),
  uploadPurchaseRequestAttachment: vi.fn(),
}));

describe("AssignedBuyingListPanel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows assigned items with action buttons", async () => {
    render(<AssignedBuyingListPanel onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Gas/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Bought/i })).toBeInTheDocument();
  });
});
