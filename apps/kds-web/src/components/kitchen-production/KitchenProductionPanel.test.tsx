import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { KitchenProductionPanel, orderTasks } from "./KitchenProductionPanel";
import type { KdsPlanTask } from "../../api";

const fetchPlanTasks = vi.fn();
const markPlanTaskMade = vi.fn();
const fetchProductionStickers = vi.fn();
const productionStickerLinks = vi.fn();

vi.mock("../../api", () => ({
  markOrderItemCooked: vi.fn(),
  createKitchenProductionBatch: vi.fn(),
  submitKitchenProductionBatch: vi.fn(),
  fetchPlanTasks: (...a: unknown[]) => fetchPlanTasks(...a),
  markPlanTaskMade: (...a: unknown[]) => markPlanTaskMade(...a),
  fetchProductionStickers: (...a: unknown[]) => fetchProductionStickers(...a),
  productionStickerLinks: (...a: unknown[]) => productionStickerLinks(...a),
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
   * 2026-10-12: the cook who just sent a batch prints its pack stickers from
   * here, with the batch's own number and dates, one a piece, on the
   * kitchen's 4 × 6 cm sticker; the PDF opens to print. Only with Print labels.
   */
  it("offers the stickers for a batch just sent, when the cook may print labels", async () => {
    fetchPlanTasks.mockResolvedValue({ date: "2026-10-12", tasks: [task({ id: 2, name: "Bajiya", item_id: 7, remaining: 30, made_qty: 20, status: "partial" })] });
    markPlanTaskMade.mockResolvedValue({
      task: task({ id: 2, made_qty: 50, remaining: 0, status: "made" }),
      batch: { id: 40, batch_no: "KP-20261012-0003", production_type: "prepared_stock", status: "submitted", items: [{ id: 91, name: "Bajiya", item_id: 7, produced_qty: 30, unit: "pcs", status: "done" }] },
    });
    fetchProductionStickers.mockResolvedValue({ data: { pi: 91, item: { id: 7, name: "Bajiya", label_enabled: true, label_shelf_life_days: 90 }, batch: "KP-20261012-0003", exp: "2027-01-10", mfg: "2026-10-12", qty: 30 } });
    productionStickerLinks.mockResolvedValue({ url: "/labels/stickers?signature=x", pdf_url: "/labels/stickers.pdf?signature=x", expires_in_minutes: 30 });
    const open = vi.spyOn(window, "open").mockReturnValue(null);

    const { rerender } = render(<KitchenProductionPanel token="tok" canProduce canPreparedStock canLabels={false} onRefresh={() => undefined} orders={[]} />);
    const card = await screen.findByTestId("kds-plan-task-2");
    fireEvent.click(within(card).getByText("Send to counter"));
    await waitFor(() => expect(markPlanTaskMade).toHaveBeenCalled());
    expect(screen.queryByTestId("kds-plan-stickers-2")).toBeNull();

    rerender(<KitchenProductionPanel token="tok" canProduce canPreparedStock canLabels onRefresh={() => undefined} orders={[]} />);
    const button = await screen.findByTestId("kds-plan-stickers-2");
    expect(button).toHaveTextContent("Stickers for batch KP-20261012-0003");
    fireEvent.click(button);
    await waitFor(() => expect(productionStickerLinks).toHaveBeenCalledWith("tok", expect.objectContaining({
      items: [{ id: 7, copies: 30 }], layout: "a4-custom", w: 40, h: 60, fill: true, mfg: "2026-10-12", exp: "2027-01-10", batch: "KP-20261012-0003", pi: 91,
    })));
    expect(fetchProductionStickers).toHaveBeenCalledWith("tok", 91);
    expect(open).toHaveBeenCalledWith("https://api.test/labels/stickers.pdf?signature=x", "_blank", "noopener");
    open.mockRestore();
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
