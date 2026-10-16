import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const previewAutoPromo = vi.fn();
vi.mock("../api/loyalty", () => ({
  previewAutoPromo: (...a: unknown[]) => previewAutoPromo(...a),
}));

import { useAutoPromoPreview } from "./useAutoPromoPreview";

const lines = [{ item_id: 1, quantity: 2, unit_price: 100, total_price: 200 }];

describe("useAutoPromoPreview (owner, 2026-10-16: the offer shows before Charge)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    previewAutoPromo.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("asks the server for the cart and shows the first offer", async () => {
    previewAutoPromo.mockResolvedValue({
      discount_laar: 2000, discount_mvr: "20.00",
      promotions: [{ id: 7, name: "Morning 10%", type: "percentage", discount_value: 10, expires_at: null }],
      ends_at: "2026-10-16T10:00:00+05:00",
    });
    const { result } = renderHook(() => useAutoPromoPreview({ lines, customerId: 4, enabled: true }));
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(result.current).toEqual({
      name: "Morning 10%", promotionId: 7, discount: 20, endsAt: "2026-10-16T10:00:00+05:00",
    });
    expect(previewAutoPromo).toHaveBeenCalledWith({ items: lines, customerId: 4 });
  });

  it("shows nothing for a resumed ticket, an empty cart, or when the server cannot answer", async () => {
    previewAutoPromo.mockRejectedValue(new Error("offline"));
    const { result, rerender } = renderHook(
      (p: { enabled: boolean; l: typeof lines }) => useAutoPromoPreview({ lines: p.l, customerId: null, enabled: p.enabled }),
      { initialProps: { enabled: false, l: lines } },
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(previewAutoPromo).not.toHaveBeenCalled();
    expect(result.current).toBeNull();

    rerender({ enabled: true, l: [] });
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(previewAutoPromo).not.toHaveBeenCalled();

    rerender({ enabled: true, l: lines });
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(previewAutoPromo).toHaveBeenCalledTimes(1);
    expect(result.current).toBeNull();
  });

  it("asks again the moment the offer ends", async () => {
    vi.setSystemTime(new Date("2026-10-16T09:59:50+05:00"));
    previewAutoPromo
      .mockResolvedValueOnce({
        discount_laar: 2000, discount_mvr: "20.00",
        promotions: [{ id: 7, name: "Morning 10%", type: "percentage", discount_value: 10, expires_at: null }],
        ends_at: "2026-10-16T10:00:00+05:00",
      })
      .mockResolvedValue({ discount_laar: 0, discount_mvr: "0.00", promotions: [], ends_at: null });
    const { result } = renderHook(() => useAutoPromoPreview({ lines, customerId: null, enabled: true }));
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(result.current?.discount).toBe(20);
    // 10 s to the end plus 1 s grace fires the re-ask; the debounce runs after.
    await act(async () => { await vi.advanceTimersByTimeAsync(11_200); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(result.current).toBeNull();
    expect(previewAutoPromo).toHaveBeenCalledTimes(2);
  });
});
