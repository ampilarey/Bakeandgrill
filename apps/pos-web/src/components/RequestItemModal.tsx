import { useRef, useState } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { createPurchaseRequest, uploadPurchaseRequestAttachment, type PurchaseRequestLineInput } from "../api";
import { palette, radius, space, type } from "../theme";

const CATEGORIES = [
  { id: "packaging", label: "Packaging" },
  { id: "drinks", label: "Drinks" },
  { id: "counter", label: "Counter" },
  { id: "cleaning", label: "Cleaning" },
  { id: "ingredients", label: "Ingredients" },
  { id: "other", label: "Other" },
] as const;

const REASONS = [
  { value: "low_stock", label: "Low stock" },
  { value: "finished", label: "Finished" },
  { value: "urgent_order", label: "Urgent order" },
  { value: "packaging", label: "Packaging" },
  { value: "cleaning", label: "Cleaning" },
  { value: "other", label: "Other" },
] as const;

type Props = {
  onClose: () => void;
  onCreated?: () => void;
  prefillName?: string;
  prefillInventoryId?: number;
};

export function RequestItemModal({ onClose, onCreated, prefillName, prefillInventoryId }: Props) {
  const trapRef = useRef<HTMLDivElement>(null);
  useFocusTrap(trapRef, true, onClose);
  const [category, setCategory] = useState("other");
  const [name, setName] = useState(prefillName ?? "");
  const [qty, setQty] = useState("1");
  const [unit, setUnit] = useState("pcs");
  const [priority, setPriority] = useState<"low" | "normal" | "urgent">("normal");
  const [reason, setReason] = useState<string>("low_stock");
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    const parsedQty = parseFloat(qty);
    if (!name.trim()) { setErr("Enter an item name."); return; }
    if (isNaN(parsedQty) || parsedQty <= 0) { setErr("Enter a valid quantity."); return; }
    setBusy(true);
    setErr("");
    try {
      const line: PurchaseRequestLineInput = {
        free_text_name: name.trim(),
        category,
        requested_qty: parsedQty,
        requested_unit: unit.trim() || "pcs",
        reason: reason as PurchaseRequestLineInput["reason"],
        notes: note.trim() || undefined,
      };
      if (prefillInventoryId) line.inventory_item_id = prefillInventoryId;
      const res = await createPurchaseRequest({
        source: "pos",
        priority,
        items: [line],
      });
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
          width: "min(480px, 100%)",
          background: palette.panel,
          borderRadius: radius.l,
          padding: space.l,
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
        }}
      >
        <h2 style={{ margin: `0 0 ${space.m}px`, fontSize: type.title.fontSize }}>Request items</h2>
        <p style={{ margin: `0 0 ${space.m}px`, color: palette.panelMuted, fontSize: type.bodySm.fontSize }}>
          Managers approve before buying. Stock updates only after verification.
        </p>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: space.m }}>
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(c.id)}
              style={{
                padding: "6px 12px", borderRadius: 999, border: "none", cursor: "pointer",
                background: category === c.id ? "#1C1408" : palette.border,
                color: category === c.id ? "#fff" : palette.panelInk,
                fontWeight: 600, fontSize: type.bodySm.fontSize,
              }}
            >
              {c.label}
            </button>
          ))}
        </div>

        <label style={{ display: "block", marginBottom: space.s }}>
          <span style={{ fontSize: type.bodySm.fontSize, fontWeight: 600 }}>Item name *</span>
          <input
            aria-label="Item name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ width: "100%", marginTop: 4, padding: 10, borderRadius: radius.m, border: `1px solid ${palette.border}`, boxSizing: "border-box" }}
          />
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: space.s, marginBottom: space.s }}>
          <label>
            <span style={{ fontSize: type.bodySm.fontSize, fontWeight: 600 }}>Qty *</span>
            <input
              type="number"
              min="0.001"
              step="any"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              style={{ width: "100%", marginTop: 4, padding: 10, borderRadius: radius.m, border: `1px solid ${palette.border}`, boxSizing: "border-box" }}
            />
          </label>
          <label>
            <span style={{ fontSize: type.bodySm.fontSize, fontWeight: 600 }}>Unit</span>
            <input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              style={{ width: "100%", marginTop: 4, padding: 10, borderRadius: radius.m, border: `1px solid ${palette.border}`, boxSizing: "border-box" }}
            />
          </label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: space.s, marginBottom: space.s }}>
          <label>
            <span style={{ fontSize: type.bodySm.fontSize, fontWeight: 600 }}>Priority</span>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as typeof priority)}
              style={{ width: "100%", marginTop: 4, padding: 10, borderRadius: radius.m, border: `1px solid ${palette.border}` }}
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
              style={{ width: "100%", marginTop: 4, padding: 10, borderRadius: radius.m, border: `1px solid ${palette.border}` }}
            >
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </label>
        </div>

        <label style={{ display: "block", marginBottom: space.s }}>
          <span style={{ fontSize: type.bodySm.fontSize, fontWeight: 600 }}>Note</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            style={{ width: "100%", marginTop: 4, padding: 10, borderRadius: radius.m, border: `1px solid ${palette.border}`, boxSizing: "border-box" }}
          />
        </label>

        <label style={{ display: "block", marginBottom: space.m }}>
          <span style={{ fontSize: type.bodySm.fontSize, fontWeight: 600 }}>Photo (optional)</span>
          <input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} style={{ marginTop: 4 }} />
        </label>

        {err && <p style={{ color: "#ef4444", fontSize: type.bodySm.fontSize }}>{err}</p>}

        <div style={{ display: "flex", gap: space.s, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} style={{ padding: "10px 16px", borderRadius: radius.m, border: `1px solid ${palette.border}`, background: "#fff", cursor: "pointer" }}>
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            style={{ padding: "10px 16px", borderRadius: radius.m, border: "none", background: "#1C1408", color: "#fff", fontWeight: 700, cursor: "pointer" }}
          >
            {busy ? "Submitting…" : "Submit request"}
          </button>
        </div>
      </div>
    </div>
  );
}
