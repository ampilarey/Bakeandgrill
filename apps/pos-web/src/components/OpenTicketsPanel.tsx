import { useEffect, useState } from "react";
import { fetchReceipts, sendBill } from "../api";

export type OpenTicket = Awaited<ReturnType<typeof fetchReceipts>>["data"][number];

type Props = {
  deviceId: string;
  onResume: (ticket: OpenTicket) => void;
  onClose: () => void;
};

/**
 * List of held / parked tickets. Replaces the old single-held-order
 * "Resume #123" button — that pattern silently overwrote previous holds
 * and made multi-tab service impossible.
 */
export function OpenTicketsPanel({ deviceId, onResume, onClose }: Props) {
  const [tickets, setTickets] = useState<OpenTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  // Per-row "action in progress" indicator (sendBill is the only async
  // per-row action that matters — Print just opens a tab).
  const [busyId, setBusyId] = useState<number | null>(null);
  const [rowMsg, setRowMsg] = useState<{ id: number; text: string; kind: "ok" | "err" } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetchReceipts({
          held_only: true,
          device_identifier: deviceId,
          per_page: 50,
        });
        if (!cancelled) setTickets(res.data);
      } catch (e) {
        if (!cancelled) setErr((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [deviceId]);

  /**
   * Send Bill (SMS) for a parked ticket. Two paths:
   *   - ticket already has a linked customer with a phone → use that phone
   *     (server-side firstOrCreate keeps the same customer row).
   *   - no linked customer → prompt the cashier for a phone once. The
   *     backend will create-or-find that customer and link it.
   */
  const handleSendBill = async (t: OpenTicket) => {
    const linkedPhone = t.customer?.phone ?? null;
    let phone = linkedPhone;
    if (!phone) {
      const raw = window.prompt(`Enter customer phone for ticket "${t.ticket_name || t.order_number}":`)?.trim();
      if (!raw) return;
      phone = raw;
    }
    setBusyId(t.id);
    setRowMsg(null);
    try {
      const res = await sendBill(t.id, phone);
      setRowMsg({ id: t.id, kind: "ok", text: `Bill sent to ${phone}` });
      // Update local row so the customer name shows immediately even
      // if the backend just created the customer.
      setTickets((curr) =>
        curr.map((row) =>
          row.id === t.id
            ? { ...row, customer: (res.order as { customer?: OpenTicket["customer"] })?.customer ?? row.customer }
            : row,
        ),
      );
    } catch (e) {
      setRowMsg({ id: t.id, kind: "err", text: (e as Error).message || "Failed to send" });
    } finally {
      setBusyId(null);
    }
  };

  /**
   * Open the public invoice link (Blade) in a new tab with ?print=1 so
   * the browser print dialog fires automatically. The backend ensures
   * an invoice exists (idempotent) even if Send Bill was never called.
   */
  const handlePrintBill = async (t: OpenTicket) => {
    setBusyId(t.id);
    setRowMsg(null);
    try {
      const res = await sendBill(t.id);
      const link = res.link;
      const url = link.includes("?") ? `${link}&print=1` : `${link}?print=1`;
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setRowMsg({ id: t.id, kind: "err", text: (e as Error).message || "Failed to open invoice" });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <PanelShell title="Open tickets" subtitle="Parked orders on this device" onClose={onClose}>
      {loading && <p style={{ color: "#64748B", fontSize: 13 }}>Loading…</p>}
      {err && <p style={{ color: "#B91C1C", fontSize: 13 }}>{err}</p>}
      {!loading && tickets.length === 0 && (
        <EmptyState
          emoji="🎫"
          title="No open tickets"
          body="Use Save Ticket from the cart to park an order here."
        />
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {tickets.map((t) => {
          const busy = busyId === t.id;
          const msg = rowMsg?.id === t.id ? rowMsg : null;
          return (
            <div
              key={t.id}
              style={{
                padding: 12, borderRadius: 10,
                background: "#fff", border: "1px solid #E2E8F0",
                display: "flex", flexDirection: "column", gap: 10,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#0F172A" }}>
                    {t.ticket_name || `Order ${t.order_number}`}
                  </div>
                  <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
                    {(t.items?.length ?? 0)} items
                    {t.ticket_note ? ` · ${t.ticket_note}` : ""}
                    {t.customer?.name ? ` · ${t.customer.name}` : ""}
                    {t.customer?.phone ? ` · ${t.customer.phone}` : ""}
                  </div>
                </div>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#0F172A", whiteSpace: "nowrap" }}>
                  MVR {Number(t.total).toFixed(2)}
                </div>
              </div>

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button onClick={() => onResume(t)} disabled={busy} style={primaryBtn(busy)}>
                  ▶ Resume
                </button>
                <button onClick={() => handleSendBill(t)} disabled={busy} style={secondaryBtn(busy)}>
                  📱 {busy ? "…" : "Send Bill SMS"}
                </button>
                <button onClick={() => handlePrintBill(t)} disabled={busy} style={secondaryBtn(busy)}>
                  🖨 Print Bill
                </button>
              </div>

              {msg && (
                <div style={{
                  fontSize: 12,
                  color: msg.kind === "ok" ? "#047857" : "#B91C1C",
                }}>
                  {msg.text}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </PanelShell>
  );
}

function primaryBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: "8px 12px",
    borderRadius: 8,
    background: disabled ? "#A7F3D0" : "#10B981",
    color: "#fff",
    border: "none",
    fontSize: 12,
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}
function secondaryBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: "8px 12px",
    borderRadius: 8,
    background: "#fff",
    color: "#0F172A",
    border: "1px solid #CBD5E1",
    fontSize: 12,
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
  };
}

export function PanelShell({ title, subtitle, onClose, children }: {
  title: string; subtitle?: string; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <div style={{
      flex: 1, minHeight: 0,
      background: "#fff", borderRadius: 12, border: "1px solid #E2E8F0",
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      <div style={{
        padding: 14, borderBottom: "1px solid #E2E8F0",
        display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
      }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#0F172A" }}>{title}</div>
          {subtitle && <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>{subtitle}</div>}
        </div>
        <button onClick={onClose} style={{
          background: "none", border: "none", color: "#64748B",
          fontSize: 22, cursor: "pointer", lineHeight: 1, padding: 4,
        }} aria-label="Close panel">×</button>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: 14 }}>
        {children}
      </div>
    </div>
  );
}

export function EmptyState({ emoji, title, body }: { emoji: string; title: string; body: string }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: 40, color: "#94A3B8", textAlign: "center",
    }}>
      <div style={{ fontSize: 44, marginBottom: 12 }}>{emoji}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#64748B" }}>{title}</div>
      <div style={{ fontSize: 12, marginTop: 4, maxWidth: 280 }}>{body}</div>
    </div>
  );
}
