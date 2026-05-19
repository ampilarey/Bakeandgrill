import { useEffect, useState } from "react";
import { fetchReceipts, fireOrderToKitchen, sendBill, sendPayLink } from "../api";
import { palette, radius, space, shadow, btnPrimary, btnSecondary, inputField, type, z } from "../theme";

export type OpenTicket = Awaited<ReturnType<typeof fetchReceipts>>["data"][number];

type Props = {
  deviceId: string;
  onResume: (ticket: OpenTicket) => void;
  onClose: () => void;
  /** Phone of the currently-attached cart customer, if any — used to
   *  prefill the "Send Bill" prompt so cashiers don't retype the same
   *  number they already entered in the cart. */
  cartCustomerPhone?: string | null;
};

/**
 * List of held / parked tickets. Replaces the old single-held-order
 * "Resume #123" button — that pattern silently overwrote previous holds
 * and made multi-tab service impossible.
 */
export function OpenTicketsPanel({ deviceId, onResume, onClose, cartCustomerPhone }: Props) {
  const [tickets, setTickets] = useState<OpenTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  // Per-row "action in progress" indicator (sendBill is the only async
  // per-row action that matters — Print just opens a tab).
  const [busyId, setBusyId] = useState<number | null>(null);
  const [rowMsg, setRowMsg] = useState<{ id: number; text: string; kind: "ok" | "err" } | null>(null);
  // Modal state for asking the cashier for a phone number when sending
  // a bill SMS for a ticket that has no linked customer. Replaces the
  // native window.prompt which was fragile, off-brand, and unusable
  // on iPad in PWA fullscreen mode.
  const [phonePrompt, setPhonePrompt] = useState<{ ticket: OpenTicket; phone: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        // Unified Open Tickets view: classic held tickets PLUS the
        // new fired-but-unpaid tickets (phone-call pickup workflow).
        // Both kinds need cashier attention before the day closes.
        const res = await fetchReceipts({
          open_only: true,
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

  // Update the local row after a side action so the cashier sees the
  // new state (e.g. "fired" badge appearing, payment_status flipping)
  // without a manual refresh.
  const patchTicket = (id: number, patch: Partial<OpenTicket>) => {
    setTickets((curr) =>
      curr.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  };

  const handleFireToKitchen = async (t: OpenTicket) => {
    setBusyId(t.id);
    setRowMsg(null);
    try {
      await fireOrderToKitchen(t.id);
      patchTicket(t.id, { status: "pending", fired_at: new Date().toISOString() });
      setRowMsg({ id: t.id, kind: "ok", text: "Sent to kitchen." });
    } catch (e) {
      setRowMsg({ id: t.id, kind: "err", text: (e as Error).message || "Couldn't fire to kitchen" });
    } finally {
      setBusyId(null);
    }
  };

  const handleSendPayLink = async (t: OpenTicket) => {
    setBusyId(t.id);
    setRowMsg(null);
    try {
      const res = await sendPayLink(t.id);
      setRowMsg({ id: t.id, kind: "ok", text: `Pay link sent (MVR ${res.amount.toFixed(2)}) to ${res.sent_to}` });
    } catch (e) {
      setRowMsg({ id: t.id, kind: "err", text: (e as Error).message || "Couldn't send pay link" });
    } finally {
      setBusyId(null);
    }
  };

  /**
   * Send Bill (SMS) for a parked ticket. Two paths:
   *   - ticket already has a linked customer with a phone → use that phone
   *     immediately (server-side firstOrCreate keeps the same customer row).
   *   - no linked customer → open the inline phone prompt modal so the
   *     cashier types a number without leaving the panel.
   */
  const handleSendBill = (t: OpenTicket) => {
    const linkedPhone = t.customer?.phone ?? null;
    if (linkedPhone) {
      void doSendBill(t, linkedPhone);
      return;
    }
    setPhonePrompt({ ticket: t, phone: cartCustomerPhone ?? "" });
  };

  const doSendBill = async (t: OpenTicket, phone: string) => {
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

  const submitPhonePrompt = async () => {
    if (!phonePrompt) return;
    const phone = phonePrompt.phone.trim();
    if (!phone) return;
    const ticket = phonePrompt.ticket;
    setPhonePrompt(null);
    await doSendBill(ticket, phone);
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
    <PanelShell
      title="Open tickets"
      subtitle="Parked orders and unpaid phone-call tickets"
      onClose={onClose}
    >
      {loading && <p style={{ color: palette.panelMuted, fontSize: type.bodySm.fontSize }}>Loading…</p>}
      {err && <p style={{ color: palette.dangerDark, fontSize: type.bodySm.fontSize }}>{err}</p>}
      {!loading && tickets.length === 0 && (
        <EmptyState
          emoji="🎫"
          title="No open tickets"
          body="Parked tickets and unpaid phone-call orders will show up here."
        />
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: space.s }}>
        {tickets.map((t) => {
          const busy = busyId === t.id;
          const msg = rowMsg?.id === t.id ? rowMsg : null;
          // Two new ticket states beyond classic held:
          //   isFired      — kitchen is cooking (fired_at is set). Shows
          //                  the 🍳 badge so cashier doesn't double-fire.
          //   isUnpaid     — payment_status is unpaid/partial. Combined
          //                  with isFired this is the "phone-call pickup
          //                  waiting for the customer to pay" state.
          const isFired = !!t.fired_at;
          const isUnpaid = t.payment_status === "unpaid" || t.payment_status === "partial";
          const isHeld = t.status === "held";
          const hasPhone = !!t.customer?.phone;
          return (
            <div
              key={t.id}
              style={{
                padding: space.m,
                borderRadius: radius.l,
                background: palette.panel,
                border: `1px solid ${palette.border}`,
                display: "flex",
                flexDirection: "column",
                gap: space.s,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: space.m }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 700, fontSize: type.body.fontSize, color: palette.panelInk }}>
                      {t.ticket_name || `Order ${t.order_number}`}
                    </div>
                    {isFired && (
                      <span
                        title="Sent to kitchen"
                        style={{
                          fontSize: 11, fontWeight: 800, letterSpacing: 0.4,
                          color: "#047857", background: "#ECFDF5",
                          padding: "2px 6px", borderRadius: 4,
                          border: "1px solid #A7F3D0",
                        }}
                      >
                        🍳 COOKING
                      </span>
                    )}
                    {isUnpaid && isFired && (
                      <span
                        title="Not paid yet"
                        style={{
                          fontSize: 11, fontWeight: 800, letterSpacing: 0.4,
                          color: "#B91C1C", background: "#FEF2F2",
                          padding: "2px 6px", borderRadius: 4,
                          border: "1px solid #FECACA",
                        }}
                      >
                        UNPAID
                      </span>
                    )}
                    {isHeld && (
                      <span
                        title="Parked — kitchen has not seen this yet"
                        style={{
                          fontSize: 11, fontWeight: 800, letterSpacing: 0.4,
                          color: "#475569", background: "#F1F5F9",
                          padding: "2px 6px", borderRadius: 4,
                          border: "1px solid #CBD5E1",
                        }}
                      >
                        📋 PARKED
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: type.caption.fontSize, color: palette.panelMuted, marginTop: 2 }}>
                    {(t.items?.length ?? 0)} items
                    {t.ticket_note ? ` · ${t.ticket_note}` : ""}
                    {t.customer?.name ? ` · ${t.customer.name}` : ""}
                    {t.customer?.phone ? ` · ${t.customer.phone}` : ""}
                  </div>
                </div>
                <div style={{ fontWeight: 800, fontSize: type.subtitle.fontSize, color: palette.panelInk, whiteSpace: "nowrap" }}>
                  MVR {Number(t.total).toFixed(2)}
                </div>
              </div>

              <div style={{ display: "flex", gap: space.xs, flexWrap: "wrap" }}>
                {/* Resume always present — cashier uses it to charge
                    at the counter when the customer arrives, or to
                    edit a parked ticket. */}
                <button onClick={() => onResume(t)} disabled={busy} style={{ ...btnPrimary(busy), padding: `${space.s}px ${space.m}px`, minHeight: 36, fontSize: type.bodySm.fontSize }}>
                  ▶ {isUnpaid && isFired ? "Charge" : "Resume"}
                </button>

                {/* Fire to kitchen — only meaningful for held tickets
                    that haven't been sent yet. Hidden once cooking
                    so cashier doesn't double-print the chit. */}
                {isHeld && (
                  <button
                    onClick={() => handleFireToKitchen(t)}
                    disabled={busy}
                    style={{
                      padding: `${space.s}px ${space.m}px`,
                      minHeight: 36, fontSize: type.bodySm.fontSize,
                      borderRadius: radius.m, fontWeight: 700,
                      background: "#047857", color: "#fff",
                      border: "none", cursor: busy ? "not-allowed" : "pointer",
                    }}
                  >
                    🍳 {busy ? "…" : "Fire to kitchen"}
                  </button>
                )}

                {/* Send pay link — only useful for unpaid tickets
                    with a customer phone (BML link gets SMS'd to
                    them). Hidden when paid or no phone attached. */}
                {isUnpaid && hasPhone && (
                  <button
                    onClick={() => handleSendPayLink(t)}
                    disabled={busy}
                    style={{
                      padding: `${space.s}px ${space.m}px`,
                      minHeight: 36, fontSize: type.bodySm.fontSize,
                      borderRadius: radius.m, fontWeight: 700,
                      background: "#1D4ED8", color: "#fff",
                      border: "none", cursor: busy ? "not-allowed" : "pointer",
                    }}
                  >
                    💳 {busy ? "…" : "Send pay link"}
                  </button>
                )}

                <button onClick={() => handleSendBill(t)} disabled={busy} style={{ ...btnSecondary(busy), padding: `${space.s}px ${space.m}px`, minHeight: 36, fontSize: type.bodySm.fontSize }}>
                  📱 {busy ? "…" : "Send Bill SMS"}
                </button>
                <button onClick={() => handlePrintBill(t)} disabled={busy} style={{ ...btnSecondary(busy), padding: `${space.s}px ${space.m}px`, minHeight: 36, fontSize: type.bodySm.fontSize }}>
                  🖨 Print Bill
                </button>
              </div>

              {msg && (
                <div style={{
                  fontSize: type.caption.fontSize,
                  color: msg.kind === "ok" ? palette.successDark : palette.dangerDark,
                  fontWeight: 600,
                }}>
                  {msg.text}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {phonePrompt && (
        <PhonePromptModal
          ticketLabel={phonePrompt.ticket.ticket_name || `Order ${phonePrompt.ticket.order_number}`}
          phone={phonePrompt.phone}
          onPhoneChange={(phone) => setPhonePrompt((p) => p ? { ...p, phone } : p)}
          onCancel={() => setPhonePrompt(null)}
          onSubmit={submitPhonePrompt}
        />
      )}
    </PanelShell>
  );
}

function PhonePromptModal({
  ticketLabel,
  phone,
  onPhoneChange,
  onCancel,
  onSubmit,
}: {
  ticketLabel: string;
  phone: string;
  onPhoneChange: (v: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Send bill — phone number"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.4)",
        zIndex: z.modalBackdrop,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: space.l,
        animation: "pos-fade-in 120ms ease",
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(420px, 100%)",
          background: palette.panel,
          borderRadius: radius.xl,
          boxShadow: shadow.xl,
          padding: space.xl,
          display: "flex",
          flexDirection: "column",
          gap: space.m,
          animation: "pos-scale-in 140ms ease",
        }}
      >
        <div>
          <div style={{ ...type.subtitle, color: palette.panelInk }}>Send bill SMS</div>
          <div style={{ ...type.bodySm, color: palette.panelMuted, marginTop: 4 }}>
            Ticket: <strong style={{ color: palette.panelInk }}>{ticketLabel}</strong>
          </div>
        </div>
        <div>
          <label style={{ ...type.label, color: palette.panelMuted, display: "block", marginBottom: space.xxs }}>
            Customer mobile
          </label>
          <input
            autoFocus
            type="tel"
            inputMode="tel"
            pattern="[0-9+\- ]*"
            value={phone}
            onChange={(e) => onPhoneChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSubmit();
              if (e.key === "Escape") onCancel();
            }}
            placeholder="7XXXXXX"
            style={{ ...inputField, width: "100%", fontSize: type.subtitle.fontSize }}
          />
        </div>
        <div style={{ display: "flex", gap: space.s, justifyContent: "flex-end", marginTop: space.xs }}>
          <button type="button" onClick={onCancel} style={btnSecondary()}>Cancel</button>
          <button type="button" onClick={onSubmit} disabled={!phone.trim()} style={btnPrimary(!phone.trim())}>
            Send SMS
          </button>
        </div>
      </div>
    </div>
  );
}

export function PanelShell({ title, subtitle, onClose, children }: {
  title: string; subtitle?: string; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <div style={{
      flex: 1,
      minHeight: 0,
      background: palette.panel,
      borderRadius: radius.xl,
      border: `1px solid ${palette.border}`,
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      boxShadow: shadow.xs,
    }}>
      <div style={{
        padding: space.l,
        borderBottom: `1px solid ${palette.border}`,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: space.m,
      }}>
        <div>
          <div style={{ ...type.subtitle, color: palette.panelInk }}>{title}</div>
          {subtitle && <div style={{ ...type.caption, color: palette.panelMuted, marginTop: 2 }}>{subtitle}</div>}
        </div>
        <button onClick={onClose} style={{
          background: "none",
          border: "none",
          color: palette.panelMuted,
          fontSize: 22,
          cursor: "pointer",
          lineHeight: 1,
          padding: space.xxs,
          minHeight: 32,
          minWidth: 32,
        }} aria-label="Close panel">×</button>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: space.l }}>
        {children}
      </div>
    </div>
  );
}

export function EmptyState({ emoji, title, body }: { emoji: string; title: string; body: string }) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: space.huge,
      color: palette.panelSubtle,
      textAlign: "center",
    }}>
      <div style={{ fontSize: 44, marginBottom: space.m }}>{emoji}</div>
      <div style={{ ...type.body, fontWeight: 700, color: palette.panelMuted }}>{title}</div>
      <div style={{ ...type.caption, marginTop: 4, maxWidth: 280 }}>{body}</div>
    </div>
  );
}
