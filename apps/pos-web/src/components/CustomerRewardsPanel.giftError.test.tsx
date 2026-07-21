import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "@shared/api";

// Stub all api imports the panel touches. Only checkGiftCardBalance is
// exercised — the other functions must exist for module resolution.
vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    checkGiftCardBalance: vi.fn(),
    fetchCustomerSummary: vi.fn(async () => ({
      customer: { id: 1, is_vip: false, tier: 'bronze' },
      lifetime: { orders_count: 0, total_spent: '0', last_paid_at: null },
      loyalty: { available_points: 0, tier: 'bronze' },
      deposit: { balance_laar: 0, status: 'active' },
      credit: { enabled: false, available_laar: 0, balance_laar: 0 },
      is_vip: false,
    })),
    previewLoyaltyRedeem: vi.fn(),
    previewPromoForCart: vi.fn(),
  };
});

vi.mock("../api/loyalty", async () => {
  const actual = await vi.importActual<typeof import("../api/loyalty")>("../api/loyalty");
  return {
    ...actual,
    removeGiftCardFromOrder: vi.fn(),
  };
});

import { CustomerRewardsPanel } from "./CustomerRewardsPanel";
import { checkGiftCardBalance } from "../api";

const defaultProps = {
  customer: null,
  taxableSubtotal: 100,
  cartLines: [],
  manualDiscountMvr: 0,
  tenderRoom: 100,
  applied: { promo: null, loyalty: null, giftCard: null },
  setAppliedPromo: () => undefined,
  setAppliedLoyalty: () => undefined,
  setAppliedGiftCard: () => undefined,
  orderId: null,
} as const;

async function expandAndType(user: ReturnType<typeof userEvent.setup>) {
  const header = screen.getByRole("button", { name: /Gift card|Customer rewards/i });
  await user.click(header);
  const input = await screen.findByPlaceholderText(/Paste gift code/i);
  await user.type(input, "GC-TEST-1234");
  const applyBtn = screen.getByRole("button", { name: /^Apply$/i });
  await user.click(applyBtn);
}

describe("CustomerRewardsPanel FIX 6 — offline vs invalid gift-card errors", () => {
  const originalOnline = Object.getOwnPropertyDescriptor(navigator, "onLine");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalOnline) {
      Object.defineProperty(navigator, "onLine", originalOnline);
    } else {
      Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    }
  });

  it("shows the offline message when navigator.onLine is false", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    (checkGiftCardBalance as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new TypeError("Failed to fetch"),
    );

    const user = userEvent.setup();
    render(<CustomerRewardsPanel {...defaultProps} />);
    await expandAndType(user);

    await waitFor(() =>
      expect(
        screen.getByText(/You're offline — gift cards need a live connection\./i),
      ).toBeTruthy(),
    );
  });

  it("shows offline message when fetch throws a TypeError even if navigator says online", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    (checkGiftCardBalance as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new TypeError("NetworkError when attempting to fetch resource."),
    );

    const user = userEvent.setup();
    render(<CustomerRewardsPanel {...defaultProps} />);
    await expandAndType(user);

    await waitFor(() =>
      expect(
        screen.getByText(/You're offline/i),
      ).toBeTruthy(),
    );
  });

  it("shows the generic 'Invalid or unavailable' message on 404 ApiRequestError", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    (checkGiftCardBalance as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new ApiRequestError("Invalid or unavailable gift card.", 404, {
        error: "Invalid or unavailable gift card.",
      }),
    );

    const user = userEvent.setup();
    render(<CustomerRewardsPanel {...defaultProps} />);
    await expandAndType(user);

    await waitFor(() =>
      expect(screen.getByText(/Invalid or unavailable gift card\./i)).toBeTruthy(),
    );
  });

  it("shows the generic invalid message on 410 ApiRequestError even when offline", async () => {
    // 404/410 from the API is authoritative — do NOT surface the
    // offline message just because navigator.onLine reports false.
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    (checkGiftCardBalance as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new ApiRequestError("Invalid or unavailable gift card.", 410),
    );

    const user = userEvent.setup();
    render(<CustomerRewardsPanel {...defaultProps} />);
    await expandAndType(user);

    await waitFor(() =>
      expect(screen.getByText(/Invalid or unavailable gift card\./i)).toBeTruthy(),
    );
  });
});
