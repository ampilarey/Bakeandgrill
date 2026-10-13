import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { KitchenProductionPanel, orderTasks } from "./KitchenProductionPanel";
import type { KdsPlanTask } from "../../api";

const fetchPlanTasks = vi.fn();
const markPlanTaskMade = vi.fn();
const fetchProductionStickers = vi.fn();
const productionStickerLinks = vi.fn();
const fetchKitchenLabelSetup = vi.fn();

vi.mock("../../api", () => ({
  DEFAULT_KITCHEN_STICKER: { layout: "a4-custom", w: 40, h: 60, name: "40 × 60 mm, 21 on A4", roll: null },
  markOrderItemCooked: vi.fn(),
  createKitchenProductionBatch: vi.fn(),
  submitKitchenProductionBatch: vi.fn(),
  fetchPlanTasks: (...a: unknown[]) => fetchPlanTasks(...a),
  markPlanTaskMade: (...a: unknown[]) => markPlanTaskMade(...a),
  fetchProductionStickers: (...a: unknown[]) => fetchProductionStickers(...a),
  productionStickerLinks: (...a: unknown[]) => productionStickerLinks(...a),
  fetchKitchenLabelSetup: (...a: unknown[]) => fetchKitchenLabelSetup(...a),
  labelSheetUrl: (path: string) => `https://api.test${path}`,
  failureMessage: (e: unknown, fallback: string) => (e as { message?: string })?.message ?? fallback,
}));

function task(over: Partial<KdsPlanTask>): KdsPlanTask {
  return {
    id: 1, item_id: 7, variant_id: 0, name: "Bajiya",
    slot_label: "Evening", slot_start: 18, slot_end: 22, slot_time: "18:00",
    planned_qty: 50, made_qty: 0, received_qty: 0, remaining: 50,
    assigned_to: null, assigned_name: null, due_time: null,
    made_at: null, made_by_name: null, status: "todo",
    ...over,
  };
}

const orders = [{
  id: 1,
  order_number: "T-1",
  status: "in_progress",
  created_at: new Date().toISOString(),
  items: [{
    id: 10,
    item_name: "Burger",
    quantity: 2,
    kitchen_produced_qty: 1,
  }],
}];

