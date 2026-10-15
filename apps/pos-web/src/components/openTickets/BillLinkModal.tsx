import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { palette, radius, space, btnPrimary, btnSecondary, type } from "../../theme";
import { ticketDisplayTotal, type OpenTicket } from "../../utils/openTicketUtils";
import { ConfirmDialogShell } from "./ConfirmDialogShell";

/** The words sent with the link, so WhatsApp or Viber shows what it is. */
export function billShareText(t: OpenTicket, url: string): string {
  const total = ticketDisplayTotal(t).toFixed(2);
  const paid = t.payment_status === "paid";
  return paid
    ? `Your bill ${t.order_number} (MVR ${total}): ${url}`
    : `Your bill ${t.order_number} (MVR ${total}). View and pay online: ${url}`;
}

/** 7XXXXXX → 9607XXXXXX for wa.me; anything else as typed, digits only. */
function waNumber(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length === 7) return `960${digits}`;
  if (digits.length === 10 && digits.startsWith("960")) return digits;
  return null;
}

/** Copy that still works where the Clipboard API is refused (older iPad Safari). */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through */ }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Copy bill link / Share bill link (owner, 2026-10-15): the invoice link with
 * a QR, Copy link, Share… (the iPad's share sheet, which lists WhatsApp and
 * Viber), and WhatsApp and Viber buttons straight to those apps. Nothing is
 * sent from the till; the cashier picks the chat.
 */
export function BillLinkModal({
  ticket,
  url,
  error,
  copyOnOpen,
  onClose,
}: {
  ticket: OpenTicket;
  url: string | null;
  error: string | null;
  copyOnOpen: boolean;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState<"yes" | "failed" | null>(null);
  const triedCopy = useRef(false);
  const label = ticket.ticket_name || `Order ${ticket.order_number}`;
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  useEffect(() => {
    if (!url || !copyOnOpen || triedCopy.current) return;
    triedCopy.current = true;
    // iPad Safari may refuse a copy that was not a tap; then Copy link does it.
    void copyText(url).then((ok) => { if (ok) setCopied("yes"); });
  }, [url, copyOnOpen]);

  const text = url ? billShareText(ticket, url) : "";
  const wa = waNumber(ticket.customer?.phone);
  const waHref = url ? `https://wa.me/${wa ?? ""}?text=${encodeURIComponent(text)}` : "#";
  const viberHref = url ? `viber://forward?text=${encodeURIComponent(text)}` : "#";

  const linkBtn = (disabled: boolean) => ({
    ...btnSecondary(disabled),
    flex: "1 1 120px",
    textAlign: "center" as const,
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: disabled ? ("none" as const) : undefined,
  });

  return (
    <ConfirmDialogShell ariaLabel="Bill link" busy={false} onCancel={onClose}>
      <div>
        <div style={{ ...type.subtitle, color: palette.panelInk }}>Bill link</div>
        <div style={{ ...type.bodySm, color: palette.panelMuted, marginTop: 4 }}>
          <strong style={{ color: palette.panelInk }}>{label}</strong>
          {" · MVR "}{ticketDisplayTotal(ticket).toFixed(2)}
          {ticket.payment_status !== "paid" ? " · the customer can pay online from it" : ""}
        </div>
      </div>

      {error ? (
        <div role="alert" style={{ color: palette.dangerDark, fontSize: type.bodySm.fontSize, fontWeight: 600 }}>
          {error}
        </div>
      ) : !url ? (
        <div style={{ color: palette.panelMuted, fontSize: type.bodySm.fontSize }}>Getting the link…</div>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <QRCodeSVG value={url} size={150} includeMargin />
          </div>
          <div
            data-testid="bill-link-url"
            style={{
              padding: "10px 12px",
              fontSize: 13,
              wordBreak: "break-all",
              background: palette.bgAlt,
              borderRadius: radius.m,
              border: "1px solid #E2E8F0",
              color: palette.panelInk,
              userSelect: "all",
            }}
          >
            {url}
          </div>
          {copied === "yes" && (
            <div data-testid="bill-link-copied" style={{ color: palette.successDark, fontSize: type.bodySm.fontSize, fontWeight: 700 }}>
              Link copied. Paste it in any chat.
            </div>
          )}
          {copied === "failed" && (
            <div style={{ color: palette.dangerDark, fontSize: type.bodySm.fontSize, fontWeight: 600 }}>
              Couldn't copy. Press and hold the link above to copy it.
            </div>
          )}
        </>
      )}

      <div style={{ display: "flex", gap: space.s, flexWrap: "wrap" }}>
        <button
          type="button"
          data-testid="bill-link-copy"
          disabled={!url}
          style={{ ...btnSecondary(!url), flex: "1 1 120px" }}
          onClick={() => {
            if (!url) return;
            void copyText(url).then((ok) => setCopied(ok ? "yes" : "failed"));
          }}
        >
          Copy link
        </button>
        {canShare && (
          <button
            type="button"
            data-testid="bill-link-share"
            disabled={!url}
            style={{ ...btnPrimary(!url), flex: "1 1 120px" }}
            onClick={() => {
              if (!url) return;
              navigator.share({ title: `Bill ${ticket.order_number}`, text, url: url }).catch(() => { /* closed */ });
            }}
          >
            Share…
          </button>
        )}
        <a
          data-testid="bill-link-whatsapp"
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          style={linkBtn(!url)}
        >
          WhatsApp
        </a>
        <a
          data-testid="bill-link-viber"
          href={viberHref}
          style={linkBtn(!url)}
        >
          Viber
        </a>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button type="button" onClick={onClose} style={btnSecondary()}>Done</button>
      </div>
    </ConfirmDialogShell>
  );
}
