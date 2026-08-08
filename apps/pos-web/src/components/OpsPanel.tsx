import { useEffect, useMemo, useState } from "react";
import {
  adjustPreparedStock,
  fetchPosMenu,
  fetchPreparedStock,
  snoozeItem,
  REFUND_REASON_CATEGORIES,
  type PreparedStockRow,
  type RefundReasonCategory,
} from "../api";
import type { Item } from "../types";
import type { useOps } from "../hooks/useOps";
import { RefundConfirmModal } from "./RefundConfirmModal";

type OpsState = ReturnType<typeof useOps>;
type Tab = "inventory" | "prepared" | "availability" | "refunds";

const C = {
  bg: "#F5F6F8",
  panel: "#FFFFFF",
  text: "#0F172A",
  muted: "#64748B",
  subtle: "#94A3B8",
  border: "#E2E8F0",
  border2: "#CBD5E1",
  accent: "#D4813A",
  accentDark: "#B86820",
  success: "#10B981",
  warn: "#F59E0B",
  danger: "#EF4444",
  rail: "#0F172A",
};

type OpsPermissions = {
  inventory?: boolean;
  preparedStock?: boolean;
  refunds?: boolean;
  refundApprove?: boolean;
  shiftOpen?: boolean;
};

/**
 * On-floor operations workspace: inventory care, menu stock counts, and
 * refunds (when a shift is open). Suppliers, reports, and SMS marketing
 * live in the Admin dashboard — a pointer in the left rail reminds staff.
 */
export function OpsPanel(props: OpsState & {
  permissions?: OpsPermissions;
  onRequestItem?: () => void;
  onMenuRefresh?: () => void;
}) {
  const { permissions, onRequestItem, onMenuRefresh, ...ops } = props;
  const [tab, setTab] = useState<Tab>("inventory");

  const lowStockCount = useMemo(
    () => ops.inventoryItems.filter((i) => isInventoryLow(i)).length,
    [ops.inventoryItems],
  );

  const showInv = permissions ? !!permissions.inventory : true;
  const showPrepared = permissions ? !!permissions.preparedStock : false;
  const showRefunds = (permissions ? !!permissions.refunds : true) && !!permissions?.shiftOpen;

  const tabs: Array<{ id: Tab; label: string; icon: string; badge?: string }> = [
    ...(showInv ? [{ id: "inventory" as Tab, label: "Inventory", icon: "📦", badge: lowStockCount > 0 ? String(lowStockCount) : undefined }] : []),
    ...(showPrepared ? [{ id: "prepared" as Tab, label: "Menu stock", icon: "🥐" }] : []),
    ...(showPrepared ? [{ id: "availability" as Tab, label: "86 today", icon: "🚫" }] : []),
    ...(showRefunds ? [{ id: "refunds" as Tab, label: "Refunds", icon: "↩️" }] : []),
  ];

  const activeTab = tabs.some((t) => t.id === tab) ? tab : (tabs[0]?.id ?? "inventory");

  if (tabs.length === 0) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontSize: 14 }}>
        No operations available for your role.
      </div>
    );
  }

  return (
    <div className="pos-ops" style={{
      flex: 1, minHeight: 0,
      background: C.panel, borderRadius: 12, border: `1px solid ${C.border}`,
      display: "flex", overflow: "hidden",
    }}>
      {/* ── Left rail ─────────────────────────────────────────────── */}
      <nav className="pos-ops-nav" style={{
        width: 200, flexShrink: 0,
        background: "#F8FAFC", borderRight: `1px solid ${C.border}`,
        padding: "12px 8px", display: "flex", flexDirection: "column", gap: 4,
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 12px", borderRadius: 8,
                background: activeTab === t.id ? C.panel : "transparent",
                color: activeTab === t.id ? C.text : C.muted,
                border: "none",
                boxShadow: activeTab === t.id ? "0 1px 2px rgba(15,23,42,0.06)" : "none",
                textAlign: "left", cursor: "pointer",
                fontWeight: 600, fontSize: 13,
              }}
            >
              <span style={{ fontSize: 16, width: 20, textAlign: "center" }}>{t.icon}</span>
              <span style={{ flex: 1 }}>{t.label}</span>
              {t.badge && (
                <span style={{
                  background: C.warn, color: "#fff",
                  padding: "1px 8px", borderRadius: 999,
                  fontSize: 10, fontWeight: 800,
                }}>{t.badge}</span>
              )}
            </button>
          ))}
        </div>
        <p style={{
          margin: "8px 4px 0", padding: "0 8px",
          fontSize: 11, lineHeight: 1.45, color: C.muted,
        }}>
          Suppliers, full Reports, and SMS marketing are in the <strong style={{ color: C.text }}>Admin dashboard</strong>.
          Day sales (if you have access) is under <strong style={{ color: C.text }}>Sales report</strong> in the menu.
        </p>
      </nav>

      {/* ── Content ──────────────────────────────────────────────── */}
      <div style={{
        flex: 1, overflow: "auto", padding: 20,
        display: "flex", flexDirection: "column", gap: 16,
      }}>
        {activeTab === "inventory"  && <InventoryTab ops={ops} onRequestItem={onRequestItem} />}
        {activeTab === "prepared"   && <PreparedStockTab setOpsMessage={ops.setOpsMessage} />}
        {activeTab === "availability" && (
          <AvailabilityTab setOpsMessage={ops.setOpsMessage} onMenuRefresh={onMenuRefresh} />
        )}
        {activeTab === "refunds"    && <RefundsTab ops={ops} canApprove={!!permissions?.refundApprove} />}
      </div>
    </div>
  );
}

