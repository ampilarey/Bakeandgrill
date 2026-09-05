import { useEffect, useMemo, useRef, useState } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";
import {
  createPurchaseRequest,
  fetchRequestCatalog,
  uploadPurchaseRequestAttachment,
  type PurchaseRequestLineInput,
  type RequestCatalogItem,
} from "../api";
import { palette, radius, space, type } from "../theme";

/*
 * "Request items" — a picker, not a form.
 *
 * Owner, 2026-09-05: staff request "from the list (he don't write anything)".
 * The old screen was a blank box where a cashier typed the item name, which
 * meant "chikn boxs", "Chicken Box" and "chicken boxes" all arrived as three
 * different things nobody could total, price or turn into stock. Now the name
 * and the unit both come from the inventory list the owner maintains, and a
 * picked line carries the item's id — so the buyer, the stock movement and the
 * cost land on the same row rather than on a spelling.
 *
 * Typing survives in exactly two places, both of them deliberate: the search
 * box, which is looking rather than naming, and a folded-away "can't find it"
 * fallback. The fallback exists because a hard block would not stop the
 * request — it would move it to a phone call, where the system never sees it.
 */

const REASONS = [
  { value: "low_stock", label: "Running low" },
  { value: "finished", label: "Finished" },
  { value: "urgent_order", label: "Urgent order" },
  { value: "other", label: "Other" },
] as const;

type Line = {
  item: RequestCatalogItem | null;
  /** Set only on the fallback path, where there is no catalogue row. */
  freeName?: string;
  freeUnit?: string;
  qty: number;
};

type Props = {
  onClose: () => void;
  onCreated?: () => void;
  prefillInventoryId?: number;
};

