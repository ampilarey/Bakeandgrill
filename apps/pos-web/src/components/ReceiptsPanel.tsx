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
  const [busy, setBusy] = useState<"" | "send" | "refund" | "link" | "print">("");
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

  /**
   * Opens the public receipt URL in a new tab with ?print=1, which the
   * Blade view honours by auto-firing window.print() on load. Reuses
   * the link we already fetched (or fetches lazily on first click) so
   * a cashier asking the customer "want a printed receipt?" five
   * minutes after charging has a one-tap action here in the Receipts
   * pane (the post-charge green banner auto-dismisses after 25s).
   */
  const handlePrint = async () => {
    setBusy("print"); setInfo("");
    try {
      let url = link;
      if (!url) {
        const res = await getReceiptLink(receipt.id);
        url = res.link;
        setLink(url);
      }
      const printUrl = url.includes("?") ? `${url}&print=1` : `${url}?print=1`;
      window.open(printUrl, "_blank", "noopener,noreferrer");
    } catch (e) { setInfo((e as Error).message || "Could not get print link."); }
    finally { setBusy(""); }
  };

  // Two-step refund: tapping "Refund" stages a confirm modal
  // showing the proposed amount + reason + order context. The
  // actual createRefund() call only fires from the modal's
  // "Yes, issue refund" button. Refunds are money out the door
  // — a single tap with no friction is the wrong UX, especially
  // when the form sits inside a <details> that opens with the
  // amount pre-filled to the order total.
  const [pendingRefund, setPendingRefund] = useState<{
    amount: number;
    reason: string;
  } | null>(null);

  const handleRefundIntent = () => {
    const amount = Number.parseFloat(refundAmount);
    if (!Number.isFinite(amount) || amount <= 0) { setInfo("Enter a refund amount."); return; }
    if (amount > Number(receipt.total) + 0.005) { setInfo("Refund cannot exceed order total."); return; }
    setInfo("");
    setPendingRefund({ amount, reason: refundReason.trim() });
  };

  const handleRefundConfirmed = async () => {
    if (!pendingRefund) return;
    const { amount, reason } = pendingRefund;
    setPendingRefund(null);
    setBusy("refund"); setInfo("");
    try {
      await createRefund(receipt.id, { amount, reason: reason || undefined });
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
        {/* Print is the most-asked-for action when a customer comes
            back asking for a paper receipt, so it gets the prominent
            primary button. SMS and Copy link sit alongside for the
            customer who wants it digitally. */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={handlePrint}
            disabled={busy === "print"}
            style={primaryBtn}
            title="Open the printable receipt in a new tab and auto-print"
          >
            {busy === "print" ? "Opening…" : "🖨 Print receipt"}
          </button>
          <button onClick={handleLink} disabled={busy === "link"} style={secondaryBtn}>
            {busy === "link" ? "…" : "Copy link"}
          </button>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone for SMS"
            style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #CBD5E1", fontSize: 13 }}
          />
          <button onClick={handleSend} disabled={busy === "send"} style={secondaryBtn}>
            {busy === "send" ? "Sending…" : "Send SMS"}
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
            <button onClick={handleRefundIntent} disabled={busy === "refund"} style={dangerBtn}>
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

      {pendingRefund && (
        <RefundConfirmModal
          orderNumber={receipt.order_number}
          orderTotal={Number(receipt.total)}
          amount={pendingRefund.amount}
          reason={pendingRefund.reason}
          onCancel={() => setPendingRefund(null)}
          onConfirm={() => void handleRefundConfirmed()}
        />
      )}
    </div>
  );
}

/**
 * Last-mile confirm before money goes back out to a customer. Shows
 * the full proposed refund — amount, reason, target order, and a
 * "full / partial" tag so the cashier eyeballs the number against
 * what they actually intended to refund. The submit button is a
 * destructive red and is the only path to fire `createRefund`.
 */
function RefundConfirmModal({
  orderNumber,
  orderTotal,
  amount,
  reason,
  onCancel,
  onConfirm,
}: {
  orderNumber: string;
  orderTotal: number;
  amount: number;
  reason: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const partial = amount + 0.005 < orderTotal;
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
      style={{
        position: "fixed", inset: 0, zIndex: 950,
        background: "rgba(15,23,42,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 14, width: "100%", maxWidth: 420,
          padding: 20, display: "flex", flexDirection: "column", gap: 14,
        }}
      >
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#0F172A" }}>
            Issue refund?
          </div>
          <div style={{ marginTop: 4, fontSize: 13, color: "#64748B" }}>
            This pays money back to the customer. Cannot be undone from the POS.
          </div>
        </div>
        <div style={{
          border: "1px solid #FECACA", background: "#FEF2F2",
          borderRadius: 10, padding: "12px 14px",
          display: "grid", rowGap: 6, fontSize: 13, color: "#0F172A",
        }}>
          <Row label="Order">{orderNumber}</Row>
          <Row label="Refund amount">
            <strong>MVR {amount.toFixed(2)}</strong>{" "}
            <span style={{ fontSize: 11, color: partial ? "#B45309" : "#15803D", fontWeight: 700 }}>
              {partial ? "PARTIAL" : "FULL"}
            </span>
          </Row>
          <Row label="Order total">MVR {orderTotal.toFixed(2)}</Row>
          {reason ? (
            <Row label="Reason">{reason}</Row>
          ) : (
            <Row label="Reason"><em style={{ color: "#94A3B8" }}>(none)</em></Row>
          )}
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            style={{
              padding: "10px 16px", borderRadius: 10, fontWeight: 700,
              background: "#fff", color: "#0F172A",
              border: "1px solid #CBD5E1", cursor: "pointer", fontSize: 13,
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: "10px 16px", borderRadius: 10, fontWeight: 800,
              background: "#B91C1C", color: "#fff",
              border: "none", cursor: "pointer", fontSize: 13,
            }}
          >
            Yes, issue refund
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span style={{ color: "#64748B", fontWeight: 600 }}>{label}</span>
      <span style={{ textAlign: "right" }}>{children}</span>
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
