import { useEffect, useRef, useState } from "react";
import { getReceiptLink, sendReceipt } from "../api";

/**
 * Post-charge action banner.
 *
 * Shown briefly after a successful payment. Server-side
 * SendPaymentConfirmationListener will already have queued an SMS to
 * the linked customer (when one exists) — this banner is purely about
 * what the cashier wants to do RIGHT NOW at the counter:
 *
 *   - Print receipt (opens /receipts/{token}?print=1 in a new tab so
 *     the Blade view auto-triggers window.print()).
 *   - Open receipt in a new tab without printing.
 *   - Resend the SMS (only enabled when a phone is present; useful if
 *     the customer didn't get the auto SMS or the queue worker was
 *     down). Idempotency comes from the message body — the customer
 *     getting a duplicate "here's your receipt" SMS is fine.
 *   - Dismiss (×).
 *
 * The banner is self-fetching for the receipt link — it doesn't ask
 * the parent to plumb the token through. It tries once on mount and
 * caches; failure leaves Print/Open disabled but doesn't block.
 */

type Props = {
  orderId: number;
  /** Customer's phone for the Resend button. If undefined, Resend is hidden. */
  customerPhone?: string | null;
  paidOnCredit?: boolean;
  /** When credit is a minority split tender — e.g. "partially on credit (MVR X)". */
  creditNote?: string | null;
  receiptResendEnabled?: boolean;
  onDismiss: () => void;
};

const C = {
  bg: "#ECFDF5",
  border: "#A7F3D0",
  text: "#064E3B",
  muted: "#047857",
  btnBorder: "#10B981",
  btn: "#FFFFFF",
};

export function ReceiptActionsBanner({ orderId, customerPhone, paidOnCredit = false, creditNote = null, receiptResendEnabled = true, onDismiss }: Props) {
  const [link, setLink] = useState<string | null>(null);
  const [linkErr, setLinkErr] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendErr, setSendErr] = useState<string | null>(null);
  const dismissTimer = useRef<number | null>(null);

  // Keep the latest onDismiss reachable from a stable effect WITHOUT
  // re-running it every render. App passes an inline arrow as onDismiss,
  // so its identity changes on every render — including the changes
  // this very banner triggers. Putting `onDismiss` in the deps caused
  // the link to re-fetch and the auto-dismiss timer to restart on every
  // parent render, so the timer effectively never fired and the network
  // got hammered.
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  // Link fetch — keyed only on the order, runs exactly once per order.
  useEffect(() => {
    let cancelled = false;
    setLink(null);
    setLinkErr(false);
    void (async () => {
      try {
        const res = await getReceiptLink(orderId);
        if (!cancelled) setLink(res.link);
      } catch {
        if (!cancelled) setLinkErr(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  // Bug-043: bumped auto-dismiss from 25s → 60s for Loyverse parity.
  // 25s wasn't long enough for the cashier to: hand the customer
  // their change, look up, and decide "yes, print a receipt." The
  // 60s window matches Loyverse/Square's post-tender shortcut bar
  // and gives the cashier a real chance to act after the customer
  // asks for a printed copy a few seconds in.
  useEffect(() => {
    dismissTimer.current = window.setTimeout(() => {
      onDismissRef.current();
    }, 60_000);
    return () => {
      if (dismissTimer.current) window.clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    };
  }, [orderId]);

  const stopAutoDismiss = () => {
    if (dismissTimer.current) {
      window.clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }
  };

  const handlePrint = () => {
    if (!link) return;
    stopAutoDismiss();
    const url = link.includes("?") ? `${link}&print=1` : `${link}?print=1`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleOpen = () => {
    if (!link) return;
    stopAutoDismiss();
    window.open(link, "_blank", "noopener,noreferrer");
  };

  const handleResend = async () => {
    if (!customerPhone) return;
    stopAutoDismiss();
    setSending(true);
    setSendErr(null);
    try {
      await sendReceipt(orderId, { channel: "sms", recipient: customerPhone });
      setSent(true);
    } catch (e) {
      setSendErr((e as Error).message || "Failed to send SMS");
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      style={{
        padding: 12,
        background: C.bg,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <div style={{ flex: "1 1 auto", minWidth: 200 }}>
        <div style={{ fontWeight: 800, color: C.text, fontSize: 14 }}>
          ✓ Order #{orderId}{" "}
          {paidOnCredit
            ? "charged to credit account"
            : creditNote
              ? creditNote
              : "paid"}
        </div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
          {customerPhone
            ? sent && receiptResendEnabled
              ? `Receipt re-sent to ${customerPhone}.`
              : receiptResendEnabled
                ? `Receipt SMS sent to ${customerPhone}.`
                : `Customer: ${customerPhone}`
            : "No customer attached — receipt not sent by SMS."}
          {sendErr && <span style={{ color: "#B91C1C", marginLeft: 8 }}>· {sendErr}</span>}
        </div>
      </div>

      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={handlePrint} disabled={!link} style={btn(!link)}>
          🖨 Print
        </button>
        <button onClick={handleOpen} disabled={!link} style={btn(!link)}>
          {linkErr ? "Open ✕" : "Open"}
        </button>
        {customerPhone && receiptResendEnabled && (
          <button onClick={handleResend} disabled={sending || sent} style={btn(sending || sent)}>
            {sending ? "Sending…" : sent ? "Sent ✓" : "Resend SMS"}
          </button>
        )}
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          style={{
            ...btn(false),
            padding: "6px 10px",
            fontSize: 16,
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
}

function btn(disabled: boolean): React.CSSProperties {
  return {
    padding: "8px 12px",
    borderRadius: 8,
    background: C.btn,
    border: `1px solid ${C.btnBorder}`,
    color: C.text,
    fontSize: 12,
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.55 : 1,
  };
}
