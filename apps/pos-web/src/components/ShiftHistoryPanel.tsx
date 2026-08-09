import { useEffect, useState } from "react";
import { getShiftHistory, getShiftSummary } from "../api";
import { EmptyState, PanelShell } from "./OpenTicketsPanel";
import { canSeeOpenShiftExpectedCash } from "../utils/shiftDisplay";
import {
  formatForeignHeldSummary,
  fromLaari,
  labelForLaari,
} from "../utils/cashDenominations";

type Props = { onClose: () => void; staffRole?: string | null };

type ShiftRow = Awaited<ReturnType<typeof getShiftHistory>>["shifts"][number];
type Summary = Awaited<ReturnType<typeof getShiftSummary>>;

export function ShiftHistoryPanel({ onClose, staffRole = null }: Props) {
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await getShiftHistory();
        setShifts(res.shifts);
        if (res.shifts.length) setSelectedId(res.shifts[0].id);
      } catch (e) { setErr((e as Error).message); }
      finally { setLoading(false); }
    })();
  }, []);

  useEffect(() => {
    if (selectedId == null) return;
    setSummary(null);
    void getShiftSummary(selectedId).then(setSummary).catch(() => setSummary(null));
  }, [selectedId]);

  const selected = shifts.find((s) => s.id === selectedId) ?? null;

  return (
    <PanelShell title="Shift history" subtitle="Past shifts (last 60)" onClose={onClose}>
      <div className="pos-shift-history" style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 12, minHeight: 0, height: "100%" }}>
        <div style={{ overflow: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
          {loading && <div style={{ color: "#64748B", fontSize: 13, padding: 8 }}>Loading…</div>}
          {err && <div style={{ color: "#B91C1C", fontSize: 13 }}>{err}</div>}
          {!loading && shifts.length === 0 && (
            <EmptyState emoji="📚" title="No history yet" body="Closed shifts will appear here." />
          )}
          {shifts.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelectedId(s.id)}
              style={{
                textAlign: "left", padding: 10, borderRadius: 8,
                background: selectedId === s.id ? "#0F172A" : "#fff",
                color: selectedId === s.id ? "#fff" : "#0F172A",
                border: `1px solid ${selectedId === s.id ? "#0F172A" : "#E2E8F0"}`,
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 13 }}>
                <span>#{s.id}</span>
                {/* Cashier responses carry no variance — show a neutral dash. */}
                <span style={{
                  color: s.variance == null
                    ? (selectedId === s.id ? "#CBD5E1" : "#64748B")
                    : Math.abs(Number(s.variance)) < 0.005
                      ? (selectedId === s.id ? "#86EFAC" : "#15803D")
                      : (selectedId === s.id ? "#FDE68A" : "#92400E"),
                }}>
                  {s.variance == null ? "—" : variance(s)}
                </span>
              </div>
              <div style={{ fontSize: 11, marginTop: 4, color: selectedId === s.id ? "#CBD5E1" : "#64748B" }}>
                {formatTime(s.opened_at)} → {s.closed_at ? formatTime(s.closed_at) : "open"}
              </div>
            </button>
          ))}
        </div>

        <div style={{ background: "#F8FAFC", borderRadius: 10, padding: 14, overflow: "auto" }}>
          {selected ? (
            <ShiftDetail shift={selected} summary={summary} staffRole={staffRole} />
          ) : (
            <EmptyState emoji="📊" title="Pick a shift" body="Select one on the left to see its X/Z report." />
          )}
        </div>
      </div>
    </PanelShell>
  );
}

