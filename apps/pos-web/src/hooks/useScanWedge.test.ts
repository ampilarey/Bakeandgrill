/**
 * A barcode gun types like a keyboard, fast, then Enter. Owner, 2026-09-02:
 * the till should hear it wherever focus is, and never mistake a person
 * typing for a gun.
 */
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useScanWedge } from "./useScanWedge";

function type(text: string, target: EventTarget = document.body, gapMs = 5) {
  for (const ch of text) {
    target.dispatchEvent(new KeyboardEvent("keydown", { key: ch, bubbles: true }));
    vi.advanceTimersByTime(gapMs);
  }
}
const enter = (target: EventTarget = document.body) =>
  target.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useScanWedge", () => {
  it("hears a fast burst ending in Enter", () => {
    const onScan = vi.fn();
    renderHook(() => useScanWedge(onScan));

    type("GC-20260902-0007");
    enter();

    expect(onScan).toHaveBeenCalledWith("GC-20260902-0007");
  });

  it("ignores a person typing slowly, and anything typed into a field", () => {
    const onScan = vi.fn();
    renderHook(() => useScanWedge(onScan));

    type("ABCDEF", document.body, 200);
    enter();
    expect(onScan).not.toHaveBeenCalled();

    const input = document.createElement("input");
    document.body.appendChild(input);
    type("GC-20260902-0007", input);
    enter(input);
    expect(onScan).not.toHaveBeenCalled();
    input.remove();
  });

  it("does nothing while disabled", () => {
    const onScan = vi.fn();
    renderHook(() => useScanWedge(onScan, { enabled: false }));
    type("8801234567890");
    enter();
    expect(onScan).not.toHaveBeenCalled();
  });
});
