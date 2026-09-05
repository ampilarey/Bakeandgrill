import { useEffect, useMemo, useState } from "react";
import {
  createPurchaseRequest,
  fetchAssignedPurchaseRequests,
  fetchItemsToReceive,
  fetchMyPurchaseRequests,
  fetchRequestCatalog,
  markPurchaseRequestItemBought,
  markPurchaseRequestItemNotAvailable,
  markPurchaseRequestItemPartial,
  receivePurchaseRequestItem,
  type KdsCatalogItem,
  type KdsPurchaseRequest,
  type KdsToReceiveItem,
} from "../api";

/*
 * The kitchen's half of buying: ask for it, watch it, take it in.
 *
 * Requesting is a picker, matching the POS. Owner, 2026-09-05: staff request
 * "from the list (he don't write anything)", and a cook typing "chikn boxs"
 * produces a line nobody can total, price or turn into stock.
 *
 * "Receive" is new. The box arrives at the kitchen door and the person
 * standing there is a cook — accepting is what raises the stock, so it can
 * happen where the delivery lands rather than waiting for a manager. Whoever
 * bought a line cannot accept it; the server decides that and this screen
 * shows the answer rather than guessing.
 */

type Props = {
  token: string;
  mode: "request" | "my" | "buying" | "receive";
  onClose: () => void;
};

type Line = { item: KdsCatalogItem; qty: number };

const chip = (active: boolean) => ({
  padding: "8px 14px", borderRadius: 999, border: "none", cursor: "pointer",
  background: active ? "#1C1408" : "#EDE4D4", color: active ? "#fff" : "#2A1E0C",
  fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" as const,
});

