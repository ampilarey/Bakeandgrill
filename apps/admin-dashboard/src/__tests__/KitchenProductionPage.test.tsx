import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import KitchenProductionPage from "../pages/KitchenProductionPage";

vi.mock("../hooks/usePermissions", () => ({
  useCurrentUserPermissions: () => ({ can: () => true, user: null, loading: false }),
}));

vi.mock("../api/kitchen-production", () => ({
  fetchKitchenProductionSummary: vi.fn().mockResolvedValue({ summary: { pending_receive: 2 }, from: "2026-01-01", to: "2026-01-31" }),
  fetchKitchenHandoverReport: vi.fn().mockResolvedValue({ data: [] }),
  fetchKitchenProductionBatches: vi.fn().mockResolvedValue({ data: [], meta: { current_page: 1, last_page: 1, total: 0 } }),
  fetchKitchenReceivingPending: vi.fn().mockResolvedValue({ data: [] }),
  fetchKitchenVariances: vi.fn().mockResolvedValue({ data: [], meta: { current_page: 1, last_page: 1, total: 0 } }),
  fetchKitchenWasteReport: vi.fn().mockResolvedValue({ data: [] }),
  fetchKitchenStaffOutputReport: vi.fn().mockResolvedValue({ data: [] }),
  fetchKitchenPosReceivingReport: vi.fn().mockResolvedValue({ data: [] }),
  fetchKitchenHandoverSettings: vi.fn().mockResolvedValue({ settings: { kitchen_require_pos_receiving_before_ready: true } }),
  updateKitchenHandoverSettings: vi.fn(),
  reviewKitchenVariance: vi.fn(),
}));

describe("KitchenProductionPage", () => {
  it("renders page title and tabs", async () => {
    render(<KitchenProductionPage />);
    expect(screen.getByRole('heading', { name: /Kitchen Handover/i })).toBeTruthy();
    expect(await screen.findByText(/pending receive/i)).toBeTruthy();
  });
});