function AvailabilityTab({
  setOpsMessage,
  onMenuRefresh,
}: {
  setOpsMessage: (msg: string) => void;
  onMenuRefresh?: () => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    fetchPosMenu("dine_in")
      .then((res) => setItems(res.items ?? []))
      .catch(() => setOpsMessage("Unable to load menu items."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.name.toLowerCase().includes(q));
  }, [items, search]);

  const toggle = async (item: Item) => {
    const snoozed = item.snoozed_until != null && new Date(item.snoozed_until).getTime() > Date.now();
    setBusyId(item.id);
    try {
      const res = await snoozeItem(item.id, snoozed ? null : "end_of_day");
      setItems((prev) => prev.map((row) => (
        row.id === item.id
          ? { ...row, snoozed_until: res.item.snoozed_until }
          : row
      )));
      setOpsMessage(res.message);
      onMenuRefresh?.();
    } catch (e) {
      setOpsMessage((e as Error).message || "Unable to update availability.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <Header
        title="86 today"
        subtitle="Mark items unavailable until end of day. They return automatically tomorrow."
      />
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search menu…"
        style={{
          minHeight: 44, borderRadius: 10, border: `1px solid ${C.border}`,
          padding: "0 12px", fontSize: 14, width: "100%", maxWidth: 360,
        }}
      />
      {loading ? (
        <p style={{ color: C.muted, fontSize: 13 }}>Loading…</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {filtered.map((item) => {
            const snoozed = item.snoozed_until != null && new Date(item.snoozed_until).getTime() > Date.now();
            return (
              <div
                key={item.id}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                  padding: "10px 12px", borderRadius: 10, border: `1px solid ${C.border}`,
                  background: snoozed ? "#FEF2F2" : C.panel,
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{item.name}</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                    {snoozed ? "Unavailable today" : "Available"}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busyId === item.id}
                  onClick={() => void toggle(item)}
                  style={{
                    minHeight: 40, padding: "0 14px", borderRadius: 8, border: "none",
                    background: snoozed ? C.success : C.danger, color: "#fff",
                    fontWeight: 700, fontSize: 12, cursor: "pointer",
                  }}
                >
                  {busyId === item.id ? "…" : snoozed ? "Restore" : "86 today"}
                </button>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p style={{ color: C.muted, fontSize: 13 }}>No items match.</p>
          )}
        </div>
      )}
    </>
  );
}

// ────────────────────────────────────────────────────────────────────
// Prepared menu stock tab (croissants, batched items, tracked variants)
// ────────────────────────────────────────────────────────────────────

function PreparedStockTab({ setOpsMessage }: { setOpsMessage: (msg: string) => void }) {
  const [rows, setRows] = useState<PreparedStockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selectedKey, setSelectedKey] = useState("");
  const [delta, setDelta] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    fetchPreparedStock()
      .then((res) => setRows(res.items ?? []))
      .catch(() => setOpsMessage("Unable to load menu stock."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const rowKey = (r: PreparedStockRow) => `${r.item_id}:${r.variant_id ?? "base"}`;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (lowOnly && r.stock > r.low_stock_threshold) return false;
      if (q && !r.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, lowOnly]);

  const selected = rows.find((r) => rowKey(r) === selectedKey) ?? null;

  const handleSubmit = () => {
    if (!selected) return;
    const d = Number.parseInt(delta, 10);
    if (!Number.isFinite(d) || d === 0) {
      setOpsMessage("Enter a non-zero whole number (+ to add, − to remove).");
      return;
    }
    setSaving(true);
    adjustPreparedStock(selected.item_id, {
      delta: d,
      variant_id: selected.variant_id,
      notes: notes.trim() || undefined,
    })
      .then((res) => {
        setRows((prev) => prev.map((r) => (
          rowKey(r) === rowKey(res.item) ? res.item : r
        )));
        setDelta("");
        setNotes("");
        setShowForm(false);
        setOpsMessage(`Updated ${res.item.name} — now ${res.item.stock} on hand. Refresh menu to sync register.`);
      })
      .catch((e: Error) => setOpsMessage(e.message || "Unable to update menu stock."))
      .finally(() => setSaving(false));
  };

  return (
    <>
      <Header
        title="Menu stock"
        subtitle="Add or remove ready-made menu counts (not raw ingredients)."
        right={(
          <PrimaryBtn onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Close" : "Add / remove stock"}
          </PrimaryBtn>
        )}
      />

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search menu items…"
          style={{
            flex: 1, padding: "10px 12px", borderRadius: 8,
            border: `1px solid ${C.border2}`, fontSize: 13, background: "#fff",
          }}
        />
        <button
          onClick={() => setLowOnly((v) => !v)}
          style={{
            padding: "10px 14px", borderRadius: 8, cursor: "pointer",
            background: lowOnly ? C.warn : "#fff", color: lowOnly ? "#fff" : C.muted,
            border: `1px solid ${lowOnly ? C.warn : C.border2}`,
            fontWeight: 700, fontSize: 12,
          }}
        >
          Low only
        </button>
        <SecondaryBtn onClick={load}>Refresh</SecondaryBtn>
      </div>

      {showForm && (
        <FormCard
          title="Adjust menu stock"
          help="Positive adds (e.g. baked 12 croissants). Negative removes. Applies to items with Track quantity enabled in Admin."
          onCancel={() => setShowForm(false)}
        >
          <div className="pos-ops-grid" style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
            <select
              value={selectedKey}
              onChange={(e) => setSelectedKey(e.target.value)}
              style={fieldStyle}
            >
              <option value="">Select item…</option>
              {rows.map((r) => (
                <option key={rowKey(r)} value={rowKey(r)}>
                  {r.name} ({r.stock} on hand)
                </option>
              ))}
            </select>
            <input
              value={delta}
              onChange={(e) => setDelta(e.target.value.replace(/[^\d-]/g, ""))}
              placeholder="Change (+/-)"
              inputMode="numeric"
              style={fieldStyle}
            />
          </div>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            style={{ ...fieldStyle, marginTop: 10 }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
            <SecondaryBtn onClick={() => setShowForm(false)}>Cancel</SecondaryBtn>
            <button
              onClick={handleSubmit}
              disabled={!selectedKey || saving}
              style={{
                padding: "10px 18px", borderRadius: 8, border: "none",
                background: !selectedKey || saving ? "#CBD5E1" : C.success,
                color: "#fff", fontWeight: 700, fontSize: 13,
                cursor: !selectedKey || saving ? "not-allowed" : "pointer",
              }}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </FormCard>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {loading ? (
          <p style={{ color: C.muted, fontSize: 13 }}>Loading…</p>
        ) : filtered.length === 0 ? (
          <p style={{ color: C.muted, fontSize: 13 }}>
            {rows.length === 0
              ? "No menu items track prepared quantity. Enable Track in Admin → Menu."
              : "No matches."}
          </p>
        ) : (
          filtered.map((r) => {
            const low = r.stock <= r.low_stock_threshold;
            const empty = r.stock <= 0;
            return (
              <div
                key={rowKey(r)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "12px 14px", borderRadius: 8,
                  border: `1px solid ${empty ? C.danger : low ? C.warn : C.border}`,
                  background: empty ? "#FEF2F2" : low ? "#FFFBEB" : "#fff",
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{r.name}</div>
                  {low && !empty && (
                    <div style={{ fontSize: 11, color: C.warn, marginTop: 2 }}>Low stock</div>
                  )}
                  {empty && (
                    <div style={{ fontSize: 11, color: C.danger, marginTop: 2 }}>Sold out</div>
                  )}
                </div>
                <div style={{ fontWeight: 800, fontSize: 16, color: C.text }}>
                  {r.stock}
                </div>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}

// ────────────────────────────────────────────────────────────────────
// Inventory tab
// ────────────────────────────────────────────────────────────────────

function isInventoryLow(it: { current_stock: number | null; reorder_point?: number | null }): boolean {
  const stock = it.current_stock ?? 0;
  if (it.reorder_point != null && Number.isFinite(Number(it.reorder_point))) {
    return stock <= Number(it.reorder_point);
  }
  return stock <= 5;
}

function InventoryTab({ ops, onRequestItem }: { ops: OpsState; onRequestItem?: () => void }) {
  const [search, setSearch] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [activeForm, setActiveForm] = useState<"adjust" | "waste" | "receive" | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ops.inventoryItems.filter((it) => {
      if (lowOnly && !isInventoryLow(it)) return false;
      if (q && !it.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [ops.inventoryItems, search, lowOnly]);

  return (
    <>
      <Header
        title="Inventory"
        subtitle="Track stock levels, record waste, receive purchases."
        right={(
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {onRequestItem && (
              <SecondaryBtn onClick={onRequestItem}>Request item</SecondaryBtn>
            )}
            <SecondaryBtn onClick={() => setActiveForm("waste")}    active={activeForm === "waste"}>Record waste</SecondaryBtn>
            <SecondaryBtn onClick={() => setActiveForm("adjust")}   active={activeForm === "adjust"}>Adjust stock</SecondaryBtn>
            <PrimaryBtn   onClick={() => setActiveForm("receive")}>Receive stock</PrimaryBtn>
          </div>
        )}
      />

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search items…"
          style={{
            flex: 1, padding: "10px 12px", borderRadius: 8,
            border: `1px solid ${C.border2}`, fontSize: 13, background: "#fff",
          }}
        />
        <button
          onClick={() => setLowOnly((v) => !v)}
          style={{
            padding: "10px 14px", borderRadius: 8, cursor: "pointer",
            background: lowOnly ? C.warn : "#fff", color: lowOnly ? "#fff" : C.muted,
            border: `1px solid ${lowOnly ? C.warn : C.border2}`,
            fontWeight: 700, fontSize: 12,
          }}
        >
          Low stock only
        </button>
      </div>

      {/* Active inline form */}
      {activeForm === "adjust" && (
        <InventoryActionForm
          title="Adjust stock"
          help="Use a positive number to add, negative to remove. Pick the item, enter the delta, save."
          items={ops.inventoryItems}
          itemId={ops.adjustItemId}
          setItemId={ops.setAdjustItemId}
          quantity={ops.adjustQuantity}
          setQuantity={ops.setAdjustQuantity}
          notes={ops.adjustNotes}
          setNotes={ops.setAdjustNotes}
          onSubmit={() => { ops.setAdjustType("adjustment"); ops.handleAdjustInventory(); setActiveForm(null); }}
          onCancel={() => setActiveForm(null)}
          submitLabel="Save adjustment"
        />
      )}
      {activeForm === "waste" && (
        <WasteForm
          ops={ops}
          onDone={() => setActiveForm(null)}
        />
      )}
      {activeForm === "receive" && (
        <ReceivePurchaseForm ops={ops} onDone={() => setActiveForm(null)} />
      )}

      {/* Inventory table */}
      <div className="pos-ops-table-wrap" style={{
        background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10,
        overflow: "hidden",
      }}>
        <div style={{
          display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr",
          padding: "10px 14px", background: "#F8FAFC",
          borderBottom: `1px solid ${C.border}`,
          fontSize: 11, fontWeight: 700, color: C.muted,
          textTransform: "uppercase", letterSpacing: "0.06em",
        }}>
          <span>Item</span>
          <span style={{ textAlign: "right" }}>Stock</span>
          <span style={{ textAlign: "right" }}>Status</span>
        </div>
        {filtered.length === 0 ? (
          <Empty emoji="🗄️" title="Nothing here yet" body={search || lowOnly ? "Try removing your filters." : "Inventory will appear once you add it from Admin → Inventory."} />
        ) : (
          filtered.map((it) => {
            const stock = it.current_stock ?? 0;
            const low = isInventoryLow(it);
            const empty = stock <= 0;
            return (
              <div key={it.id} style={{
                display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr",
                padding: "10px 14px", borderTop: `1px solid ${C.border}`,
                fontSize: 13, color: C.text, alignItems: "center",
              }}>
                <span style={{ fontWeight: 600 }}>{it.name}</span>
                <span style={{ textAlign: "right", color: empty ? C.danger : C.text, fontWeight: 600 }}>
                  {stock} <span style={{ color: C.muted, fontWeight: 400 }}>{it.unit}</span>
                </span>
                <span style={{ textAlign: "right" }}>
                  <Pill tone={empty ? "danger" : low ? "warn" : "success"}>
                    {empty ? "Out" : low ? "Low" : "OK"}
                  </Pill>
                </span>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}

function InventoryActionForm({
  title, help, items, itemId, setItemId, quantity, setQuantity, notes, setNotes,
  onSubmit, onCancel, submitLabel, submitColor = C.success,
}: {
  title: string;
  help: string;
  items: OpsState["inventoryItems"];
  itemId: number | null;
  setItemId: (n: number | null) => void;
  quantity: string;
  setQuantity: (s: string) => void;
  notes: string;
  setNotes: (s: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
  submitColor?: string;
}) {
  return (
    <FormCard title={title} help={help} onCancel={onCancel}>
      <div className="pos-ops-grid" style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
        <select
          value={itemId ?? ""}
          onChange={(e) => setItemId(e.target.value ? Number(e.target.value) : null)}
          style={fieldStyle}
        >
          <option value="">Select item…</option>
          {items.map((it) => (
            <option key={it.id} value={it.id}>{it.name} ({it.current_stock ?? 0} {it.unit})</option>
          ))}
        </select>
        <input
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder="Quantity (+/-)"
          inputMode="decimal"
          style={fieldStyle}
        />
      </div>
      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes (optional)"
        style={{ ...fieldStyle, marginTop: 10 }}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
        <SecondaryBtn onClick={onCancel}>Cancel</SecondaryBtn>
        <button onClick={onSubmit} disabled={!itemId} style={{
          padding: "10px 18px", borderRadius: 8, border: "none",
          background: !itemId ? "#CBD5E1" : submitColor,
          color: "#fff", fontWeight: 700, fontSize: 13,
          cursor: !itemId ? "not-allowed" : "pointer",
        }}>{submitLabel}</button>
      </div>
    </FormCard>
  );
}

function WasteForm({ ops, onDone }: { ops: OpsState; onDone: () => void }) {
  const reasons: Array<{ value: typeof ops.wasteReason; label: string }> = [
    { value: "spoilage", label: "Spoilage" },
    { value: "over_prep", label: "Over-prep" },
    { value: "drop", label: "Dropped" },
    { value: "expired", label: "Expired" },
    { value: "quality", label: "Quality" },
    { value: "other", label: "Other" },
  ];

  return (
    <FormCard
      title="Record waste"
      help="Enter a positive quantity. This writes a waste log for finance and removes stock."
      onCancel={onDone}
    >
      <div className="pos-ops-grid" style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
        <select
          value={ops.adjustItemId ?? ""}
          onChange={(e) => ops.setAdjustItemId(e.target.value ? Number(e.target.value) : null)}
          style={fieldStyle}
        >
          <option value="">Select item…</option>
          {ops.inventoryItems.map((it) => (
            <option key={it.id} value={it.id}>{it.name} ({it.current_stock ?? 0} {it.unit})</option>
          ))}
        </select>
        <input
          value={ops.adjustQuantity}
          onChange={(e) => ops.setAdjustQuantity(e.target.value)}
          placeholder="Qty wasted"
          inputMode="decimal"
          style={fieldStyle}
        />
      </div>
      <select
        value={ops.wasteReason}
        onChange={(e) => ops.setWasteReason(e.target.value as typeof ops.wasteReason)}
        style={{ ...fieldStyle, marginTop: 10 }}
      >
        {reasons.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
      </select>
      <input
        value={ops.adjustNotes}
        onChange={(e) => ops.setAdjustNotes(e.target.value)}
        placeholder="Notes (optional)"
        style={{ ...fieldStyle, marginTop: 10 }}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
        <SecondaryBtn onClick={onDone}>Cancel</SecondaryBtn>
        <button
          onClick={() => { ops.handleRecordWaste(); onDone(); }}
          disabled={!ops.adjustItemId}
          style={{
            padding: "10px 18px", borderRadius: 8, border: "none",
            background: !ops.adjustItemId ? "#CBD5E1" : C.danger,
            color: "#fff", fontWeight: 700, fontSize: 13,
            cursor: !ops.adjustItemId ? "not-allowed" : "pointer",
          }}
        >
          Record waste
        </button>
      </div>
    </FormCard>
  );
}

function ReceivePurchaseForm({ ops, onDone }: { ops: OpsState; onDone: () => void }) {
  return (
    <FormCard title="Receive stock" help="Pick inventory SKUs — stock on hand updates immediately when you save." onCancel={onDone}>
      <div className="pos-ops-grid" style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 10 }}>
        <select
          value={ops.purchaseSupplierId ?? ""}
          onChange={(e) => ops.setPurchaseSupplierId(e.target.value ? Number(e.target.value) : null)}
          style={fieldStyle}
        >
          <option value="">Supplier (optional)</option>
          {ops.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <input
          type="date"
          value={ops.purchaseDate}
          onChange={(e) => ops.setPurchaseDate(e.target.value)}
          style={fieldStyle}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
        {ops.purchaseLines.map((line) => (
          <div
            key={line.key}
            className="pos-ops-grid"
            style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 8, alignItems: "center" }}
          >
            <select
              value={line.inventoryItemId ?? ""}
              onChange={(e) => {
                const id = e.target.value ? Number(e.target.value) : null;
                const inv = ops.inventoryItems.find((i) => i.id === id);
                ops.updatePurchaseLine(line.key, {
                  inventoryItemId: id,
                  name: inv?.name ?? "",
                });
              }}
              style={fieldStyle}
            >
              <option value="">Select inventory item…</option>
              {ops.inventoryItems.map((it) => (
                <option key={it.id} value={it.id}>{it.name} ({it.unit})</option>
              ))}
            </select>
            <input
              value={line.quantity}
              onChange={(e) => ops.updatePurchaseLine(line.key, { quantity: e.target.value })}
              placeholder="Qty"
              inputMode="decimal"
              style={fieldStyle}
            />
            <input
              value={line.unitCost}
              onChange={(e) => ops.updatePurchaseLine(line.key, { unitCost: e.target.value })}
              placeholder="Unit MVR"
              inputMode="decimal"
              style={fieldStyle}
            />
            <button
              type="button"
              onClick={() => ops.removePurchaseLine(line.key)}
              disabled={ops.purchaseLines.length === 1}
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: `1px solid ${C.border2}`,
                background: "#fff",
                color: ops.purchaseLines.length === 1 ? C.subtle : C.danger,
                cursor: ops.purchaseLines.length === 1 ? "not-allowed" : "pointer",
                fontWeight: 700,
                fontSize: 12,
              }}
              title="Remove line"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "space-between", flexWrap: "wrap" }}>
        <SecondaryBtn onClick={ops.addPurchaseLine}>+ Add line</SecondaryBtn>
        <div style={{ display: "flex", gap: 8 }}>
          <SecondaryBtn onClick={onDone}>Cancel</SecondaryBtn>
          <PrimaryBtn onClick={() => { ops.handleCreatePurchase(); onDone(); }}>Record purchase</PrimaryBtn>
        </div>
      </div>
    </FormCard>
  );
}

function RefundsTab({ ops, canApprove }: { ops: OpsState; canApprove: boolean }) {
  const statusOptions = [
    { value: "", label: "All statuses" },
    { value: "pending", label: "Pending" },
    { value: "approved", label: "Approved" },
    { value: "processed", label: "Processed" },
    { value: "rejected", label: "Rejected" },
  ];

  const [pendingRefund, setPendingRefund] = useState<{
    orderId: number;
    amount: number;
    reason: string;
    cashOverride: boolean;
  } | null>(null);
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const handleRefundIntent = () => {
    const orderId = Number.parseInt(ops.refundOrderId, 10);
    const amount = Number.parseFloat(ops.refundAmount);
    if (!Number.isFinite(orderId) || orderId <= 0) {
      ops.setOpsMessage("Enter a valid order ID.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      ops.setOpsMessage("Enter a valid refund amount.");
      return;
    }
    if (!ops.refundCategory) {
      ops.setOpsMessage("Pick a reason category.");
      return;
    }
    if (!ops.refundReason.trim()) {
      ops.setOpsMessage("Describe the reason.");
      return;
    }
    if (ops.refundCategory === "other" && ops.refundReason.trim().length < 3) {
      ops.setOpsMessage("Please describe the reason when category is Other.");
      return;
    }
    ops.setOpsMessage("");
    setPendingRefund({
      orderId,
      amount,
      reason: ops.refundReason.trim(),
      cashOverride: ops.refundCashOverride,
    });
  };

  return (
    <>
      <Header
        title="Refunds"
        subtitle="Request refunds for approval. Money moves only after an authoriser approves."
      />

      <FormCard title="Request refund" help="Use the order ID from Receipts or Active orders. Amount is in MVR. Walk-in phone is only used when the order has no stored number — existing numbers cannot be changed here.">
        <div className="pos-ops-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.4fr 1.6fr auto", gap: 10 }}>
          <input
            value={ops.refundOrderId}
            onChange={(e) => ops.setRefundOrderId(e.target.value)}
            placeholder="Order ID"
            inputMode="numeric"
            style={fieldStyle}
          />
          <input
            value={ops.refundAmount}
            onChange={(e) => ops.setRefundAmount(e.target.value)}
            placeholder="Amount MVR"
            inputMode="decimal"
            style={fieldStyle}
          />
          <select
            value={ops.refundCategory}
            onChange={(e) => ops.setRefundCategory(e.target.value as RefundReasonCategory | "")}
            style={fieldStyle}
          >
            <option value="">Category…</option>
            {REFUND_REASON_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <input
            value={ops.refundReason}
            onChange={(e) => ops.setRefundReason(e.target.value)}
            placeholder="Details (required)"
            style={fieldStyle}
          />
          <PrimaryBtn onClick={handleRefundIntent}>Request</PrimaryBtn>
        </div>
        <input
          value={ops.refundPhone}
          onChange={(e) => ops.setRefundPhone(e.target.value)}
          placeholder="Walk-in phone (only if order has none)"
          inputMode="tel"
          style={{ ...fieldStyle, marginTop: 8, width: "100%" }}
        />
        <label style={{
          display: "flex", alignItems: "center", gap: 8, marginTop: 8,
          fontSize: 12, color: C.muted, cursor: "pointer",
        }}>
          <input
            type="checkbox"
            checked={ops.refundCashOverride}
            onChange={(e) => ops.setRefundCashOverride(e.target.checked)}
            style={{ width: 15, height: 15 }}
          />
          Refund card portion in cash (applied on approval)
        </label>
      </FormCard>

      {pendingRefund && (
        <RefundConfirmModal
          orderLabel={`Order #${pendingRefund.orderId}`}
          amount={pendingRefund.amount}
          reason={pendingRefund.reason}
          cashRefundOverride={pendingRefund.cashOverride}
          cashOverrideMode="display"
          onCancel={() => setPendingRefund(null)}
          onConfirm={() => {
            setPendingRefund(null);
            ops.handleCreateRefund();
          }}
        />
      )}

      {canApprove && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.muted }}>Filter</span>
            <select
              value={ops.refundStatusFilter}
              onChange={(e) => ops.setRefundStatusFilter(e.target.value)}
              style={{ ...fieldStyle, width: "auto", minWidth: 160 }}
            >
              {statusOptions.map((o) => (
                <option key={o.value || "all"} value={o.value}>{o.label}</option>
              ))}
            </select>
            <span style={{ fontSize: 12, color: C.subtle }}>{ops.refunds.length} shown</span>
          </div>

          {ops.refunds.length === 0 ? (
            <Empty emoji="↩️" title="No refunds" body="Nothing matches this filter yet." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {ops.refunds.map((r) => (
                <div
                  key={r.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto 1fr auto auto",
                    gap: 12,
                    alignItems: "center",
                    padding: "12px 14px",
                    borderRadius: 10,
                    border: `1px solid ${r.no_customer_contact ? "#FECACA" : C.border}`,
                    background: r.no_customer_contact ? "#FEF2F2" : "#FAFAFA",
                    fontSize: 13,
                  }}
                >
                  <span style={{ fontWeight: 800, color: C.text }}>#{r.id}</span>
                  <span style={{ color: C.muted }}>
                    Order {r.order_id}
                    {r.reason ? ` · ${r.reason}` : ""}
                    {(r.phone_flags?.refund_phone ?? r.refund_phone) ? ` · ${r.phone_flags?.refund_phone ?? r.refund_phone}` : ""}
                    {r.phone_flags?.phone_added_at_refund ? " · ADDED" : ""}
                    {r.phone_flags?.has_prior_order_history === false ? " · NO HISTORY" : ""}
                    {(r.phone_flags?.refunds_last_90_days ?? 0) > 0 ? ` · ${r.phone_flags?.refunds_last_90_days} refunds/90d` : ""}
                    {r.phone_flags?.otp_owner_override ? " · OTP OVERRIDE" : ""}
                    {r.no_customer_contact ? " · NO CONTACT" : ""}
                    {r.rejection_reason ? ` · Rejected: ${r.rejection_reason}` : ""}
                    {r.status === "pending" && (
                      <span style={{ display: "inline-flex", gap: 6, marginLeft: 8 }}>
                        <button
                          type="button"
                          onClick={() => ops.handleApproveRefund(r.id)}
                          style={{
                            padding: "4px 10px", fontSize: 11, fontWeight: 700, borderRadius: 8,
                            border: "none", background: C.success, color: "#fff", cursor: "pointer",
                          }}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => { setRejectId(r.id); setRejectReason(""); }}
                          style={{
                            padding: "4px 10px", fontSize: 11, fontWeight: 700, borderRadius: 8,
                            border: "none", background: C.danger, color: "#fff", cursor: "pointer",
                          }}
                        >
                          Reject
                        </button>
                      </span>
                    )}
                  </span>
                  <span style={{ fontWeight: 700, color: C.text }}>MVR {Number(r.amount).toFixed(2)}</span>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    color: r.status === "rejected" ? C.danger : r.status === "pending" ? C.warn : C.success,
                  }}>
                    {r.status}
                  </span>
                </div>
              ))}
            </div>
          )}

          {rejectId !== null && (
            <FormCard title="Reject refund" help="Rejection reason is required. No money moves.">
              <div style={{ display: "flex", gap: 10 }}>
                <input
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Why decline this refund?"
                  style={{ ...fieldStyle, flex: 1 }}
                />
                <PrimaryBtn onClick={() => {
                  ops.handleRejectRefund(rejectId, rejectReason);
                  setRejectId(null);
                  setRejectReason("");
                }}>
                  Confirm reject
                </PrimaryBtn>
                <button
                  type="button"
                  onClick={() => setRejectId(null)}
                  style={{
                    padding: "8px 12px", borderRadius: 8, fontWeight: 700, fontSize: 13,
                    background: "#fff", color: C.text, border: `1px solid ${C.border2}`, cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            </FormCard>
          )}
        </>
      )}
    </>
  );
}

// ────────────────────────────────────────────────────────────────────
// Shared bits
// ────────────────────────────────────────────────────────────────────

function Header({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: C.text }}>{title}</h1>
        {subtitle && <p style={{ margin: "4px 0 0", fontSize: 13, color: C.muted }}>{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

function FormCard({ title, help, children, onCancel }: {
  title: string;
  help?: string;
  children: React.ReactNode;
  onCancel?: () => void;
}) {
  return (
    <div style={{
      background: C.panel, borderRadius: 10, border: `1px solid ${C.border}`,
      padding: 16,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{title}</div>
          {help && <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{help}</div>}
        </div>
        {onCancel && (
          <button onClick={onCancel} aria-label="Close" style={{
            background: "none", border: "none", color: C.subtle,
            fontSize: 18, cursor: "pointer", lineHeight: 1, padding: 0,
          }}>×</button>
        )}
      </div>
      {children}
    </div>
  );
}

function Pill({ children, tone }: { children: React.ReactNode; tone: "success" | "warn" | "danger" }) {
  const palette = {
    success: { bg: "#DCFCE7", color: "#15803D" },
    warn:    { bg: "#FEF3C7", color: "#92400E" },
    danger:  { bg: "#FEE2E2", color: "#B91C1C" },
  }[tone];
  return (
    <span style={{
      display: "inline-block", padding: "3px 10px", borderRadius: 999,
      fontSize: 11, fontWeight: 700,
      background: palette.bg, color: palette.color,
    }}>{children}</span>
  );
}

function Empty({ emoji, title, body }: { emoji: string; title: string; body: string }) {
  return (
    <div style={{
      padding: 32, textAlign: "center", color: C.subtle,
      display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
    }}>
      <div style={{ fontSize: 38 }}>{emoji}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.muted }}>{title}</div>
      <div style={{ fontSize: 12, maxWidth: 280 }}>{body}</div>
    </div>
  );
}

function PrimaryBtn({ children, onClick, disabled }: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: "10px 18px", borderRadius: 8, border: "none",
      background: disabled ? "#F1B98C" : C.accent,
      color: "#fff", fontWeight: 700, fontSize: 13,
      cursor: disabled ? "not-allowed" : "pointer",
    }}>{children}</button>
  );
}

function SecondaryBtn({ children, onClick, disabled, active }: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: "10px 14px", borderRadius: 8,
      background: active ? "#F8FAFC" : "#fff",
      color: C.text, border: `1px solid ${C.border2}`,
      fontWeight: 600, fontSize: 13,
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1,
    }}>{children}</button>
  );
}

const fieldStyle: React.CSSProperties = {
  padding: "10px 12px", borderRadius: 8,
  border: `1px solid ${C.border2}`, fontSize: 13,
  background: "#fff", color: C.text, outline: "none",
  width: "100%", boxSizing: "border-box",
};
