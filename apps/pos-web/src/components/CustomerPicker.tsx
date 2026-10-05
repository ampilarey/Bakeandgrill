import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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
 * Redrawn 2026-10-05. Owner: "The way customers are added in pos is
 * difficult both in ipad and iPhone." The old picker opened inside the
 * cart: a phone box with its own numpad, a name box that appeared only
 * after digits, a separate "search by name" mode, and the regulars list
 * underneath all of that, below the fold on a phone.
 *
 * Now "Add customer" opens a page of its own (CustomerPickerPage): one box
 * for a name or a phone with the device's own keyboard, the regulars
 * listed before anything is typed, a chip row for regulars / today / all,
 * a dashed "save as new" row the moment a valid number has no match, and a
 * New customer button for the rest. On a phone it fills the screen; on a
 * tablet it covers everything but the ticket, whichever side the ticket
 * is on. The chip for an attached customer is unchanged.
 *
 * Phone stays the key: it is what unlocks SMS and loyalty. Name is
 * optional and can be added on the chip afterwards; quick-create never
 * overwrites a name a customer already has.
 */

type Props = {
  /** Currently attached customer (null when none). */
  customer: PosCustomer | null;
  onAttach: (customer: PosCustomer) => void;
  onDetach: () => void;
  /** Open straight away — the cashier just pressed "+ Add customer". */
  autoFocus?: boolean;
  /**
   * Half a row wide, beside the table picker: a short label and no margin
   * of its own, so the row that holds it owns the spacing.
   */
  compact?: boolean;
  /** Told when the picker opens or closes, so a compact row can give it
   *  the full width while it is open. */
  onOpenChange?: (open: boolean) => void;
  /** What the ticket comes to, shown under the page title ("3 items · MVR 26.00"). */
  ticketLine?: string;
};

const C = {
  text: "#0F172A",
  muted: "#64748B",
  subtle: "#94A3B8",
  border: "#E2E8F0",
  border2: "#CBD5E1",
  bg: "#F8FAFC",
  bgAlt: "#F1F5F9",
  primary: "#B74B0C",
  primaryDark: "#A1420B",
  primarySoft: "#FEF3E2",
  ok: "#10B981",
  danger: "#B91C1C",
};

function isValidPhone(s: string): boolean {
  return isValidMvMobile(s.trim());
}

