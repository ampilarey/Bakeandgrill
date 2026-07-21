import { QRCodeSVG } from "qrcode.react";
import { z } from "../../theme";

type Props = {
  url: string;
  ticketLabel: string;
  onClose: () => void;
};

/**
 * FIX 19 — shown when `window.open` returned null (mobile Safari, popup
 * blocker, kiosk). Presents the invoice URL alongside a scannable QR
 * so the cashier can hand the customer's phone the link directly.
 */
export function PrintBillFallbackModal({ url, ticketLabel, onClose }: Props) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Print bill"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.6)",
        zIndex: z.modal,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 14,
          padding: 20,
          width: "min(420px, 100%)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18, color: "#0F172A" }}>
          Print blocked — scan or copy the link
        </h2>
        <p style={{ marginTop: 6, marginBottom: 12, color: "#475569", fontSize: 13 }}>
          Print for <strong>{ticketLabel}</strong>. The browser blocked the pop-up.
          Scan the QR on the customer's phone, or paste the copied link into a new tab.
        </p>

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            padding: 12,
            background: "#F8FAFC",
            borderRadius: 10,
            border: "1px solid #E2E8F0",
          }}
        >
          <QRCodeSVG value={url} size={200} includeMargin />
        </div>

        <div
          style={{
            marginTop: 12,
            padding: "10px 12px",
            fontSize: 12,
            wordBreak: "break-all",
            background: "#F1F5F9",
            borderRadius: 8,
            border: "1px solid #E2E8F0",
            color: "#1E293B",
          }}
        >
          {url}
        </div>

        <div
          style={{
            marginTop: 16,
            display: "flex",
            gap: 10,
            justifyContent: "flex-end",
          }}
        >
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(url);
            }}
            style={{
              minHeight: 40,
              padding: "0 16px",
              borderRadius: 8,
              border: "1px solid #CBD5E1",
              background: "#fff",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Copy link
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              minHeight: 40,
              padding: "0 18px",
              borderRadius: 8,
              border: "none",
              background: "#0F172A",
              color: "#fff",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
