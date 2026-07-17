import { useEffect, useState, type CSSProperties } from "react";
import {
  getDiscountsByType,
  getSalesBreakdown,
  getSalesSummary,
  type DiscountsByTypeReport,
  type SalesBreakdownReport,
  type SalesSummary,
} from "../api";
import { EmptyState, PanelShell } from "./OpenTicketsPanel";

type Props = {
  onClose: () => void;
  onOpenReceipts?: () => void;
  onOpenShiftHistory?: () => void;
};

type Preset = "today" | "yesterday" | "7d" | "month" | "custom";

type ReportId =
  | "summary"
  | "by_item"
  | "by_category"
  | "by_employee"
  | "by_payment"
  | "discounts"
  | "taxes"
  | "receipts"
  | "shifts";

type SummaryData = SalesSummary & {
  from?: string;
  to?: string;
  totals: SalesSummary["totals"] & { service_charge_total?: number };
};

const REPORTS: {
  id: ReportId;
  label: string;
  hint: string;
  kind: "data" | "nav";
}[] = [
  { id: "summary", label: "Sales summary", hint: "Totals for the period", kind: "data" },
  { id: "by_item", label: "Sales by item", hint: "Qty and net sales", kind: "data" },
  { id: "by_category", label: "Sales by category", hint: "By menu category", kind: "data" },
  { id: "by_employee", label: "Sales by employee", hint: "Orders and totals", kind: "data" },
  { id: "by_payment", label: "Sales by payment type", hint: "Cash, card, and more", kind: "data" },
  { id: "discounts", label: "Discounts", hint: "Promo, loyalty, manual…", kind: "data" },
  { id: "taxes", label: "Taxes", hint: "GST collected", kind: "data" },
  { id: "receipts", label: "Receipts", hint: "Open receipts list", kind: "nav" },
  { id: "shifts", label: "Shifts", hint: "Open shift history", kind: "nav" },
];

function ymdInTz(d: Date, timeZone = "Indian/Maldives"): string {
  return d.toLocaleDateString("en-CA", { timeZone });
}

function addDays(isoYmd: string, delta: number): string {
  const [y, m, day] = isoYmd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

function monthStart(isoYmd: string): string {
  return `${isoYmd.slice(0, 7)}-01`;
}

function rangeForPreset(preset: Preset, customFrom: string, customTo: string): { from: string; to: string } {
  const today = ymdInTz(new Date());
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const y = addDays(today, -1);
      return { from: y, to: y };
    }
    case "7d":
      return { from: addDays(today, -6), to: today };
    case "month":
      return { from: monthStart(today), to: today };
    case "custom":
      return {
        from: customFrom || today,
        to: customTo || customFrom || today,
      };
  }
}

const PRESETS: { id: Preset; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "7d", label: "Last 7 days" },
  { id: "month", label: "This month" },
  { id: "custom", label: "Custom" },
];

function mvr(n: number): string {
  const v = Number(n ?? 0);
  return `${v < 0 ? "−" : ""}MVR ${Math.abs(v).toFixed(2)}`;
}

export function SalesReportPanel({ onClose, onOpenReceipts, onOpenShiftHistory }: Props) {
  const today = ymdInTz(new Date());
  const [preset, setPreset] = useState<Preset>("today");
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);
  const [active, setActive] = useState<ReportId | null>(null);

  const { from, to } = rangeForPreset(preset, customFrom, customTo);
  const activeMeta = REPORTS.find((r) => r.id === active);

  const openReport = (id: ReportId) => {
    if (id === "receipts") {
      onOpenReceipts?.();
      return;
    }
    if (id === "shifts") {
      onOpenShiftHistory?.();
      return;
    }
    setActive(id);
  };

  return (
    <PanelShell
      title={activeMeta ? activeMeta.label : "Sales reports"}
      subtitle={`${from} → ${to}`}
      onClose={active ? () => setActive(null) : onClose}
      backMode={Boolean(active)}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0, height: "100%" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPreset(p.id)}
              style={{
                padding: "8px 12px",
                minHeight: 40,
                borderRadius: 999,
                border: `1px solid ${preset === p.id ? "#0F172A" : "#E2E8F0"}`,
                background: preset === p.id ? "#0F172A" : "#fff",
                color: preset === p.id ? "#fff" : "#334155",
                fontWeight: 700,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        {preset === "custom" && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <label style={{ fontSize: 12, color: "#64748B", fontWeight: 600 }}>
              From
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                style={dateInputStyle}
              />
            </label>
            <label style={{ fontSize: 12, color: "#64748B", fontWeight: 600 }}>
              To
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                style={dateInputStyle}
              />
            </label>
          </div>
        )}

        {!active && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, overflow: "auto", paddingBottom: 8 }}>
            {REPORTS.map((r) => {
              const disabled =
                (r.id === "receipts" && !onOpenReceipts) ||
                (r.id === "shifts" && !onOpenShiftHistory);
              return (
                <button
                  key={r.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => openReport(r.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: "14px 14px",
                    minHeight: 52,
                    border: "1px solid #E2E8F0",
                    borderRadius: 10,
                    background: "#fff",
                    cursor: disabled ? "not-allowed" : "pointer",
                    opacity: disabled ? 0.45 : 1,
                    textAlign: "left",
                  }}
                >
                  <span>
                    <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: "#0F172A" }}>
                      {r.label}
                    </span>
                    <span style={{ display: "block", fontSize: 12, color: "#94A3B8", marginTop: 2 }}>
                      {r.hint}
                    </span>
                  </span>
                  <span style={{ color: "#94A3B8", fontSize: 18, lineHeight: 1 }}>›</span>
                </button>
              );
            })}
            <p style={{ margin: "8px 0 0", fontSize: 11, color: "#94A3B8", lineHeight: 1.4 }}>
              More reports and exports are in the Admin dashboard.
            </p>
          </div>
        )}

        {active === "summary" && <SummaryView from={from} to={to} />}
        {active === "by_item" && <BreakdownView from={from} to={to} mode="item" />}
        {active === "by_category" && <BreakdownView from={from} to={to} mode="category" />}
        {active === "by_employee" && <BreakdownView from={from} to={to} mode="employee" />}
        {active === "by_payment" && <PaymentView from={from} to={to} />}
        {active === "discounts" && <DiscountsView from={from} to={to} />}
        {active === "taxes" && <TaxesView from={from} to={to} />}
      </div>
    </PanelShell>
  );
}

