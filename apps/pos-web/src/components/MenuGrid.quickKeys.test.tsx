/**
 * The Quick tabs and the Popular-now tab on the till.
 *
 * Owner, 2026-09-02: the POS showed categories and items only in the
 * admin's order, "but usually pos used for dine in customers and certain
 * items are frequent in certain times … each staff on his own" — then, the
 * same afternoon: more than one tab, renamed, rearranged, switching by time
 * of day, and copyable from a colleague. So:
 *
 *   - each Quick tab is a pill in front of the categories, own tabs first
 *   - a tab with hours opens itself when they start
 *   - hold a tab pill to rename, set hours, move or delete; "+ Tab", in More,
 *     adds one
 *   - hold a tile to put it on a tab, move it, or take it off; a tap rings up
 *   - "🔥 Now" lists what sells at this hour, only when the server sent a list
 *   - the strip fits the screen: "All" pinned left, "More" pinned right,
 *     and whatever is over the line behind More
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MenuGrid } from "./MenuGrid";
import type { Item } from "../types";
import type { PosQuickTab } from "../api";

vi.mock("../hooks/useCart", () => ({
  effectiveItemPrice: (item: Item) => Number(item.base_price),
  originalItemPrice: () => null,
}));

const categories = [
  { id: 1, name: "Food", is_active: true, parent_id: null },
  { id: 2, name: "Drinks", is_active: true, parent_id: null },
];

function item(id: number, name: string, category_id: number): Item {
  return { id, name, base_price: 10, category_id, is_available: true, has_variants: false, modifiers: [] } as unknown as Item;
}
function tab(id: string, name: string, items: number[], from: string | null = null, to: string | null = null): PosQuickTab {
  return { id, name, items, from, to };
}

const bajiya = item(10, "Bajiya", 1);
const gulha = item(11, "Gulha", 1);
const tea = item(20, "Black Tea", 2);
const coffee = item(21, "Coffee", 2);
const items = [bajiya, gulha, tea, coffee];

function renderGrid(over: Record<string, unknown> = {}) {
  const addToCart = vi.fn();
  const onUpdateQuickLayout = vi.fn();
  const onCopyQuickLayout = vi.fn().mockResolvedValue(true);
  const loadQuickLayoutSources = vi.fn().mockResolvedValue([{ user_id: 7, name: "Hassan", tabs: 2 }]);
  const element = (props: Record<string, unknown>) => (
    <MenuGrid
      {...({
        categories,
        selectedCategoryId: null,
        setSelectedCategoryId: () => {},
        filteredItems: items,
        isLoading: false,
        dataError: "",
        selectedItem: null,
        selectedModifiers: [],
        handleSelectItem: () => {},
        toggleModifier: () => {},
        addToCart,
        clearSelectedItem: () => {},
        barcode: "",
        setBarcode: () => {},
        onBarcodeSubmit: (e: React.FormEvent) => e.preventDefault(),
        orderType: "Dine-in",
        quickLayout: { shared: [tab("s1", "House", [tea.id])], mine: [] },
        canManageSharedQuickKeys: false,
        onUpdateQuickLayout,
        onCopyQuickLayout,
        loadQuickLayoutSources,
        popularNow: [],
        ...over,
        ...props,
      } as never)}
    />
  );
  const view = render(element({}));
  return {
    addToCart, onUpdateQuickLayout, onCopyQuickLayout, loadQuickLayoutSources,
    rerender: (props: Record<string, unknown>) => view.rerender(element(props)),
  };
}

const pill = (name: RegExp) => screen.getByRole("button", { name });
const pillLabels = () => screen.getAllByTestId("quick-tab-pill").map((b) => b.textContent);
const tileNames = () =>
  Array.from(document.querySelectorAll(".pos-menu-grid button")).map((b) => (b.textContent || "").replace(/MVR.*$/, "").replace("★", "").trim());

function hold(el: Element) {
  fireEvent.pointerDown(el, { button: 0, pointerType: "touch", clientX: 20, clientY: 20 });
  act(() => { vi.advanceTimersByTime(500); });
  fireEvent.pointerUp(el);
  fireEvent.click(el);
}

describe("Quick tabs in the strip", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(2026, 8, 2, 13, 0) }));
  afterEach(() => vi.useRealTimers());

  it("draws own tabs first, then shared, ahead of the categories", () => {
    renderGrid({ quickLayout: { shared: [tab("s1", "House", [tea.id])], mine: [tab("m1", "Morning", [bajiya.id, gulha.id]), tab("m2", "Regulars", [])] } });

    expect(pillLabels()).toEqual(["★ Morning (2)", "★ Regulars", "★ House (1)"]);
    // "All" is pinned at the left edge; the tabs come first of the rest,
    // ahead of the categories.
    const all = screen.getAllByRole("button").map((b) => b.textContent);
    expect(all[0]).toBe("All");
    expect(all.indexOf("★ Morning (2)")).toBeLessThan(all.indexOf("Food"));
    expect(screen.getByRole("button", { name: "★ House (1)" })).toHaveAttribute("data-shared", "true");
  });

  it("opens a tab's items in the tab's own order, and closes on a second tap", () => {
    renderGrid({ quickLayout: { shared: [], mine: [tab("m1", "Morning", [coffee.id, bajiya.id])] } });

    fireEvent.click(pill(/Morning/));
    expect(tileNames()).toEqual(["Coffee", "Bajiya"]);

    fireEvent.click(pill(/Morning/));
    expect(tileNames()).toEqual(["Bajiya", "Gulha", "Black Tea", "Coffee"]);
  });

  it("explains an empty tab", () => {
    renderGrid({ quickLayout: { shared: [], mine: [tab("m1", "Morning", [])] } });
    fireEvent.click(pill(/Morning/));
    expect(screen.getByTestId("quick-empty")).toHaveTextContent("Press and hold any item");
  });

  it("opens the tab whose hours cover now, and switches when the next one starts", () => {
    renderGrid({ quickLayout: { shared: [], mine: [
      tab("m1", "Lunch", [bajiya.id], "12:00", "14:00"),
      tab("m2", "Tea time", [tea.id], "14:00", "18:00"),
    ] } });

    // 13:00 — Lunch opened itself.
    expect(tileNames()).toEqual(["Bajiya"]);

    // The cashier goes back to everything; nothing forces Lunch back.
    fireEvent.click(pill(/^All$/));
    expect(tileNames()).toHaveLength(4);

    // 14:00 — Tea time starts and takes over.
    act(() => { vi.setSystemTime(new Date(2026, 8, 2, 14, 0)); vi.advanceTimersByTime(60_000); });
    expect(tileNames()).toEqual(["Black Tea"]);
  });

  it("waits for the ticket to clear before a timed tab opens itself", () => {
    const { rerender } = renderGrid({
      ticketEmpty: false,
      quickLayout: { shared: [], mine: [tab("m1", "Lunch", [bajiya.id], "12:00", "14:00")] },
    });

    // 13:00 with items on the ticket: the cashier keeps their place.
    expect(tileNames()).toHaveLength(4);

    // The ticket clears: now Lunch opens.
    rerender({ ticketEmpty: true, quickLayout: { shared: [], mine: [tab("m1", "Lunch", [bajiya.id], "12:00", "14:00")] } });
    expect(tileNames()).toEqual(["Bajiya"]);
  });
});

describe("Editing a tab", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(2026, 8, 2, 13, 0) }));
  afterEach(() => vi.useRealTimers());

  it("hold on a tab pill: rename and set hours", () => {
    const { onUpdateQuickLayout } = renderGrid({ quickLayout: { shared: [], mine: [tab("m1", "Morning", [bajiya.id]), tab("m2", "Late", [])] } });

    hold(pill(/Morning/));
    const prompt = screen.getByTestId("quick-tab-prompt");
    fireEvent.change(within(prompt).getByLabelText("Name"), { target: { value: "Breakfast" } });
    fireEvent.change(within(prompt).getByLabelText("From"), { target: { value: "06:00" } });
    fireEvent.change(within(prompt).getByLabelText("To"), { target: { value: "11:00" } });
    fireEvent.click(within(prompt).getByRole("button", { name: "Save" }));

    expect(onUpdateQuickLayout).toHaveBeenCalledWith("mine", [
      tab("m1", "Breakfast", [bajiya.id], "06:00", "11:00"),
      tab("m2", "Late", []),
    ]);
  });

  it("hold on a tab pill: move right, and delete after confirming", () => {
    const { onUpdateQuickLayout } = renderGrid({ quickLayout: { shared: [], mine: [tab("m1", "A", []), tab("m2", "B", [])] } });

    hold(pill(/★ A/));
    fireEvent.click(within(screen.getByTestId("quick-tab-prompt")).getByRole("button", { name: /Move right/ }));
    expect(onUpdateQuickLayout).toHaveBeenLastCalledWith("mine", [tab("m2", "B", []), tab("m1", "A", [])]);

    hold(pill(/★ A/));
    const prompt = screen.getByTestId("quick-tab-prompt");
    fireEvent.click(within(prompt).getByRole("button", { name: "Delete this tab" }));
    fireEvent.click(within(prompt).getByRole("button", { name: /Yes, delete/ }));
    expect(onUpdateQuickLayout).toHaveBeenLastCalledWith("mine", [tab("m2", "B", [])]);
  });

  it("a cashier cannot edit a shared tab; a menu manager can", () => {
    renderGrid();
    hold(pill(/House/));
    expect(screen.queryByTestId("quick-tab-prompt")).toBeNull();

    renderGrid({ canManageSharedQuickKeys: true });
    hold(screen.getAllByRole("button", { name: /House/ })[1]);
    expect(screen.getByTestId("quick-tab-prompt")).toBeInTheDocument();
  });

  it("+ Tab creates a tab of my own and opens it", () => {
    const { onUpdateQuickLayout } = renderGrid({ quickLayout: { shared: [], mine: [] } });

    fireEvent.click(pill(/^More/));
    fireEvent.click(within(screen.getByTestId("pos-more-categories")).getByRole("button", { name: /\+ Tab/ }));
    const prompt = screen.getByTestId("quick-tab-prompt");
    fireEvent.change(within(prompt).getByLabelText("Name"), { target: { value: "Tea time" } });
    fireEvent.click(within(prompt).getByRole("button", { name: "Create tab" }));

    expect(onUpdateQuickLayout).toHaveBeenCalledWith("mine", [tab("tab-1", "Tea time", [])]);
  });

  it("+ Tab offers to copy another cashier's tabs", async () => {
    vi.useRealTimers();
    const { onCopyQuickLayout, loadQuickLayoutSources } = renderGrid({ quickLayout: { shared: [], mine: [] } });

    fireEvent.click(pill(/^More/));
    fireEvent.click(within(screen.getByTestId("pos-more-categories")).getByRole("button", { name: /\+ Tab/ }));
    const copy = await screen.findByTestId("quick-tab-copy");
    expect(loadQuickLayoutSources).toHaveBeenCalled();
    fireEvent.click(within(copy).getByRole("button", { name: /Copy Hassan’s tabs/ }));

    expect(onCopyQuickLayout).toHaveBeenCalledWith(7);
  });
});

describe("Putting items on tabs", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(2026, 8, 2, 13, 0) }));
  afterEach(() => vi.useRealTimers());

  it("a hold on a tile offers each of my tabs; a tap still rings it up", () => {
    const { addToCart, onUpdateQuickLayout } = renderGrid({ quickLayout: { shared: [tab("s1", "House", [])], mine: [tab("m1", "Morning", []), tab("m2", "Late", [])] } });

    const tile = screen.getByRole("button", { name: /Bajiya/ });
    fireEvent.click(tile);
    expect(addToCart).toHaveBeenCalledTimes(1);

    hold(tile);
    expect(addToCart).toHaveBeenCalledTimes(1);
    const prompt = screen.getByTestId("quick-key-prompt");
    // Not a manager: the shared tab is not on offer.
    expect(within(prompt).queryByRole("button", { name: /House/ })).toBeNull();
    fireEvent.click(within(prompt).getByRole("button", { name: "Add to Late" }));

    expect(onUpdateQuickLayout).toHaveBeenCalledWith("mine", [tab("m1", "Morning", []), tab("m2", "Late", [bajiya.id])]);
  });

  it("a pinned tile is starred and can be moved or removed within its tab", () => {
    const { onUpdateQuickLayout } = renderGrid({ quickLayout: { shared: [], mine: [tab("m1", "Morning", [coffee.id, bajiya.id, tea.id])] } });

    const tile = screen.getByRole("button", { name: /Bajiya/ });
    expect(tile).toHaveAttribute("data-pinned", "true");
    expect(screen.getByRole("button", { name: /Gulha/ })).not.toHaveAttribute("data-pinned");

    hold(tile);
    const prompt = screen.getByTestId("quick-key-prompt");
    fireEvent.click(within(prompt).getByRole("button", { name: "Move earlier in Morning" }));
    expect(onUpdateQuickLayout).toHaveBeenCalledWith("mine", [tab("m1", "Morning", [bajiya.id, coffee.id, tea.id])]);
  });

  it("with no tab of my own, a hold offers to start one", () => {
    const { onUpdateQuickLayout } = renderGrid({ quickLayout: { shared: [], mine: [] } });

    hold(screen.getByRole("button", { name: /Gulha/ }));
    fireEvent.click(within(screen.getByTestId("quick-key-prompt")).getByRole("button", { name: "Add to a new tab of my own" }));

    expect(onUpdateQuickLayout).toHaveBeenCalledWith("mine", [tab("tab-1", "Quick", [gulha.id])]);
  });

  it("a menu manager can pin to a shared tab", () => {
    const { onUpdateQuickLayout } = renderGrid({ canManageSharedQuickKeys: true });

    hold(screen.getByRole("button", { name: /Gulha/ }));
    fireEvent.click(within(screen.getByTestId("quick-key-prompt")).getByRole("button", { name: "Add to House (shared)" }));

    expect(onUpdateQuickLayout).toHaveBeenCalledWith("shared", [tab("s1", "House", [tea.id, gulha.id])]);
  });

  it("does nothing on a till without the feature", () => {
    const { addToCart } = renderGrid({ quickLayout: undefined, onUpdateQuickLayout: undefined });

    expect(screen.queryAllByTestId("quick-tab-pill")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /\+ Tab/ })).toBeNull();
    hold(screen.getByRole("button", { name: /Bajiya/ }));
    expect(screen.queryByTestId("quick-key-prompt")).toBeNull();
    expect(addToCart).toHaveBeenCalled();
  });
});

describe("Popular-now tab", () => {
  it("appears only with a ranking", () => {
    renderGrid({ popularNow: [] });
    expect(screen.queryByRole("button", { name: /Now/ })).toBeNull();
  });

  it("lists what sells at this hour, best first, skipping anything not on this menu", () => {
    renderGrid({ popularNow: [coffee.id, 999, bajiya.id] });
    fireEvent.click(pill(/🔥 Now \(2\)/));
    expect(tileNames()).toEqual(["Coffee", "Bajiya"]);
  });
});

/**
 * Owner, 2026-09-03: "keep fixed to the screen — left side All, right side
 * More, in between tabs to fit the screen. + Tab also in More."
 */
describe("More", () => {
  it("hides nothing when the row width is unknown, and counts what it holds", () => {
    renderGrid();
    expect(screen.getByRole("button", { name: "Drinks" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Food" })).toBeInTheDocument();
    // Nothing is over the line, so More carries no count — it is only the
    // home of "+ Tab".
    expect(pill(/^More/)).toHaveTextContent(/^More/);
    expect(pill(/^More/)).not.toHaveTextContent(/\(/);
  });

  it("keeps + Tab inside More however much room there is", () => {
    renderGrid();
    expect(screen.queryByRole("button", { name: /\+ Tab/ })).toBeNull();

    fireEvent.click(pill(/^More/));
    const more = screen.getByTestId("pos-more-categories");
    expect(within(more).getByRole("button", { name: /\+ Tab/ })).toBeInTheDocument();
  });

  it("has no More at all on a till without Quick tabs and with room to spare", () => {
    renderGrid({ quickLayout: undefined, onUpdateQuickLayout: undefined });
    expect(screen.queryByRole("button", { name: /^More/ })).toBeNull();
  });
});
