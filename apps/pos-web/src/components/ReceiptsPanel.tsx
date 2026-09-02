import { useEffect, useMemo, useState } from "react";
import {
  createRefund,
  fetchReceipts,
  getReceiptLink,
  sendReceipt,
  REFUND_REASON_CATEGORIES,
  type RefundReasonCategory,
} from "../api";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { posOrderTypeEmoji, posOrderTypeLabel } from "../orderTypeLabels";
import { palette } from "../theme";
import { localDateYmd } from "../utils/localDate";
import { EmptyState, PanelShell } from "./OpenTicketsPanel";
import { RefundConfirmModal } from "./RefundConfirmModal";

export type Receipt = Awaited<ReturnType<typeof fetchReceipts>>["data"][number];

type Props = {
  onClose: () => void;
  shiftId?: number | null;
  defaultScope?: "today" | "shift";
  /** Select this order when the list loads (post-charge redirect). */
  initialOrderId?: number | null;
  receiptResendEnabled?: boolean;
  canRefund?: boolean;
};

type Scope = "today" | "shift" | "all";
type PayFilter = "all" | "cash" | "card" | "transfer" | "other";

const SCOPE_LABEL: Record<Scope, string> = { today: "Today", shift: "This shift", all: "All" };

/** How a payment method reads on the pane. */
export function paymentLabel(method: string | null | undefined): string {
  switch ((method ?? "").toLowerCase()) {
    case "cash": return "Cash";
    case "card": return "Card";
    case "transfer":
    case "bank_transfer": return "Transfer";
    case "qr": return "QR";
    case "house_account":
    case "credit": return "Credit";
    case "wallet":
    case "deposit": return "Deposit";
    case "gift_card": return "Gift card";
    case "loyalty": return "Loyalty";
    case "bml":
    case "bml_gateway": return "BML online";
    case "stripe": return "Card online";
    default: return method ? method.replace(/_/g, " ") : "—";
  }
}

function payFilterOf(method: string | null | undefined): PayFilter {
  const m = (method ?? "").toLowerCase();
  if (m === "cash") return "cash";
  if (m === "card" || m === "stripe") return "card";
  if (m === "transfer" || m === "bank_transfer" || m === "bml" || m === "bml_gateway" || m === "qr") return "transfer";
  return "other";
}

/** Payments that actually landed — pending and failed legs are not money. */
export function settledPayments(r: Receipt) {
  return (r.payments ?? []).filter((p) => {
    const s = (p.status ?? "").toLowerCase();
    return s === "" || s === "paid" || s === "completed" || s === "succeeded" || s === "captured" || s === "settled";
  });
}

export function refundedTotal(r: Receipt): number {
  return (r.refunds ?? [])
    .filter((f) => ["approved", "completed", "processed", "auto_approved"].includes((f.status ?? "").toLowerCase()))
    .reduce((sum, f) => sum + Number(f.amount || 0), 0);
}

/** One word on the state of the money, and a colour for it. */
export function receiptState(r: Receipt): { label: string; tone: "ok" | "warn" | "danger" | "muted" } {
  const status = (r.status ?? "").toLowerCase();
  if (status === "cancelled") return { label: "Cancelled", tone: "muted" };
  if (status === "refunded" || refundedTotal(r) >= Number(r.total) - 0.005 && refundedTotal(r) > 0) {
    return { label: "Refunded", tone: "danger" };
  }
  if (refundedTotal(r) > 0) return { label: "Part refunded", tone: "warn" };
  if (r.payment_settlement?.paid_on_credit) return { label: r.payment_settlement.short_label, tone: "warn" };
  const ps = (r.payment_status ?? "").toLowerCase();
  if (ps === "unpaid") return { label: "Unpaid", tone: "warn" };
  if (ps === "partial") return { label: "Part paid", tone: "warn" };
  return { label: "Paid", tone: "ok" };
}

