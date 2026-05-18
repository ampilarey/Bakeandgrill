import { useEffect, useMemo, useState } from "react";
import { createRefund, fetchReceipts, getReceiptLink, sendReceipt } from "../api";
import { EmptyState, PanelShell } from "./OpenTicketsPanel";

export type Receipt = Awaited<ReturnType<typeof fetchReceipts>>["data"][number];

type Props = {
  onClose: () => void;
  shiftId?: number | null;
  defaultScope?: "today" | "shift";
};

/**
 * Loyverse-style master/detail receipts list. Cashier scrolls receipts
 * on the left, taps one to see the full breakdown on the right, and can
 * send via SMS, refund, or copy the public receipt link. Replaces the
 * old "no way to find past sales from the POS" gap.
 */
export function ReceiptsPanel({ onClose, shiftId, defaultScope = "today" }: Props) {
  const [scope, setScope] = useState<"today" | "shift" | "all">(defaultScope);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [items, setItems] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Debounce so we don't fire on every keystroke.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => clearTimeout(id);
  }, [q]);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const res = await fetchReceipts({
          ...(scope === "today" ? { date: today } : {}),
          ...(scope === "shift" && shiftId ? { shift_id: String(shiftId) as unknown as undefined } : {}),
          ...(debouncedQ ? { q: debouncedQ } : {}),
          per_page: 50,
        });
        if (!cancelled) {
          setItems(res.data);
          if (res.data.length && selectedId == null) setSelectedId(res.data[0].id);
        }
      } catch (e) {
        if (!cancelled) setErr((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, debouncedQ, shiftId, today]);

  const selected = items.find((r) => r.id === selectedId) ?? null;

  return (
    <PanelShell title="Receipts" subtitle="Recent sales from this POS" onClose={onClose}>
      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 12, minHeight: 0, height: "100%" }}>
        {/* List */}
        <div style={{ display: "flex", flexDirection: "column", minHeight: 0, gap: 8 }}>
          <div style={{ display: "flex", background: "#F1F5F9", borderRadius: 8, padding: 3 }}>
            {(["today", "shift", "all"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setScope(s)}
                disabled={s === "shift" && !shiftId}
                style={{
                  flex: 1, padding: "6px 8px", fontSize: 11, fontWeight: 700,
                  borderRadius: 6, border: "none", cursor: s === "shift" && !shiftId ? "not-allowed" : "pointer",
                  background: scope === s ? "#fff" : "transparent",
                  color: scope === s ? "#0F172A" : "#64748B",
                  textTransform: "uppercase", letterSpacing: "0.05em",
                  opacity: s === "shift" && !shiftId ? 0.5 : 1,
                }}
              >{s}</button>
            ))}
          </div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search order #, name, phone…"
            style={{
              padding: "8px 10px", borderRadius: 8, border: "1px solid #CBD5E1",
              fontSize: 13, background: "#fff",
            }}
          />
          <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
            {loading && <div style={{ color: "#64748B", fontSize: 13, padding: 8 }}>Loading…</div>}
            {!loading && items.length === 0 && (
              <EmptyState emoji="🧾" title="No receipts" body={debouncedQ ? "Try a different search." : "Receipts will appear here as you ring up sales."} />
            )}
            {items.map((r) => (
              <button
                key={r.id}
                onClick={() => setSelectedId(r.id)}
                style={{
                  textAlign: "left", padding: 10, borderRadius: 8,
                  background: selectedId === r.id ? "#0F172A" : "#fff",
                  color: selectedId === r.id ? "#fff" : "#0F172A",
                  border: `1px solid ${selectedId === r.id ? "#0F172A" : "#E2E8F0"}`,
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 13 }}>
                  <span>{r.order_number}</span>
                  <span>MVR {Number(r.total).toFixed(2)}</span>
                </div>
                <div style={{
                  fontSize: 11, marginTop: 4,
                  color: selectedId === r.id ? "#CBD5E1" : "#64748B",
                  display: "flex", justifyContent: "space-between",
                }}>
                  <span>{formatTime(r.created_at)}</span>
                  <span>{r.status}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Detail */}
        <div style={{
          background: "#F8FAFC", borderRadius: 10, padding: 14,
          display: "flex", flexDirection: "column", minHeight: 0,
        }}>
          {selected ? (
            <ReceiptDetail receipt={selected} />
          ) : (
            <EmptyState emoji="📄" title="Pick a receipt" body="Select one from the list to see details, send it, or refund it." />
          )}
        </div>
      </div>
      {err && <div style={{ marginTop: 8, padding: 10, borderRadius: 8, background: "#FEE2E2", color: "#B91C1C", fontSize: 12 }}>{err}</div>}
    </PanelShell>
  );
}

