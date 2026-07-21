/**
 * FIX 9: offline cart math falls back to cached GST / service-charge
 * config from IndexedDB before hardcoded defaults.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  saveCachedGstBootstrap,
  saveCachedServiceChargeSettings,
} from "../offline/db";

// Both fetchers throw so we hit the cache-hydration branch.
vi.mock("../api", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    fetchPublicSiteSettings: vi.fn(async () => {
      throw new Error("offline");
    }),
    fetchGstBootstrap: vi.fn(async () => {
      throw new Error("offline");
    }),
  };
});

async function importUseCart() {
  const mod = await import("./useCart");
  return mod.useCart;
}

async function resetIndexedDb() {
  // fake-indexeddb starts fresh per test file, but reset stores between tests
  // to guarantee isolation of cache state.
  const { getOfflineDb } = await import("../offline/db");
  const db = await getOfflineDb();
  for (const store of Array.from(db.objectStoreNames)) {
    // eslint-disable-next-line no-await-in-loop
    await db.clear(store);
  }
}

describe("useCart FIX 9 — cached settings hydrate on fetch failure", () => {
  beforeEach(async () => {
    await resetIndexedDb();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("uses cached inclusive-tax bootstrap when fetchGstBootstrap fails", async () => {
    await saveCachedGstBootstrap({
      tax_rate_percent: 8,
      tax_inclusive: true,
      packaging_fee_taxable: true,
    });
    await saveCachedServiceChargeSettings({});

    const useCart = await importUseCart();
    const { result } = renderHook(() => useCart("Takeaway"));

    // Wait for the async cache-hydrate effect.
    await waitFor(() => {
      expect(result.current.settingsCacheAgeMs).not.toBeNull();
    });

    // Ring in a MVR 108 (tax-inclusive) item.
    act(() => {
      result.current.addToCart({
        id: 101,
        name: "Latte",
        base_price: 108,
        tax_rate: 8,
        tax_code: "standard_8",
        has_variants: false,
        variants: [],
        packaging_fee: 0,
        packaging_fee_mode: "per_unit",
        packaging_options: [],
      } as never);
    });

    // Tax-inclusive: gross === subtotal === grand total. Embedded tax = 8/108 of 108 = 8.
    expect(result.current.cartSubtotal).toBeCloseTo(108, 2);
    expect(result.current.cartTax).toBeCloseTo(8, 2);
    expect(result.current.cartGrandTotal).toBeCloseTo(108, 2);
  });

  it("falls back to hardcoded defaults when no cache present", async () => {
    const useCart = await importUseCart();
    const { result } = renderHook(() => useCart("Takeaway"));

    act(() => {
      result.current.addToCart({
        id: 202,
        name: "Burger",
        base_price: 100,
        tax_rate: 8,
        tax_code: "standard_8",
        has_variants: false,
        variants: [],
        packaging_fee: 0,
        packaging_fee_mode: "per_unit",
        packaging_options: [],
      } as never);
    });

    // Exclusive: subtotal 100 + 8 tax = 108 grand.
    expect(result.current.cartSubtotal).toBeCloseTo(100, 2);
    // Exact tax may need a moment to settle after async effect resolves.
    await waitFor(() => {
      expect(result.current.cartTax).toBeCloseTo(8, 2);
      expect(result.current.cartGrandTotal).toBeCloseTo(108, 2);
    });
    expect(result.current.settingsCacheAgeMs).toBeNull();
  });
});