const TONE = {
  ok: { bg: palette.successBg, fg: palette.successDark, border: palette.successBorder },
  warn: { bg: palette.warnBg, fg: palette.warnDark, border: palette.warnBorder },
  danger: { bg: palette.dangerBg, fg: palette.dangerDark, border: palette.dangerBorder },
  muted: { bg: palette.bgAlt, fg: palette.panelMuted, border: palette.border },
} as const;

function money(n: number | string | null | undefined): string {
  return `MVR ${Number(n ?? 0).toFixed(2)}`;
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return "";
  try { return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}

function formatDay(iso: string | null | undefined): string {
  if (!iso) return "";
  try { return new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short" }); }
  catch { return iso; }
}

/**
 * Receipts on the till: the list on the left, the receipt on the right.
 *
 * Owner, 2026-09-02: "can u enhance the receipt page in pos". The old pane
 * showed an order number, a time and a total per row, and a bare item list
 * with one Total line underneath — no way to tell cash from card, a refund
 * from a sale, or a GST line from a service charge without opening the
 * printed receipt. Now each row carries how it was paid and where the
 * money stands, the list has a running total for whatever is filtered, and
 * the receipt itself reads like the paper one: sizes and notes on the
 * lines, every money line broken out, each payment with its change, and
 * any refund against it.
 *
 * On a phone it is one pane at a time: the list, then the receipt with a
 * Back button, instead of both squeezed into a column.
 */
export function ReceiptsPanel({
  onClose,
  shiftId,
  defaultScope = "today",
  initialOrderId = null,
  receiptResendEnabled = true,
  canRefund = true,
}: Props) {
  const isNarrow = useMediaQuery("(max-width: 760px)");
  const [scope, setScope] = useState<Scope>(defaultScope);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [payFilter, setPayFilter] = useState<PayFilter>("all");
  const [items, setItems] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // On a phone the detail is its own screen; a tap on a row opens it.
  const [detailOpen, setDetailOpen] = useState(initialOrderId != null);
  const [reloadKey, setReloadKey] = useState(0);

  // Debounce so we don't fire on every keystroke.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => clearTimeout(id);
  }, [q]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        // Recompute on each fetch so a POS left open past midnight stays correct,
        // and use local calendar date (not UTC) for Maldives overnight shifts.
        const today = localDateYmd();
        const res = await fetchReceipts({
          ...(scope === "today" ? { date: today } : {}),
          ...(scope === "shift" && shiftId ? { shift_id: shiftId } : {}),
          ...(debouncedQ ? { q: debouncedQ } : {}),
          per_page: 50,
        });
        if (!cancelled) {
          setItems(res.data);
          setErr("");
          if (initialOrderId != null && res.data.some((r) => r.id === initialOrderId)) {
            setSelectedId(initialOrderId);
          } else if (res.data.length && selectedId == null && !isNarrow) {
            setSelectedId(res.data[0].id);
          }
        }
      } catch (e) {
        if (!cancelled) setErr((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, debouncedQ, shiftId, initialOrderId, reloadKey]);

  const visible = useMemo(
    () => (payFilter === "all"
      ? items
      : items.filter((r) => settledPayments(r).some((p) => payFilterOf(p.method) === payFilter))),
    [items, payFilter],
  );

  const payCounts = useMemo(() => {
    const counts: Record<PayFilter, number> = { all: items.length, cash: 0, card: 0, transfer: 0, other: 0 };
    for (const r of items) {
      const seen = new Set<PayFilter>();
      for (const p of settledPayments(r)) seen.add(payFilterOf(p.method));
      for (const k of seen) counts[k] += 1;
    }
    return counts;
  }, [items]);

  const summary = useMemo(() => {
    const live = visible.filter((r) => (r.status ?? "").toLowerCase() !== "cancelled");
    const sales = live.reduce((s, r) => s + Number(r.total || 0), 0);
    const refunds = live.reduce((s, r) => s + refundedTotal(r), 0);
    return { count: live.length, sales, refunds };
  }, [visible]);

  const selected = items.find((r) => r.id === selectedId) ?? null;
  const showList = !isNarrow || !detailOpen || !selected;
  const showDetail = !isNarrow || (detailOpen && !!selected);

  const scopeBar = (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <div role="group" aria-label="Which receipts" style={{ display: "flex", background: palette.bgAlt, borderRadius: 10, padding: 3 }}>
          {(["today", "shift", "all"] as const).map((s) => {
            const disabled = s === "shift" && !shiftId;
            const on = scope === s;
            return (
              <button
                key={s}
                type="button"
                aria-pressed={on}
                onClick={() => setScope(s)}
                disabled={disabled}
                style={{
                  padding: "0 12px", minHeight: 36, fontSize: 12, fontWeight: 700,
                  borderRadius: 8, border: "none", cursor: disabled ? "not-allowed" : "pointer",
                  background: on ? palette.panel : "transparent",
                  color: on ? palette.panelInk : palette.panelMuted,
                  boxShadow: on ? "0 1px 2px rgba(15,23,42,0.08)" : "none",
                  opacity: disabled ? 0.5 : 1, whiteSpace: "nowrap",
                }}
              >{SCOPE_LABEL[s]}</button>
            );
          })}
        </div>
        <div style={{ position: "relative", flex: "1 1 180px", minWidth: 160 }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Order #, name, phone, table…"
            aria-label="Search receipts"
            style={{
              width: "100%", boxSizing: "border-box", minHeight: 36, padding: "0 32px 0 12px",
              borderRadius: 10, border: `1px solid ${palette.borderStrong}`,
              fontSize: 13, background: palette.panel, color: palette.panelInk,
            }}
          />
          {q !== "" && (
            <button
              type="button"
              onClick={() => setQ("")}
              aria-label="Clear search"
              style={{
                position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)",
                width: 28, height: 28, border: "none", background: "transparent",
                color: palette.panelMuted, cursor: "pointer", fontSize: 14,
              }}
            >✕</button>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {(["all", "cash", "card", "transfer", "other"] as const).map((f) => {
          if (f !== "all" && payCounts[f] === 0) return null;
          const on = payFilter === f;
          const label = f === "all" ? "All" : f === "transfer" ? "Transfer / QR" : f[0].toUpperCase() + f.slice(1);
          return (
            <button
              key={f}
              type="button"
              aria-pressed={on}
              onClick={() => setPayFilter(f)}
              style={{
                minHeight: 30, padding: "0 10px", borderRadius: 999, fontSize: 12, fontWeight: 700,
                border: `1px solid ${on ? palette.primaryDark : palette.border}`,
                background: on ? palette.primary : palette.panel,
                color: on ? "#fff" : palette.panelInk, cursor: "pointer",
              }}
            >
              {label} <span style={{ opacity: 0.7, fontWeight: 600 }}>{payCounts[f]}</span>
            </button>
          );
        })}
        <span data-testid="receipts-summary" style={{ marginLeft: "auto", fontSize: 12, color: palette.panelMuted, whiteSpace: "nowrap" }}>
          {summary.count} {summary.count === 1 ? "receipt" : "receipts"} · {money(summary.sales)}
          {summary.refunds > 0 ? ` · refunded ${money(summary.refunds)}` : ""}
        </span>
      </div>
    </div>
  );

  return (
    <PanelShell
      title="Receipts"
      subtitle="Your sales — every device you've logged in on"
      onClose={onClose}
      toolbar={showList ? scopeBar : undefined}
    >
      <div
        className="pos-receipts"
        style={{
          display: "grid",
          gridTemplateColumns: isNarrow ? "1fr" : "300px 1fr",
          gap: 12, minHeight: 0, height: "100%",
        }}
      >
        {showList && (
          <div data-testid="receipts-list" style={{ display: "flex", flexDirection: "column", minHeight: 0, gap: 6, overflow: "auto" }}>
            {loading && items.length === 0 && <div style={{ color: palette.panelMuted, fontSize: 13, padding: 8 }}>Loading…</div>}
            {!loading && visible.length === 0 && (
              <EmptyState
                emoji="🧾"
                title="No receipts"
                body={debouncedQ || payFilter !== "all" ? "Try a different search or filter." : "Receipts will appear here as you ring up sales."}
              />
            )}
            {visible.map((r) => (
              <ReceiptRow
                key={r.id}
                receipt={r}
                selected={selectedId === r.id && !isNarrow}
                onClick={() => { setSelectedId(r.id); setDetailOpen(true); }}
              />
            ))}
          </div>
        )}

        {showDetail && (
          <div style={{
            background: palette.bg, borderRadius: 12, padding: isNarrow ? 10 : 14,
            display: "flex", flexDirection: "column", minHeight: 0,
            border: `1px solid ${palette.border}`,
          }}>
            {selected ? (
              <ReceiptDetail
                key={selected.id}
                receipt={selected}
                receiptResendEnabled={receiptResendEnabled}
                canRefund={canRefund}
                onBack={isNarrow ? () => setDetailOpen(false) : undefined}
                onChanged={() => setReloadKey((k) => k + 1)}
              />
            ) : (
              <EmptyState emoji="📄" title="Pick a receipt" body="Select one from the list to see it, print it, send it, or refund it." />
            )}
          </div>
        )}
      </div>
      {err && <div style={{ marginTop: 8, padding: 10, borderRadius: 8, background: palette.dangerBg, color: palette.dangerDark, fontSize: 12 }}>{err}</div>}
    </PanelShell>
  );
}

function Chip({ children, tone = "muted", title }: { children: React.ReactNode; tone?: keyof typeof TONE; title?: string }) {
  const t = TONE[tone];
  return (
    <span title={title} style={{
      display: "inline-block", padding: "1px 7px", borderRadius: 999,
      fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
      background: t.bg, color: t.fg, border: `1px solid ${t.border}`,
    }}>
      {children}
    </span>
  );
}

function ReceiptRow({ receipt: r, selected, onClick }: { receipt: Receipt; selected: boolean; onClick: () => void }) {
  const state = receiptState(r);
  const pays = settledPayments(r);
  const who = r.customer?.name?.trim() || r.table?.name || (r.type === "dine_in" ? "Walk-in" : "");
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`receipt-row-${r.id}`}
      aria-pressed={selected}
      style={{
        // Safari lets a <button> flex item shrink below its content in a
        // column list; without this every row collapses to one line and the
        // next row paints over the rest.
        flexShrink: 0,
        textAlign: "left", padding: "10px 12px", borderRadius: 10, cursor: "pointer",
        background: selected ? palette.primaryBg : palette.panel,
        border: `1px solid ${selected ? palette.primary : palette.border}`,
        borderLeft: `4px solid ${selected ? palette.primary : "transparent"}`,
        color: palette.panelInk, fontFamily: "inherit",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontWeight: 800, fontSize: 14, whiteSpace: "nowrap" }}>
          <span aria-hidden="true" style={{ marginRight: 6 }}>{posOrderTypeEmoji(r.type, r.user?.id, r.is_customer_placed)}</span>
          {r.order_number}
        </span>
        <span style={{
          fontWeight: 800, fontSize: 14, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
          textDecoration: state.label === "Refunded" || state.label === "Cancelled" ? "line-through" : "none",
          color: state.label === "Cancelled" ? palette.panelMuted : palette.panelInk,
        }}>
          {money(r.total)}
        </span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 5 }}>
        <span style={{ fontSize: 12, color: palette.panelMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {formatTime(r.created_at)}{who ? ` · ${who}` : ""}
        </span>
        <span style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          {pays.slice(0, 2).map((p) => (
            <Chip key={p.id} title={money(p.amount)}>{paymentLabel(p.method)}</Chip>
          ))}
          {pays.length > 2 && <Chip>+{pays.length - 2}</Chip>}
          <Chip tone={state.tone}>{state.label}</Chip>
        </span>
      </div>
    </button>
  );
}

function ReceiptDetail({
  receipt,
  receiptResendEnabled = true,
  canRefund = true,
  onBack,
  onChanged,
}: {
  receipt: Receipt;
  receiptResendEnabled?: boolean;
  canRefund?: boolean;
  onBack?: () => void;
  onChanged?: () => void;
}) {
  const [link, setLink] = useState<string | null>(null);
  const [phone, setPhone] = useState(receipt.customer?.phone ?? "");
  const [busy, setBusy] = useState<"" | "send" | "refund" | "link" | "print">("");
  const [info, setInfo] = useState("");
  const [refundOpen, setRefundOpen] = useState(false);
  const alreadyRefunded = refundedTotal(receipt);
  const refundable = Math.max(0, Number(receipt.total) - alreadyRefunded);
  const [refundAmount, setRefundAmount] = useState(refundable.toFixed(2));
  const [refundCategory, setRefundCategory] = useState<RefundReasonCategory | "">("");
  const [refundReason, setRefundReason] = useState("");
  const orderHasPhone = Boolean(receipt.customer?.phone?.trim());
  const [walkInRefundPhone, setWalkInRefundPhone] = useState("");
  const state = receiptState(receipt);
  const pays = settledPayments(receipt);

  const handleSend = async () => {
    if (!phone.trim()) { setInfo("Enter a phone number."); return; }
    setBusy("send"); setInfo("");
    try {
      const res = await sendReceipt(receipt.id, { channel: "sms", recipient: phone.trim() });
      setLink(res.link);
      setInfo(`Sent to ${phone.trim()}.`);
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
   * Blade view honours by auto-firing window.print() on load.
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

  // Two-step refund: the form stages a confirm modal; createRefund only
  // fires from the modal. Refunds are money out the door.
  const [pendingRefund, setPendingRefund] = useState<{
    amount: number;
    reason: string;
    reason_category: RefundReasonCategory;
  } | null>(null);

  const handleRefundIntent = () => {
    const amount = Number.parseFloat(refundAmount);
    if (!Number.isFinite(amount) || amount <= 0) { setInfo("Enter a refund amount."); return; }
    if (amount > refundable + 0.005) { setInfo(`Refund cannot exceed ${money(refundable)} still on this receipt.`); return; }
    if (!refundCategory) { setInfo("Pick a reason category."); return; }
    if (!refundReason.trim()) { setInfo("Describe the reason."); return; }
    if (refundCategory === "other" && refundReason.trim().length < 3) {
      setInfo("Please describe the reason when category is Other.");
      return;
    }
    if (!orderHasPhone && !walkInRefundPhone.trim()) {
      setInfo("Enter the customer phone for this walk-in refund.");
      return;
    }
    setInfo("");
    setPendingRefund({ amount, reason: refundReason.trim(), reason_category: refundCategory });
  };

  const handleRefundConfirmed = async (cashRefundOverride: boolean) => {
    if (!pendingRefund) return;
    const { amount, reason, reason_category } = pendingRefund;
    setPendingRefund(null);
    setBusy("refund"); setInfo("");
    try {
      const res = await createRefund(receipt.id, {
        amount,
        reason,
        reason_category,
        ...(cashRefundOverride ? { cash_refund_override: true } : {}),
        // Never send a phone when the order/customer already has one —
        // the server rejects overrides. Walk-in add only.
        ...(!orderHasPhone && walkInRefundPhone.trim()
          ? { refund_phone: walkInRefundPhone.trim() }
          : {}),
      });
      if (res.auto_approved) {
        const breakdownMsg = formatRefundBreakdown(res.breakdown as never ?? res.refund?.breakdown, cashRefundOverride);
        setInfo(breakdownMsg ? `Refund approved — ${breakdownMsg}` : "Refund approved.");
      } else {
        setInfo(
          res.refund?.phone_added_at_refund
            ? "Refund requested — phone added at refund time; ask customer for OTP before approval."
            : "Refund requested — OTP sent to customer; awaiting approval.",
        );
      }
      setRefundOpen(false);
      onChanged?.();
    } catch (e) { setInfo((e as Error).message || "Refund failed."); }
    finally { setBusy(""); }
  };

  const typeLabel = posOrderTypeLabel(receipt.type, receipt.user?.id, receipt.is_customer_placed) ?? receipt.type;
  const meta = [
    `${formatDay(receipt.created_at)} ${formatTime(receipt.created_at)}`,
    typeLabel,
    receipt.table?.name ? `Table ${receipt.table.name}` : null,
    receipt.user?.name ? `by ${receipt.user.name}` : null,
  ].filter(Boolean).join(" · ");

  const lines: Array<{ label: string; value: number; tone?: "minus" }> = [];
  if (Number(receipt.discount_amount) > 0) lines.push({ label: "Discount", value: Number(receipt.discount_amount), tone: "minus" });
  if (Number(receipt.service_charge_amount) > 0) lines.push({ label: receipt.service_charge_label || "Service charge", value: Number(receipt.service_charge_amount) });
  if (Number(receipt.packaging_fee) > 0) lines.push({ label: "Packaging", value: Number(receipt.packaging_fee) });
  if (Number(receipt.delivery_fee) > 0) lines.push({ label: "Delivery", value: Number(receipt.delivery_fee) });
  if (Number(receipt.tax_amount) > 0) lines.push({ label: "GST", value: Number(receipt.tax_amount) });

  const input: React.CSSProperties = {
    minHeight: 40, padding: "0 10px", borderRadius: 8, border: `1px solid ${palette.borderStrong}`,
    fontSize: 13, background: palette.panel, color: palette.panelInk, fontFamily: "inherit", boxSizing: "border-box",
  };

  return (
    <div data-testid="receipt-detail" style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, gap: 10 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to list"
            style={{
              minWidth: 44, minHeight: 44, borderRadius: 10, border: `1px solid ${palette.border}`,
              background: palette.panel, fontSize: 22, cursor: "pointer", color: palette.panelInk, flexShrink: 0,
            }}
          >‹</button>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 18, fontWeight: 800, color: palette.panelInk }}>{receipt.order_number}</span>
            <Chip tone={state.tone}>{state.label}</Chip>
          </div>
          <div style={{ fontSize: 12, color: palette.panelMuted, marginTop: 3 }}>{meta}</div>
          {receipt.customer && (receipt.customer.name || receipt.customer.phone) && (
            <div style={{ fontSize: 12, color: palette.panelInk, marginTop: 2 }}>
              {[receipt.customer.name, receipt.customer.phone].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: palette.panelMuted, textTransform: "uppercase", letterSpacing: "0.05em" }}>Total</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: palette.panelInk, fontVariantNumeric: "tabular-nums" }}>{money(receipt.total)}</div>
        </div>
      </div>

      {/* The receipt itself */}
      <div style={{
        flex: 1, overflow: "auto", background: palette.panel, borderRadius: 10,
        padding: 12, border: `1px solid ${palette.border}`, minHeight: 0,
      }}>
        {receipt.items?.map((it) => (
          <div key={it.id} style={{ display: "flex", gap: 8, padding: "5px 0", fontSize: 13, color: palette.panelInk, borderBottom: `1px dashed ${palette.border}` }}>
            <span style={{ width: 28, flexShrink: 0, fontWeight: 700, color: palette.panelMuted, fontVariantNumeric: "tabular-nums" }}>{it.quantity}×</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontWeight: 600 }}>{it.item_name}</span>
              {it.variant_name && <span style={{ color: palette.panelMuted }}> · {it.variant_name}</span>}
              {it.notes && <div style={{ fontSize: 12, color: palette.panelMuted, fontStyle: "italic" }}>{it.notes}</div>}
              {it.quantity > 1 && <div style={{ fontSize: 11, color: palette.panelSubtle }}>@ {Number(it.unit_price).toFixed(2)}</div>}
            </span>
            <span style={{ fontWeight: 700, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
              {Number(it.total_price).toFixed(2)}
            </span>
          </div>
        ))}

        <div style={{ marginTop: 8, paddingTop: 8 }}>
          {lines.length > 0 && <Line label="Subtotal" value={money(receipt.subtotal)} />}
          {lines.map((l) => (
            <Line key={l.label} label={l.label} value={l.tone === "minus" ? `− ${money(l.value)}` : money(l.value)} />
          ))}
          <Line label="Total" value={money(receipt.total)} bold />
        </div>

        {pays.length > 0 && (
          <div data-testid="receipt-payments" style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${palette.border}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: palette.panelMuted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Paid by</div>
            {pays.map((p) => (
              <div key={p.id}>
                <Line label={paymentLabel(p.method)} value={money(p.amount)} />
                {Number(p.tendered_amount) > 0 && Number(p.change_given) > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: palette.panelMuted, padding: "0 0 2px 12px" }}>
                    <span>Tendered {money(p.tendered_amount)}</span>
                    <span>Change {money(p.change_given)}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {(receipt.refunds ?? []).length > 0 && (
          <div data-testid="receipt-refunds" style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${palette.border}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: palette.dangerDark, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Refunds</div>
            {receipt.refunds!.map((f) => (
              <Line
                key={f.id}
                label={`${formatDay(f.created_at)} · ${(f.reason_category ?? "").replace(/_/g, " ") || "refund"} · ${f.status.replace(/_/g, " ")}`}
                value={`− ${money(f.amount)}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{
        padding: 10, borderRadius: 10, background: palette.panel,
        border: `1px solid ${palette.border}`, display: "flex", flexDirection: "column", gap: 8,
      }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={handlePrint} disabled={busy === "print"} style={primaryBtn} title="Open the printable receipt in a new tab and auto-print">
            {busy === "print" ? "Opening…" : "🖨 Print"}
          </button>
          <button onClick={handleLink} disabled={busy === "link"} style={secondaryBtn}>
            {busy === "link" ? "…" : "🔗 Copy link"}
          </button>
          {canRefund && refundable > 0 && (
            <button
              type="button"
              onClick={() => setRefundOpen((o) => !o)}
              aria-expanded={refundOpen}
              style={{ ...secondaryBtn, marginLeft: "auto", color: palette.dangerDark, borderColor: palette.dangerBorder }}
            >
              {refundOpen ? "Cancel refund" : alreadyRefunded > 0 ? "Refund more" : "Refund"}
            </button>
          )}
        </div>
        {receiptResendEnabled && (
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone for SMS receipt"
              inputMode="tel"
              aria-label="Phone for SMS receipt"
              style={{ ...input, flex: 1 }}
            />
            <button onClick={handleSend} disabled={busy === "send"} style={secondaryBtn}>
              {busy === "send" ? "Sending…" : "Send SMS"}
            </button>
          </div>
        )}

        {canRefund && refundOpen && (
          <div data-testid="refund-form" style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 8, borderTop: `1px dashed ${palette.border}` }}>
            <div style={{ fontSize: 12, color: palette.panelMuted }}>
              Up to {money(refundable)} can be refunded on this receipt{alreadyRefunded > 0 ? ` (${money(alreadyRefunded)} already refunded)` : ""}.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                onFocus={(e) => e.currentTarget.select()}
                placeholder="Amount"
                aria-label="Refund amount"
                inputMode="decimal"
                autoComplete="off"
                style={{ ...input, width: 110, textAlign: "right" }}
              />
              <select
                value={refundCategory}
                onChange={(e) => setRefundCategory(e.target.value as RefundReasonCategory | "")}
                aria-label="Refund reason category"
                style={{ ...input, flex: 1 }}
              >
                <option value="">Reason…</option>
                {REFUND_REASON_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <input
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              placeholder="What happened (required)"
              aria-label="Refund details"
              style={input}
            />
            {orderHasPhone ? (
              <div style={{ fontSize: 11, color: palette.panelMuted }}>
                OTP goes to {receipt.customer?.phone} (order phone — cannot change here).
              </div>
            ) : (
              <input
                value={walkInRefundPhone}
                onChange={(e) => setWalkInRefundPhone(e.target.value)}
                placeholder="Customer phone (required for walk-in)"
                aria-label="Customer phone for refund"
                inputMode="tel"
                style={input}
              />
            )}
            <button onClick={handleRefundIntent} disabled={busy === "refund"} style={dangerBtn}>
              {busy === "refund" ? "…" : `Request refund of ${money(Number.parseFloat(refundAmount) || 0)}`}
            </button>
          </div>
        )}

        {link && (
          <a href={link} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: palette.panelMuted, wordBreak: "break-all" }}>
            {link}
          </a>
        )}
        {info && <div role="status" style={{ fontSize: 12, color: palette.panelInk, fontWeight: 600 }}>{info}</div>}
      </div>

      {pendingRefund && (
        <RefundConfirmModal
          orderLabel={receipt.order_number}
          orderTotal={Number(receipt.total)}
          amount={pendingRefund.amount}
          reason={pendingRefund.reason}
          cashOverrideMode="edit"
          onCancel={() => setPendingRefund(null)}
          onConfirm={(cashRefundOverride) => void handleRefundConfirmed(cashRefundOverride)}
        />
      )}
    </div>
  );
}

function Line({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", gap: 12,
      fontSize: bold ? 15 : 12, color: palette.panelInk,
      fontWeight: bold ? 800 : 500, padding: "2px 0",
      fontVariantNumeric: "tabular-nums",
    }}>
      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span><span style={{ whiteSpace: "nowrap" }}>{value}</span>
    </div>
  );
}

/**
 * Turn the backend's per-method laari refund breakdown into a short human
 * summary the cashier can eyeball after the refund lands. Only non-zero
 * legs are shown.
 */
function formatRefundBreakdown(
  breakdown:
    | {
        cash_laar?: number;
        card_laar?: number;
        transfer_laar?: number;
        qr_laar?: number;
        house_account_laar?: number;
        wallet_laar?: number;
        other_laar?: number;
      }
    | null
    | undefined,
  cashRefundOverride?: boolean,
): string {
  if (!breakdown) return "";
  const parts: string[] = [];
  const push = (label: string, laar?: number) => {
    if (typeof laar !== "number" || laar <= 0) return;
    parts.push(`${label} MVR ${(laar / 100).toFixed(2)}`);
  };
  push("cash", breakdown.cash_laar);
  push("card", breakdown.card_laar);
  push("transfer", breakdown.transfer_laar);
  push("QR", breakdown.qr_laar);
  push("credit", breakdown.house_account_laar);
  push("deposit", breakdown.wallet_laar);
  push("other", breakdown.other_laar);
  if (parts.length === 0) return "";
  const suffix = cashRefundOverride ? " (card portion converted to cash)" : "";
  return `${parts.join(", ")}${suffix}.`;
}

const primaryBtn: React.CSSProperties = {
  minHeight: 40, padding: "0 14px", borderRadius: 8, border: "none",
  background: palette.ink, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
};
const secondaryBtn: React.CSSProperties = {
  minHeight: 40, padding: "0 12px", borderRadius: 8, border: `1px solid ${palette.borderStrong}`,
  background: palette.panel, color: palette.panelInk, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
};
const dangerBtn: React.CSSProperties = {
  minHeight: 44, padding: "0 14px", borderRadius: 8, border: "none",
  background: palette.danger, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
};
