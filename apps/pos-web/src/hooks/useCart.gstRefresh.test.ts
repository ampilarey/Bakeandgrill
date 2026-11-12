/**
 * Owner, 2026-11-12: a cashier saved a ticket and Charge asked for less than
 * the cart showed. The till kept the GST rate it read when it opened, so with
 * Charge GST on sales switched off in Admin the cart went on adding 8% that
 * the server no longer charged. The rate now follows Admin while the till is open.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const rate = vi.hoisted(() => ({ percent: 8, fail: false }));
const sc = vi.hoisted(() => ({ percent: 0, fail: false }));

vi.mock("../api", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    fetchPublicSiteSettingsStrict: vi.fn(async () => {
      if (sc.fail) throw new Error("offline");
      return sc.percent > 0
        ? { service_charge_enabled: "1", service_charge_type: "percent", service_charge_value: String(sc.percent), service_charge_apply_dine_in: "1", service_charge_taxable: "0" }
        : {};
    }),
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
    sc.percent = 0;
    sc.fail = false;
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

  it("follows a service charge changed in Admin, and keeps it when a refresh fails", async () => {
    sc.percent = 10;
    rate.percent = 0;
    const { useCart } = await import("./useCart");
    const { result } = renderHook(() => useCart("Dine-in"));
    act(() => { result.current.addToCart(item as never); });
    await waitFor(() => expect(result.current.cartServiceCharge).toBeCloseTo(10, 2));

    sc.percent = 5;
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    await waitFor(() => expect(result.current.cartServiceCharge).toBeCloseTo(5, 2));

    // A failed ask used to read as "no service charge".
    sc.fail = true;
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.cartServiceCharge).toBeCloseTo(5, 2);
  });
});
