import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useStaffRefresh, STAFF_REFRESH } from "./useStaffRefresh";
import { PERMISSIONS_STALE_EVENT } from "../api/client";

/*
 * Owner, 2026-10-10: Pickup was switched off for cashiers in Admin, yet a
 * signed-in till still offered it. The till kept the list from sign-in; now
 * it reads the person again while it is in use.
 */
let visibility: DocumentVisibilityState = "visible";

function setVisibility(v: DocumentVisibilityState) {
  visibility = v;
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("useStaffRefresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    visibility = "visible";
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads the person shortly after sign-in, then every minute while on screen", () => {
    const refresh = vi.fn();
    renderHook(() => useStaffRefresh(true, refresh));
    expect(refresh).not.toHaveBeenCalled();

    vi.advanceTimersByTime(STAFF_REFRESH.firstMs);
    expect(refresh).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(STAFF_REFRESH.everyMs);
    expect(refresh).toHaveBeenCalledTimes(2);

    // Off screen: no reads.
    visibility = "hidden";
    vi.advanceTimersByTime(STAFF_REFRESH.everyMs * 3);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("reads again when the till comes back on screen, but not twice in a row", () => {
    const refresh = vi.fn();
    renderHook(() => useStaffRefresh(true, refresh));
    vi.advanceTimersByTime(STAFF_REFRESH.firstMs);
    expect(refresh).toHaveBeenCalledTimes(1);

    // Back on screen straight after a read: nothing new to learn yet.
    setVisibility("hidden");
    setVisibility("visible");
    expect(refresh).toHaveBeenCalledTimes(1);

    setVisibility("hidden");
    vi.advanceTimersByTime(STAFF_REFRESH.minGapMs + 1);
    setVisibility("visible");
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("reads at once when the server refuses something the till offered", () => {
    const refresh = vi.fn();
    renderHook(() => useStaffRefresh(true, refresh));
    vi.advanceTimersByTime(STAFF_REFRESH.firstMs + STAFF_REFRESH.minGapMs + 1);
    const before = refresh.mock.calls.length;

    window.dispatchEvent(new Event(PERMISSIONS_STALE_EVENT));
    expect(refresh).toHaveBeenCalledTimes(before + 1);
  });

  it("does nothing while signed out, and stops at sign-out", () => {
    const refresh = vi.fn();
    const { rerender } = renderHook(({ on }) => useStaffRefresh(on, refresh), { initialProps: { on: false } });
    vi.advanceTimersByTime(STAFF_REFRESH.everyMs * 2);
    window.dispatchEvent(new Event(PERMISSIONS_STALE_EVENT));
    expect(refresh).not.toHaveBeenCalled();

    rerender({ on: true });
    vi.advanceTimersByTime(STAFF_REFRESH.firstMs);
    expect(refresh).toHaveBeenCalledTimes(1);

    rerender({ on: false });
    vi.advanceTimersByTime(STAFF_REFRESH.everyMs * 2);
    window.dispatchEvent(new Event(PERMISSIONS_STALE_EVENT));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