function SummaryView({ from, to }: { from: string; to: string }) {
  const { data, loading, err } = useSummary(from, to);
  const totals = data?.totals;
  const payments = data?.payments ?? {};
  const paymentEntries = Object.entries(payments).filter(([, v]) => Number(v) !== 0);

  return (
    <ReportBody loading={loading} err={err} empty={!totals}>
      {totals && (
        <>
          <Section title="Sales">
            <Row label="Orders" value={totals.orders_count} count />
            <Row label="Subtotal" value={Number(totals.subtotal)} />
            {Number(totals.discount_amount) > 0 && (
              <Row label="Discounts" value={-Number(totals.discount_amount)} />
            )}
            {Number(totals.service_charge_total ?? 0) > 0 && (
              <Row label="Service charge" value={Number(totals.service_charge_total)} />
            )}
            {Number(totals.tax_amount) > 0 && (
              <Row label="GST" value={Number(totals.tax_amount)} />
            )}
            <Row label="Net sales" value={Number(totals.total)} bold />
          </Section>
          {paymentEntries.length > 0 && (
            <Section title="Payments">
              {paymentEntries.map(([method, amount]) => (
                <Row key={method} label={method.replace(/_/g, " ")} value={Number(amount)} />
              ))}
            </Section>
          )}
        </>
      )}
    </ReportBody>
  );
}

function PaymentView({ from, to }: { from: string; to: string }) {
  const { data, loading, err } = useSummary(from, to);
  const payments = data?.payments ?? {};
  const paymentEntries = Object.entries(payments).filter(([, v]) => Number(v) !== 0);
  const total = paymentEntries.reduce((s, [, v]) => s + Number(v), 0);

  return (
    <ReportBody loading={loading} err={err} empty={paymentEntries.length === 0}>
      <Section title="By payment type">
        {paymentEntries.map(([method, amount]) => (
          <Row key={method} label={method.replace(/_/g, " ")} value={Number(amount)} />
        ))}
        <Row label="Total" value={total} bold />
      </Section>
    </ReportBody>
  );
}

function TaxesView({ from, to }: { from: string; to: string }) {
  const { data, loading, err } = useSummary(from, to);
  const tax = Number(data?.totals?.tax_amount ?? 0);
  const net = Number(data?.totals?.total ?? 0);

  return (
    <ReportBody loading={loading} err={err} empty={false}>
      <Section title="Taxes">
        <Row label="GST collected" value={tax} bold />
        <Row label="Net sales (incl. tax)" value={net} />
      </Section>
    </ReportBody>
  );
}

