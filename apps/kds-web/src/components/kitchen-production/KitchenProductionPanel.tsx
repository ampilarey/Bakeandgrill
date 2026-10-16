import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_KITCHEN_STICKER,
  createKitchenProductionBatch,
  failureMessage,
  fetchKitchenLabelSetup,
  fetchPlanTasks,
  fetchProductionStickers,
  labelSheetUrl,
  markOrderItemCooked,
  markPlanTaskMade,
  productionStickerLinks,
  submitKitchenProductionBatch,
  type KdsOrder,
  type KdsOrderItem,
  type KdsPlanTask,
  type KdsTaskBatch,
  type KitchenLabelSetup,
  type KitchenProductionBatch,
  type StickerLang,
} from "../../api";
import { TodaysPacks } from "./TodaysPacks";

type Props = {
  token: string;
  orders: KdsOrder[];
  canProduce: boolean;
  canPreparedStock: boolean;
  /** Print labels: a Stickers button on a job just sent to the counter (2026-10-12). */
  canLabels?: boolean;
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

/*
 * Print when packing (round 12 of the labels work, owner 2026-10-13: "a
 * Labels button on the kitchen board for the batch just made"). Every batch
 * made for a task is listed on its card, from the server, so the stickers
 * print from any device after a reload or by the next cook: how many, on
 * the roll and in the language picked under Labels → Settings (4 × 6 cm in
 * English until something is picked); the cook can pick another language
 * here, which this screen remembers.
 */
const LANG_WORDS: Record<StickerLang, string> = { en: "English", dv: "ދިވެހި", both: "Both" };
const LANG_KEY = "kds_label_lang";
function storedLang(): StickerLang | null {
  try {
    const v = localStorage.getItem(LANG_KEY);
    return v === "en" || v === "dv" || v === "both" ? v : null;
  } catch {
    return null;
  }
}
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

export function KitchenProductionPanel({
  token,
  orders,
  canProduce,
  canPreparedStock,
  canLabels = false,
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
  // The batch each job made this session: the server lists them on the task too, this covers the moment before the list reloads.
  const [batches, setBatches] = useState<Record<number, KitchenProductionBatch>>({});
  // Print when packing (round 12): what the kitchen prints stickers on and in, the cook's own language pick, how many per batch, and what was printed.
  const [labelSetup, setLabelSetup] = useState<KitchenLabelSetup | null>(null);
  const [lang, setLang] = useState<StickerLang | null>(storedLang);
  const [copies, setCopies] = useState<Record<number, string>>({});
  const [printed, setPrinted] = useState<Record<number, { pdf: string; count: number }>>({});
  useEffect(() => {
    if (!canLabels) return;
    fetchKitchenLabelSetup(token).then(setLabelSetup).catch(() => setLabelSetup(null));
  }, [canLabels, token]);
  const stickerSize = labelSetup?.size ?? DEFAULT_KITCHEN_STICKER;
  const stickerLang: StickerLang = lang ?? labelSetup?.lang ?? "en";
  const pickLang = (l: StickerLang) => {
    setLang(l);
    try { localStorage.setItem(LANG_KEY, l); } catch { /* a private window */ }
  };
  /** The batches made for a task: the server's list, else the one this session just sent. */
  const batchesOf = (task: KdsPlanTask): KdsTaskBatch[] => {
    if (task.batches && task.batches.length > 0) return task.batches;
    const b = batches[task.id];
    const line = b?.items.find((i) => i.item_id === task.item_id) ?? b?.items[0];
    return b && line ? [{ pi: line.id, batch_no: b.batch_no, qty: line.produced_qty, made_at: null, expires_at: null, status: line.status }] : [];
  };

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
      const res = await markPlanTaskMade(token, task.id, qty);
      if (res.batch) setBatches((b) => ({ ...b, [task.id]: res.batch as KitchenProductionBatch }));
      setMadeQty((m) => { const next = { ...m }; delete next[task.id]; return next; });
      await loadTasks();
      onRefresh();
    } catch (e) {
      setErr(failureMessage(e, "Could not send that to the counter."));
    } finally {
      setBusyKey(null);
    }
  };

  /*
   * Stickers for a batch (2026-10-12, round 12): the batch number, expiry
   * and made-on date come from the line, one sticker a piece unless the cook
   * typed a count, on the kitchen's roll and in its language; the PDF opens
   * to print (a tablet prints the PDF).
   */
  const printStickers = async (task: KdsPlanTask, b: KdsTaskBatch) => {
    setBusyKey(`stickers-${b.pi}`);
    setErr("");
    // Opened in the tap itself: a tablet's browser blocks a window opened only once the server has answered.
    const win = window.open("", "_blank");
    try {
      const { data } = await fetchProductionStickers(token, b.pi);
      if (!data.item) { win?.close(); setErr("This line is not a menu item, so it has no sticker."); return; }
      const typed = Number(copies[b.pi] ?? "");
      const n = Math.max(1, Math.min(400, Math.round(typed > 0 ? typed : (data.qty || b.qty || task.made_qty || 1))));
      const size = labelSetup?.size ?? data.size ?? DEFAULT_KITCHEN_STICKER;
      const useLang: StickerLang = lang ?? labelSetup?.lang ?? data.lang ?? "en";
      const r = await productionStickerLinks(token, { items: [{ id: data.item.id, copies: n, ...(task.variant_id > 0 ? { size: task.variant_id } : {}) }], layout: size.layout, w: size.w, h: size.h, lang: useLang, fill: true, mfg: data.mfg, exp: data.exp, batch: data.batch || null, pi: data.pi, roll: size.roll ?? null });
      const pdf = labelSheetUrl(r.pdf_url);
      if (win) { win.location.href = pdf; } else { window.open(pdf, "_blank", "noopener"); }
      setPrinted((p) => ({ ...p, [b.pi]: { pdf, count: n } }));
    } catch (e) {
      win?.close();
      setErr(failureMessage(e, "Could not prepare the stickers."));
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
              background: tab === t ? "#B74B0C" : "#EDE4D4",
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
          {canProduce && canLabels && tasks !== null && tasks.length > 0 && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 13, color: "#EDE4D4" }} data-testid="kds-sticker-setup">
              <span>Stickers print on {stickerSize.name}, in</span>
              {(["en", "dv", "both"] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  aria-pressed={stickerLang === l}
                  onClick={() => pickLang(l)}
                  style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #EDE4D4", background: stickerLang === l ? "#B74B0C" : "#fff", color: stickerLang === l ? "#fff" : "#2A1E0C", fontWeight: 700, cursor: "pointer", fontSize: 12 }}
                >
                  {LANG_WORDS[l]}
                </button>
              ))}
            </div>
          )}
          {canProduce && canLabels && tasks !== null && tasks.some((t) => (t.batches ?? []).length > 0) && (
            <TodaysPacks token={token} size={stickerSize} lang={stickerLang} tasks={tasks} onPrinted={loadTasks} />
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
                  border: mine && !done ? "2px solid #B74B0C" : "1px solid #EDE4D4",
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
                {canLabels && task.stickers_locked && batchesOf(task).length > 0 && (
                  <p role="alert" data-testid={`kds-stickers-locked-${task.id}`} style={{ margin: 0, fontSize: 13, padding: 8, background: "#FEE2E2", color: "#991B1B", borderRadius: 8 }}>{task.stickers_locked}</p>
                )}
                {canLabels && batchesOf(task).map((b) => {
                  const busyB = busyKey === `stickers-${b.pi}`;
                  return (
                    <div key={b.pi} data-testid={`kds-batch-${b.pi}`} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 8, border: "1px dashed #B74B0C", background: "#FFF8F3" }}>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>
                        Batch {b.batch_no || "—"}{b.made_at ? ` · ${fmtTime(b.made_at)}` : ""}{b.expires_at ? ` · use by ${b.expires_at}` : ""}
                      </span>
                      <input
                        type="number"
                        min={1}
                        max={400}
                        step={1}
                        inputMode="numeric"
                        aria-label={`Stickers for batch ${b.batch_no}`}
                        value={copies[b.pi] ?? String(Math.max(1, Math.round(b.qty)))}
                        onChange={(e) => setCopies((c) => ({ ...c, [b.pi]: e.target.value }))}
                        style={{ width: 72, padding: 8, borderRadius: 8, border: "1px solid #EDE4D4", fontSize: 15, fontWeight: 700, textAlign: "center" }}
                      />
                      <button
                        type="button"
                        disabled={busyB || Boolean(task.stickers_locked)}
                        onClick={() => void printStickers(task, b)}
                        data-testid={`kds-plan-stickers-${b.pi}`}
                        style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #B74B0C", background: "#B74B0C", color: "#fff", fontWeight: 700, cursor: task.stickers_locked ? "not-allowed" : "pointer", opacity: task.stickers_locked ? 0.5 : 1, fontSize: 13 }}
                      >
                        {busyB ? "Preparing…" : "Print stickers"}
                      </button>
                      {printed[b.pi] && (
                        <a href={printed[b.pi].pdf} target="_blank" rel="noreferrer" data-testid={`kds-stickers-ready-${b.pi}`} style={{ fontSize: 12, color: "#B74B0C", fontWeight: 700 }}>
                          {printed[b.pi].count} ready · open the PDF again
                        </a>
                      )}
                    </div>
                  );
                })}
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
                      style={{ padding: "10px 14px", borderRadius: 8, border: "none", background: "#B74B0C", color: "#fff", fontWeight: 700, cursor: "pointer" }}
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
                style={{ width: "100%", padding: 12, borderRadius: 8, border: "none", background: "#B74B0C", color: "#fff", fontWeight: 700, cursor: "pointer" }}
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
