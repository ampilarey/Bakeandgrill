import { useCallback, useEffect, useState } from "react";
import {
  createKitchenProductionBatch,
  failureMessage,
  fetchPlanTasks,
  markOrderItemCooked,
  markPlanTaskMade,
  submitKitchenProductionBatch,
  type KdsOrder,
  type KdsOrderItem,
  type KdsPlanTask,
} from "../../api";

type Props = {
  token: string;
  orders: KdsOrder[];
  canProduce: boolean;
  canPreparedStock: boolean;
  /** Who is signed in, so their own jobs come first. */
  userId?: number | null;
  onRefresh: () => void;
};

type Tab = "plan" | "orders" | "prepared";

const TASK_STATUS_LABEL: Record<KdsPlanTask["status"], string> = {
  todo: "To make",
  partial: "Part made",
  made: "Sent to counter",
  received: "Counter has it",
};

/** Refetch the day's jobs this often while the panel is open. */
const TASKS_REFRESH_MS = 60_000;

/**
 * The cook's own jobs first, then everyone else's, each group earliest due
 * first (the server already orders by time); finished jobs sink to the end.
 */
export function orderTasks(tasks: KdsPlanTask[], userId: number | null | undefined): KdsPlanTask[] {
  const rank = (t: KdsPlanTask): number => {
    const done = t.remaining <= 0 ? 2 : 0;
    const mine = userId != null && t.assigned_to === userId ? 0 : 1;
    return done + mine;
  };
  return tasks
    .map((t, i) => ({ t, i }))
    .sort((a, b) => rank(a.t) - rank(b.t) || a.i - b.i)
    .map(({ t }) => t);
}

