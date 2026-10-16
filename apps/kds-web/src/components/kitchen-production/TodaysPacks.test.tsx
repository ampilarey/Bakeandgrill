import { describe, it, expect, vi, beforeEach } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TodaysPacks, nextSet, packsOf, type TodaysPack } from "./TodaysPacks";
import type { KdsPlanTask, KdsTaskBatch } from "../../api";

const productionStickerLinks = vi.fn();

vi.mock("../../api", () => ({
  productionStickerLinks: (...a: unknown[]) => productionStickerLinks(...a),
  labelSheetUrl: (path: string) => `https://api.test${path}`,
  failureMessage: (e: unknown, fallback: string) => (e as { message?: string })?.message ?? fallback,
}));

const SIZE = { layout: "a4-custom", w: 40, h: 60, name: "40 × 60 mm, 21 on A4", roll: "small" };
const batch = (pi: number, over: Partial<KdsTaskBatch> = {}): KdsTaskBatch => ({ pi, batch_no: `B${pi}`, qty: 6, made_at: null, expires_at: "2026-10-19", status: "produced", mfg: "2026-10-16", printed: 0, ...over });
const task = (id: number, itemId: number, name: string, batches: KdsTaskBatch[], over: Partial<KdsPlanTask> = {}): KdsPlanTask => ({
  id, item_id: itemId, variant_id: 0, name, slot_label: "Evening", slot_start: 18, slot_end: 22, slot_time: "18:00",
  planned_qty: 50, made_qty: 10, received_qty: 0, remaining: 40, assigned_to: null, assigned_name: null, due_time: null,
  made_at: null, made_by_name: null, status: "partial", batches, label_enabled: true, ...over,
});

/*
 * Today's packs (label audit, Batch D, 2026-10-16): one list of today's
 * batches on the kitchen screen, one Print for the ticked ones, each batch
 * with its own batch number and dates, a second batch of an item next.
 */
describe("TodaysPacks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("open", vi.fn(() => ({ location: { href: "" }, close: vi.fn() })));
  });

  it("lists today's batches of label items and takes the first ticked pack of each item into one print", () => {
    const packs = packsOf([task(1, 7, "Bajiya", [batch(3), batch(1)]), task(2, 8, "Patties", [batch(2)]), task(3, 9, "Tea", [batch(4)], { label_enabled: false })]);
    expect(packs.map((p) => p.pi)).toEqual([3, 2, 1]);
    const ticked = { 1: true, 2: true, 3: true };
    expect(nextSet(packs, ticked).map((p: TodaysPack) => p.pi)).toEqual([3, 2]);
    expect(nextSet(packs, { 1: true }).map((p) => p.pi)).toEqual([1]);
    // A pack the wording lock refuses is never ticked into a print.
    const locked = packsOf([task(1, 7, "Bajiya", [batch(3)], { stickers_locked: "The wording is locked: Bajiya …" })]);
    expect(locked[0].locked).toBe(true);
    expect(nextSet(locked, { 3: true })).toEqual([]);
  });

  it("ticks the bare ones and prints them in sets with their own batches", async () => {
    productionStickerLinks.mockResolvedValue({ url: "/s", pdf_url: "/s.pdf", expires_in_minutes: 30 });
    function Host() {
      const [tasks, setTasks] = useState([task(1, 7, "Bajiya", [batch(3), batch(1, { qty: 5 })]), task(2, 8, "Patties", [batch(2, { qty: 4 })]), task(3, 9, "Hedhika", [batch(9, { printed: 10 })])]);
      return <TodaysPacks token="t" size={SIZE} lang="both" tasks={tasks} onPrinted={() => setTasks([task(1, 7, "Bajiya", [batch(3, { printed: 6 }), batch(1, { qty: 5 })]), task(2, 8, "Patties", [batch(2, { qty: 4, printed: 4 })]), task(3, 9, "Hedhika", [batch(9, { printed: 10 })])])} />;
    }
    render(<Host />);
    fireEvent.click(screen.getByTestId("kds-todays-packs-toggle"));

    expect(screen.getByTestId("kds-pack-9")).toHaveTextContent("10 printed");
    expect(screen.getByTestId("kds-pack-3")).toHaveTextContent("Not printed yet");
    expect(screen.getByLabelText("Print Hedhika, batch B9")).not.toBeChecked();
    expect(screen.getByTestId("kds-todays-packs-print")).toHaveTextContent("Print: 10 stickers for 2 packs");
    expect(screen.getByTestId("kds-todays-packs-more")).toHaveTextContent("1 more ticked pack is a second batch");

    fireEvent.click(screen.getByTestId("kds-todays-packs-print"));
    await waitFor(() => expect(productionStickerLinks).toHaveBeenCalledWith("t", expect.objectContaining({
      items: [
        { id: 7, copies: 6, pi: 3, batch: "B3", mfg: "2026-10-16", exp: "2026-10-19" },
        { id: 8, copies: 4, pi: 2, batch: "B2", mfg: "2026-10-16", exp: "2026-10-19" },
      ],
      layout: "a4-custom", w: 40, h: 60, lang: "both", fill: true, roll: "small",
    })));
    expect(await screen.findByTestId("kds-todays-packs-ready")).toHaveTextContent("10 ready");
    expect(screen.getByTestId("kds-pack-3")).toHaveTextContent("6 printed");
    // The second Bajiya batch is next.
    expect(screen.getByTestId("kds-todays-packs-print")).toHaveTextContent("Print the next set: 5 stickers for 1 pack");
    expect(screen.queryByTestId("kds-todays-packs-more")).toBeNull();
  });

  it("closes the window it opened and says why when the print is refused", async () => {
    const win = { location: { href: "" }, close: vi.fn() };
    vi.stubGlobal("open", vi.fn(() => win));
    productionStickerLinks.mockRejectedValue(new Error("The wording is locked: Bajiya has legal lines not signed off as they stand."));
    render(<TodaysPacks token="t" size={SIZE} lang="en" tasks={[task(1, 7, "Bajiya", [batch(3)])]} onPrinted={vi.fn()} />);
    fireEvent.click(screen.getByTestId("kds-todays-packs-toggle"));
    fireEvent.click(screen.getByTestId("kds-todays-packs-print"));
    expect(await screen.findByRole("alert")).toHaveTextContent("The wording is locked");
    expect(win.close).toHaveBeenCalled();
  });
});
