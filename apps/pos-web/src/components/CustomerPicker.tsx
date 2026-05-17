import { useEffect, useRef, useState } from "react";
import { quickCreateCustomer, searchCustomers, type PosCustomer } from "../api";

/**
 * Customer Picker — sits at the top of the OrderCart.
 *
 * Two states:
 *   - **Attached**: shows a compact chip with the customer's name, phone,
 *     loyalty tier/points and a × to detach. Cashier can tap the chip to
 *     re-edit (which detaches and opens the search).
 *   - **Searching**: text input. On every keystroke (≥ 2 chars, debounced
 *     250 ms) we hit /customers/search and render up to 10 hits. If the
 *     query looks like a phone (digits + maybe +, space, dash) and there
 *     are no matches, we show a "Save as new customer" CTA that POSTs to
 *     /customers/quick.
 *
 * Why phone-first quick-create: the cashier's primary key is the phone
 * (it's what unlocks SMS). Name is purely cosmetic and optional — the
 * backend won't overwrite an existing customer's name if quick-create
 * is called with one for a phone that already exists.
 *
 * Auto-fill: typing an existing customer's name OR phone surfaces the
 * row in the dropdown; one tap attaches them. There's no separate
 * "name lookup vs phone lookup" — the backend search hits all three of
 * name/phone/email with a single LIKE pass.
 */

type Props = {
  /** Currently attached customer (null when none). */
  customer: PosCustomer | null;
  onAttach: (customer: PosCustomer) => void;
  onDetach: () => void;
  /** Auto-focus the input on mount — useful when the panel was just
   *  expanded by the cashier clicking "+ Add customer". */
  autoFocus?: boolean;
};

const C = {
  text: "#0F172A",
  muted: "#64748B",
  subtle: "#94A3B8",
  border: "#E2E8F0",
  border2: "#CBD5E1",
  bg: "#F8FAFC",
  primary: "#D4813A",
  primaryDark: "#B86820",
  primarySoft: "#FEF3E2",
  ok: "#10B981",
};

const PHONE_RX = /^\+?[\d\s\-]{4,}$/;

