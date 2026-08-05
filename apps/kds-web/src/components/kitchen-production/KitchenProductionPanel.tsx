import { useState } from "react";
import {
  createKitchenProductionBatch,
  markOrderItemCooked,
  submitKitchenProductionBatch,
  type KdsOrder,
  type KdsOrderItem,
} from "../../api";

type Props = {
  token: string;
  orders: KdsOrder[];
  canProduce: boolean;
  canPreparedStock: boolean;
  onRefresh: () => void;
};

export function KitchenProductionPanel({
  token,
  orders,
  canProduce,
  canPreparedStock,
  onRefresh,
}: Props) {
  const [tab, setTab] = useState<"orders" | "prepared">("orders");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [prepName, setPrepName] = useState("");
  const [prepQty, setPrepQty] = useState("10");
  const [prepUnit, setPrepUnit] = useState("pcs");

  const cookingOrders = orders.filter((o) =>
    ["in_progress", "preparing"].includes(o.status),
  );

  const handleCooked = async (orderId: number, itemId: number) => {
    setBusyKey(`${orderId}-${itemId}`);
    setErr("");
    try {
      await markOrderItemCooked(token, orderId, itemId);
      onRefresh();
    } catch (e) {
      setErr((e as Error).message);
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
      setErr((e as Error).message);
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div style={{ padding: "12px 16px 24px" }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {(["orders", "prepared"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: "none",
              background: tab === t ? "#1C1408" : "#EDE4D4",
              color: tab === t ? "#fff" : "#2A1E0C",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {t === "orders" ? "Order production" : "Prepared stock"}
          </button>
        ))}
      </div>

      {err && (
        <div style={{ marginBottom: 12, padding: 10, background: "#FEE2E2", color: "#991B1B", borderRadius: 8, fontSize: 13 }}>
          {err}
        </div>
      )}

      {tab === "orders" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {!canProduce && (
            <p style={{ color: "#8B7355" }}>No production permission on this account.</p>
          )}
          {canProduce && cookingOrders.length === 0 && (
            <p style={{ color: "#8B7355" }}>No tickets cooking right now.</p>
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