function DiscountsView({ from, to }: { from: string; to: string }) {
  const [data, setData] = useState<DiscountsByTypeReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr("");
    void getDiscountsByType({ from, to })
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((e) => {
        if (!cancelled) {
          setData(null);
          setErr((e as Error).message || "Could not load discounts");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  const rows = (data?.rows ?? []).filter((r) => Number(r.amount) > 0 || r.orders_count > 0);

  return (
    <ReportBody loading={loading} err={err} empty={rows.length === 0}>
      <Section title="Discounts by type">
        {rows.map((r) => (
          <div key={r.type} style={tableRowStyle}>
            <span style={{ textTransform: "capitalize" }}>{r.type.replace(/_/g, " ")}</span>
            <span style={{ color: "#64748B", fontSize: 12 }}>{r.orders_count} orders</span>
            <span style={{ fontWeight: 600, textAlign: "right" }}>{mvr(Number(r.amount))}</span>
          </div>
        ))}
        {data && (
          <Row label="Total applied" value={-Number(data.total_applied)} bold />
        )}
      </Section>
    </ReportBody>
  );
}

function BreakdownView({
  from,
  to,
  mode,
}: {
  from: string;
  to: string;
  mode: "item" | "category" | "employee";
}) {
  const [data, setData] = useState<SalesBreakdownReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr("");
    void getSalesBreakdown({ from, to, limit: 200 })
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((e) => {
        if (!cancelled) {
          setData(null);
          setErr((e as Error).message || "Could not load breakdown");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  if (mode === "item") {
    const rows = data?.items ?? [];
    return (
      <ReportBody loading={loading} err={err} empty={rows.length === 0}>
        <Section title="Sales by item">
          <div style={tableHeadStyle}>
            <span>Item</span>
            <span style={{ textAlign: "right" }}>Qty</span>
            <span style={{ textAlign: "right" }}>Net sales</span>
          </div>
          {rows.map((r, i) => (
            <div key={`${r.item_id ?? r.item_name}-${i}`} style={tableRowStyle}>
              <span style={{ fontWeight: 600 }}>{r.item_name || "—"}</span>
              <span style={{ textAlign: "right", color: "#64748B" }}>{Number(r.quantity)}</span>
              <span style={{ textAlign: "right", fontWeight: 600 }}>{mvr(Number(r.total))}</span>
            </div>
          ))}
        </Section>
      </ReportBody>
    );
  }

  if (mode === "category") {
    const rows = data?.categories ?? [];
    return (
      <ReportBody loading={loading} err={err} empty={rows.length === 0}>
        <Section title="Sales by category">
          <div style={tableHeadStyle}>
            <span>Category</span>
            <span style={{ textAlign: "right" }}>Qty</span>
            <span style={{ textAlign: "right" }}>Net sales</span>
          </div>
          {rows.map((r) => (
            <div key={r.category_id} style={tableRowStyle}>
              <span style={{ fontWeight: 600 }}>{r.category_name || "—"}</span>
              <span style={{ textAlign: "right", color: "#64748B" }}>{Number(r.quantity)}</span>
              <span style={{ textAlign: "right", fontWeight: 600 }}>{mvr(Number(r.total))}</span>
            </div>
          ))}
        </Section>
      </ReportBody>
    );
  }

  const rows = data?.employees ?? [];
  return (
    <ReportBody loading={loading} err={err} empty={rows.length === 0}>
      <Section title="Sales by employee">
        <div style={tableHeadStyle}>
          <span>Employee</span>
          <span style={{ textAlign: "right" }}>Orders</span>
          <span style={{ textAlign: "right" }}>Net sales</span>
        </div>
        {rows.map((r, i) => (
          <div key={`${r.user_id ?? "x"}-${i}`} style={tableRowStyle}>
            <span style={{ fontWeight: 600 }}>{r.name || "Unassigned"}</span>
            <span style={{ textAlign: "right", color: "#64748B" }}>{r.orders_count}</span>
            <span style={{ textAlign: "right", fontWeight: 600 }}>{mvr(Number(r.total))}</span>
          </div>
        ))}
      </Section>
    </ReportBody>
  );
}

function useSummary(from: string, to: string) {
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr("");
    void getSalesSummary({ from, to })
      .then((res) => {
        if (!cancelled) setData(res as SummaryData);
      })
      .catch((e) => {
        if (!cancelled) {
          setData(null);
          setErr((e as Error).message || "Could not load report");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  return { data, loading, err };
}

function ReportBody({
  loading,
  err,
  empty,
  children,
}: {
  loading: boolean;
  err: string;
  empty: boolean;
  children: React.ReactNode;
}) {
  if (loading) return <div style={{ color: "#64748B", fontSize: 13, padding: 8 }}>Loading…</div>;
  if (err) return <div style={{ color: "#B91C1C", fontSize: 13, padding: 8 }}>{err}</div>;
  if (empty) {
    return <EmptyState emoji="📊" title="No data" body="Try a different date range." />;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, overflow: "auto", paddingBottom: 8, minHeight: 0 }}>
      {children}
    </div>
  );
}

const dateInputStyle: CSSProperties = {
  display: "block",
  marginTop: 4,
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #E2E8F0",
  fontSize: 14,
  color: "#0F172A",
  background: "#fff",
};

const tableHeadStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 64px 100px",
  gap: 8,
  fontSize: 11,
  fontWeight: 700,
  color: "#94A3B8",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  paddingBottom: 6,
  borderBottom: "1px solid #E2E8F0",
  marginBottom: 4,
};

const tableRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 64px 100px",
  gap: 8,
  padding: "8px 0",
  fontSize: 13,
  color: "#334155",
  borderBottom: "1px solid #F1F5F9",
  alignItems: "center",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #E2E8F0", padding: 12 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "#64748B",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  count,
}: {
  label: string;
  value: number;
  bold?: boolean;
  count?: boolean;
}) {
  const n = Number(value ?? 0);
  const fmt = count ? String(Math.round(n)) : mvr(n);
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "4px 0",
        fontSize: 13,
        color: bold ? "#0F172A" : "#475569",
        fontWeight: bold ? 700 : 500,
        borderTop: bold ? "1px solid #E2E8F0" : "none",
        marginTop: bold ? 6 : 0,
      }}
    >
      <span style={{ textTransform: "capitalize" }}>{label}</span>
      <span>{fmt}</span>
    </div>
  );
}
