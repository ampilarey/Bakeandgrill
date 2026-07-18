import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  fetchRecentCustomers, quickCreateCustomer, searchCustomers,
  updateCustomerFromPos, type PosCustomer,
} from "../api";
import { isValidMvMobile } from "../orderTypes";

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

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

function isValidPhone(s: string): boolean {
  return isValidMvMobile(s.trim());
}

type Mode = "phone" | "name";

export function CustomerPicker({ customer, onAttach, onDetach, autoFocus }: Props) {
  const [open, setOpen] = useState<boolean>(autoFocus ?? false);
  const isSheet = useMediaQuery("(max-width: 840px)");
  const [mode, setMode] = useState<Mode>("phone");

  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [nameQuery, setNameQuery] = useState("");

  const [results, setResults] = useState<PosCustomer[]>([]);
  const [recents, setRecents] = useState<PosCustomer[]>([]);
  const [recentsTotal, setRecentsTotal] = useState<number | null>(null);
  const [loadingRecents, setLoadingRecents] = useState(false);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const phoneRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const query = mode === "phone" ? phone.trim() : nameQuery.trim();
  const phoneValid = isValidPhone(phone);

  // ── Recent customers — fetched once when the picker opens ─────────
  // Backed by /customers/search?q= (empty query → recent list).
  // Backend now returns up to 50 customers ordered by
  // COALESCE(last_order_at, created_at) DESC, so brand-new customers
  // also appear (the old query only showed people who had ordered).
  // We also surface the total count so the cashier knows when there
  // are more customers than the 50-row scroll panel can show, and to
  // type a name/phone to search the rest.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingRecents(true);
    void (async () => {
      try {
        const res = await fetchRecentCustomers();
        if (!cancelled) {
          setRecents(res.data ?? []);
          setRecentsTotal(res.total ?? null);
        }
      } catch {
        if (!cancelled) {
          setRecents([]);
          setRecentsTotal(null);
        }
      } finally {
        if (!cancelled) setLoadingRecents(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

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

  // ── Click-outside to collapse (inline only — sheet uses backdrop) ──
  useEffect(() => {
    if (!open || isSheet) return;
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
  }, [open, isSheet, phone, name, nameQuery]);

  // ── Focus management ───────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    if (mode === "phone") phoneRef.current?.focus();
    else nameRef.current?.focus();
  }, [open, mode]);

  // On phones the cart panel is height-capped — scroll the picker into
  // view when it opens so the numpad and Save button aren't clipped.
  // Sheet mode portals to body, so scrollIntoView is unnecessary.
  useEffect(() => {
    if (!open || isSheet) return;
    const id = window.requestAnimationFrame(() => {
      wrapRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(id);
  }, [open, isSheet]);

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
      <AttachedCustomerChip
        customer={customer}
        onDetach={onDetach}
        onUpdated={(updated) => onAttach(updated)}
      />
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
  const closePicker = () => { setOpen(false); reset(); };

  const panel = (
    <div
      ref={wrapRef}
      className={`pos-customer-picker pos-customer-picker-open${isSheet ? " pos-customer-picker-sheet" : ""}`}
      style={isSheet ? {
        background: "#FFFFFF",
        border: `1px solid ${C.border}`,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      } : {
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
        flexShrink: 0,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.text, letterSpacing: "0.02em" }}>
          {mode === "phone" ? "Customer phone" : "Search by name"}
        </div>
        <button
          onClick={closePicker}
          style={{
            background: "transparent", border: "none", color: C.muted,
            fontSize: 12, fontWeight: 600, cursor: "pointer",
            padding: "8px 12px", minHeight: 44,
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

      {/* Results / Recent customers / Create CTA
          Three modes share one scroll panel:
            • Query typed (≥2 chars) → live search results
            • No query yet → "Recent customers" list (cashier taps a
              regular without typing)
            • Phone looks valid but no match → "Save as new" CTA
       */}
      {(loading || loadingRecents || results.length > 0 || recents.length > 0 || showCreate || (query.length >= 2 && !loading)) && (
        <div
          className="pos-customer-picker-results"
          style={{
          borderTop: `1px solid ${C.border}`,
          background: C.bg,
          // Doubled from 260 → 420 so the 50-row customer list is
          // actually scrollable. Below 420 the list felt cramped and
          // cashiers were thumb-flicking past regulars.
          maxHeight: isSheet ? undefined : 420,
          flex: isSheet ? "1 1 auto" : undefined,
          minHeight: isSheet ? 0 : undefined,
          overflow: "auto",
        }}>
          {(loading || (loadingRecents && results.length === 0 && query.length < 2)) && (
            <div style={{ padding: 12, fontSize: 12, color: C.muted, textAlign: "center" }}>
              {loading ? "Searching…" : "Loading recent customers…"}
            </div>
          )}

          {!loading && results.length > 0 && (
            <SectionHeader label="Matches" />
          )}
          {!loading && results.map((c) => (
            <CustomerRow key={c.id} customer={c} onAttach={handleAttach} />
          ))}

          {/* Customer list — shown only when nothing is being searched,
              so we don't double-render rows that already appear in
              the live results. Header explicitly tells the cashier
              there may be more in the database so they know to type
              a name/phone instead of assuming this is everyone. */}
          {!loading && query.length < 2 && recents.length > 0 && (
            <>
              <SectionHeader
                label="Customers"
                hint={
                  recentsTotal != null && recentsTotal > recents.length
                    ? `Showing ${recents.length} of ${recentsTotal} — type to search`
                    : `${recents.length} total · tap to attach`
                }
              />
              {recents.map((c) => (
                <CustomerRow key={c.id} customer={c} onAttach={handleAttach} />
              ))}
            </>
          )}

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

          {!loading && !loadingRecents && query.length < 2 && recents.length === 0 && (
            <div style={{ padding: 12, fontSize: 12, color: C.muted, textAlign: "center" }}>
              No recent customers yet. Type a phone above to add one.
            </div>
          )}
        </div>
      )}

      {error && !showCreate && (
        <div style={{ padding: "8px 12px", fontSize: 12, color: C.danger, background: C.bg, flexShrink: 0 }}>
          {error}
        </div>
      )}
    </div>
  );

  if (isSheet) {
    return (
      <>
        <div
          style={{
            width: "100%",
            padding: "10px 12px",
            marginBottom: 10,
            borderRadius: 8,
            border: `1px dashed ${C.border2}`,
            background: C.bg,
            color: C.muted,
            fontSize: 13,
            fontWeight: 600,
            textAlign: "center",
            boxSizing: "border-box",
          }}
        >
          Selecting customer…
        </div>
        {typeof document !== "undefined" &&
          createPortal(
            <>
              <button
                type="button"
                className="pos-customer-picker-backdrop"
                aria-label="Close customer picker"
                onClick={closePicker}
              />
              {panel}
            </>,
            document.body,
          )}
      </>
    );
  }

  return panel;
}

// ── Attached chip with inline name edit ────────────────────────────────────
// Lets the cashier add a name (or fix a typo'd one) on a customer who was
// quick-attached by phone only. The phone is intentionally read-only here —
// editing the matching key from POS is dangerous (silent customer merges,
// broken SMS); admin handles that case via Admin → Customers.
function AttachedCustomerChip({
  customer, onDetach, onUpdated,
}: {
  customer: PosCustomer;
  onDetach: () => void;
  onUpdated: (c: PosCustomer) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(customer.name ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const startEdit = () => {
    setDraftName(customer.name ?? "");
    setError("");
    setEditing(true);
  };

  const saveName = async () => {
    const next = draftName.trim();
    if (next === (customer.name ?? "").trim()) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await updateCustomerFromPos(customer.id, { name: next || null });
      onUpdated(res.customer);
      setEditing(false);
    } catch (e) {
      setError((e as Error).message || "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  // No-name customer: surface the edit button prominently so the
  // cashier immediately sees "you can fix this" instead of having to
  // guess that tapping the chip is editable.
  const hasName = !!customer.name?.trim();

  return (
    <div
      style={{
        padding: "8px 10px",
        background: C.primarySoft,
        border: `1px solid ${C.primary}33`,
        borderRadius: 8,
        marginBottom: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
          {!editing ? (
            <>
              <div
                style={{
                  fontSize: 13, fontWeight: 700,
                  color: hasName ? C.text : C.muted,
                  fontStyle: hasName ? "normal" : "italic",
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
            </>
          ) : (
            <input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void saveName();
                if (e.key === "Escape") setEditing(false);
              }}
              placeholder="Customer name"
              autoFocus
              maxLength={120}
              disabled={saving}
              style={{
                width: "100%", padding: "8px 10px",
                borderRadius: 6, border: `1.5px solid ${C.primary}`,
                fontSize: 14, fontWeight: 600, color: C.text,
                background: "#FFFFFF", outline: "none",
                boxSizing: "border-box",
              }}
            />
          )}
        </div>

        {!editing ? (
          <>
            <button
              onClick={startEdit}
              aria-label={hasName ? "Edit customer name" : "Add customer name"}
              title={hasName ? "Edit name" : "Add name"}
              style={{
                background: hasName ? "transparent" : "#FFFFFF",
                border: hasName ? "none" : `1px solid ${C.primary}`,
                color: hasName ? C.muted : C.primary,
                fontSize: 12, fontWeight: 700,
                padding: "6px 10px", borderRadius: 6,
                cursor: "pointer", minHeight: 44,
              }}
            >
              {hasName ? "✎" : "+ Name"}
            </button>
            <button
              aria-label="Detach customer"
              onClick={onDetach}
              style={{
                background: "transparent", border: "none", color: C.muted,
                fontSize: 22, lineHeight: 1, cursor: "pointer",
                padding: "4px 8px", minWidth: 44, minHeight: 44,
              }}
            >
              ×
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => void saveName()}
              disabled={saving}
              style={{
                background: C.primary, color: "#FFFFFF",
                border: "none", fontSize: 12, fontWeight: 700,
                padding: "8px 12px", borderRadius: 6,
                cursor: saving ? "wait" : "pointer", minHeight: 44,
              }}
            >
              {saving ? "…" : "Save"}
            </button>
            <button
              onClick={() => { setEditing(false); setError(""); }}
              disabled={saving}
              style={{
                background: "transparent", border: "none", color: C.muted,
                fontSize: 12, fontWeight: 600,
                padding: "8px 10px", borderRadius: 6,
                cursor: "pointer", minHeight: 44,
              }}
            >
              Cancel
            </button>
          </>
        )}
      </div>

      {error && (
        <div style={{ marginTop: 6, fontSize: 11, color: C.danger }}>{error}</div>
      )}
    </div>
  );
}

// ── Row + section helpers ──────────────────────────────────────────────────
// Both the live search results and the recent-customers list render
// the same card layout, so we share one component to keep the visual
// language consistent and the parent JSX readable.

function SectionHeader({ label, hint }: { label: string; hint?: string }) {
  return (
    <div style={{
      padding: "8px 12px 4px", fontSize: 10, fontWeight: 700,
      color: C.muted, letterSpacing: "0.06em", textTransform: "uppercase",
      display: "flex", alignItems: "baseline", justifyContent: "space-between",
      gap: 8, background: C.bg, position: "sticky", top: 0, zIndex: 1,
    }}>
      <span>{label}</span>
      {hint && (
        <span style={{
          fontSize: 10, fontWeight: 500, color: C.subtle,
          letterSpacing: 0, textTransform: "none",
        }}>
          {hint}
        </span>
      )}
    </div>
  );
}

function CustomerRow({
  customer, onAttach,
}: {
  customer: PosCustomer;
  onAttach: (c: PosCustomer) => void;
}) {
  return (
    <button
      onClick={() => onAttach(customer)}
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
        {(customer.name ?? customer.phone ?? "?").slice(0, 1).toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14, fontWeight: 700, color: C.text,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {customer.name || "(no name)"}
        </div>
        <div style={{ fontSize: 12, color: C.muted }}>
          {customer.phone}
          {typeof customer.orders_count === "number" && customer.orders_count > 0 && (
            <span> · {customer.orders_count} order{customer.orders_count === 1 ? "" : "s"}</span>
          )}
        </div>
      </div>
    </button>
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