export function CustomerPicker({ customer, onAttach, onDetach, autoFocus, compact, onOpenChange, ticketLine }: Props) {
  const [open, setOpenState] = useState<boolean>(autoFocus ?? false);
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;
  const setOpen = useCallback((next: boolean) => {
    setOpenState(next);
    onOpenChangeRef.current?.(next);
  }, []);

  // ── ATTACHED CHIP ──────────────────────────────────────────────────
  if (customer) {
    return (
      <AttachedCustomerChip
        customer={customer}
        onDetach={onDetach}
        onUpdated={(updated) => onAttach(updated)}
        compact={compact}
      />
    );
  }

  // ── EMPTY STATE ────────────────────────────────────────────────────
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 8,
          padding: "10px 12px",
          background: C.bg, border: `1px dashed ${C.border2}`,
          borderRadius: 8, fontSize: 13, fontWeight: 600,
          color: C.muted, cursor: "pointer", marginBottom: compact ? 0 : 10,
          minHeight: 44, boxSizing: "border-box",
          justifyContent: compact ? "center" : "flex-start",
          whiteSpace: "nowrap", overflow: "hidden",
        }}
      >
        <span aria-hidden="true" style={{ fontSize: 16 }}>＋</span>
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
          {compact ? "Customer" : "Add customer (phone / name)"}
        </span>
      </button>
    );
  }

  // ── THE PAGE ───────────────────────────────────────────────────────
  return (
    <>
      <div
        style={{
          width: "100%",
          padding: "10px 12px",
          marginBottom: compact ? 0 : 10,
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
        Choosing a customer…
      </div>
      {typeof document !== "undefined" && createPortal(
        <CustomerPickerPage
          ticketLine={ticketLine}
          onAttach={(c) => { onAttach(c); setOpen(false); }}
          onClose={() => setOpen(false)}
        />,
        document.body,
      )}
    </>
  );
}

// ── The page ───────────────────────────────────────────────────────────────

type Filter = "regulars" | "today" | "all";

function isToday(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

/** Digits only, so "778 1234" and "7781234" compare equal. */
function digitsOf(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

/**
 * Regulars: who to show before anything is typed. Most frequent first,
 * the most recent among equals, so the people who come every day are at
 * the top of the first screen.
 */
export function rankRegulars(customers: PosCustomer[]): PosCustomer[] {
  return [...customers].sort((a, b) => {
    const n = (b.orders_count ?? 0) - (a.orders_count ?? 0);
    if (n !== 0) return n;
    return (b.last_order_at ?? "").localeCompare(a.last_order_at ?? "");
  });
}

export function CustomerPickerPage({ ticketLine, onAttach, onClose }: {
  ticketLine?: string;
  onAttach: (c: PosCustomer) => void;
  onClose: () => void;
}) {
  const isNarrow = useMediaQuery("(max-width: 840px)");
  const [q, setQ] = useState("");
  // Numbers first: customers are looked up by phone far more often than
  // by name (owner, 2026-10-05). A phone gets its own keypad; a tablet
  // keeps the pad on screen beside the list; "abc" is for a name.
  const [numeric, setNumeric] = useState(true);
  const [filter, setFilter] = useState<Filter>("regulars");
  const [recents, setRecents] = useState<PosCustomer[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loadingRecents, setLoadingRecents] = useState(true);
  const [results, setResults] = useState<PosCustomer[]>([]);
  const [loading, setLoading] = useState(false);
  // The new-customer form: null while choosing, else the phone it opened with.
  const [creating, setCreating] = useState<{ phone: string } | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);

  // On a tablet the page leaves the ticket showing, whichever side the
  // cashier keeps it on; on a phone it is the whole screen.
  const [inset, setInset] = useState<{ left: number; right: number }>({ left: 0, right: 0 });
  useLayoutEffect(() => {
    if (isNarrow) { setInset({ left: 0, right: 0 }); return; }
    const cart = document.querySelector(".pos-cart");
    if (!cart) { setInset({ left: 0, right: 0 }); return; }
    const r = cart.getBoundingClientRect();
    const onLeft = r.left < window.innerWidth / 2;
    const w = Math.min(Math.max(0, r.width), window.innerWidth * 0.45);
    setInset(onLeft ? { left: r.left + w, right: 0 } : { left: 0, right: Math.max(0, window.innerWidth - r.right) + w });
  }, [isNarrow]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetchRecentCustomers();
        if (!cancelled) { setRecents(res.data ?? []); setTotal(res.total ?? null); }
      } catch {
        if (!cancelled) { setRecents([]); setTotal(null); }
      } finally {
        if (!cancelled) setLoadingRecents(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const query = q.trim();
  useEffect(() => {
    if (query.length < 2) { setResults([]); setLoading(false); return; }
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
    return () => { aborted = true; window.clearTimeout(handle); };
  }, [query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { if (creating) setCreating(null); else onClose(); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [creating, onClose]);

  useEffect(() => {
    if (creating) phoneRef.current?.focus();
    else inputRef.current?.focus();
  }, [creating]);

  /*
   * Switching between digits and letters. iPadOS only raises its keyboard
   * for a focus that happens inside the tap itself, and it ignores a
   * change to a field's inputmode while the field stays focused. So the
   * box's attributes are changed on the element and it is re-focused
   * synchronously here, before React re-renders (owner, 2026-10-05: "When
   * abc is clicked nothing happens"). On a tablet in number mode the box
   * asks for no keyboard at all; the pad beside the list types into it.
   */
  const switchKeyboard = (next: boolean) => {
    const el = inputRef.current;
    if (el) {
      el.setAttribute("type", next ? "tel" : "search");
      el.setAttribute("inputmode", next ? (isNarrow ? "tel" : "none") : "search");
      el.blur();
      el.focus();
    }
    setNumeric(next);
  };

  // iPad has no numbers-only keyboard, so digits there come from our own
  // pad, kept beside the list the whole time (owner: "keep the number
  // keypad one side and the customers with mobile number other side");
  // a phone has one, so it gets the device's keypad.
  const padOnScreen = !isNarrow;
  const typeDigit = (k: string, set: (fn: (p: string) => string) => void) => {
    setError("");
    if (k === "back") set((p) => p.slice(0, -1));
    else if (k === "clear") set(() => "");
    else set((p) => p + k);
  };

  const shown: PosCustomer[] = query.length >= 2
    ? results
    : filter === "regulars"
      ? rankRegulars(recents)
      : filter === "today"
        ? recents.filter((c) => isToday(c.last_order_at))
        : recents;

  const queryIsPhone = isValidPhone(query);
  const exactMatch = queryIsPhone && results.some((c) => digitsOf(c.phone).endsWith(digitsOf(query).slice(-7)));
  const offerSave = queryIsPhone && !loading && !exactMatch;

  const startCreate = (phone: string) => { setCreating({ phone }); setName(""); setError(""); };

  const save = async () => {
    const phone = (creating?.phone ?? "").trim();
    if (!isValidPhone(phone)) { setError("Enter a valid phone number (7 digits)."); return; }
    setSaving(true); setError("");
    try {
      const res = await quickCreateCustomer({ phone, name: name.trim() || undefined });
      onAttach(res.customer);
    } catch (e) {
      setError((e as Error).message || "Could not save the customer.");
    } finally {
      setSaving(false);
    }
  };

  const chip = (key: Filter, label: string) => (
    <button
      key={key}
      type="button"
      onClick={() => setFilter(key)}
      aria-pressed={filter === key}
      style={{
        padding: "8px 12px", borderRadius: 999, minHeight: 36,
        background: filter === key ? C.text : "#fff", color: filter === key ? "#fff" : "#334155",
        border: `1.5px solid ${filter === key ? C.text : C.border}`, fontSize: 13, fontWeight: 700, cursor: "pointer",
      }}
    >
      {label}
    </button>
  );

  const listHint = query.length >= 2
    ? (loading ? "searching…" : `${results.length} of ${total ?? "?"}`)
    : filter === "all" && total != null && total > recents.length
      ? `showing ${recents.length} of ${total} — type to search`
      : filter === "regulars" ? "most frequent first · tap to attach" : "tap to attach";

  return (
    <>
      <button type="button" className="pos-customer-picker-backdrop" aria-label="Close customer picker" onClick={onClose} />
      <div
        className="pos-customer-page"
        role="dialog"
        aria-modal="true"
        aria-label={creating ? "New customer" : "Customer"}
        style={{ left: inset.left, right: inset.right }}
        data-testid="customer-picker-page"
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#fff", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => (creating ? setCreating(null) : onClose())}
            aria-label={creating ? "Back to the customer list" : "Back to the ticket"}
            style={{ width: 44, height: 44, borderRadius: 12, background: C.bgAlt, border: "none", fontSize: 22, fontWeight: 800, cursor: "pointer", color: C.text }}
          >
            ‹
          </button>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 18, color: C.text }}>{creating ? "New customer" : "Customer"}</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
              {creating ? "Not on the list yet" : `For this ticket${ticketLine ? ` · ${ticketLine}` : ""}`}
            </div>
          </div>
        </div>

        {creating ? (
          <div style={{ padding: 14, display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 280px", background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
              <label htmlFor="customer-new-phone" style={{ display: "block", fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Phone</label>
              <div style={{ position: "relative" }}>
                <input
                  id="customer-new-phone"
                  ref={phoneRef}
                  value={creating.phone}
                  onChange={(e) => { setCreating({ phone: e.target.value.replace(/[^\d+\s-]/g, "") }); setError(""); }}
                  type="tel"
                  inputMode={isNarrow ? "tel" : "none"}
                  autoComplete="off"
                  placeholder="7123456"
                  style={{ width: "100%", height: 48, border: `1.5px solid ${isValidPhone(creating.phone) ? C.ok : C.border2}`, borderRadius: 10, padding: "0 12px", fontSize: 18, fontWeight: 700, letterSpacing: "0.04em", boxSizing: "border-box", outline: "none", color: C.text }}
                />
                {isValidPhone(creating.phone) && <span aria-hidden="true" style={{ position: "absolute", right: 12, top: 12, color: C.ok, fontWeight: 900 }}>✓</span>}
              </div>
              <label htmlFor="customer-new-name" style={{ display: "block", fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: "0.04em", margin: "12px 0 4px" }}>
                Name <span style={{ fontWeight: 500, textTransform: "none" }}>(optional, can add later)</span>
              </label>
              <input
                id="customer-new-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void save(); }}
                placeholder="e.g. Ahmed"
                autoComplete="off"
                maxLength={120}
                style={{ width: "100%", height: 48, border: `1.5px solid ${C.border2}`, borderRadius: 10, padding: "0 12px", fontSize: 16, fontWeight: 600, boxSizing: "border-box", outline: "none", color: C.text }}
              />
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving}
                style={{ width: "100%", height: 48, borderRadius: 12, background: saving ? C.subtle : C.primary, color: "#fff", border: "none", fontWeight: 800, fontSize: 15, marginTop: 12, cursor: saving ? "wait" : "pointer" }}
              >
                {saving ? "Saving…" : "Save and attach"}
              </button>
              {error && <div role="alert" style={{ marginTop: 8, fontSize: 12, color: C.danger }}>{error}</div>}
              <div style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>Saved to Customers. SMS and loyalty use this phone.</div>
            </div>
            {!isNarrow && (
              <div style={{ width: 230 }}>
                <Numpad onPress={(k) => typeDigit(k, (fn) => setCreating((c) => ({ phone: fn(c?.phone ?? "") })))} />
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flex: "1 1 auto", minHeight: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", flex: "1 1 auto", minWidth: 0, minHeight: 0, position: "relative" }}>
            {/* Search */}
            <div style={{ display: "flex", gap: 8, padding: "12px 14px 0", flexShrink: 0 }}>
              <div style={{ position: "relative", flex: 1 }}>
                <input
                  ref={inputRef}
                  value={q}
                  onChange={(e) => { setQ(e.target.value); setError(""); }}
                  type={numeric ? "tel" : "search"}
                  inputMode={numeric ? (padOnScreen ? "none" : "tel") : "search"}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="words"
                  spellCheck={false}
                  placeholder="Name or phone"
                  aria-label="Find a customer by name or phone"
                  style={{ width: "100%", height: 52, border: `2px solid ${queryIsPhone ? C.ok : C.primary}`, borderRadius: 12, padding: "0 14px", fontSize: 18, fontWeight: 600, boxSizing: "border-box", outline: "none", color: C.text, background: "#fff" }}
                />
                {queryIsPhone && <span aria-hidden="true" style={{ position: "absolute", right: 14, top: 14, color: C.ok, fontWeight: 900 }}>✓</span>}
              </div>
              <button
                type="button"
                onClick={() => switchKeyboard(!numeric)}
                aria-pressed={numeric}
                aria-label={numeric ? "Letters keyboard" : "Numbers keyboard"}
                style={{ width: 52, height: 52, border: `1.5px solid ${numeric ? C.primary : C.border2}`, borderRadius: 12, background: numeric ? C.primarySoft : "#fff", fontWeight: 800, fontSize: 13, color: numeric ? C.primaryDark : C.muted, cursor: "pointer" }}
              >
                {numeric ? "abc" : "123"}
              </button>
            </div>

            {query.length < 2 && (
              <div style={{ display: "flex", gap: 8, padding: "10px 14px 0", flexWrap: "wrap", flexShrink: 0 }} role="group" aria-label="Which customers to show">
                {chip("regulars", "Regulars")}
                {chip("today", "Today")}
                {chip("all", total != null ? `All ${total}` : "All")}
              </div>
            )}

            <div style={{ padding: "14px 14px 6px", fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", color: C.muted, textTransform: "uppercase", display: "flex", justifyContent: "space-between", gap: 8, flexShrink: 0 }}>
              <span>{query.length >= 2 ? "Matches" : filter === "regulars" ? "Regulars" : filter === "today" ? "Ordered today" : "All customers"}</span>
              <span style={{ fontWeight: 500, letterSpacing: 0, textTransform: "none", color: C.subtle }}>{listHint}</span>
            </div>

            {/* The list */}
            <div className="pos-customer-page-list" style={{ flex: "1 1 auto", minHeight: 0, overflow: "auto", padding: "0 14px 90px", WebkitOverflowScrolling: "touch" }} data-testid="customer-picker-list">
              {offerSave && (
                <button
                  type="button"
                  onClick={() => startCreate(query)}
                  data-testid="customer-picker-save-new"
                  style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", border: `2px dashed ${C.primary}`, background: "#FFF7ED", borderRadius: 12, padding: 12, marginBottom: 8, cursor: "pointer", minHeight: 64 }}
                >
                  <div style={{ width: 40, height: 40, borderRadius: "50%", background: C.primary, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 18, flexShrink: 0 }}>＋</div>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: C.text }}>Save {query} as a new customer</div>
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>One tap · the name can be added on the ticket afterwards</div>
                  </div>
                </button>
              )}
              {(loading || (loadingRecents && query.length < 2)) && (
                <div style={{ padding: 12, fontSize: 12, color: C.muted, textAlign: "center" }}>{loading ? "Searching…" : "Loading customers…"}</div>
              )}
              <div>
                {!loading && shown.map((c) => (
                  <CustomerRow key={c.id} customer={c} onAttach={onAttach} query={query} />
                ))}
              </div>
              {!loading && !loadingRecents && shown.length === 0 && !offerSave && (
                <div style={{ padding: 16, fontSize: 13, color: C.muted, textAlign: "center" }}>
                  {query.length >= 2
                    ? (/^[\d\s+-]+$/.test(query) ? "No customer with that number. Keep typing to 7 digits to save them." : `No customer named “${query}”. Use New customer to add them.`)
                    : filter === "today" ? "Nobody on the list has ordered today." : "No customers yet. Use New customer to add the first."}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => startCreate(queryIsPhone ? query : "")}
              data-testid="customer-picker-new"
              style={{ position: "absolute", right: 14, bottom: `calc(16px + env(safe-area-inset-bottom, 0px))`, height: 52, padding: "0 20px", borderRadius: 14, background: C.primary, color: "#fff", border: "none", fontWeight: 800, fontSize: 15, display: "flex", alignItems: "center", gap: 8, boxShadow: "0 6px 18px rgba(183,75,12,.35)", cursor: "pointer" }}
            >
              ＋ New customer
            </button>
          </div>

          {/* The pad, always there on a tablet: the list on one side, the
              digits on the other. Clear wipes the box. */}
          {padOnScreen && (
            <div style={{ width: 250, flexShrink: 0, padding: "12px 14px 12px 0", display: "flex", flexDirection: "column", gap: 8 }} data-testid="customer-picker-pad">
              <Numpad onPress={(k) => typeDigit(k, (fn) => setQ((p) => fn(p)))} />
              <button
                type="button"
                onClick={() => { setQ(""); setError(""); inputRef.current?.focus(); }}
                disabled={q === ""}
                style={{ height: 44, borderRadius: 10, border: `1px solid ${C.border2}`, background: "#fff", color: q === "" ? C.subtle : C.muted, fontWeight: 700, fontSize: 14, cursor: q === "" ? "default" : "pointer" }}
              >
                Clear
              </button>
            </div>
          )}
          </div>
        )}
      </div>
    </>
  );
}

// ── Attached chip with inline name edit ────────────────────────────────────
// Lets the cashier add a name (or fix a typo'd one) on a customer who was
// quick-attached by phone only. The phone is intentionally read-only here —
// editing the matching key from POS is dangerous (silent customer merges,
// broken SMS); admin handles that case via Admin → Customers.
function AttachedCustomerChip({
  customer, onDetach, onUpdated, compact,
}: {
  customer: PosCustomer;
  onDetach: () => void;
  onUpdated: (c: PosCustomer) => void;
  compact?: boolean;
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
        marginBottom: compact ? 0 : 10,
        boxSizing: "border-box",
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

function CustomerRow({
  customer, onAttach, query = "",
}: {
  customer: PosCustomer;
  onAttach: (c: PosCustomer) => void;
  query?: string;
}) {
  const today = isToday(customer.last_order_at);
  return (
    <button
      onClick={() => onAttach(customer)}
      className="pos-customer-page-row"
      style={{
        display: "flex", alignItems: "center", gap: 12,
        width: "100%", padding: 12, marginBottom: 8,
        background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12,
        cursor: "pointer", textAlign: "left",
        minHeight: 64, boxSizing: "border-box",
      }}
    >
      <div style={{
        width: 40, height: 40, borderRadius: "50%",
        background: C.primarySoft, color: C.primaryDark,
        border: `1px solid ${C.primary}33`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontWeight: 800, fontSize: 15, flexShrink: 0,
      }}>
        {(customer.name ?? customer.phone ?? "?").slice(0, 1).toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 15, fontWeight: 800, color: customer.name ? C.text : C.muted,
          fontStyle: customer.name ? "normal" : "italic",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {customer.name || "(no name)"}
        </div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          <Highlight text={customer.phone ?? "no phone"} query={query} />
          {typeof customer.orders_count === "number" && customer.orders_count > 0 && (
            <span> · {customer.orders_count} order{customer.orders_count === 1 ? "" : "s"}</span>
          )}
          {typeof customer.loyalty_points === "number" && customer.loyalty_points > 0 && <span> · {customer.loyalty_points} pts</span>}
        </div>
      </div>
      {today && (
        <span style={{ fontSize: 11, fontWeight: 700, color: "#0F766E", background: "#ECFDF5", border: "1px solid #A7F3D0", padding: "3px 8px", borderRadius: 999, whiteSpace: "nowrap", flexShrink: 0 }}>today</span>
      )}
    </button>
  );
}

/** The digits typed, marked inside a phone number so the match is visible. */
function Highlight({ text, query }: { text: string; query: string }) {
  const needle = digitsOf(query);
  if (needle.length < 2) return <span>{text}</span>;
  const i = text.indexOf(needle);
  if (i < 0) return <span>{text}</span>;
  return (
    <span>
      {text.slice(0, i)}
      <mark style={{ background: C.primarySoft, color: C.primaryDark, padding: "0 2px", borderRadius: 3 }}>{text.slice(i, i + needle.length)}</mark>
      {text.slice(i + needle.length)}
    </span>
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
