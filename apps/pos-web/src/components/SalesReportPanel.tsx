import { useEffect, useState, type CSSProperties } from "react";
import { getSalesSummary, type SalesSummary } from "../api";
import { EmptyState, PanelShell } from "./OpenTicketsPanel";

type Props = { onClose: () => void };

type Preset = "today" | "yesterday" | "7d" | "month" | "custom";

type ReportData = SalesSummary & {
  from?: string;
  to?: string;
  totals: SalesSummary["totals"] & { service_charge_total?: number };
};

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

export function SalesReportPanel({ onClose }: Props) {
  const today = ymdInTz(new Date());
  const [preset, setPreset] = useState<Preset>("today");
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const { from, to } = rangeForPreset(preset, customFrom, customTo);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr("");
    void getSalesSummary({ from, to })
      .then((res) => {
        if (!cancelled) setData(res as ReportData);
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
    return () => { cancelled = true; };
  }, [from, to]);

  const totals = data?.totals;
  const payments = data?.payments ?? {};
  const paymentEntries = Object.entries(payments).filter(([, v]) => Number(v) !== 0);

  return (
    <PanelShell
      title="Sales report"
      subtitle={`${from} → ${to}`}
      onClose={onClose}
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

        {loading && <div style={{ color: "#64748B", fontSize: 13, padding: 8 }}>Loading…</div>}
        {err && <div style={{ color: "#B91C1C", fontSize: 13, padding: 8 }}>{err}</div>}

        {!loading && !err && !totals && (
          <EmptyState emoji="📊" title="No data" body="Try a different date range." />
        )}

        {!loading && !err && totals && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, overflow: "auto", paddingBottom: 8 }}>
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
                  <Row
                    key={method}
                    label={method.replace(/_/g, " ")}
                    value={Number(amount)}
                  />
                ))}
              </Section>
            )}

            <p style={{ margin: 0, fontSize: 11, color: "#94A3B8", lineHeight: 1.4 }}>
              Full Reports, P&amp;L, and exports are in the Admin dashboard.
            </p>
          </div>
        )}
      </div>
    </PanelShell>
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #E2E8F0", padding: 12 }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: "#64748B",
        textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8,
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value, bold, count }: { label: string; value: number; bold?: boolean; count?: boolean }) {
  const n = Number(value ?? 0);
  const fmt = count ? String(Math.round(n)) : `${n < 0 ? "−" : ""}MVR ${Math.abs(n).toFixed(2)}`;
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", padding: "4px 0",
      fontSize: 13, color: bold ? "#0F172A" : "#475569",
      fontWeight: bold ? 700 : 500,
      borderTop: bold ? "1px solid #E2E8F0" : "none",
      marginTop: bold ? 6 : 0,
    }}>
      <span style={{ textTransform: "capitalize" }}>{label}</span>
      <span>{fmt}</span>
    </div>
  );
}