/** Steppers beat a number pad on a tablet, and cannot produce "1.000000001". */
function roundQty(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function RequestItemModal({ onClose, onCreated, prefillInventoryId }: Props) {
  const trapRef = useRef<HTMLDivElement>(null);
  useFocusTrap(trapRef, true, onClose);

  const [catalog, setCatalog] = useState<RequestCatalogItem[]>([]);
  const [categories, setCategories] = useState<Array<{ id: number; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [lines, setLines] = useState<Line[]>([]);

  const [priority, setPriority] = useState<"low" | "normal" | "urgent">("normal");
  const [reason, setReason] = useState<string>("low_stock");
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);

  const [showFallback, setShowFallback] = useState(false);
  const [otherName, setOtherName] = useState("");
  const [otherUnit, setOtherUnit] = useState("pcs");

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetchRequestCatalog();
        if (cancelled) return;
        setCatalog(res.items);
        setCategories(res.categories);
        // Arrived from a low-stock tap: that item is already in the basket.
        if (prefillInventoryId) {
          const hit = res.items.find((i) => i.id === prefillInventoryId);
          if (hit) setLines([{ item: hit, qty: hit.suggested_qty && hit.suggested_qty > 0 ? hit.suggested_qty : 1 }]);
        }
      } catch (e) {
        if (!cancelled) setLoadError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [prefillInventoryId]);

  const picked = useMemo(
    () => new Set(lines.map((l) => l.item?.id).filter((id): id is number => id != null)),
    [lines],
  );

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();

    return catalog.filter((i) => {
      if (categoryId != null && i.category_id !== categoryId) return false;
      if (term === "") return true;

      return i.name.toLowerCase().includes(term);
    });
  }, [catalog, search, categoryId]);

  const addItem = (item: RequestCatalogItem) => {
    setErr("");
    setLines((prev) => {
      const at = prev.findIndex((l) => l.item?.id === item.id);
      // Tapping an item already on the list adds one more of it rather than
      // silently doing nothing.
      if (at >= 0) {
        const next = [...prev];
        next[at] = { ...next[at], qty: roundQty(next[at].qty + 1) };

        return next;
      }

      return [...prev, { item, qty: item.suggested_qty && item.suggested_qty > 0 ? item.suggested_qty : 1 }];
    });
  };

  const bumpQty = (idx: number, delta: number) => {
    setLines((prev) => {
      const next = [...prev];
      const q = roundQty(next[idx].qty + delta);
      if (q <= 0) return prev.filter((_, i) => i !== idx);
      next[idx] = { ...next[idx], qty: q };

      return next;
    });
  };

  const addFallback = () => {
    const name = otherName.trim();
    if (!name) { setErr("Type what you need, or pick it from the list."); return; }
    setErr("");
    setLines((prev) => [...prev, { item: null, freeName: name, freeUnit: otherUnit.trim() || "pcs", qty: 1 }]);
    setOtherName("");
    setShowFallback(false);
  };

  const submit = async () => {
    if (lines.length === 0) { setErr("Pick at least one item."); return; }
    setBusy(true);
    setErr("");
    try {
      const payload: PurchaseRequestLineInput[] = lines.map((l) => (
        l.item
          ? {
              inventory_item_id: l.item.id,
              requested_qty: l.qty,
              requested_unit: l.item.unit,
              category: l.item.category ?? undefined,
              reason: reason as PurchaseRequestLineInput["reason"],
              notes: note.trim() || undefined,
            }
          : {
              free_text_name: l.freeName,
              requested_qty: l.qty,
              requested_unit: l.freeUnit || "pcs",
              reason: reason as PurchaseRequestLineInput["reason"],
              // Flagged so a manager can add it to the list with one tap
              // instead of it becoming a permanent piece of free text.
              notes: [note.trim(), "Not on the request list — add to inventory?"]
                .filter(Boolean)
                .join(" · "),
            }
      ));

      const res = await createPurchaseRequest({ source: "pos", priority, items: payload });
      if (photo && res.request?.id) {
        await uploadPurchaseRequestAttachment(res.request.id, photo, "request_photo");
      }
      onCreated?.();
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const chip = (active: boolean): React.CSSProperties => ({
    padding: "8px 14px", borderRadius: 999, border: "none", cursor: "pointer",
    background: active ? "#1C1408" : palette.border,
    color: active ? "#fff" : palette.panelInk,
    fontWeight: 600, fontSize: type.bodySm.fontSize, whiteSpace: "nowrap",
  });

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 800,
        background: "rgba(15,23,42,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: space.m,
      }}
      onClick={onClose}
    >
      <div
        ref={trapRef}
        role="dialog"
        aria-label="Request items"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(520px, 100%)",
          maxHeight: "100%",
          background: palette.panel,
          borderRadius: radius.l,
          padding: space.l,
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
          display: "flex", flexDirection: "column", gap: space.s,
          boxSizing: "border-box",
        }}
      >
        <h2 style={{ margin: 0, fontSize: type.title.fontSize }}>Request items</h2>
        <p style={{ margin: 0, color: palette.panelMuted, fontSize: type.bodySm.fontSize }}>
          Tap what you need. Managers approve before buying; stock updates after verification.
        </p>

        {/* ── The basket, first, because it is what you are building ────── */}
        {lines.length > 0 && (
          <div data-testid="request-basket" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {lines.map((l, idx) => (
              <div
                key={l.item?.id ?? `free-${idx}`}
                style={{
                  display: "flex", alignItems: "center", gap: space.s,
                  background: palette.border, borderRadius: radius.m, padding: "8px 10px",
                }}
              >
                <span style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: type.bodySm.fontSize }}>
                  {l.item?.name ?? l.freeName}
                  {!l.item && (
                    <span style={{ fontWeight: 500, color: palette.panelMuted }}> · not on the list</span>
                  )}
                </span>
                <button
                  type="button"
                  aria-label={`Less ${l.item?.name ?? l.freeName}`}
                  onClick={() => bumpQty(idx, -1)}
                  style={{ width: 36, height: 36, borderRadius: radius.m, border: "none", background: palette.panel, fontSize: 20, fontWeight: 700, cursor: "pointer" }}
                >−</button>
                <span style={{ minWidth: 72, textAlign: "center", fontWeight: 700, fontSize: type.bodySm.fontSize }}>
                  {l.qty} {l.item?.unit ?? l.freeUnit}
                </span>
                <button
                  type="button"
                  aria-label={`More ${l.item?.name ?? l.freeName}`}
                  onClick={() => bumpQty(idx, 1)}
                  style={{ width: 36, height: 36, borderRadius: radius.m, border: "none", background: palette.panel, fontSize: 20, fontWeight: 700, cursor: "pointer" }}
                >+</button>
              </div>
            ))}
          </div>
        )}

        {/* ── Finding an item ──────────────────────────────────────────── */}
        <input
          aria-label="Search items"
          placeholder="Search the list…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ padding: 12, borderRadius: radius.m, border: `1px solid ${palette.border}`, fontSize: 16, boxSizing: "border-box" }}
        />

        {categories.length > 0 && (
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
            <button type="button" onClick={() => setCategoryId(null)} style={chip(categoryId === null)}>All</button>
            {categories.map((c) => (
              <button key={c.id} type="button" onClick={() => setCategoryId(c.id)} style={chip(categoryId === c.id)}>
                {c.name}
              </button>
            ))}
          </div>
        )}

        <div
          data-testid="request-catalog"
          style={{ flex: 1, minHeight: 120, maxHeight: 260, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}
        >
          {loading && <p style={{ color: palette.panelMuted, fontSize: type.bodySm.fontSize }}>Loading the list…</p>}
          {!loading && loadError && (
            <p style={{ color: "#ef4444", fontSize: type.bodySm.fontSize }}>{loadError}</p>
          )}
          {!loading && !loadError && visible.length === 0 && (
            <p style={{ color: palette.panelMuted, fontSize: type.bodySm.fontSize }}>
              Nothing matches. Try another word, or use “Can’t find it?” below.
            </p>
          )}
          {visible.map((item) => {
            const low = item.reorder_point != null && item.current_stock <= item.reorder_point;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => addItem(item)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: space.s,
                  textAlign: "left", width: "100%", minHeight: 52,
                  padding: "10px 12px", borderRadius: radius.m, cursor: "pointer",
                  border: `1px solid ${picked.has(item.id) ? "#1C1408" : palette.border}`,
                  background: picked.has(item.id) ? palette.border : palette.panel,
                }}
              >
                <span style={{ fontWeight: 700, fontSize: type.bodySm.fontSize }}>{item.name}</span>
                <span style={{ fontSize: type.bodySm.fontSize, color: low ? "#b45309" : palette.panelMuted, whiteSpace: "nowrap" }}>
                  {low ? "Low · " : ""}{item.current_stock} {item.unit} left
                </span>
              </button>
            );
          })}
        </div>

        {/* ── The escape hatch, folded away ────────────────────────────── */}
        {showFallback ? (
          <div style={{ display: "flex", gap: 6 }}>
            <input
              aria-label="Item not on the list"
              placeholder="What do you need?"
              value={otherName}
              onChange={(e) => setOtherName(e.target.value)}
              style={{ flex: 1, minWidth: 0, padding: 10, borderRadius: radius.m, border: `1px solid ${palette.border}`, fontSize: 16 }}
            />
            <input
              aria-label="Unit"
              value={otherUnit}
              onChange={(e) => setOtherUnit(e.target.value)}
              style={{ width: 76, padding: 10, borderRadius: radius.m, border: `1px solid ${palette.border}`, fontSize: 16 }}
            />
            <button type="button" onClick={addFallback} style={{ padding: "10px 14px", borderRadius: radius.m, border: "none", background: "#1C1408", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
              Add
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowFallback(true)}
            style={{ alignSelf: "flex-start", background: "none", border: "none", padding: 0, cursor: "pointer", color: palette.panelMuted, fontSize: type.bodySm.fontSize, textDecoration: "underline", fontFamily: "inherit" }}
          >
            Can’t find it?
          </button>
        )}

        {/* ── How urgent, and why ──────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: space.s }}>
          <label>
            <span style={{ fontSize: type.bodySm.fontSize, fontWeight: 600 }}>Priority</span>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as typeof priority)}
              style={{ width: "100%", marginTop: 4, padding: 10, borderRadius: radius.m, border: `1px solid ${palette.border}`, fontSize: 16 }}
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="urgent">Urgent</option>
            </select>
          </label>
          <label>
            <span style={{ fontSize: type.bodySm.fontSize, fontWeight: 600 }}>Reason</span>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              style={{ width: "100%", marginTop: 4, padding: 10, borderRadius: radius.m, border: `1px solid ${palette.border}`, fontSize: 16 }}
            >
              {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </label>
        </div>

        <label style={{ display: "block" }}>
          <span style={{ fontSize: type.bodySm.fontSize, fontWeight: 600 }}>Note (optional)</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            style={{ width: "100%", marginTop: 4, padding: 10, borderRadius: radius.m, border: `1px solid ${palette.border}`, boxSizing: "border-box", fontSize: 16 }}
          />
        </label>

        <label style={{ display: "block" }}>
          <span style={{ fontSize: type.bodySm.fontSize, fontWeight: 600 }}>Photo (optional)</span>
          <input type="file" accept="image/*,.heic,.heif" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} style={{ marginTop: 4 }} />
        </label>

        {err && <p style={{ color: "#ef4444", fontSize: type.bodySm.fontSize, margin: 0 }}>{err}</p>}

        <div style={{ display: "flex", gap: space.s, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} style={{ padding: "12px 16px", borderRadius: radius.m, border: `1px solid ${palette.border}`, background: "#fff", cursor: "pointer" }}>
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || lines.length === 0}
            onClick={() => void submit()}
            style={{
              padding: "12px 16px", borderRadius: radius.m, border: "none",
              background: "#1C1408", color: "#fff", fontWeight: 700,
              cursor: busy || lines.length === 0 ? "not-allowed" : "pointer",
              opacity: busy || lines.length === 0 ? 0.5 : 1,
            }}
          >
            {busy ? "Sending…" : lines.length > 1 ? `Send ${lines.length} items` : "Send request"}
          </button>
        </div>
      </div>
    </div>
  );
}
