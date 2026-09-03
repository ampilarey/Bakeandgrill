import { describe, expect, it } from "vitest";
import { autoTabKey, fitPillRow, flattenTabs, moveInList, newTabId, pillWidth, tabOpenAt } from "./quickTabs";

const tab = (id: string, from: string | null = null, to: string | null = null) =>
  ({ id, name: id, items: [], from, to });

describe("tabOpenAt", () => {
  const at = (h: number, m = 0) => new Date(2026, 8, 2, h, m);

  it("is closed without hours", () => {
    expect(tabOpenAt(tab("a"), at(9))).toBe(false);
  });

  it("covers a daytime window, start inclusive, end exclusive", () => {
    const t = tab("a", "06:00", "11:00");
    expect(tabOpenAt(t, at(5, 59))).toBe(false);
    expect(tabOpenAt(t, at(6))).toBe(true);
    expect(tabOpenAt(t, at(10, 59))).toBe(true);
    expect(tabOpenAt(t, at(11))).toBe(false);
  });

  it("runs past midnight when the end is before the start", () => {
    const t = tab("late", "22:00", "02:00");
    expect(tabOpenAt(t, at(23))).toBe(true);
    expect(tabOpenAt(t, at(1))).toBe(true);
    expect(tabOpenAt(t, at(3))).toBe(false);
    expect(tabOpenAt(t, at(21))).toBe(false);
  });
});

describe("autoTabKey", () => {
  it("picks the first open tab in strip order, own tabs before shared", () => {
    const tabs = flattenTabs({
      mine: [tab("m1", "12:00", "14:00"), tab("m2", "06:00", "11:00")],
      shared: [tab("s1", "06:00", "11:00")],
    });
    expect(autoTabKey(tabs, new Date(2026, 8, 2, 8))).toBe("mine:m2");
    expect(autoTabKey(tabs, new Date(2026, 8, 2, 13))).toBe("mine:m1");
    expect(autoTabKey(tabs, new Date(2026, 8, 2, 16))).toBeNull();
  });
});

describe("newTabId / moveInList", () => {
  it("never reuses an id that is taken", () => {
    expect(newTabId([tab("tab-1"), tab("tab-2")])).toBe("tab-3");
    expect(newTabId([tab("tab-2")])).toBe("tab-1");
    expect(newTabId([tab("tab-1"), tab("tab-3")])).toBe("tab-2");
  });

  it("moves within bounds and leaves the list alone at the edges", () => {
    expect(moveInList([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
    expect(moveInList([1, 2, 3], 2, 1)).toEqual([1, 2, 3]);
    expect(moveInList([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
  });
});

/**
 * Owner, 2026-09-03: "keep fixed to the screen — left side All, right side
 * More, in between tabs to fit the screen."
 */
describe("fitPillRow", () => {
  const pills = ["Drinks", "Hedhika", "Breakfast", "Grill", "Desserts", "Events & Catering"];

  it("shows everything when the width is unknown", () => {
    expect(fitPillRow(0, "All items", pills).visible).toHaveLength(pills.length);
    expect(fitPillRow(0, "All items", pills).hidden).toEqual([]);
  });

  it("shows everything when it all fits", () => {
    expect(fitPillRow(2000, "All items", pills).hidden).toEqual([]);
  });

  it("keeps room for the pinned pills once something has to hide", () => {
    const { visible, hidden } = fitPillRow(420, "All items", pills);
    expect(visible.length).toBeGreaterThan(0);
    expect(hidden.length).toBeGreaterThan(0);
    // Nothing is lost and nothing is listed twice.
    expect([...visible, ...hidden].sort((a, b) => a - b)).toEqual(pills.map((_, i) => i));
  });

  it("keeps the strip in order — a short label never jumps a long one", () => {
    const { visible, hidden } = fitPillRow(420, "All items", ["Grill", "A very long category name here", "Tea"]);
    expect(visible).toEqual([0]);
    expect(hidden).toEqual([1, 2]);
  });

  it("holds back a safety margin so a pill is never clipped", () => {
    // A width that fits the estimate exactly must still not fill the row.
    const one = [pills[0]];
    const exact = pillWidth("All items") + 6 + pillWidth(one[0]);
    expect(fitPillRow(exact, "All items", one).hidden).toHaveLength(1);
    expect(fitPillRow(exact + 20, "All items", one).hidden).toHaveLength(0);
  });
});