function ShiftDetail({
  shift,
  summary,
  staffRole,
}: {
  shift: ShiftRow;
  summary: Summary | null;
  staffRole: string | null | undefined;
}) {
  const isClosed = !!shift.closed_at;
  // The server strips expected_cash/variance for cashiers (blind count):
  // render the reconciliation only when the response actually carries it.
  // Open rows additionally require the manager/owner role (same control
  // as ShiftPanel).
  const hasReconciliation = shift.expected_cash != null && shift.variance != null;
  const showExpectedMath = (isClosed && hasReconciliation)
    || (!isClosed && canSeeOpenShiftExpectedCash(staffRole));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#0F172A" }}>Shift #{shift.id}</div>
        <div style={{ fontSize: 12, color: "#64748B", marginTop: 4 }}>
          {formatTime(shift.opened_at)} → {shift.closed_at ? formatTime(shift.closed_at) : "still open"}
        </div>
      </div>

      <Section title="Cash drawer">
        <Row label="Opening cash" value={Number(shift.opening_cash)} />
        {showExpectedMath && summary && <Row label="+ Cash sales" value={summary.cash_drawer.cash_sales} />}
        {showExpectedMath && summary && summary.cash_drawer.paid_in > 0 && (
          <Row label="+ Paid in" value={summary.cash_drawer.paid_in} />
        )}
        {showExpectedMath && summary && summary.cash_drawer.paid_out > 0 && (
          <Row label="− Paid out" value={-summary.cash_drawer.paid_out} />
        )}
        {showExpectedMath ? (
          <>
            <Row label="Expected" value={Number(shift.expected_cash ?? 0)} bold />
            <Row label="Counted" value={Number(shift.closing_cash ?? 0)} bold />
            <div data-testid="shift-history-variance">
              <Row label="Variance" value={Number(shift.variance ?? 0)} bold />
              {(() => {
                const fx = shift.foreign_currency_held ?? [];
                const v = Number(shift.variance ?? 0);
                if (!fx.length || Math.abs(v) < 0.005) return null;
                const summary = formatForeignHeldSummary(fx);
                return (
                  <div
                    data-testid="shift-history-fx-beside-variance"
                    style={{ fontSize: 12, color: "#92400E", marginTop: 4, fontWeight: 600 }}
                  >
                    {v < 0 ? `Short MVR ${Math.abs(v).toFixed(2)}` : `Over MVR ${v.toFixed(2)}`}
                    {" · "}
                    {summary}
                  </div>
                );
              })()}
            </div>
            {shift.cash_count_method && (
              <div style={{ fontSize: 11, color: "#64748B", marginTop: 6 }}>
                Count method: {shift.cash_count_method === "denominations" ? "denominations" : "plain total"}
              </div>
            )}
          </>
        ) : isClosed ? (
          <>
            <Row label="Counted" value={Number(shift.closing_cash ?? 0)} bold />
            <div style={{ fontSize: 12, color: "#64748B", paddingTop: 6, lineHeight: 1.4 }}>
              The drawer reconciliation for this shift is recorded and visible to
              managers and owners.
            </div>
          </>
        ) : (
          <div style={{ fontSize: 12, color: "#64748B", paddingTop: 6, lineHeight: 1.4 }}>
            Expected drawer total stays hidden until this shift is closed and counted.
          </div>
        )}
      </Section>

      {isClosed && shift.cash_count_breakdown && Object.keys(shift.cash_count_breakdown).length > 0 && (
        <Section title="Denomination breakdown">
          <div data-testid="shift-history-denom-breakdown">
            {Object.entries(shift.cash_count_breakdown)
              .map(([laari, count]) => ({ laari: Number(laari), count: Number(count) }))
              .filter((r) => r.count > 0)
              .sort((a, b) => b.laari - a.laari)
              .map((r) => (
                <div
                  key={r.laari}
                  style={{
                    display: "flex", justifyContent: "space-between", padding: "4px 0",
                    fontSize: 13, color: "#475569",
                  }}
                >
                  <span>{labelForLaari(r.laari)} × {r.count}</span>
                  <span>MVR {fromLaari(r.laari * r.count).toFixed(2)}</span>
                </div>
              ))}
          </div>
        </Section>
      )}

      {isClosed && (shift.foreign_currency_held?.length ?? 0) > 0 && (
        <Section title="Foreign currency held">
          <div data-testid="shift-history-foreign-currency">
            {shift.foreign_currency_held!.map((r, i) => (
              <div
                key={i}
                style={{
                  display: "flex", justifyContent: "space-between", padding: "4px 0",
                  fontSize: 13, color: "#475569",
                }}
              >
                <span>{r.currency} {Number(r.denomination)} × {r.count}</span>
                <span>accepted MVR {Number(r.accepted_mvr).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {summary && (
        <Section title="Sales">
          <Row label="Orders" value={summary.sales_summary.order_count} count />
          <Row label="Gross sales" value={summary.sales_summary.gross_sales} />
          <Row label="Discounts" value={-summary.sales_summary.discounts} />
          <Row label="Refunds" value={-summary.sales_summary.refunds} />
          <Row label="Net sales" value={summary.sales_summary.net_sales} bold />
        </Section>
      )}

      {summary && Object.keys(summary.tenders ?? {}).length > 0 && (
        <Section title="Tenders">
          {Object.entries(summary.tenders)
            .filter(([m]) => showExpectedMath || m !== "cash")
            .map(([m, v]) => (
              <Row key={m} label={m.replace("_", " ")} value={Number(v)} />
            ))}
        </Section>
      )}

      {shift.notes && (
        <Section title="Notes">
          <div style={{ fontSize: 13, color: "#475569", whiteSpace: "pre-wrap" }}>{shift.notes}</div>
        </Section>
      )}

      <button onClick={() => window.print()} style={{
        alignSelf: "flex-start", padding: "8px 14px", borderRadius: 8,
        background: "#fff", border: "1px solid #CBD5E1", color: "#475569",
        fontWeight: 600, fontSize: 13, cursor: "pointer",
      }}>Print</button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #E2E8F0", padding: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value, bold, count }: { label: string; value: number; bold?: boolean; count?: boolean }) {
  // Bug-053: see ShiftPanel — Laravel returns strings for decimal casts.
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
      <span>{label}</span><span>{fmt}</span>
    </div>
  );
}

function variance(s: ShiftRow): string {
  const v = Number(s.variance ?? 0);
  return `${v >= 0 ? "+" : ""}MVR ${v.toFixed(2)}`;
}

function formatTime(iso: string): string {
  try { return new Date(iso).toLocaleString(undefined, { hour: "2-digit", minute: "2-digit", month: "short", day: "2-digit" }); }
  catch { return iso; }
}
