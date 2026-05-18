import { useEffect, useMemo, useRef, useState } from "react";
import { quickCreateCustomer, searchCustomers, type PosCustomer } from "../api";

/**
 * Customer Picker — sits at the top of the OrderCart.
 *
 * Redesign goals (May 2026, based on cashier feedback):
 *  1. Tapping the phone field MUST trigger a numeric keypad on tablets,
 *     not the full alphanumeric keyboard. We use `type="tel"` +
 *     `inputMode="tel"` + an always-visible on-screen numpad so the
 *     experience is identical on iPad, Android, and bare POS terminals
 *     that have no virtual keyboard at all.
 *  2. Phone and Name are now visually distinct controls — the cashier
 *     never has to wonder "where do I type the name?". Name only appears
 *     once a phone is typed because a name without a phone can't be
 *     looked up later or messaged.
 *  3. A small "Search by name instead" toggle is provided for the rare
 *     case where the customer doesn't know their phone (e.g. asking a
 *     regular by first name). In that mode the on-screen numpad hides
 *     and a free-text input takes its place.
 *
 * Why phone-first quick-create: the cashier's primary key is the phone
 * (it's what unlocks SMS). Name is purely cosmetic and optional — the
 * backend won't overwrite an existing customer's name if quick-create
 * is called with one for a phone that already exists.
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
  bgAlt: "#F1F5F9",
  primary: "#D4813A",
  primaryDark: "#B86820",
  primarySoft: "#FEF3E2",
  ok: "#10B981",
  danger: "#B91C1C",
};

// Anything that is at least 7 digits (Maldivian local numbers are 7) is
// considered "valid enough" to enable the Save button. We strip
// non-digits before counting so "+960 7123456" still passes.
const PHONE_RX = /^\+?[\d\s\-]{4,}$/;

function digitsOnly(s: string): number {
  return (s.match(/\d/g) ?? []).length;
}
function isValidPhone(s: string): boolean {
  return PHONE_RX.test(s.trim()) && digitsOnly(s) >= 7;
}

type Mode = "phone" | "name";

export function CustomerPicker({ customer, onAttach, onDetach, autoFocus }: Props) {
  const [open, setOpen] = useState<boolean>(autoFocus ?? false);
  const [mode, setMode] = useState<Mode>("phone");

  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [nameQuery, setNameQuery] = useState("");

  const [results, setResults] = useState<PosCustomer[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const phoneRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const query = mode === "phone" ? phone.trim() : nameQuery.trim();
  const phoneValid = isValidPhone(phone);

  // ── Debounced search (works for both phone and name) ───────────────
  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }
    let aborted = false;
    setLoading(true);
    const handle = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await searchCustomers(query);
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
  }, [query]);

  // ── Click-outside to collapse ──────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        // Don't auto-close if the cashier is mid-entry; only collapse
        // when nothing has been typed yet. Otherwise tapping outside
        // by accident would wipe their work.
        if (!phone && !name && !nameQuery) setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open, phone, name, nameQuery]);

  // ── Focus management ───────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    if (mode === "phone") phoneRef.current?.focus();
    else nameRef.current?.focus();
  }, [open, mode]);

  // ── Handlers ───────────────────────────────────────────────────────
  const reset = () => {
    setPhone("");
    setName("");
    setNameQuery("");
    setResults([]);
    setError("");
    setMode("phone");
  };

  const handleAttach = (c: PosCustomer) => {
    onAttach(c);
    setOpen(false);
    reset();
  };

  const handleQuickCreate = async () => {
    if (!phoneValid) {
      setError("Enter a valid phone number (at least 7 digits).");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const res = await quickCreateCustomer({
        phone: phone.trim(),
        name: name.trim() || undefined,
      });
      handleAttach(res.customer);
    } catch (e) {
      setError((e as Error).message || "Could not create customer.");
    } finally {
      setCreating(false);
    }
  };

  // Numpad button press → append/remove from phone input. We update
  // state directly rather than dispatching synthetic input events so
  // the input doesn't re-trigger the soft keyboard on every tap.
  const numpadPress = (key: string) => {
    setError("");
    if (key === "back") {
      setPhone((p) => p.slice(0, -1));
      return;
    }
    if (key === "clear") {
      setPhone("");
      return;
    }
    setPhone((p) => p + key);
  };

  // ── ATTACHED CHIP ──────────────────────────────────────────────────
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
            width: 28, height: 28, borderRadius: "50%",
            background: C.primary, color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 800, fontSize: 12, flexShrink: 0,
          }}
          aria-hidden="true"
        >
          {(customer.name ?? customer.phone ?? "?").slice(0, 1).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13, fontWeight: 700, color: C.text,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}
          >
            {customer.name || "(no name)"}
          </div>
          <div style={{ fontSize: 11, color: C.muted, display: "flex", gap: 6 }}>
            <span>{customer.phone}</span>
            {typeof customer.loyalty_points === "number" && customer.loyalty_points > 0 && (
              <span>· {customer.loyalty_points} pts</span>
            )}
            {customer.sms_opt_out && <span style={{ color: C.danger }}>· SMS opted out</span>}
          </div>
        </div>
        <button
          aria-label="Detach customer"
          onClick={onDetach}
          style={{
            background: "transparent", border: "none", color: C.muted,
            fontSize: 22, lineHeight: 1, cursor: "pointer",
            padding: "4px 8px", minWidth: 36, minHeight: 36,
          }}
        >
          ×
        </button>
      </div>
    );
  }

  // ── EMPTY STATE ────────────────────────────────────────────────────
  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); setMode("phone"); }}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 8,
          padding: "10px 12px",
          background: C.bg, border: `1px dashed ${C.border2}`,
          borderRadius: 8, fontSize: 13, fontWeight: 600,
          color: C.muted, cursor: "pointer", marginBottom: 10,
          minHeight: 44,
        }}
      >
        <span aria-hidden="true" style={{ fontSize: 16 }}>＋</span>
        <span>Add customer (phone / name)</span>
      </button>
    );
  }

  // ── EXPANDED PICKER ────────────────────────────────────────────────
  const showCreate = mode === "phone" && phoneValid && !loading && results.length === 0;

  return (
    <div
      ref={wrapRef}
      style={{
        marginBottom: 10,
        background: "#FFFFFF",
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        boxShadow: "0 4px 12px rgba(15,23,42,0.06)",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 12px", background: C.bg,
        borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.text, letterSpacing: "0.02em" }}>
          {mode === "phone" ? "Customer phone" : "Search by name"}
        </div>
        <button
          onClick={() => { setOpen(false); reset(); }}
          style={{
            background: "transparent", border: "none", color: C.muted,
            fontSize: 12, fontWeight: 600, cursor: "pointer",
            padding: "4px 8px", minHeight: 32,
          }}
        >
          Cancel
        </button>
      </div>

      {/* Inputs */}
      <div style={{ padding: 12 }}>
        {mode === "phone" ? (
          <>
            <PhoneField
              inputRef={phoneRef}
              value={phone}
              onChange={(v) => { setPhone(v); setError(""); }}
              valid={phoneValid}
            />

            <Numpad onPress={numpadPress} />

            {/* Name field appears once the phone is typed, NOT on first
                paint — keeps the UI uncluttered until it's relevant. */}
            {phone.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <label style={{
                  display: "block", fontSize: 11, fontWeight: 700,
                  color: C.muted, marginBottom: 4, letterSpacing: "0.04em",
                  textTransform: "uppercase",
                }}>
                  Name <span style={{ fontWeight: 500, textTransform: "none" }}>(optional)</span>
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Ahmed"
                  autoComplete="off"
                  style={{
                    width: "100%", padding: "12px 14px",
                    borderRadius: 8, border: `1px solid ${C.border2}`,
                    fontSize: 15, color: C.text,
                    background: "#FFFFFF", outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            )}

            <button
              onClick={() => { setMode("name"); setPhone(""); setName(""); setError(""); }}
              style={{
                marginTop: 12, width: "100%",
                background: "transparent", border: `1px solid ${C.border}`,
                borderRadius: 8, color: C.muted, fontSize: 12, fontWeight: 600,
                padding: "8px 10px", cursor: "pointer", minHeight: 38,
              }}
            >
              Search by name instead →
            </button>
          </>
        ) : (
          <>
            <input
              ref={nameRef}
              value={nameQuery}
              onChange={(e) => setNameQuery(e.target.value)}
              placeholder="Type a name…"
              autoComplete="off"
              style={{
                width: "100%", padding: "12px 14px",
                borderRadius: 8, border: `1px solid ${C.primary}`,
                fontSize: 15, color: C.text,
                background: "#FFFFFF", outline: "none",
                boxSizing: "border-box",
              }}
            />
            <button
              onClick={() => { setMode("phone"); setNameQuery(""); }}
              style={{
                marginTop: 12, width: "100%",
                background: "transparent", border: `1px solid ${C.border}`,
                borderRadius: 8, color: C.muted, fontSize: 12, fontWeight: 600,
                padding: "8px 10px", cursor: "pointer", minHeight: 38,
              }}
            >
              ← Back to phone entry
            </button>
          </>
        )}
      </div>

      {/* Results / Create CTA */}
      {(loading || results.length > 0 || showCreate || (query.length >= 2 && !loading)) && (
        <div style={{
          borderTop: `1px solid ${C.border}`,
          background: C.bg,
          maxHeight: 220,
          overflow: "auto",
        }}>
          {loading && (
            <div style={{ padding: 12, fontSize: 12, color: C.muted, textAlign: "center" }}>
              Searching…
            </div>
          )}

          {!loading && results.length > 0 && (
            <div style={{
              padding: "6px 12px", fontSize: 10, fontWeight: 700,
              color: C.muted, letterSpacing: "0.06em", textTransform: "uppercase",
            }}>
              Matches
            </div>
          )}

          {!loading && results.map((c) => (
            <button
              key={c.id}
              onClick={() => handleAttach(c)}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                width: "100%", padding: "10px 12px",
                background: "transparent", border: "none",
                borderBottom: `1px solid ${C.border}`,
                cursor: "pointer", textAlign: "left",
                minHeight: 48,
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = C.bgAlt; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
            >
              <div style={{
                width: 32, height: 32, borderRadius: "50%",
                background: C.primarySoft, color: C.primaryDark,
                border: `1px solid ${C.primary}33`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 800, fontSize: 13, flexShrink: 0,
              }}>
                {(c.name ?? c.phone ?? "?").slice(0, 1).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 14, fontWeight: 700, color: C.text,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {c.name || "(no name)"}
                </div>
                <div style={{ fontSize: 12, color: C.muted }}>
                  {c.phone}
                  {typeof c.orders_count === "number" && c.orders_count > 0 && (
                    <span> · {c.orders_count} order{c.orders_count === 1 ? "" : "s"}</span>
                  )}
                </div>
              </div>
            </button>
          ))}

          {showCreate && (
            <div style={{
              padding: 12,
              borderTop: results.length ? `1px solid ${C.border}` : undefined,
            }}>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>
                No existing customer with this number — save as new?
              </div>
              <button
                onClick={handleQuickCreate}
                disabled={creating}
                style={{
                  width: "100%", padding: "12px 14px",
                  borderRadius: 8,
                  background: creating ? C.subtle : C.primary,
                  color: "#FFFFFF", border: "none",
                  fontWeight: 700, fontSize: 14,
                  cursor: creating ? "not-allowed" : "pointer",
                  minHeight: 44,
                }}
              >
                {creating ? "Saving…" : `Save ${phone.trim()}${name.trim() ? ` — ${name.trim()}` : ""}`}
              </button>
              {error && (
                <div style={{ marginTop: 8, fontSize: 12, color: C.danger }}>{error}</div>
              )}
            </div>
          )}

          {!loading && results.length === 0 && !showCreate && query.length >= 2 && (
            <div style={{ padding: 12, fontSize: 12, color: C.muted, textAlign: "center" }}>
              {mode === "phone"
                ? `Keep typing — at least 7 digits to save as new.`
                : `No matches for "${query}". Switch to phone entry to save a new customer.`}
            </div>
          )}
        </div>
      )}

      {error && !showCreate && (
        <div style={{ padding: "8px 12px", fontSize: 12, color: C.danger, background: C.bg }}>
          {error}
        </div>
      )}
    </div>
  );
}

