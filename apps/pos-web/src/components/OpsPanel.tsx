import { useMemo, useState } from "react";
import type { useOps } from "../hooks/useOps";

type OpsState = ReturnType<typeof useOps>;
type Tab = "inventory" | "suppliers" | "reports" | "marketing";

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

/**
 * The old OpsPanel was a 6-card grid full of cramped raw forms — and half
 * of it (shift, cash drawer, refunds) is now duplicated by the dedicated
 * shift / receipts panels in the new POS. This rewrite turns Operations
 * into a focused back-office workspace with the four jobs that actually
 * belong here: inventory care, supplier book, KPI reports, SMS marketing.
 *
 * UX choices:
 *  - Left rail for tab nav so the content area stays roomy on a tablet.
 *  - Inventory tab gets a search box + low-stock filter so cashiers can
 *    find the one item they want without scrolling a 100-row dropdown.
 *  - Reports tab leads with preset chips (Today, 7d, 30d) — date pickers
 *    are still there but most lookups are one tap.
 *  - Marketing tab shows a live segment count + cost estimate so staff
 *    can't accidentally fire 3-segment Unicode messages without seeing
 *    the bill first.
 */
export function OpsPanel(ops: OpsState) {
  const [tab, setTab] = useState<Tab>("inventory");

  const lowStockThreshold = 5;
  const lowStockCount = useMemo(
    () => ops.inventoryItems.filter((i) => (i.current_stock ?? 0) <= lowStockThreshold).length,
    [ops.inventoryItems],
  );

  const tabs: Array<{ id: Tab; label: string; icon: string; badge?: string }> = [
    { id: "inventory",  label: "Inventory",  icon: "📦", badge: lowStockCount > 0 ? String(lowStockCount) : undefined },
    { id: "suppliers",  label: "Suppliers",  icon: "🏭" },
    { id: "reports",    label: "Reports",    icon: "📊" },
    { id: "marketing",  label: "Marketing",  icon: "📣" },
  ];

  return (
    <div style={{
      flex: 1, minHeight: 0,
      background: C.panel, borderRadius: 12, border: `1px solid ${C.border}`,
      display: "flex", overflow: "hidden",
    }}>
      {/* ── Left rail ─────────────────────────────────────────────── */}
      <nav style={{
        width: 200, flexShrink: 0,
        background: "#F8FAFC", borderRight: `1px solid ${C.border}`,
        padding: "12px 8px", display: "flex", flexDirection: "column", gap: 4,
      }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 12px", borderRadius: 8,
              background: tab === t.id ? C.panel : "transparent",
              color: tab === t.id ? C.text : C.muted,
              border: "none",
              boxShadow: tab === t.id ? "0 1px 2px rgba(15,23,42,0.06)" : "none",
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
      </nav>

      {/* ── Content ──────────────────────────────────────────────── */}
      <div style={{
        flex: 1, overflow: "auto", padding: 20,
        display: "flex", flexDirection: "column", gap: 16,
      }}>
        {tab === "inventory"  && <InventoryTab ops={ops} lowStockThreshold={lowStockThreshold} />}
        {tab === "suppliers"  && <SuppliersTab ops={ops} />}
        {tab === "reports"    && <ReportsTab ops={ops} />}
        {tab === "marketing"  && <MarketingTab ops={ops} />}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Inventory tab
// ────────────────────────────────────────────────────────────────────

function InventoryTab({ ops, lowStockThreshold }: { ops: OpsState; lowStockThreshold: number }) {
  const [search, setSearch] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [activeForm, setActiveForm] = useState<"adjust" | "waste" | "receive" | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ops.inventoryItems.filter((it) => {
      if (lowOnly && (it.current_stock ?? 0) > lowStockThreshold) return false;
      if (q && !it.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [ops.inventoryItems, search, lowOnly, lowStockThreshold]);

  return (
    <>
      <Header
        title="Inventory"
        subtitle="Track stock levels, record waste, receive purchases."
        right={(
          <div style={{ display: "flex", gap: 8 }}>
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
        <InventoryActionForm
          title="Record waste"
          help="Use a negative number — what you're throwing away. Notes help finance reconcile later."
          items={ops.inventoryItems}
          itemId={ops.adjustItemId}
          setItemId={ops.setAdjustItemId}
          quantity={ops.adjustQuantity}
          setQuantity={ops.setAdjustQuantity}
          notes={ops.adjustNotes}
          setNotes={ops.setAdjustNotes}
          onSubmit={() => { ops.setAdjustType("waste"); ops.handleAdjustInventory(); setActiveForm(null); }}
          onCancel={() => setActiveForm(null)}
          submitLabel="Record waste"
          submitColor={C.danger}
        />
      )}
      {activeForm === "receive" && (
        <ReceivePurchaseForm ops={ops} onDone={() => setActiveForm(null)} />
      )}

      {/* Inventory table */}
      <div style={{
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
            const low = stock <= lowStockThreshold;
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
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
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
          inputMode="none"
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

function ReceivePurchaseForm({ ops, onDone }: { ops: OpsState; onDone: () => void }) {
  return (
    <FormCard title="Receive stock" help="Logs a purchase from a supplier and increases on-hand inventory accordingly." onCancel={onDone}>
      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 10 }}>
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
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10, marginTop: 10 }}>
        <input
          value={ops.purchaseItemName}
          onChange={(e) => ops.setPurchaseItemName(e.target.value)}
          placeholder="Item name"
          style={fieldStyle}
        />
        <input
          value={ops.purchaseQuantity}
          onChange={(e) => ops.setPurchaseQuantity(e.target.value)}
          placeholder="Qty received"
          inputMode="none"
          style={fieldStyle}
        />
        <input
          value={ops.purchaseUnitCost}
          onChange={(e) => ops.setPurchaseUnitCost(e.target.value)}
          placeholder="Unit cost MVR"
          inputMode="none"
          style={fieldStyle}
        />
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
        <SecondaryBtn onClick={onDone}>Cancel</SecondaryBtn>
        <PrimaryBtn onClick={() => { ops.handleCreatePurchase(); onDone(); }}>Record purchase</PrimaryBtn>
      </div>
    </FormCard>
  );
}

// ────────────────────────────────────────────────────────────────────
// Suppliers tab
// ────────────────────────────────────────────────────────────────────

function SuppliersTab({ ops }: { ops: OpsState }) {
  return (
    <>
      <Header
        title="Suppliers"
        subtitle="Vendors you buy stock from. Used to attribute purchases for finance."
      />

      {/* Add row */}
      <FormCard title="Add supplier" help="Phone is optional but helps when you need to reorder.">
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr auto", gap: 10 }}>
          <input
            value={ops.newSupplierName}
            onChange={(e) => ops.setNewSupplierName(e.target.value)}
            placeholder="Supplier name"
            style={fieldStyle}
          />
          <input
            value={ops.newSupplierPhone}
            onChange={(e) => ops.setNewSupplierPhone(e.target.value)}
            placeholder="Phone (optional)"
            style={fieldStyle}
          />
          <PrimaryBtn onClick={ops.handleCreateSupplier} disabled={!ops.newSupplierName.trim()}>
            Add supplier
          </PrimaryBtn>
        </div>
      </FormCard>

      {/* Chips list */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {ops.suppliers.length === 0 ? (
          <Empty emoji="🏭" title="No suppliers yet" body="Add your first supplier above so you can attribute purchases." />
        ) : ops.suppliers.map((s) => (
          <div key={s.id} style={{
            padding: "10px 14px", borderRadius: 999,
            background: C.panel, border: `1px solid ${C.border}`,
            fontSize: 13, fontWeight: 600, color: C.text,
          }}>
            🏭 {s.name}
          </div>
        ))}
      </div>
    </>
  );
}

// ────────────────────────────────────────────────────────────────────
// Reports tab
// ────────────────────────────────────────────────────────────────────

function ReportsTab({ ops }: { ops: OpsState }) {
  const presets: Array<{ id: string; label: string; from: () => string; to: () => string }> = [
    { id: "today",   label: "Today",      from: () => isoDate(0),  to: () => isoDate(0) },
    { id: "yest",    label: "Yesterday",  from: () => isoDate(1),  to: () => isoDate(1) },
    { id: "7d",      label: "Last 7 days",from: () => isoDate(6),  to: () => isoDate(0) },
    { id: "30d",     label: "Last 30 days",from: () => isoDate(29),to: () => isoDate(0) },
  ];

  const applyPreset = (p: typeof presets[number]) => {
    ops.setReportFrom(p.from());
    ops.setReportTo(p.to());
  };

  return (
    <>
      <Header
        title="Reports"
        subtitle="Sales summary across any date range. For the live shift snapshot, see Current Shift in the side menu."
      />

      {/* Preset chips + custom dates */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {presets.map((p) => {
          const active = ops.reportFrom === p.from() && ops.reportTo === p.to();
          return (
            <button key={p.id} onClick={() => applyPreset(p)} style={{
              padding: "8px 14px", borderRadius: 999, cursor: "pointer",
              background: active ? C.text : "#fff",
              color: active ? "#fff" : C.muted,
              border: `1px solid ${active ? C.text : C.border2}`,
              fontWeight: 700, fontSize: 12,
            }}>{p.label}</button>
          );
        })}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 4 }}>
          <input type="date" value={ops.reportFrom} onChange={(e) => ops.setReportFrom(e.target.value)} style={fieldStyle} />
          <span style={{ color: C.subtle, fontSize: 12 }}>→</span>
          <input type="date" value={ops.reportTo} onChange={(e) => ops.setReportTo(e.target.value)} style={fieldStyle} />
        </div>
      </div>

      {/* KPI tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
        <KpiTile label="Orders"    value={ops.reportData ? String(ops.reportData.totals.orders_count ?? 0) : "—"} />
        <KpiTile label="Gross"     value={ops.reportData ? mvr(ops.reportData.totals.subtotal) : "—"} />
        <KpiTile label="Discounts" value={ops.reportData ? `− ${mvr(ops.reportData.totals.discount_amount)}` : "—"} tone="muted" />
        <KpiTile label="Net total" value={ops.reportData ? mvr(ops.reportData.totals.total) : "—"} accent />
      </div>

      {/* Payments breakdown */}
      <div style={{
        background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10,
        overflow: "hidden",
      }}>
        <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`,
          fontSize: 11, fontWeight: 700, color: C.muted,
          textTransform: "uppercase", letterSpacing: "0.06em",
          display: "flex", justifyContent: "space-between",
        }}>
          <span>Payments by method</span>
          <span>Amount</span>
        </div>
        {!ops.reportData ? (
          <Empty emoji="📊" title="Loading…" body="Pick a date range and the summary will populate." />
        ) : Object.keys(ops.reportData.payments ?? {}).length === 0 ? (
          <Empty emoji="💳" title="No payments yet" body="There were no payments in this range." />
        ) : Object.entries(ops.reportData.payments).map(([method, amount]) => (
          <div key={method} style={{
            display: "flex", justifyContent: "space-between",
            padding: "10px 14px", borderTop: `1px solid ${C.border}`,
            fontSize: 13, color: C.text,
          }}>
            <span style={{ fontWeight: 600, textTransform: "capitalize" }}>{method.replace("_", " ")}</span>
            <span style={{ fontWeight: 700 }}>{mvr(amount)}</span>
          </div>
        ))}
      </div>
    </>
  );
}

// ────────────────────────────────────────────────────────────────────
// Marketing tab
// ────────────────────────────────────────────────────────────────────

function MarketingTab({ ops }: { ops: OpsState }) {
  const [confirming, setConfirming] = useState(false);

  // GSM-7 vs UCS-2 segment math — matches admin SMS page logic so the
  // estimate before send doesn't lie. Unicode (emoji, Thaana) jumps to
  // 70-char segments which can triple SMS cost on long messages.
  const encoding = useMemo<"GSM-7" | "UCS-2">(() => {
    // Anything outside the basic GSM 03.38 set forces UCS-2.
    // Cheap heuristic: any char with code > 127 is non-ASCII → assume UCS-2.
    return /[^\x00-\x7F]/.test(ops.promoMessage) ? "UCS-2" : "GSM-7";
  }, [ops.promoMessage]);

  const segments = useMemo(() => {
    const len = ops.promoMessage.length;
    if (len === 0) return 0;
    const perSeg = encoding === "UCS-2" ? 70 : 160;
    return Math.ceil(len / perSeg);
  }, [ops.promoMessage, encoding]);

  return (
    <>
      <Header
        title="Marketing"
        subtitle="Send a one-off SMS to opted-in customers. Estimate cost before sending."
      />

      <FormCard title="Compose" help="Keep it under 160 ASCII chars (or 70 if you include emoji/Thaana) to stay at 1 segment.">
        <textarea
          rows={4}
          value={ops.promoMessage}
          onChange={(e) => ops.setPromoMessage(e.target.value)}
          placeholder="e.g. Friday special — buy 1 burger get 1 free. Reply STOP to opt out."
          style={{
            ...fieldStyle,
            resize: "vertical", fontFamily: "inherit",
          }}
        />
        <div style={{
          display: "flex", justifyContent: "space-between",
          fontSize: 11, color: C.muted, marginTop: 6,
        }}>
          <span>
            {ops.promoMessage.length} chars · {encoding}
          </span>
          <span style={{ fontWeight: 700, color: segments > 1 ? C.warn : C.muted }}>
            {segments} segment{segments === 1 ? "" : "s"}
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
          <input
            value={ops.promoLastOrderDays}
            onChange={(e) => ops.setPromoLastOrderDays(e.target.value)}
            placeholder="Active in last X days (optional)"
            inputMode="none"
            style={fieldStyle}
          />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <SecondaryBtn onClick={ops.handlePreviewPromotion} disabled={!ops.promoMessage.trim()}>Preview</SecondaryBtn>
            <PrimaryBtn onClick={() => setConfirming(true)} disabled={!ops.promoMessage.trim() || !ops.promoEstimate}>
              Send SMS
            </PrimaryBtn>
          </div>
        </div>
      </FormCard>

      {ops.promoEstimate && (
        <div style={{
          background: C.panel, borderRadius: 10, border: `1px solid ${C.border}`,
          padding: 16, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16,
        }}>
          <KpiTile compact label="Recipients" value={String(ops.promoEstimate.recipient_count)} />
          <KpiTile compact label="Segments / msg" value={String(ops.promoEstimate.segments)} />
          <KpiTile compact label="Estimated cost" value={mvr(ops.promoEstimate.total_cost_mvr)} accent />
        </div>
      )}

      {confirming && ops.promoEstimate && (
        <SmsBlastConfirmDialog
          recipients={ops.promoEstimate.recipient_count}
          costMvr={ops.promoEstimate.total_cost_mvr}
          segments={ops.promoEstimate.segments}
          message={ops.promoMessage}
          onConfirm={() => { ops.handleSendPromotion(); setConfirming(false); }}
          onCancel={() => setConfirming(false)}
        />
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

function KpiTile({ label, value, accent, tone, compact }: {
  label: string; value: string;
  accent?: boolean;
  tone?: "muted";
  compact?: boolean;
}) {
  return (
    <div style={{
      background: accent ? C.text : C.panel,
      color: accent ? "#fff" : C.text,
      borderRadius: 10, border: accent ? "none" : `1px solid ${C.border}`,
      padding: compact ? 12 : 16,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700,
        color: accent ? "#94A3B8" : C.muted,
        textTransform: "uppercase", letterSpacing: "0.06em",
      }}>{label}</div>
      <div style={{
        marginTop: 6,
        fontSize: compact ? 20 : 24, fontWeight: 800,
        color: tone === "muted" ? C.muted : (accent ? "#fff" : C.text),
      }}>{value}</div>
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

/**
 * Bug-019: dedicated SMS-blast confirm dialog with a message
 * preview, full cost/recipient breakdown, and (for big blasts)
 * type-to-confirm so a stray tap can't accidentally fire off a
 * 500-recipient promotion. The plain ConfirmDialog wasn't enough
 * because cashiers couldn't see the actual message they were
 * about to send and the cost callout was buried in body text.
 */
function SmsBlastConfirmDialog({
  recipients,
  costMvr,
  segments,
  message,
  onConfirm,
  onCancel,
}: {
  recipients: number;
  costMvr: number;
  segments: number;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  // Big-blast threshold: 100 recipients OR MVR 50 cost. Either
  // is a "no take-backs" level of money / customer reach, so we
  // force a typed acknowledgement before the Send button enables.
  const requiresTypeToConfirm = recipients >= 100 || costMvr >= 50;
  const [typed, setTyped] = useState("");
  const isReady = !requiresTypeToConfirm || typed.trim().toUpperCase() === "SEND";

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 800,
      background: "rgba(15,23,42,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div style={{ background: "#fff", borderRadius: 14, padding: 22, width: "100%", maxWidth: 480, display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 18, color: C.text }}>
            📣 Send SMS blast?
          </h3>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: C.muted }}>
            Once you tap Send the messages start queueing immediately. This cannot be undone.
          </p>
        </div>

        <div style={{
          background: "#F8FAFC", border: `1px solid ${C.border}`, borderRadius: 10,
          padding: "10px 12px", fontSize: 13, color: C.text,
          display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10,
        }}>
          <Cell label="Recipients" value={recipients.toLocaleString()} />
          <Cell label="Segments / msg" value={String(segments)} />
          <Cell label="Total cost" value={mvr(costMvr)} accent />
        </div>

        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
            Message preview
          </div>
          <div style={{
            background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8,
            padding: "10px 12px", fontSize: 13, color: "#78350F",
            whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 140, overflowY: "auto",
          }}>
            {message || <em style={{ color: "#A8A29E" }}>(empty)</em>}
          </div>
        </div>

        {requiresTypeToConfirm && (
          <div>
            <div style={{ fontSize: 12, color: "#B45309", fontWeight: 700, marginBottom: 6 }}>
              ⚠️ Large blast — type SEND to confirm
            </div>
            <input
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder='Type "SEND" here'
              style={{
                width: "100%", padding: "10px 12px", borderRadius: 8,
                border: `1px solid ${isReady ? "#15803D" : "#CBD5E1"}`,
                fontSize: 14, color: C.text, boxSizing: "border-box",
                outline: "none",
              }}
            />
          </div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <SecondaryBtn onClick={onCancel}>Cancel</SecondaryBtn>
          <button
            onClick={onConfirm}
            disabled={!isReady}
            style={{
              padding: "10px 18px", borderRadius: 8, border: "none",
              background: isReady ? C.accent : "#F1B98C",
              color: "#fff", fontWeight: 800, fontSize: 13,
              cursor: isReady ? "pointer" : "not-allowed",
            }}
          >
            Send {recipients.toLocaleString()} SMS
          </button>
        </div>
      </div>
    </div>
  );
}

function Cell({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 800, color: accent ? C.accent : C.text }}>{value}</span>
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

function isoDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function mvr(n: unknown): string {
  return `MVR ${Number.parseFloat(String(n ?? 0)).toFixed(2)}`;
}