export function CustomerPicker({ customer, onAttach, onDetach, autoFocus }: Props) {
  const [open, setOpen] = useState<boolean>(autoFocus ?? false);
  const [q, setQ] = useState("");
  const [name, setName] = useState("");
  const [results, setResults] = useState<PosCustomer[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // ── Debounced search ─────────────────────────────────────────────
  useEffect(() => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }
    let aborted = false;
    setLoading(true);
    const handle = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await searchCustomers(trimmed);
          if (!aborted) setResults(res.data ?? []);
        } catch {
          if (!aborted) setResults([]);
        } finally {
          if (!aborted) setLoading(false);
        }
      })();
    }, 250);
    return () => {
      aborted = true;
      window.clearTimeout(handle);
    };
  }, [q]);

  // ── Click-outside to collapse ────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const handleAttach = (c: PosCustomer) => {
    onAttach(c);
    setOpen(false);
    setQ("");
    setName("");
    setResults([]);
    setError("");
  };

  const handleQuickCreate = async () => {
    const phone = q.trim();
    if (!PHONE_RX.test(phone)) {
      setError("Enter a valid phone number (e.g. 7123456).");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const res = await quickCreateCustomer({ phone, name: name.trim() || undefined });
      handleAttach(res.customer);
    } catch (e) {
      setError((e as Error).message || "Could not create customer.");
    } finally {
      setCreating(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────
  // ATTACHED CHIP
  // ─────────────────────────────────────────────────────────────────
  if (customer) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 10px",
          background: C.primarySoft,
          border: `1px solid ${C.primary}33`,
          borderRadius: 8,
          marginBottom: 10,
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: C.primary,
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 800,
            fontSize: 12,
            flexShrink: 0,
          }}
          aria-hidden="true"
        >
          {(customer.name ?? customer.phone ?? "?").slice(0, 1).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: C.text,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {customer.name || "(no name)"}
          </div>
          <div style={{ fontSize: 11, color: C.muted, display: "flex", gap: 6 }}>
            <span>{customer.phone}</span>
            {typeof customer.loyalty_points === "number" && customer.loyalty_points > 0 && (
              <span>· {customer.loyalty_points} pts</span>
            )}
            {customer.sms_opt_out && <span style={{ color: "#B91C1C" }}>· SMS opted out</span>}
          </div>
        </div>
        <button
          aria-label="Detach customer"
          onClick={onDetach}
          style={{
            background: "transparent",
            border: "none",
            color: C.muted,
            fontSize: 18,
            lineHeight: 1,
            cursor: "pointer",
            padding: 4,
          }}
        >
          ×
        </button>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // EMPTY STATE / SEARCH
  // ─────────────────────────────────────────────────────────────────
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 10px",
          background: C.bg,
          border: `1px dashed ${C.border2}`,
          borderRadius: 8,
          fontSize: 12,
          fontWeight: 600,
          color: C.muted,
          cursor: "pointer",
          marginBottom: 10,
        }}
      >
        <span aria-hidden="true">＋</span>
        <span>Add customer (phone / name)</span>
      </button>
    );
  }

  const trimmed = q.trim();
  const looksLikePhone = PHONE_RX.test(trimmed);
  const showCreate = trimmed.length >= 2 && !loading && results.length === 0 && looksLikePhone;

  return (
    <div ref={wrapRef} style={{ position: "relative", marginBottom: 10 }}>
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setError("");
        }}
        placeholder="Search by phone or name…"
        style={{
          width: "100%",
          padding: "10px 12px",
          borderRadius: 8,
          border: `1px solid ${C.primary}`,
          fontSize: 13,
          color: C.text,
          background: "#FFFFFF",
          outline: "none",
        }}
      />

      {(loading || results.length > 0 || showCreate) && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: 4,
            background: "#FFFFFF",
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            boxShadow: "0 6px 24px rgba(15,23,42,0.12)",
            zIndex: 30,
            maxHeight: 280,
            overflow: "auto",
          }}
        >
          {loading && (
            <div style={{ padding: 10, fontSize: 12, color: C.muted, textAlign: "center" }}>
              Searching…
            </div>
          )}

          {!loading &&
            results.map((c) => (
              <button
                key={c.id}
                onClick={() => handleAttach(c)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  padding: "10px 12px",
                  background: "#FFFFFF",
                  border: "none",
                  borderBottom: `1px solid ${C.border}`,
                  cursor: "pointer",
                  textAlign: "left",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = C.bg;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "#FFFFFF";
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: C.bg,
                    color: C.muted,
                    border: `1px solid ${C.border}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 800,
                    fontSize: 12,
                    flexShrink: 0,
                  }}
                >
                  {(c.name ?? c.phone ?? "?").slice(0, 1).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: C.text,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {c.name || "(no name)"}
                  </div>
                  <div style={{ fontSize: 11, color: C.muted }}>
                    {c.phone}
                    {typeof c.orders_count === "number" && c.orders_count > 0 && (
                      <span> · {c.orders_count} order{c.orders_count === 1 ? "" : "s"}</span>
                    )}
                  </div>
                </div>
              </button>
            ))}

          {showCreate && (
            <div style={{ padding: 10, borderTop: results.length ? `1px solid ${C.border}` : undefined }}>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>
                No match. Save as new customer:
              </div>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name (optional)"
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 6,
                  border: `1px solid ${C.border2}`,
                  fontSize: 12,
                  marginBottom: 6,
                }}
              />
              <button
                onClick={handleQuickCreate}
                disabled={creating}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 6,
                  background: creating ? "#D4D4D8" : C.primary,
                  color: "#FFFFFF",
                  border: "none",
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: creating ? "not-allowed" : "pointer",
                }}
              >
                {creating ? "Saving…" : `Save ${q.trim()}`}
              </button>
              {error && (
                <div style={{ marginTop: 6, fontSize: 11, color: "#B91C1C" }}>{error}</div>
              )}
            </div>
          )}

          {!loading && results.length === 0 && !showCreate && trimmed.length >= 2 && (
            <div style={{ padding: 10, fontSize: 12, color: C.muted, textAlign: "center" }}>
              No matches. Type a phone number to save as new.
            </div>
          )}
        </div>
      )}

      {error && !showCreate && (
        <div style={{ marginTop: 6, fontSize: 11, color: "#B91C1C" }}>{error}</div>
      )}
    </div>
  );
}