// ── Phone field ────────────────────────────────────────────────────────────
// iPad note: we DO NOT want the OS soft keyboard to appear — iPad has no
// numeric-only keyboard variant, so `inputMode="tel"` pops the full
// alphanumeric layout on top of our numpad. Setting `inputMode="none"`
// instructs Safari/Chrome to suppress the virtual keyboard entirely
// while keeping the input fully focusable, accessible, and editable via
// a hardware keyboard. The on-screen numpad below is the sole touch
// input path on POS hardware.
function PhoneField({
  inputRef, value, onChange, valid,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (v: string) => void;
  valid: boolean;
}) {
  const display = useMemo(() => value, [value]);
  // Track focus so we can render our own caret hint without depending
  // on the browser's native caret (which iOS still renders even when
  // the keyboard is suppressed, but inconsistently).
  const [focused, setFocused] = useState(false);

  return (
    <div
      style={{ position: "relative" }}
      onClick={() => inputRef.current?.focus()}
    >
      <input
        ref={inputRef}
        value={display}
        onChange={(e) => onChange(e.target.value.replace(/[^\d+\s-]/g, ""))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        type="tel"
        // inputMode="none" → tell mobile browsers NOT to show a soft
        // keyboard. Hardware keyboards still work.
        inputMode="none"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        pattern="[0-9+\s\-]*"
        placeholder="7123456"
        aria-label="Customer phone number — use the numpad below"
        style={{
          width: "100%", padding: "14px 16px",
          borderRadius: 8,
          border: `2px solid ${valid ? C.ok : focused ? C.primary : C.border2}`,
          fontSize: 22, fontWeight: 700,
          letterSpacing: "0.06em",
          color: C.text, background: "#FFFFFF",
          outline: "none", boxSizing: "border-box",
          textAlign: "center",
          fontVariantNumeric: "tabular-nums",
          caretColor: "transparent",
          cursor: "pointer",
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
      />
      {/* Blinking pseudo-caret so cashier sees the field is active. */}
      {focused && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            top: "50%",
            transform: "translateY(-50%)",
            left: `calc(50% + ${Math.max(0, display.length) * 0.45}ch + 4px)`,
            width: 2,
            height: 24,
            background: C.primary,
            animation: "bg-blink 1s steps(2, start) infinite",
            pointerEvents: "none",
          }}
        />
      )}
      {valid && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)",
            color: C.ok, fontSize: 18, fontWeight: 900,
          }}
        >
          ✓
        </span>
      )}
      {/* Inject the blink keyframes once — defined locally so we don't
          pollute the global stylesheet for a tiny POS-only animation. */}
      <style>{`@keyframes bg-blink { 0%, 49% { opacity: 1 } 50%, 100% { opacity: 0 } }`}</style>
    </div>
  );
}

