/**
 * Owner, 2026-11-12: a cashier saved a ticket and Charge asked for less than
 * the cart showed. The till kept the GST rate it read when it opened, so with
 * Charge GST on sales switched off in Admin the cart went on adding 8% that
 * the server no longer charged. The rate now follows Admin while the till is open.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const rate = vi.hoisted(() => ({ percent: 8, fail: false }));

vi.mock("../api", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    fetchPublicSiteSettings: vi.fn(async () => ({})),
    fetchGstBootstrap: vi.fn(async () => {
      if (rate.fail) throw new Error("offline");
      return { default_tax_rate_bp: rate.percent * 100, tax_rate_percent: rate.percent, tax_inclusive: false, gst_registered: true, currency: "MVR", packaging_fee_taxable: rate.percent > 0 };
    }),
  };
});

const item = { id: 1, name: "Bajiya", base_price: 100, price: 100, tax_code: "standard_8" };

describe("useCart: the GST rate follows Admin while the till is open", () => {
  afterEach(() => {
    rate.percent = 8;
    rate.fail = false;
  });

  it("drops the GST from the cart when the till comes back to the front after it was switched off", async () => {
    const { useCart } = await import("./useCart");
    const { result } = renderHook(() => useCart("Takeaway"));
    act(() => { result.current.addToCart(item as never); });
    await waitFor(() => expect(result.current.cartTax).toBeCloseTo(8, 2));

    rate.percent = 0;
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    await waitFor(() => expect(result.current.cartTax).toBe(0));

    // A refresh that fails keeps what the cart has; it never goes back to a made-up 8%.
    rate.fail = true;
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.cartTax).toBe(0);
  });
});
