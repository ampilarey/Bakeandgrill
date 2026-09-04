import { useEffect, useMemo, useState } from "react";
import {
  adjustPreparedStock,
  fetchPosMenu,
  fetchPreparedStock,
  fetchReceipts,
  snoozeItem,
  REFUND_REASON_CATEGORIES,
  type PreparedStockRow,
  type RefundReasonCategory,
} from "../api";
import type { Item } from "../types";
import type { useOps } from "../hooks/useOps";
import { localDateYmd } from "../utils/localDate";
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
    ...(showPrepared ? [{ id: "availability" as Tab, label: "Sold out today", icon: "🚫" }] : []),
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
        title="Sold out today"
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
                  {busyId === item.id ? "…" : snoozed ? "Restore" : "Sold out"}
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

/**
 * The invoice behind the order being refunded.
 *
 * Owner, 2026-09-04: "need option to see invoice details, in pos, operation,
 * refund." Refunding blind meant trusting the customer's account of what they
 * bought; the lines, the money breakdown and what has already been refunded
 * are what let a cashier check it.
 *
 * Everything here comes from the row the picker already loaded — the receipts
 * list eager-loads items, payments and refunds — so opening this costs no
 * request and works with a dropped connection.
 */
function InvoiceDetails({ order }: {
  order: {
    order_number: string;
    created_at: string;
    customer_name: string | null;
    cashier_name: string | null;
    type: string | null;
    total: number;
    subtotal: number;
    discount: number;
    tax: number;
    serviceCharge: number;
    serviceChargeLabel: string | null;
    packagingFee: number;
    deliveryFee: number;
    items: Array<{
      id: number; name: string; variant: string | null; notes: string | null;
      quantity: number; unitPrice: number; lineTotal: number;
    }>;
    payments: Array<{ id: number; method: string; amount: number }>;
    refundedLaar: number;
    pendingRefundLaar: number;
  };
}) {
  const mvr = (n: number) => `MVR ${n.toFixed(2)}`;
  const when = (() => {
    try {
      return new Date(order.created_at).toLocaleString(undefined, {
        day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
      });
    } catch {
      return order.created_at;
    }
  })();
  const remaining = Math.max(
    0,
    Math.round(order.total * 100) - order.refundedLaar - order.pendingRefundLaar,
  ) / 100;

  const Line = ({ label, value, strong = false, tone }: {
    label: string; value: string; strong?: boolean; tone?: string;
  }) => (
    <div style={{
      display: "flex", justifyContent: "space-between", gap: 12,
      padding: "3px 0", fontSize: strong ? 13 : 12,
      fontWeight: strong ? 800 : 500, color: tone ?? (strong ? C.text : C.muted),
    }}>
      <span>{label}</span>
      <span style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );

  return (
    <div
      data-testid="refund-invoice"
      style={{
        marginTop: 8, padding: "10px 12px", borderRadius: 8,
        background: "#fff", border: `1px solid ${C.border}`,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 800, color: C.text }}>
        Invoice #{order.order_number}
      </div>
      <div style={{ fontSize: 11, color: C.subtle, marginBottom: 8 }}>
        {when}
        {order.type ? ` · ${order.type.replace(/_/g, " ")}` : ""}
        {order.customer_name ? ` · ${order.customer_name}` : ""}
        {order.cashier_name ? ` · rung by ${order.cashier_name}` : ""}
      </div>

      {order.items.length === 0 ? (
        <div style={{ fontSize: 12, color: C.muted, paddingBottom: 6 }}>
          No line items recorded on this order.
        </div>
      ) : (
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 6 }}>
          {order.items.map((it) => (
            <div key={it.id} style={{ display: "flex", gap: 10, padding: "4px 0" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>
                  {it.quantity} × {it.name}
                  {it.variant ? <span style={{ fontWeight: 500, color: C.muted }}> · {it.variant}</span> : null}
                </div>
                <div style={{ fontSize: 11, color: C.subtle }}>
                  {mvr(it.unitPrice)} each
                  {it.notes ? ` · ${it.notes}` : ""}
                </div>
              </div>
              <div style={{
                fontSize: 12, fontWeight: 700, color: C.text,
                whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums",
              }}>
                {mvr(it.lineTotal)}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 6, paddingTop: 6 }}>
        <Line label="Subtotal" value={mvr(order.subtotal)} />
        {order.discount > 0 && <Line label="Discount" value={`− ${mvr(order.discount)}`} />}
        {order.tax > 0 && <Line label="GST" value={mvr(order.tax)} />}
        {order.serviceCharge > 0 && (
          <Line label={order.serviceChargeLabel || "Service charge"} value={mvr(order.serviceCharge)} />
        )}
        {order.packagingFee > 0 && <Line label="Packaging" value={mvr(order.packagingFee)} />}
        {order.deliveryFee > 0 && <Line label="Delivery" value={mvr(order.deliveryFee)} />}
        <Line label="Total" value={mvr(order.total)} strong />
      </div>

      {order.payments.length > 0 && (
        <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 6, paddingTop: 6 }}>
          {order.payments.map((p) => (
            <Line
              key={p.id}
              label={`Paid · ${p.method.replace(/_/g, " ")}`}
              value={mvr(p.amount)}
            />
          ))}
        </div>
      )}

      {(order.refundedLaar > 0 || order.pendingRefundLaar > 0) && (
        <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 6, paddingTop: 6 }}>
          {order.refundedLaar > 0 && (
            <Line label="Already refunded" value={`− ${mvr(order.refundedLaar / 100)}`} tone={C.warn} />
          )}
          {order.pendingRefundLaar > 0 && (
            <Line
              label="Refund awaiting approval"
              value={`− ${mvr(order.pendingRefundLaar / 100)}`}
              tone={C.warn}
            />
          )}
          <Line label="Still refundable" value={mvr(remaining)} strong tone={remaining > 0 ? C.text : C.danger} />
        </div>
      )}
    </div>
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
    orderLabel: string;
    amount: number;
    reason: string;
    cashOverride: boolean;
  } | null>(null);
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [orderQuery, setOrderQuery] = useState("");
  const [debouncedOrderQuery, setDebouncedOrderQuery] = useState("");
  const [orderCandidates, setOrderCandidates] = useState<Array<{
    id: number;
    order_number: string;
    total: number;
    created_at: string;
    customer_name: string | null;
    payment_status?: string | null;
    /* The invoice itself. All of this already travels with each row of the
     * receipts list — items, payments and refunds are eager-loaded there — so
     * showing the invoice costs no extra request. Owner, 2026-09-04: "need
     * option to see invoice details". */
    cashier_name: string | null;
    type: string | null;
    subtotal: number;
    discount: number;
    tax: number;
    serviceCharge: number;
    serviceChargeLabel: string | null;
    packagingFee: number;
    deliveryFee: number;
    items: Array<{
      id: number;
      name: string;
      variant: string | null;
      notes: string | null;
      quantity: number;
      unitPrice: number;
      lineTotal: number;
    }>;
    payments: Array<{ id: number; method: string; amount: number }>;
    /** Already refunded — anything pending, approved or processed. Money the
     *  customer has been promised, so it must not be promised twice. */
    refundedLaar: number;
    pendingRefundLaar: number;
  }>>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState("");
  const [pickedOrderLabel, setPickedOrderLabel] = useState<string | null>(null);

  /*
   * Whose sales the picker lists.
   *
   * Owner, 2026-09-04: "to write the order number is v difficult... cashier
   * sees his only orders in refund, but admin sees all orders, so easily can
   * pick the order."
   *
   * A cashier who can only request sees the sales they rang themselves — a
   * short list they can recognise by time and amount, which is the point. An
   * authoriser opens on every sale of the day, since the order they are
   * refunding is usually somebody else's, and can narrow to their own. The
   * server filters on the order's user_id, the cashier who rang it, so a
   * requester cannot widen this from the client.
   */
  const [orderScope, setOrderScope] = useState<"mine" | "all">(canApprove ? "all" : "mine");
  const mineOnly = !canApprove || orderScope === "mine";

  /*
   * How far back the picker looks.
   *
   * Owner, 2026-09-04: "now see the same day invoice only, add option to see
   * his older sales also." A complaint often arrives a day or two after the
   * sale, and until now the only way to refund one of those was to type the
   * internal order ID, which nobody has to hand.
   *
   * Today stays the default because it is the common case and the shortest
   * list. The server takes a business-day range, so these are whole local
   * days, not a rolling 24 hours.
   */
  const [dateScope, setDateScope] = useState<"today" | "7d" | "30d" | "custom">("today");
  const [customFrom, setCustomFrom] = useState(localDateYmd());
  const [customTo, setCustomTo] = useState(localDateYmd());

  const dateParams = useMemo(() => {
    const today = localDateYmd();
    const daysAgo = (n: number) => {
      const d = new Date();
      d.setDate(d.getDate() - n);
      return localDateYmd(d);
    };
    if (dateScope === "today") return { date: today };
    if (dateScope === "7d") return { date_from: daysAgo(6), date_to: today };
    if (dateScope === "30d") return { date_from: daysAgo(29), date_to: today };
    // A backwards custom range would return nothing and read as "no sales",
    // so swap the ends rather than showing an empty list.
    const from = customFrom <= customTo ? customFrom : customTo;
    const to = customFrom <= customTo ? customTo : customFrom;
    return { date_from: from, date_to: to };
  }, [dateScope, customFrom, customTo]);

  /** The order behind the picked row, kept so the invoice can be shown. */
  const [pickedOrder, setPickedOrder] = useState<(typeof orderCandidates)[number] | null>(null);
  const [showInvoice, setShowInvoice] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedOrderQuery(orderQuery.trim()), 250);
    return () => window.clearTimeout(id);
  }, [orderQuery]);

  useEffect(() => {
    let cancelled = false;
    setOrdersLoading(true);
    setOrdersError("");
    void (async () => {
      try {
        const res = await fetchReceipts({
          ...dateParams,
          ...(debouncedOrderQuery ? { q: debouncedOrderQuery } : {}),
          ...(mineOnly ? { created_by_me: true } : {}),
          // A day's sales fit in 25; a month's do not. The search box is what
          // finds one further back than this.
          per_page: dateScope === "today" ? 25 : 100,
          slim: true,
        });
        if (cancelled) return;
        const laari = (v: unknown) => Math.round((Number(v) || 0) * 100);
        const rows = (res.data ?? [])
          .filter((r) => r.payment_status !== "unpaid")
          .map((r) => {
            const refunds = r.refunds ?? [];
            const sumWhere = (statuses: string[]) => refunds
              .filter((x) => statuses.includes(String(x.status)))
              .reduce((sum, x) => sum + laari(x.amount), 0);
            return {
              id: r.id,
              order_number: r.order_number,
              total: Number(r.total) || 0,
              created_at: r.created_at,
              customer_name: r.customer?.name ?? null,
              payment_status: r.payment_status ?? null,
              cashier_name: r.user?.name ?? null,
              type: r.type ?? null,
              subtotal: Number(r.subtotal) || 0,
              discount: Number(r.discount_amount) || 0,
              tax: Number(r.tax_amount) || 0,
              serviceCharge: Number(r.service_charge_amount) || 0,
              serviceChargeLabel: r.service_charge_label ?? null,
              packagingFee: Number(r.packaging_fee) || 0,
              deliveryFee: Number(r.delivery_fee) || 0,
              items: (r.items ?? []).map((it) => ({
                id: it.id,
                name: it.item_name,
                variant: it.variant_name ?? null,
                notes: it.notes ?? null,
                quantity: Number(it.quantity) || 0,
                unitPrice: Number(it.unit_price) || 0,
                lineTotal: Number(it.total_price) || 0,
              })),
              payments: (r.payments ?? [])
                .filter((p) => !p.status || ["completed", "paid", "success"].includes(String(p.status)))
                .map((p) => ({ id: p.id, method: String(p.method), amount: Number(p.amount) || 0 })),
              // Approved and processed are money gone; pending is money already
              // promised to the customer and awaiting an authoriser. Neither may
              // be offered twice, so both count against what is left.
              refundedLaar: sumWhere(["approved", "processed"]),
              pendingRefundLaar: sumWhere(["pending"]),
            };
          });
        setOrderCandidates(rows);
      } catch (e) {
        if (!cancelled) {
          setOrderCandidates([]);
          setOrdersError((e as Error).message || "Could not load orders.");
        }
      } finally {
        if (!cancelled) setOrdersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedOrderQuery, mineOnly, dateParams, dateScope]);

  const pickOrder = (row: (typeof orderCandidates)[number]) => {
    ops.setRefundOrderId(String(row.id));
    // Prefill what is still refundable, not the whole ticket: a second refund
    // on a part-refunded order would be rejected by the server's cap, and the
    // cashier would have no way to see why from this screen.
    const remaining = Math.max(
      0,
      Math.round(row.total * 100) - row.refundedLaar - row.pendingRefundLaar,
    ) / 100;
    ops.setRefundAmount(remaining > 0 ? remaining.toFixed(2) : "");
    setPickedOrderLabel(`#${row.order_number}`);
    setPickedOrder(row);
    setShowInvoice(false);
    ops.setOpsMessage("");
  };

  const clearPickedOrder = () => {
    ops.setRefundOrderId("");
    ops.setRefundAmount("");
    setPickedOrderLabel(null);
    setPickedOrder(null);
    setShowInvoice(false);
  };

  const handleRefundIntent = () => {
    const orderId = Number.parseInt(ops.refundOrderId, 10);
    const amount = Number.parseFloat(ops.refundAmount);
    if (!Number.isFinite(orderId) || orderId <= 0) {
      ops.setOpsMessage("Pick an order from the list (or enter a valid order ID).");
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
    const fromList = orderCandidates.find((r) => r.id === orderId);
    setPendingRefund({
      orderId,
      orderLabel: pickedOrderLabel
        || (fromList ? `#${fromList.order_number}` : `Order #${orderId}`),
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

      <FormCard
        title="Request refund"
        help={
          canApprove
            ? "Pick a sale from the list — every till, or just yours, today or further back. Search by order #, customer, or phone. Tap View invoice to check the lines before requesting. Amount is in MVR."
            : "Pick one of your own sales from the list — today or further back, no need to type the order number. Tap View invoice to check the lines before requesting. Amount is in MVR."
        }
      >
        {pickedOrderLabel && ops.refundOrderId ? (
          <div
            data-testid="refund-picked-order"
            style={{
              marginBottom: 10,
              padding: "10px 12px",
              borderRadius: 8,
              background: "#F0FDF4",
              border: "1px solid #86EFAC",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                {pickedOrderLabel}
              </div>
              <div style={{ fontSize: 11, color: C.muted }}>
                Internal ID {ops.refundOrderId}
                {ops.refundAmount ? ` · MVR ${ops.refundAmount}` : ""}
              </div>
            </div>
            <button
              type="button"
              onClick={clearPickedOrder}
              aria-label="Clear selected order"
              style={{
                border: "none",
                background: "transparent",
                color: C.danger,
                fontSize: 20,
                lineHeight: 1,
                cursor: "pointer",
                padding: 4,
              }}
            >
              ×
            </button>
            </div>
            {pickedOrder && (
              <>
                <button
                  type="button"
                  data-testid="refund-invoice-toggle"
                  onClick={() => setShowInvoice((v) => !v)}
                  aria-expanded={showInvoice}
                  style={{
                    marginTop: 8,
                    minHeight: 40,
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: `1px solid ${C.border}`,
                    background: "#fff",
                    color: C.text,
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    touchAction: "manipulation",
                  }}
                >
                  {showInvoice ? "Hide invoice" : "View invoice"}
                </button>
                {showInvoice && <InvoiceDetails order={pickedOrder} />}
              </>
            )}
          </div>
        ) : (
          <div style={{ marginBottom: 10 }}>
            {canApprove && (
              <div
                role="group"
                aria-label="Whose sales to show"
                style={{ display: "flex", gap: 6, marginBottom: 8 }}
              >
                {([["all", "All sales"], ["mine", "My sales"]] as const).map(([scope, label]) => {
                  const active = orderScope === scope;
                  return (
                    <button
                      key={scope}
                      type="button"
                      onClick={() => setOrderScope(scope)}
                      aria-pressed={active}
                      style={{
                        flex: 1,
                        minHeight: 40,
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: `1px solid ${active ? C.rail : C.border}`,
                        background: active ? C.rail : "#fff",
                        color: active ? "#fff" : C.text,
                        fontWeight: 700,
                        fontSize: 13,
                        cursor: "pointer",
                        fontFamily: "inherit",
                        touchAction: "manipulation",
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}
            <div
              role="group"
              aria-label="How far back to look"
              style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}
            >
              {([
                ["today", "Today"],
                ["7d", "Last 7 days"],
                ["30d", "Last 30 days"],
                ["custom", "Pick dates"],
              ] as const).map(([scope, label]) => {
                const active = dateScope === scope;
                return (
                  <button
                    key={scope}
                    type="button"
                    onClick={() => setDateScope(scope)}
                    aria-pressed={active}
                    style={{
                      flex: "1 1 auto",
                      minHeight: 40,
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: `1px solid ${active ? C.accent : C.border}`,
                      background: active ? "#FFF7ED" : "#fff",
                      color: active ? C.accentDark : C.text,
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      touchAction: "manipulation",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {dateScope === "custom" && (
              <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                <label style={{ flex: 1, fontSize: 11, color: C.muted }}>
                  From
                  <input
                    type="date"
                    value={customFrom}
                    max={localDateYmd()}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    aria-label="Sales from date"
                    style={{ ...fieldStyle, width: "100%", marginTop: 2 }}
                  />
                </label>
                <label style={{ flex: 1, fontSize: 11, color: C.muted }}>
                  To
                  <input
                    type="date"
                    value={customTo}
                    max={localDateYmd()}
                    onChange={(e) => setCustomTo(e.target.value)}
                    aria-label="Sales to date"
                    style={{ ...fieldStyle, width: "100%", marginTop: 2 }}
                  />
                </label>
              </div>
            )}
            <input
              value={orderQuery}
              onChange={(e) => setOrderQuery(e.target.value)}
              placeholder={mineOnly ? "Search my sales (number, name, phone)…" : "Search orders (number, name, phone)…"}
              aria-label="Search orders for refund"
              style={{ ...fieldStyle, width: "100%", marginBottom: 8 }}
            />
            <div
              data-testid="refund-order-picker"
              style={{
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                maxHeight: 280,
                overflowY: "auto",
                background: "#F8FAFC",
              }}
            >
              {ordersLoading && (
                <div style={{ padding: 12, fontSize: 12, color: C.muted }}>Loading orders…</div>
              )}
              {!ordersLoading && ordersError && (
                <div style={{ padding: 12, fontSize: 12, color: C.danger }}>{ordersError}</div>
              )}
              {!ordersLoading && !ordersError && orderCandidates.length === 0 && (
                <div style={{ padding: 12, fontSize: 12, color: C.muted }}>
                  {mineOnly
                    ? (debouncedOrderQuery
                      ? "None of your paid sales match."
                      : dateScope === "today"
                        ? "You have no paid sales today yet."
                        : "You have no paid sales in this period.")
                    : "No matching paid orders."}
                  {dateScope === "today" ? " Try a wider date range." : ""}
                  {canApprove && mineOnly && !debouncedOrderQuery ? " Or “All sales”." : ""}
                </div>
              )}
              {!ordersLoading && orderCandidates.map((row) => {
                const time = (() => {
                  try {
                    const d = new Date(row.created_at);
                    const clock = d.toLocaleTimeString(undefined, {
                      hour: "numeric",
                      minute: "2-digit",
                    });
                    // Once the list spans more than one day, the time alone
                    // stops identifying a sale — the date has to be on the row.
                    if (dateScope === "today") return clock;
                    const day = d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
                    return `${day} · ${clock}`;
                  } catch {
                    return "";
                  }
                })();
                const alreadyRefunded = row.refundedLaar + row.pendingRefundLaar;
                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => pickOrder(row)}
                    style={{
                      display: "flex",
                      width: "100%",
                      minHeight: 48,
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 12px",
                      touchAction: "manipulation",
                      border: "none",
                      borderBottom: `1px solid ${C.border}`,
                      background: "transparent",
                      textAlign: "left",
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                        #{row.order_number}
                        {row.customer_name ? (
                          <span style={{ fontWeight: 500, color: C.muted }}> · {row.customer_name}</span>
                        ) : null}
                      </div>
                      <div style={{ fontSize: 11, color: C.subtle }}>
                        {time}
                        {row.payment_status === "partial" ? " · partial" : ""}
                        {alreadyRefunded > 0 ? (
                          <span style={{ color: C.warn, fontWeight: 700 }}>
                            {` · refunded MVR ${(alreadyRefunded / 100).toFixed(2)}`}
                          </span>
                        ) : null}
                        {canApprove && row.cashier_name ? ` · ${row.cashier_name}` : ""}
                      </div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.text, whiteSpace: "nowrap" }}>
                      MVR {row.total.toFixed(2)}
                    </div>
                  </button>
                );
              })}
            </div>
            <details style={{ marginTop: 8 }}>
              <summary style={{ fontSize: 12, color: C.muted, cursor: "pointer" }}>
                Or type internal order ID
              </summary>
              <input
                value={ops.refundOrderId}
                onChange={(e) => {
                  setPickedOrderLabel(null);
                  ops.setRefundOrderId(e.target.value);
                }}
                placeholder="Order ID"
                inputMode="numeric"
                style={{ ...fieldStyle, width: "100%", marginTop: 8 }}
              />
            </details>
          </div>
        )}

        <div className="pos-ops-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr 1.6fr auto", gap: 10 }}>
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
          orderLabel={pendingRefund.orderLabel}
          amount={pendingRefund.amount}
          reason={pendingRefund.reason}
          cashRefundOverride={pendingRefund.cashOverride}
          cashOverrideMode="display"
          onCancel={() => setPendingRefund(null)}
          onConfirm={() => {
            setPendingRefund(null);
            setPickedOrderLabel(null);
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