// ── On-screen numpad ───────────────────────────────────────────────────────
// 3×4 grid. Buttons are large (≥56px tall) so cashiers can hit them with
// a thumb on a busy line. We deliberately route taps through `onPress`
// instead of dispatching synthetic input events — that way we never
// fight the soft keyboard if both are visible.
function Numpad({ onPress }: { onPress: (k: string) => void }) {
  const rows: Array<Array<{ k: string; label: string; variant?: "muted" | "danger" }>> = [
    [{ k: "1", label: "1" }, { k: "2", label: "2" }, { k: "3", label: "3" }],
    [{ k: "4", label: "4" }, { k: "5", label: "5" }, { k: "6", label: "6" }],
    [{ k: "7", label: "7" }, { k: "8", label: "8" }, { k: "9", label: "9" }],
    [
      { k: "+", label: "+", variant: "muted" },
      { k: "0", label: "0" },
      { k: "back", label: "⌫", variant: "danger" },
    ],
  ];

  return (
    <div style={{
      marginTop: 12,
      display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8,
    }}>
      {rows.flat().map(({ k, label, variant }) => {
        const isMuted = variant === "muted";
        const isDanger = variant === "danger";
        const bg = isDanger ? "#FEE2E2" : isMuted ? C.bg : "#FFFFFF";
        const fg = isDanger ? C.danger : isMuted ? C.muted : C.text;
        const border = isDanger ? "#FCA5A5" : C.border2;
        return (
          <button
            key={k}
            type="button"
            onClick={() => onPress(k)}
            aria-label={k === "back" ? "Backspace" : `Digit ${label}`}
            style={{
              padding: "16px 0",
              borderRadius: 10,
              border: `1px solid ${border}`,
              background: bg,
              color: fg,
              fontSize: 22,
              fontWeight: 700,
              cursor: "pointer",
              minHeight: 56,
              fontVariantNumeric: "tabular-nums",
              userSelect: "none",
              touchAction: "manipulation",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