describe("KitchenProductionPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchPlanTasks.mockResolvedValue({ date: "2026-09-17", tasks: [] });
    fetchKitchenLabelSetup.mockResolvedValue({ size: { layout: "a4-custom", w: 40, h: 60, name: "40 × 60 mm, 21 on A4", roll: null }, lang: "en" });
    try { localStorage.clear(); } catch { /* jsdom */ }
  });

  it("shows order production tab with cook progress", async () => {
    render(
      <KitchenProductionPanel
        token="tok"
        canProduce
        canPreparedStock
        onRefresh={() => undefined}
        orders={orders}
      />,
    );
    fireEvent.click(screen.getByText(/Order production/i));
    expect(screen.getByText(/Burger/)).toBeTruthy();
    expect(screen.getByText(/1\/2 cooked/)).toBeTruthy();
    await waitFor(() => expect(fetchPlanTasks).toHaveBeenCalledWith("tok"));
  });

  /*
   * Owner, 2026-09-17: "admin/manager assign and requests items that should
   * be made for tomorrow and assign time and staff to do that, so when he
   * prepares and cashier receives the amount it will be in the prepared
   * list and will be added to the stock."
   */
  it("opens on today's plan, the cook's own jobs first, and sends what was made to the counter", async () => {
    fetchPlanTasks.mockResolvedValue({
      date: "2026-09-17",
      tasks: [
        task({ id: 1, name: "Gulha", slot_label: "Morning", due_time: "06:30", assigned_to: 4, assigned_name: "Hassan" }),
        task({ id: 2, name: "Bajiya", due_time: "17:30", assigned_to: 3, assigned_name: "Aishath", made_qty: 20, remaining: 30, status: "partial" }),
        task({ id: 3, name: "Samosa", planned_qty: 20, made_qty: 20, received_qty: 20, remaining: 0, status: "received", assigned_to: 3, assigned_name: "Aishath" }),
      ],
    });
    markPlanTaskMade.mockResolvedValue({ task: task({ id: 2, made_qty: 50, remaining: 0, status: "made" }) });
    const onRefresh = vi.fn();

    render(
      <KitchenProductionPanel token="tok" canProduce canPreparedStock userId={3} onRefresh={onRefresh} orders={[]} />,
    );

    const list = await screen.findByTestId("kds-plan-tasks");
    await screen.findByTestId("kds-plan-task-2");
    const cards = within(list).getAllByTestId(/kds-plan-task-/).map((el) => el.getAttribute("data-testid"));
    // Mine first (2), then Hassan's (1), the finished one last (3).
    expect(cards).toEqual(["kds-plan-task-2", "kds-plan-task-1", "kds-plan-task-3"]);
    expect(screen.getByText(/Today's plan \(2\)/)).toBeTruthy();

    const mine = screen.getByTestId("kds-plan-task-2");
    expect(mine).toHaveTextContent("50 × Bajiya");
    expect(mine).toHaveTextContent("Evening · by 17:30");
    expect(mine).toHaveTextContent("You");
    expect(mine).toHaveTextContent("made 20");
    expect(mine).toHaveTextContent("30 still to make");
    expect(screen.getByTestId("kds-plan-task-1")).toHaveTextContent("Hassan");
    expect(screen.getByTestId("kds-plan-task-3")).toHaveTextContent("Counter has it");

    // The box opens on what is left; the cook corrects it and sends.
    const box = within(mine).getByLabelText("Made of Bajiya");
    expect(box).toHaveValue(30);
    fireEvent.change(box, { target: { value: "25" } });
    fireEvent.click(within(mine).getByText("Send to counter"));

    await waitFor(() => expect(markPlanTaskMade).toHaveBeenCalledWith("tok", 2, 25));
    await waitFor(() => expect(fetchPlanTasks).toHaveBeenCalledTimes(2));
    expect(onRefresh).toHaveBeenCalled();
  });

  /*
   * 2026-10-12, round 12 (print when packing): the cook who just sent a batch
   * prints its pack stickers from here, with the batch's own number and
   * dates, one a piece unless a count is typed, on the roll and in the
   * language Labels → Settings picked; the PDF opens to print. Only with
   * Print labels. The server lists the batches on the task, so they stay
   * after a reload and on another device.
   */
  it("offers the stickers for a batch just sent, when the cook may print labels", async () => {
    const batchRow = { pi: 91, batch_no: "KP-20261012-0003", qty: 30, made_at: "2026-10-12T17:05:00+05:00", expires_at: "2027-01-10", status: "submitted" };
    fetchPlanTasks
      .mockResolvedValueOnce({ date: "2026-10-12", tasks: [task({ id: 2, name: "Bajiya", item_id: 7, remaining: 30, made_qty: 20, status: "partial", batches: [] })] })
      .mockResolvedValue({ date: "2026-10-12", tasks: [task({ id: 2, name: "Bajiya", item_id: 7, remaining: 0, made_qty: 50, status: "made", batches: [batchRow] })] });
    markPlanTaskMade.mockResolvedValue({
      task: task({ id: 2, made_qty: 50, remaining: 0, status: "made" }),
      batch: { id: 40, batch_no: "KP-20261012-0003", production_type: "prepared_stock", status: "submitted", items: [{ id: 91, name: "Bajiya", item_id: 7, produced_qty: 30, unit: "pcs", status: "done" }] },
    });
    fetchKitchenLabelSetup.mockResolvedValue({ size: { layout: "single-custom", w: 60, h: 40, name: "60 × 40 mm, label printer", roll: "small" }, lang: "dv" });
    fetchProductionStickers.mockResolvedValue({ data: { pi: 91, item: { id: 7, name: "Bajiya", label_enabled: true, label_shelf_life_days: 90 }, batch: "KP-20261012-0003", exp: "2027-01-10", mfg: "2026-10-12", qty: 30, size: { layout: "single-custom", w: 60, h: 40, name: "60 × 40 mm, label printer", roll: "small" }, lang: "dv" } });
    productionStickerLinks.mockResolvedValue({ url: "/labels/stickers?signature=x", pdf_url: "/labels/stickers.pdf?signature=x", expires_in_minutes: 30 });
    const open = vi.spyOn(window, "open").mockReturnValue(null);

    const { rerender } = render(<KitchenProductionPanel token="tok" canProduce canPreparedStock canLabels={false} onRefresh={() => undefined} orders={[]} />);
    const card = await screen.findByTestId("kds-plan-task-2");
    fireEvent.click(within(card).getByText("Send to counter"));
    await waitFor(() => expect(markPlanTaskMade).toHaveBeenCalled());
    expect(screen.queryByTestId("kds-batch-91")).toBeNull();
    expect(screen.queryByTestId("kds-sticker-setup")).toBeNull();

    rerender(<KitchenProductionPanel token="tok" canProduce canPreparedStock canLabels onRefresh={() => undefined} orders={[]} />);
    const row = await screen.findByTestId("kds-batch-91");
    expect(row).toHaveTextContent("Batch KP-20261012-0003");
    expect(row).toHaveTextContent("use by 2027-01-10");
    // The roll and language from Settings, the latter changeable here.
    const setup = await screen.findByTestId("kds-sticker-setup");
    await waitFor(() => expect(setup).toHaveTextContent("Stickers print on 60 × 40 mm, label printer"));
    expect(within(setup).getByRole("button", { name: "ދިވެހި" })).toHaveAttribute("aria-pressed", "true");
    const box = within(row).getByLabelText("Stickers for batch KP-20261012-0003");
    expect(box).toHaveValue(30);
    fireEvent.change(box, { target: { value: "24" } });
    fireEvent.click(within(row).getByTestId("kds-plan-stickers-91"));
    await waitFor(() => expect(productionStickerLinks).toHaveBeenCalledWith("tok", expect.objectContaining({
      items: [{ id: 7, copies: 24 }], layout: "single-custom", w: 60, h: 40, lang: "dv", fill: true, mfg: "2026-10-12", exp: "2027-01-10", batch: "KP-20261012-0003", pi: 91,
    })));
    expect(fetchProductionStickers).toHaveBeenCalledWith("tok", 91);
    // The window is opened in the tap; a blocked one falls back to opening the PDF, and a link stays on the card either way.
    expect(open).toHaveBeenCalledWith("https://api.test/labels/stickers.pdf?signature=x", "_blank", "noopener");
    expect(await within(row).findByTestId("kds-stickers-ready-91")).toHaveTextContent("24 ready");

    // Picking English here is remembered and used for the next print.
    fireEvent.click(within(setup).getByRole("button", { name: "English" }));
    expect(localStorage.getItem("kds_label_lang")).toBe("en");
    fireEvent.click(within(row).getByTestId("kds-plan-stickers-91"));
    await waitFor(() => expect(productionStickerLinks).toHaveBeenCalledTimes(2));
    expect(productionStickerLinks.mock.calls[1][1]).toMatchObject({ lang: "en", items: [{ id: 7, copies: 24 }] });
    open.mockRestore();
  });

  it("lists the batches another device made, each with its own sticker button", async () => {
    fetchPlanTasks.mockResolvedValue({ date: "2026-10-13", tasks: [task({ id: 5, name: "Gulha", item_id: 9, made_qty: 50, remaining: 0, status: "received", batches: [
      { pi: 120, batch_no: "KP-20261013-0002", qty: 20, made_at: "2026-10-13T11:40:00+05:00", expires_at: null, status: "received" },
      { pi: 118, batch_no: "KP-20261013-0001", qty: 30, made_at: "2026-10-13T09:10:00+05:00", expires_at: null, status: "received" },
    ] })] });
    render(<KitchenProductionPanel token="tok" canProduce canPreparedStock canLabels onRefresh={() => undefined} orders={[]} />);
    const card = await screen.findByTestId("kds-plan-task-5");
    expect(within(card).getByTestId("kds-batch-120")).toHaveTextContent("Batch KP-20261013-0002");
    expect(within(card).getByTestId("kds-batch-118")).toHaveTextContent("Batch KP-20261013-0001");
    expect(within(card).getByLabelText("Stickers for batch KP-20261013-0001")).toHaveValue(30);
    expect(markPlanTaskMade).not.toHaveBeenCalled();
  });

  it("refuses to send nothing", async () => {
    fetchPlanTasks.mockResolvedValue({ date: "2026-09-17", tasks: [task({ id: 1 })] });
    render(<KitchenProductionPanel token="tok" canProduce canPreparedStock userId={3} onRefresh={() => undefined} orders={[]} />);

    const card = await screen.findByTestId("kds-plan-task-1");
    fireEvent.change(within(card).getByLabelText("Made of Bajiya"), { target: { value: "0" } });
    fireEvent.click(within(card).getByText("Send to counter"));

    expect(await screen.findByRole("alert")).toHaveTextContent("Enter how many were made.");
    expect(markPlanTaskMade).not.toHaveBeenCalled();
  });

  it("says when nothing is planned", async () => {
    render(<KitchenProductionPanel token="tok" canProduce canPreparedStock onRefresh={() => undefined} orders={[]} />);
    expect(await screen.findByText(/Nothing planned for today \(2026-09-17\)/)).toBeTruthy();
  });
});

describe("orderTasks", () => {
  it("puts the signed-in cook's open jobs first and finished ones last", () => {
    const ordered = orderTasks([
      task({ id: 1, assigned_to: 4, remaining: 10 }),
      task({ id: 2, assigned_to: 3, remaining: 0 }),
      task({ id: 3, assigned_to: 3, remaining: 5 }),
      task({ id: 4, assigned_to: null, remaining: 5 }),
    ], 3);
    expect(ordered.map((t) => t.id)).toEqual([3, 1, 4, 2]);
  });
});