export function KdsPurchaseRequestOverlay({ token, mode, onClose }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [rows, setRows] = useState<KdsPurchaseRequest[]>([]);

  // Requesting
  const [catalog, setCatalog] = useState<KdsCatalogItem[]>([]);
  const [categories, setCategories] = useState<Array<{ id: number; name: string }>>([]);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [priority, setPriority] = useState<"normal" | "urgent">("normal");
  const [note, setNote] = useState("");

  // Receiving
  const [toReceive, setToReceive] = useState<KdsToReceiveItem[]>([]);

  useEffect(() => {
    if (mode === "my") {
      void fetchMyPurchaseRequests(token).then((r) => setRows(r.data ?? [])).catch((e) => setErr((e as Error).message));
    } else if (mode === "buying") {
      void fetchAssignedPurchaseRequests(token).then((r) => setRows(r.data ?? [])).catch((e) => setErr((e as Error).message));
    } else if (mode === "receive") {
      void fetchItemsToReceive(token).then((r) => setToReceive(r.items ?? [])).catch((e) => setErr((e as Error).message));
    } else {
      void fetchRequestCatalog(token)
        .then((r) => { setCatalog(r.items ?? []); setCategories(r.categories ?? []); })
        .catch((e) => setErr((e as Error).message));
    }
  }, [mode, token]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();

    return catalog.filter((i) => {
      if (categoryId != null && i.category_id !== categoryId) return false;

      return term === "" || i.name.toLowerCase().includes(term);
    });
  }, [catalog, search, categoryId]);

  const addItem = (item: KdsCatalogItem) => {
    setErr("");
    setLines((prev) => {
      const at = prev.findIndex((l) => l.item.id === item.id);
      if (at >= 0) {
        const next = [...prev];
        next[at] = { ...next[at], qty: Math.round((next[at].qty + 1) * 1000) / 1000 };

        return next;
      }

      return [...prev, { item, qty: item.suggested_qty && item.suggested_qty > 0 ? item.suggested_qty : 1 }];
    });
  };

  const bumpQty = (idx: number, delta: number) => {
    setLines((prev) => {
      const next = [...prev];
      const q = Math.round((next[idx].qty + delta) * 1000) / 1000;
      if (q <= 0) return prev.filter((_, i) => i !== idx);
      next[idx] = { ...next[idx], qty: q };

      return next;
    });
  };

  const submitRequest = async () => {
    if (lines.length === 0) { setErr("Pick at least one item."); return; }
    setBusy(true);
    setErr("");
    try {
      await createPurchaseRequest(token, {
        source: "kds",
        priority,
        items: lines.map((l) => ({
          inventory_item_id: l.item.id,
          requested_qty: l.qty,
          requested_unit: l.item.unit,
          category: l.item.category ?? undefined,
          reason: "low_stock",
          notes: note.trim() || undefined,
        })),
      });
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const accept = async (item: KdsToReceiveItem) => {
    setBusy(true);
    setErr("");
    try {
      await receivePurchaseRequestItem(token, item.request_id, item.id);
      setToReceive((prev) => prev.filter((i) => i.id !== item.id));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const title = mode === "request" ? "Request items"
    : mode === "my" ? "My requests"
      : mode === "buying" ? "Buying list"
        : "To receive";

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(15,23,42,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div role="dialog" aria-label={title} style={{ background: "#fff", borderRadius: 12, width: "min(520px, 100%)", maxHeight: "90vh", overflow: "auto", padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" style={{ border: "none", background: "none", fontSize: 20, cursor: "pointer" }}>×</button>
        </div>

        {err && <p style={{ color: "#ef4444", fontSize: 13 }}>{err}</p>}

        {mode === "request" && (
          <>
            {lines.length > 0 && (
              <div data-testid="kds-request-basket" style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
                {lines.map((l, idx) => (
                  <div key={l.item.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "#EDE4D4", borderRadius: 8, padding: "8px 10px" }}>
                    <span style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 13 }}>{l.item.name}</span>
                    <button type="button" aria-label={`Less ${l.item.name}`} onClick={() => bumpQty(idx, -1)} style={{ width: 36, height: 36, borderRadius: 8, border: "none", background: "#fff", fontSize: 20, fontWeight: 700, cursor: "pointer" }}>−</button>
                    <span style={{ minWidth: 70, textAlign: "center", fontWeight: 700, fontSize: 13 }}>{l.qty} {l.item.unit}</span>
                    <button type="button" aria-label={`More ${l.item.name}`} onClick={() => bumpQty(idx, 1)} style={{ width: 36, height: 36, borderRadius: 8, border: "none", background: "#fff", fontSize: 20, fontWeight: 700, cursor: "pointer" }}>+</button>
                  </div>
                ))}
              </div>
            )}

            <input
              aria-label="Search items"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search the list…"
              style={{ width: "100%", padding: 12, marginBottom: 8, borderRadius: 8, border: "1px solid #EDE4D4", boxSizing: "border-box", fontSize: 16 }}
            />

            {categories.length > 0 && (
              <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 10, paddingBottom: 2 }}>
                <button type="button" onClick={() => setCategoryId(null)} style={chip(categoryId === null)}>All</button>
                {categories.map((c) => (
                  <button key={c.id} type="button" onClick={() => setCategoryId(c.id)} style={chip(categoryId === c.id)}>{c.name}</button>
                ))}
              </div>
            )}

            <div data-testid="kds-request-catalog" style={{ maxHeight: 240, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
              {visible.length === 0 && <p style={{ color: "#8B7355", fontSize: 13 }}>Nothing matches.</p>}
              {visible.map((item) => {
                const low = item.reorder_point != null && item.current_stock <= item.reorder_point;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => addItem(item)}
                    style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
                      textAlign: "left", width: "100%", minHeight: 52, padding: "10px 12px",
                      borderRadius: 8, cursor: "pointer", background: "#fff",
                      border: `1px solid ${lines.some((l) => l.item.id === item.id) ? "#1C1408" : "#EDE4D4"}`,
                    }}
                  >
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{item.name}</span>
                    <span style={{ fontSize: 12, color: low ? "#b45309" : "#8B7355", whiteSpace: "nowrap" }}>
                      {low ? "Low · " : ""}{item.current_stock} {item.unit} left
                    </span>
                  </button>
                );
              })}
            </div>

            <select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)} aria-label="Priority" style={{ width: "100%", padding: 10, marginBottom: 8, borderRadius: 8, border: "1px solid #EDE4D4", fontSize: 16 }}>
              <option value="normal">Normal</option>
              <option value="urgent">Urgent</option>
            </select>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" rows={2} style={{ width: "100%", padding: 10, marginBottom: 12, borderRadius: 8, border: "1px solid #EDE4D4", boxSizing: "border-box", fontSize: 16 }} />
            <button
              type="button"
              disabled={busy || lines.length === 0}
              onClick={() => void submitRequest()}
              style={{ width: "100%", padding: 14, borderRadius: 8, border: "none", background: "#D4813A", color: "#fff", fontWeight: 700, fontSize: 15, cursor: busy || lines.length === 0 ? "not-allowed" : "pointer", opacity: busy || lines.length === 0 ? 0.5 : 1 }}
            >
              {busy ? "Sending…" : lines.length > 1 ? `Send ${lines.length} items` : "Send request"}
            </button>
          </>
        )}

        {mode === "receive" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <p style={{ margin: 0, fontSize: 13, color: "#8B7355" }}>
              Bought and on its way. Accepting adds it to stock.
            </p>
            {toReceive.length === 0 ? (
              <p data-testid="kds-to-receive-empty" style={{ color: "#8B7355" }}>Nothing waiting.</p>
            ) : toReceive.map((item) => (
              <div key={item.id} data-testid="kds-to-receive-row" style={{ border: "1px solid #EDE4D4", borderRadius: 8, padding: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontWeight: 800, fontSize: 15 }}>
                  {item.qty} {item.unit} · {item.name}{item.partial ? " · part only" : ""}
                </div>
                <div style={{ fontSize: 12, color: "#8B7355" }}>
                  {item.shop ? `From ${item.shop}` : "Shop not recorded"}
                  {item.bought_by ? ` · bought by ${item.bought_by}` : ""}
                </div>
                {item.can_receive ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void accept(item)}
                    style={{ minHeight: 48, borderRadius: 8, border: "none", background: "#047857", color: "#fff", fontWeight: 700, fontSize: 14, cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.5 : 1 }}
                  >
                    Accept — add to stock
                  </button>
                ) : (
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "#b45309" }}>
                    {item.blocked_reason ?? "Somebody else has to accept this one."}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {(mode === "my" || mode === "buying") && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {rows.length === 0 ? <p style={{ color: "#8B7355" }}>Nothing here.</p> : rows.map((r) => (
              <div key={r.id} style={{ border: "1px solid #EDE4D4", borderRadius: 8, padding: 10 }}>
                <div style={{ fontWeight: 700 }}>{r.request_no}</div>
                <div style={{ fontSize: 12, color: "#8B7355" }}>{r.status} · {r.priority}</div>
                <ul style={{ margin: "8px 0 0", paddingLeft: 16, fontSize: 13 }}>
                  {r.items.map((item) => (
                    <li key={item.id} style={{ marginBottom: 6 }}>
                      {item.name} — {item.approved_qty ?? item.requested_qty} {item.requested_unit}
                      {mode === "buying" && !["received", "not_available", "bought"].includes(item.status) && (
                        <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                          <button type="button" onClick={() => void markPurchaseRequestItemBought(token, r.id, item.id, { actual_qty: item.approved_qty ?? item.requested_qty })} style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, border: "none", background: "#047857", color: "#fff", cursor: "pointer" }}>Bought</button>
                          <button type="button" onClick={() => void markPurchaseRequestItemPartial(token, r.id, item.id, { actual_qty: (item.approved_qty ?? item.requested_qty) / 2 })} style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, border: "1px solid #EDE4D4", cursor: "pointer" }}>Partial</button>
                          <button type="button" onClick={() => void markPurchaseRequestItemNotAvailable(token, r.id, item.id)} style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, border: "1px solid #EDE4D4", cursor: "pointer" }}>N/A</button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
