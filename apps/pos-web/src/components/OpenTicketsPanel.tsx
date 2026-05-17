import { useEffect, useState } from "react";
import { fetchReceipts } from "../api";

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
        {tickets.map((t) => (
          <button
            key={t.id}
            onClick={() => onResume(t)}
            style={{
              textAlign: "left", padding: 12, borderRadius: 10,
              background: "#fff", border: "1px solid #E2E8F0", cursor: "pointer",
              display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#0F172A" }}>
                {t.ticket_name || `Order ${t.order_number}`}
              </div>
              <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
                {(t.items?.length ?? 0)} items
                {t.ticket_note ? ` · ${t.ticket_note}` : ""}
                {t.customer?.name ? ` · ${t.customer.name}` : ""}
              </div>
            </div>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#0F172A", whiteSpace: "nowrap" }}>
              MVR {Number(t.total).toFixed(2)}
            </div>
          </button>
        ))}
      </div>
    </PanelShell>
  );
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