function fmtQty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function KitchenProductionPanel({
  token,
  orders,
  canProduce,
  canPreparedStock,
  userId,
  onRefresh,
}: Props) {
  const [tab, setTab] = useState<Tab>("plan");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [prepName, setPrepName] = useState("");
  const [prepQty, setPrepQty] = useState("10");
  const [prepUnit, setPrepUnit] = useState("pcs");
  const [tasks, setTasks] = useState<KdsPlanTask[] | null>(null);
  const [tasksDate, setTasksDate] = useState("");
  const [madeQty, setMadeQty] = useState<Record<number, string>>({});

  const cookingOrders = orders.filter((o) =>
    ["in_progress", "preparing"].includes(o.status),
  );

  const loadTasks = useCallback(async () => {
    try {
      const res = await fetchPlanTasks(token);
      setTasks(res.tasks);
      setTasksDate(res.date);
    } catch (e) {
      setErr(failureMessage(e, "Could not load today's plan."));
      setTasks((t) => t ?? []);
    }
  }, [token]);

  useEffect(() => {
    if (!canProduce) return;
    void loadTasks();
    const id = window.setInterval(() => void loadTasks(), TASKS_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [canProduce, loadTasks]);

  const handleCooked = async (orderId: number, itemId: number) => {
    setBusyKey(`${orderId}-${itemId}`);
    setErr("");
    try {
      await markOrderItemCooked(token, orderId, itemId);
      onRefresh();
    } catch (e) {
      setErr(failureMessage(e, "Could not mark that cooked."));
    } finally {
      setBusyKey(null);
    }
  };

  const sendTask = async (task: KdsPlanTask) => {
    const raw = madeQty[task.id];
    const qty = raw === undefined || raw === "" ? task.remaining : parseFloat(raw);
    if (!Number.isFinite(qty) || qty <= 0) { setErr("Enter how many were made."); return; }
    setBusyKey(`task-${task.id}`);
    setErr("");
    try {
      await markPlanTaskMade(token, task.id, qty);
      setMadeQty((m) => { const next = { ...m }; delete next[task.id]; return next; });
      await loadTasks();
      onRefresh();
    } catch (e) {
      setErr(failureMessage(e, "Could not send that to the counter."));
    } finally {
      setBusyKey(null);
    }
  };

  const submitPrepared = async () => {
    const qty = parseFloat(prepQty);
    if (!prepName.trim()) { setErr("Enter item name."); return; }
    if (isNaN(qty) || qty <= 0) { setErr("Invalid quantity."); return; }
    setBusyKey("prepared");
    setErr("");
    try {
      const res = await createKitchenProductionBatch(token, {
        production_type: "prepared_stock",
        source: "kds",
        items: [{
          free_text_name: prepName.trim(),
          produced_qty: qty,
          unit: prepUnit,
        }],
      });
      await submitKitchenProductionBatch(token, res.batch.id);
      setPrepName("");
      setPrepQty("10");
      onRefresh();
    } catch (e) {
      setErr(failureMessage(e, "Could not submit that batch."));
    } finally {
      setBusyKey(null);
    }
  };

  const ordered = orderTasks(tasks ?? [], userId);
  const openCount = ordered.filter((t) => t.remaining > 0).length;

  return (
    // The cards below are white, on a board whose text is near-white. The
    // colour is set here so what is written on them can be read.
    <div style={{ padding: "12px 16px 24px", color: "#1C1408" }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {(["plan", "orders", "prepared"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: "none",
              // The board behind the tabs is near-black, so the chosen tab
              // is the orange the rest of the screen uses, not black on black.
              background: tab === t ? "#D4813A" : "#EDE4D4",
              color: tab === t ? "#fff" : "#2A1E0C",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {t === "plan" ? `Today's plan${openCount > 0 ? ` (${openCount})` : ""}` : t === "orders" ? "Order production" : "Prepared stock"}
          </button>
        ))}
      </div>

      {err && (
        <div style={{ marginBottom: 12, padding: 10, background: "#FEE2E2", color: "#991B1B", borderRadius: 8, fontSize: 13 }} role="alert">
          {err}
        </div>
      )}

      {tab === "plan" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }} data-testid="kds-plan-tasks">
          {!canProduce && (
            <p style={{ color: "#b6a992" }}>No production permission on this account.</p>
          )}
          {canProduce && tasks === null && (
            <p style={{ color: "#b6a992" }}>Loading today's plan…</p>
          )}
          {canProduce && tasks !== null && tasks.length === 0 && (
            <p style={{ color: "#b6a992" }}>Nothing planned for today{tasksDate ? ` (${tasksDate})` : ""}. The manager saves the plan under Kitchen → Plan.</p>
          )}
          {canProduce && ordered.map((task) => {
            const mine = userId != null && task.assigned_to === userId;
            const done = task.remaining <= 0;
            const busy = busyKey === `task-${task.id}`;
            return (
              <div
                key={task.id}
                data-testid={`kds-plan-task-${task.id}`}
                style={{
                  background: "#fff",
                  border: mine && !done ? "2px solid #D4813A" : "1px solid #EDE4D4",
                  borderRadius: 12,
                  padding: 14,
                  opacity: done ? 0.7 : 1,
                  display: "grid",
                  gap: 8,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>
                    {fmtQty(task.planned_qty)} × {task.name}
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: done ? "#047857" : "#8B7355", background: done ? "#ECFDF5" : "#F7F1E8", padding: "2px 8px", borderRadius: 999 }}>
                    {TASK_STATUS_LABEL[task.status]}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: "#6B5D4F", display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <span>{task.slot_label}{task.due_time ? ` · by ${task.due_time}` : ""}</span>
                  <span>{task.assigned_name ? (mine ? "You" : task.assigned_name) : "Anyone"}</span>
                  {task.made_qty > 0 && <span>made {fmtQty(task.made_qty)}</span>}
                  {task.received_qty > 0 && <span>counter got {fmtQty(task.received_qty)}</span>}
                </div>
                {task.instructions && (
                  <details data-testid={`kds-plan-recipe-${task.id}`} style={{ fontSize: 13, color: "#6B5D4F" }}>
                    <summary style={{ cursor: "pointer", fontWeight: 700, minHeight: 28, display: "flex", alignItems: "center" }}>How to make</summary>
                    <div style={{ whiteSpace: "pre-wrap", padding: "6px 10px", borderLeft: "2px solid #EDE4D4", marginTop: 2 }}>{task.instructions}</div>
                  </details>
                )}
                {!done && (
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      inputMode="numeric"
                      aria-label={`Made of ${task.name}`}
                      value={madeQty[task.id] ?? String(task.remaining)}
                      onChange={(e) => setMadeQty((m) => ({ ...m, [task.id]: e.target.value }))}
                      style={{ width: 90, padding: 10, borderRadius: 8, border: "1px solid #EDE4D4", fontSize: 16, fontWeight: 700, textAlign: "center" }}
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void sendTask(task)}
                      style={{ padding: "10px 14px", borderRadius: 8, border: "none", background: "#D4813A", color: "#fff", fontWeight: 700, cursor: "pointer" }}
                    >
                      {busy ? "Sending…" : "Send to counter"}
                    </button>
                    <span style={{ fontSize: 12, color: "#8B7355" }}>{fmtQty(task.remaining)} still to make</span>
                  </div>
                )}
              </div>
            );
          })}
          {canProduce && tasks !== null && (
            <button type="button" onClick={() => void loadTasks()} style={{ alignSelf: "flex-start", padding: "6px 10px", borderRadius: 8, border: "1px solid #EDE4D4", background: "#fff", cursor: "pointer", fontSize: 12 }}>
              Refresh
            </button>
          )}
        </div>
      )}

      {tab === "orders" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {!canProduce && (
            <p style={{ color: "#b6a992" }}>No production permission on this account.</p>
          )}
          {canProduce && cookingOrders.length === 0 && (
            <p style={{ color: "#b6a992" }}>No tickets cooking right now.</p>
          )}
          {canProduce && cookingOrders.map((order) => (
            <div key={order.id} style={{ background: "#fff", border: "1px solid #EDE4D4", borderRadius: 12, padding: 14 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>
                #{order.order_number}
                {order.kitchen_handover_status && (
                  <span style={{ marginLeft: 8, fontSize: 11, color: "#047857", background: "#ECFDF5", padding: "2px 8px", borderRadius: 999 }}>
                    {order.kitchen_handover_status}
                  </span>
                )}
              </div>
              {order.items.map((item: KdsOrderItem) => {
                const produced = item.kitchen_produced_qty ?? 0;
                const done = produced >= item.quantity;
                return (
                  <div
                    key={item.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 8,
                      fontSize: 14,
                      marginLeft: item.parent_order_item_id ? 16 : 0,
                    }}
                  >
                    <span>
                      {item.quantity}x {item.parent_order_item_id ? `↳ ${item.item_name}` : item.item_name}
                      <span style={{ color: "#8B7355", marginLeft: 6 }}>
                        ({produced}/{item.quantity} cooked)
                      </span>
                    </span>
                    {!done && (
                      <button
                        type="button"
                        disabled={busyKey === `${order.id}-${item.id}`}
                        onClick={() => void handleCooked(order.id, item.id)}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 8,
                          border: "none",
                          background: "#047857",
                          color: "#fff",
                          fontWeight: 700,
                          cursor: "pointer",
                          fontSize: 12,
                        }}
                      >
                        {busyKey === `${order.id}-${item.id}` ? "…" : "Mark cooked"}
                      </button>
                    )}
                    {done && (
                      <span style={{ fontSize: 11, color: "#047857", fontWeight: 700 }}>✓ Done</span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {tab === "prepared" && (
        <div style={{ maxWidth: 420, background: "#fff", border: "1px solid #EDE4D4", borderRadius: 12, padding: 16 }}>
          {!canPreparedStock ? (
            <p style={{ color: "#8B7355" }}>Prepared stock batches are disabled for this account.</p>
          ) : (
            <>
              <p style={{ margin: "0 0 10px", fontSize: 12, color: "#8B7355" }}>
                Something made that was not on the plan. Typed by name, so it reaches the counter but not the stock count — plan lines do both.
              </p>
              <input
                value={prepName}
                onChange={(e) => setPrepName(e.target.value)}
                placeholder="Item name (e.g. Chicken wrap)"
                style={{ width: "100%", boxSizing: "border-box", padding: 10, marginBottom: 8, borderRadius: 8, border: "1px solid #EDE4D4" }}
              />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                <input value={prepQty} onChange={(e) => setPrepQty(e.target.value)} type="number" placeholder="Qty" style={{ padding: 10, borderRadius: 8, border: "1px solid #EDE4D4" }} />
                <input value={prepUnit} onChange={(e) => setPrepUnit(e.target.value)} placeholder="Unit" style={{ padding: 10, borderRadius: 8, border: "1px solid #EDE4D4" }} />
              </div>
              <button
                type="button"
                disabled={busyKey === "prepared"}
                onClick={() => void submitPrepared()}
                style={{ width: "100%", padding: 12, borderRadius: 8, border: "none", background: "#D4813A", color: "#fff", fontWeight: 700, cursor: "pointer" }}
              >
                {busyKey === "prepared" ? "Submitting…" : "Submit batch to counter"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