function ReceiptDetail({ receipt }: { receipt: Receipt }) {
  const [link, setLink] = useState<string | null>(null);
  const [phone, setPhone] = useState(receipt.customer?.phone ?? "");
  const [busy, setBusy] = useState<"" | "send" | "refund" | "link">("");
  const [info, setInfo] = useState("");
  const [refundAmount, setRefundAmount] = useState(Number(receipt.total).toFixed(2));
  const [refundReason, setRefundReason] = useState("");

  const handleSend = async () => {
    if (!phone.trim()) { setInfo("Enter a phone number."); return; }
    setBusy("send"); setInfo("");
    try {
      const res = await sendReceipt(receipt.id, { channel: "sms", recipient: phone.trim() });
      setLink(res.link);
      setInfo("Sent.");
    } catch (e) { setInfo((e as Error).message || "Send failed."); }
    finally { setBusy(""); }
  };

  const handleLink = async () => {
    setBusy("link"); setInfo("");
    try {
      const res = await getReceiptLink(receipt.id);
      setLink(res.link);
      try { await navigator.clipboard.writeText(res.link); setInfo("Link copied."); }
      catch { setInfo("Link ready."); }
    } catch (e) { setInfo((e as Error).message || "Could not get link."); }
    finally { setBusy(""); }
  };

  const handleRefund = async () => {
    const amount = Number.parseFloat(refundAmount);
    if (!Number.isFinite(amount) || amount <= 0) { setInfo("Enter a refund amount."); return; }
    if (amount > Number(receipt.total) + 0.005) { setInfo("Refund cannot exceed order total."); return; }
    setBusy("refund"); setInfo("");
    try {
      await createRefund(receipt.id, { amount, reason: refundReason.trim() || undefined });
      setInfo("Refund recorded.");
    } catch (e) { setInfo((e as Error).message || "Refund failed."); }
    finally { setBusy(""); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#0F172A" }}>{receipt.order_number}</div>
        <div style={{ fontSize: 12, color: "#64748B", marginTop: 4 }}>
          {formatTime(receipt.created_at)} · {receipt.type.replace("_", " ")} · {receipt.status}
        </div>
        {receipt.customer && (
          <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
            {receipt.customer.name ?? ""} {receipt.customer.phone ?? ""}
          </div>
        )}
      </div>

      <div style={{
        flex: 1, overflow: "auto", background: "#fff", borderRadius: 8,
        padding: 12, border: "1px solid #E2E8F0",
      }}>
        {receipt.items?.map((it) => (
          <div key={it.id} style={{
            display: "flex", justifyContent: "space-between", gap: 8, padding: "4px 0",
            fontSize: 13, color: "#0F172A",
          }}>
            <span style={{ flex: 1 }}>
              {it.quantity} × {it.item_name}
            </span>
            <span style={{ color: "#64748B" }}>@ {Number(it.unit_price).toFixed(2)}</span>
            <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>
              MVR {Number(it.total_price).toFixed(2)}
            </span>
          </div>
        ))}
        <div style={{ borderTop: "1px solid #E2E8F0", marginTop: 8, paddingTop: 8 }}>
          {Number(receipt.discount_amount) > 0 && (
            <Line label="Discount" value={`− MVR ${Number(receipt.discount_amount).toFixed(2)}`} />
          )}
          <Line label="Total" value={`MVR ${Number(receipt.total).toFixed(2)}`} bold />
        </div>
      </div>

      <div style={{
        marginTop: 10, padding: 10, borderRadius: 8, background: "#fff",
        border: "1px solid #E2E8F0", display: "flex", flexDirection: "column", gap: 8,
      }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone for SMS"
            style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #CBD5E1", fontSize: 13 }}
          />
          <button onClick={handleSend} disabled={busy === "send"} style={primaryBtn}>
            {busy === "send" ? "Sending…" : "Send SMS"}
          </button>
          <button onClick={handleLink} disabled={busy === "link"} style={secondaryBtn}>
            {busy === "link" ? "…" : "Copy link"}
          </button>
        </div>

        <details>
          <summary style={{ cursor: "pointer", fontSize: 12, color: "#475569", fontWeight: 600 }}>
            Refund this receipt
          </summary>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <input
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              placeholder="Amount"
              inputMode="none"
              autoComplete="off"
              style={{
                width: 110, padding: "8px 10px", borderRadius: 8,
                border: "1px solid #CBD5E1", fontSize: 13,
                caretColor: "transparent",
              }}
            />
            <input
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              placeholder="Reason"
              style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #CBD5E1", fontSize: 13 }}
            />
            <button onClick={handleRefund} disabled={busy === "refund"} style={dangerBtn}>
              {busy === "refund" ? "…" : "Refund"}
            </button>
          </div>
        </details>

        {link && (
          <a href={link} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "#0F172A", wordBreak: "break-all" }}>
            {link}
          </a>
        )}
        {info && <div style={{ fontSize: 12, color: "#475569" }}>{info}</div>}
      </div>
    </div>
  );
}

function Line({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between",
      fontSize: bold ? 14 : 12, color: "#0F172A",
      fontWeight: bold ? 700 : 500, padding: "2px 0",
    }}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
}

function formatTime(iso: string): string {
  try { return new Date(iso).toLocaleString(undefined, { hour: "2-digit", minute: "2-digit", month: "short", day: "2-digit" }); }
  catch { return iso; }
}

const primaryBtn: React.CSSProperties = {
  padding: "8px 12px", borderRadius: 8, border: "none",
  background: "#0F172A", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer",
};
const secondaryBtn: React.CSSProperties = {
  padding: "8px 12px", borderRadius: 8, border: "1px solid #CBD5E1",
  background: "#fff", color: "#0F172A", fontWeight: 600, fontSize: 12, cursor: "pointer",
};
const dangerBtn: React.CSSProperties = {
  padding: "8px 12px", borderRadius: 8, border: "none",
  background: "#EF4444", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer",
};
