import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import PurchaseRequestsPage from "../pages/PurchaseRequestsPage";

vi.mock("../hooks/usePageTitle", () => ({ usePageTitle: () => {} }));
vi.mock("../hooks/usePermissions", () => ({
  useCurrentUserPermissions: () => ({ can: (slug: string) => slug === "purchase_requests.view_all" || slug.startsWith("purchase_requests.") }),
}));
vi.mock("../components/ui", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));
vi.mock("../api", () => ({
  fetchStaff: vi.fn().mockResolvedValue({ staff: [{ id: 2, name: "Buyer" }], roles: [] }),
}));
vi.mock("../api/procurement", () => ({
  fetchPurchaseRequests: vi.fn().mockResolvedValue({
    data: [{ id: 1, request_no: "PR-1", title: null, requester: { id: 1, name: "Ali" }, priority: "normal", status: "requested", items: [], needed_by: null }],
    meta: { current_page: 1, last_page: 1, total: 1 },
  }),
  getPurchaseRequest: vi.fn(),
  approvePurchaseRequest: vi.fn(),
  rejectPurchaseRequest: vi.fn(),
  assignPurchaseRequest: vi.fn(),
  cancelPurchaseRequest: vi.fn(),
  updatePurchaseRequest: vi.fn(),
  verifyPurchaseRequestItem: vi.fn(),
  verifyAllPurchaseRequestItems: vi.fn(),
  convertPurchaseRequestToPurchase: vi.fn(),
  convertPurchaseRequestToExpense: vi.fn(),
  laarToMvr: (l: number | null) => (l == null ? "—" : (l / 100).toFixed(2)),
}));

describe("PurchaseRequestsPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders tabs and pending requests", async () => {
    render(<PurchaseRequestsPage />);
    expect(screen.getByText(/Purchase Requests/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Pending/i })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/PR-1/i)).toBeInTheDocument());
  });
});
