import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { AssignedBuyingListPanel } from "./AssignedBuyingListPanel";

/*
 * Owner, 2026-09-09: "can i upload a pic of different brand of item to know
 * which brand is this."
 *
 * Eggs come as three brands and only the packet tells them apart. The buying
 * list on the phone shows the packets, and tapping the one you bought fills
 * the brand box, so the record writes itself instead of relying on somebody
 * spelling "Sunrise" the same way twice.
 */

const markBought = vi.fn().mockResolvedValue({});

vi.mock("../api", () => ({
  fetchAssignedPurchaseRequests: vi.fn().mockResolvedValue({
    data: [{
      id: 1,
      request_no: "PR-20260909-0001",
      priority: "normal",
      items: [{
        id: 10,
        name: "Egg",
        requested_qty: 30,
        requested_unit: "piece",
        approved_qty: 30,
        status: "assigned",
        brand: "Sunrise",
        brand_photos: [
          { id: 1, brand: "Sunrise", url: "https://cdn.test/sunrise.jpg", note: null },
          { id: 2, brand: "Royal", url: "https://cdn.test/royal.jpg", note: null },
          { id: 3, brand: "GRB", url: null, note: null },
        ],
      }, {
        id: 11,
        name: "Gas",
        requested_qty: 1,
        requested_unit: "tank",
        approved_qty: 1,
        status: "assigned",
      }],
    }],
  }),
  markPurchaseRequestItemBought: (...a: unknown[]) => markBought(...a),
  markPurchaseRequestItemPartial: vi.fn(),
  markPurchaseRequestItemNotAvailable: vi.fn(),
  uploadPurchaseRequestAttachment: vi.fn(),
}));

describe("Brand pictures on the buying list", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows a picture of every brand this item has been bought as", async () => {
    render(<AssignedBuyingListPanel onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("Egg")).toBeInTheDocument());

    const strip = screen.getByTestId("brand-photos-10");
    const shots = within(strip).getAllByRole("img");
    expect(shots.map((i) => i.getAttribute("alt"))).toEqual(["Sunrise", "Royal"]);
    expect(shots[0]).toHaveAttribute("src", "https://cdn.test/sunrise.jpg");
  });

  it("says which brand the kitchen usually buys", async () => {
    render(<AssignedBuyingListPanel onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("Egg")).toBeInTheDocument());

    expect(screen.getByText(/Usually Sunrise/)).toBeInTheDocument();
  });

  it("tapping a packet records that brand, and tapping again clears it", async () => {
    render(<AssignedBuyingListPanel onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("Egg")).toBeInTheDocument());

    const royal = screen.getByLabelText(/Royal — tap if this is the one you bought/);
    expect(royal).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(royal);
    expect(royal).toHaveAttribute("aria-pressed", "true");
    // Only the one you picked.
    expect(screen.getByLabelText(/Sunrise — tap/)).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(royal);
    expect(royal).toHaveAttribute("aria-pressed", "false");
  });

  it("sends the tapped brand when the item is marked bought", async () => {
    render(<AssignedBuyingListPanel onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("Egg")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText(/Royal — tap if this is the one you bought/));
    fireEvent.click(screen.getAllByRole("button", { name: /^Bought$/i })[0]);

    await waitFor(() => expect(markBought).toHaveBeenCalled());
    const [, , payload] = markBought.mock.calls[0] as [number, number, { brand?: string }];
    expect(payload.brand).toBe("Royal");
  });

  it("leaves out a brand nobody has photographed", async () => {
    // Owner, 2026-09-09: "photo is optional". A tile with nothing in it is
    // worse than no tile on a strip meant to be recognised at arm's length.
    render(<AssignedBuyingListPanel onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("Egg")).toBeInTheDocument());

    const strip = screen.getByTestId("brand-photos-10");
    expect(within(strip).getAllByRole("img").map((i) => i.getAttribute("alt")))
      .toEqual(["Sunrise", "Royal"]);
    expect(screen.queryByLabelText(/GRB — tap/)).toBeNull();
  });

  it("shows no strip for an item that has no pictures", async () => {
    render(<AssignedBuyingListPanel onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("Gas")).toBeInTheDocument());

    expect(screen.queryByTestId("brand-photos-11")).toBeNull();
  });
});
