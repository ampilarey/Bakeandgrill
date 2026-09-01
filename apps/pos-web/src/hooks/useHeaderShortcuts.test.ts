import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { isPane, MAX_HEADER_SHORTCUTS, useHeaderShortcuts } from "./useHeaderShortcuts";

const KEY = "pos-header-shortcuts";

describe("useHeaderShortcuts", () => {
  beforeEach(() => localStorage.clear());

  it("starts empty and keeps what is pinned", () => {
    const { result } = renderHook(() => useHeaderShortcuts());
    expect(result.current.shortcuts).toEqual([]);

    act(() => result.current.add("receipts"));

    expect(result.current.shortcuts).toEqual(["receipts"]);
    expect(JSON.parse(localStorage.getItem(KEY) ?? "[]")).toEqual(["receipts"]);
  });

  it("survives a reload", () => {
    localStorage.setItem(KEY, JSON.stringify(["receipts", "open_tickets"]));
    const { result } = renderHook(() => useHeaderShortcuts());

    expect(result.current.shortcuts).toEqual(["receipts", "open_tickets"]);
  });

  it("does not pin the same pane twice", () => {
    const { result } = renderHook(() => useHeaderShortcuts());

    act(() => result.current.add("receipts"));
    act(() => result.current.add("receipts"));

    expect(result.current.shortcuts).toEqual(["receipts"]);
  });

  it("stops at the header's capacity", () => {
    // Past this the title starts truncating and the status pill gets pushed.
    const { result } = renderHook(() => useHeaderShortcuts());

    act(() => {
      result.current.add("receipts");
      result.current.add("open_tickets");
      result.current.add("shift");
      result.current.add("events");
      result.current.add("expenses");
    });

    expect(result.current.shortcuts).toHaveLength(MAX_HEADER_SHORTCUTS);
    expect(result.current.shortcuts).not.toContain("expenses");
    expect(result.current.isFull).toBe(true);
  });

  it("removes one without disturbing the rest", () => {
    const { result } = renderHook(() => useHeaderShortcuts());

    act(() => {
      result.current.add("receipts");
      result.current.add("open_tickets");
    });
    act(() => result.current.remove("receipts"));

    expect(result.current.shortcuts).toEqual(["open_tickets"]);
  });

  it("ignores junk under the key rather than breaking the header", () => {
    // Someone else's data, a half-written value, a cleared store mid-write.
    localStorage.setItem(KEY, "{not json");
    const { result } = renderHook(() => useHeaderShortcuts());

    expect(result.current.shortcuts).toEqual([]);
  });

  it("drops stored ids that are not panes", () => {
    // A pane renamed or retired in a later build must not leave a button that
    // navigates nowhere.
    localStorage.setItem(KEY, JSON.stringify(["receipts", "logout", "nonsense"]));
    const { result } = renderHook(() => useHeaderShortcuts());

    expect(result.current.shortcuts).toEqual(["receipts"]);
  });
});

describe("isPane", () => {
  it("accepts destinations and refuses actions", () => {
    // Actions are the reason this guard exists: a header button that logs you
    // out on a mistap is a hazard, not a shortcut.
    expect(isPane("receipts")).toBe(true);
    expect(isPane("kitchen_receiving")).toBe(true);
    expect(isPane("logout")).toBe(false);
    expect(isPane("lock")).toBe(false);
    expect(isPane("refresh_menu")).toBe(false);
    expect(isPane("preferences")).toBe(false);
  });
});
