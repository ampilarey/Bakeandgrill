import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  cancelOrder,
  fetchActiveOrdersMine,
  fetchActiveOrdersVenueWide,
  fetchReceipts,
  fireOrderToKitchen,
  markOrderPickedUp,
  markOrderReady,
  mergeOpenTickets,
  sendBill,
  sendPayLink,
  splitOpenTicket,
} from "../api";
import { palette, radius, space, shadow, btnPrimary, btnSecondary, inputField, type, z } from "../theme";

export type OpenTicket = Awaited<ReturnType<typeof fetchReceipts>>["data"][number];

/**
 * Robust money display for a ticket.
 *
 * The backend `total` column drifts to 0 in several edge cases we've
 * had to firefight — orders created via legacy paths, orders saved
 * before `OrderTotalsCalculator` was wired into every code path, and
 * any future race where the order is created before items are
 * persisted. When that happens the cashier sees "MVR 0.00" on a
 * ticket that clearly has items, which destroys trust in the panel.
 *
 * Falls back to summing line-item `total_price` when the persisted
 * `total` is 0 or missing. Items are eager-loaded by the API so the
 * data is already on the row — no extra request, no flicker.
 *
 * Laravel's `decimal:2` cast returns money values as strings (e.g.
 * `"50.00"`), so every field has to go through `Number()` before any
 * arithmetic or `.toFixed()` call to avoid `NaN` (Bug-053 / Bug-055).
 */
export function ticketDisplayTotal(t: OpenTicket): number {
  const stored = Number(t.total ?? 0);
  if (stored > 0) return stored;
  const items = t.items ?? [];
  const summed = items.reduce(
    (sum, it) => sum + Number(it.total_price ?? 0),
    0,
  );
  return summed > 0 ? summed : stored;
}

type Props = {
  /** Hide the destructive Void chip for cashiers without the
   *  orders.void permission. The backend also enforces this (403) but
   *  hiding the button avoids dead-tap UX. */
  canVoidOrders?: boolean;
  onResume: (ticket: OpenTicket) => void;
  onClose: () => void;
  /** Phone of the currently-attached cart customer, if any — used to
   *  prefill the "Send Bill" prompt so cashiers don't retype the same
   *  number they already entered in the cart. */
  cartCustomerPhone?: string | null;
};

/**
 * "Active orders" panel — every in-flight ticket the cashier still has
 * work to do on, organised by lifecycle stage with stage-appropriate
 * actions:
 *
 *   📋 PARKED   held tickets the kitchen has not seen
 *               actions: Fire to kitchen / Resume / Send pay link
 *
 *   🍳 COOKING  fired but not yet ready (pending / in_progress)
 *               actions: Mark ready / Charge (if unpaid) / Pay link
 *
 *   ✅ READY    kitchen says it's done; waiting for the customer
 *               actions: Picked up (if paid) / Charge (if unpaid)
 *
 * Lifecycle is decoupled from payment — a ticket can be PAID at any
 * stage and a ticket can be picked up only when PAID. This solves
 * the old gap where charging a pickup order made it vanish from POS
 * even though the kitchen was still cooking; now the same ticket
 * stays visible with a "🍳 COOKING + PAID" badge until the cashier
 * marks it picked up.
 */
export function OpenTicketsPanel({
  canVoidOrders = true,
  onResume,
  onClose,
  cartCustomerPhone,
}: Props) {
  const [tickets, setTickets] = useState<OpenTicket[]>([]);
  /** Server total for the current list scope (may exceed loaded rows). */
  const [activeTotal, setActiveTotal] = useState(0);
  // Default all-staff so the list matches the sales-page badge. Cashiers
  // can narrow to tickets they created via the scope chips.
  const [listScope, setListScope] = useState<"all" | "mine">("all");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  // Per-row "action in progress" indicator (sendBill is the only async
  // per-row action that matters — Print just opens a tab).
  const [busyId, setBusyId] = useState<number | null>(null);
  const [rowMsg, setRowMsg] = useState<{ id: number; text: string; kind: "ok" | "err" } | null>(null);
  // Bug-029: auto-clear the per-row success/error message after a
  // sensible delay so the green/red strip doesn't sit on the row
  // forever. Errors get the longer 10s fuse to match the global
  // status banner (Bug-015) — cashier needs time to read + retry.
  // Successes get 6s. Timer is reset on every new rowMsg, so a
  // rapid sequence of taps doesn't accumulate stale timers.
  useEffect(() => {
    if (!rowMsg) return;
    const ms = rowMsg.kind === "err" ? 10000 : 6000;
    const handle = window.setTimeout(() => setRowMsg(null), ms);
    return () => window.clearTimeout(handle);
  }, [rowMsg]);
  // Modal state for asking the cashier for a phone number when sending
  // a bill SMS for a ticket that has no linked customer. Replaces the
  // native window.prompt which was fragile, off-brand, and unusable
  // on iPad in PWA fullscreen mode.
  const [phonePrompt, setPhonePrompt] = useState<{ ticket: OpenTicket; phone: string } | null>(null);

  // Void / cancel modal — explicit two-step destructive flow.
  // Cashier hits the red 🗑️ Void chip on a row, this modal opens
  // and demands a reason before enabling Confirm. Required because:
  //   - Voids return stock to inventory (irreversible without a manual
  //     stock adjustment)
  //   - Voids release loyalty / promo / gift-card holds
  //   - A high void rate is a leakage indicator, so every void needs
  //     a written note for the manager review
  //
  // Backend refuses paid / completed / refunded — UI hides the button
  // for those states too, but the server is the source of truth.
  const [voidPrompt, setVoidPrompt] = useState<{ ticket: OpenTicket; reason: string } | null>(null);
  const [voidBusy, setVoidBusy] = useState(false);

  // ── Filter state ──────────────────────────────────────────────
  // Single-select chip filter — at any moment exactly ONE chip is
  // highlighted (or [All] when nothing is filtered). Stacking
  // filters AND'd together (Ready AND Pickup AND Paid) produced
  // empty results in the wild because no single ticket matches
  // every dimension at once, which looked broken. One filter at a
  // time matches how Loyverse / Square / Toast handle these top-
  // level chip bars and is impossible to misinterpret.
  //
  // Filter is namespaced: "stage:ready", "type:dine_in",
  // "payment:paid", or "all". Keeping it as one string makes the
  // toggle logic trivial and prevents the old multi-state bug.
  type FilterKey =
    | "all"
    | "stage:cooking" | "stage:ready" | "stage:parked"
    | "type:dine_in" | "type:takeaway" | "type:online_pickup" | "type:delivery"
    | "payment:paid" | "payment:unpaid";
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
  // Search bar is a separate dimension — it narrows whatever chip
  // bucket is currently active, so a cashier can do
  // "show Pickup tickets matching 'aisha'". Hidden by default.
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");

  // ── Merge / split state ────────────────────────────────────────
  // Two-tap-plus-confirm merge flow:
  //   1. tap 🔀 Merge on a row  → mergeTargetId set, picker mode
  //   2. tap any other row      → mergeConfirm set, confirmation modal
  //   3. tap "Confirm merge"    → backend merge + reload
  // Step 2 used to fire the merge immediately. Cashiers hit it by
  // accident (any tap on any row consolidated two tickets — easy to
  // undo only by re-splitting). Confirmation modal prevents the slip.
  const [mergeTargetId, setMergeTargetId] = useState<number | null>(null);
  const [mergeConfirm, setMergeConfirm] = useState<{ target: OpenTicket; source: OpenTicket } | null>(null);
  const [mergeBusy, setMergeBusy] = useState(false);
  // Split picker is a modal — choose which items from a single
  // ticket to peel off into a sibling.
  const [splitFor, setSplitFor] = useState<OpenTicket | null>(null);

  /**
   * Auto-refresh interval (ms) for the Open Tickets list. 15s is the
   * sweet spot between "cashier sees state changes promptly" (kitchen
   * marks ready, BML pay-link redeemed, etc.) and "we don't hammer
   * the backend during a quiet hour". Pauses while the tab is hidden
   * — no point polling a backgrounded PWA — and refreshes immediately
   * on tab focus so a cashier who switches away and back gets a
   * fresh list before they tap anything.
   */
  const POLL_MS = 15_000;

  const loadActiveOrders = useCallback(async () => {
    if (listScope === "mine") {
      return fetchActiveOrdersMine();
    }
    return fetchActiveOrdersVenueWide();
  }, [listScope]);

  useEffect(() => {
    let cancelled = false;

    const reload = async (showSpinner: boolean) => {
      if (cancelled) return;
      try {
        if (showSpinner) setLoading(true);
        const { data, total } = await loadActiveOrders();
        if (!cancelled) {
          setTickets(data);
          setActiveTotal(total);
          setErr("");
        }
      } catch (e) {
        // Soft-fail subsequent polls — we don't want a momentary
        // network blip to wipe the list the cashier is looking at.
        // Only the initial load surfaces the error.
        if (!cancelled && showSpinner) setErr((e as Error).message);
      } finally {
        if (!cancelled && showSpinner) setLoading(false);
      }
    };

    void reload(true);

    const interval = window.setInterval(() => {
      // Skip polls while the tab is hidden — saves battery and
      // avoids piling up requests that would all execute when the
      // tab returns to foreground.
      if (document.visibilityState === "visible") void reload(false);
    }, POLL_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") void reload(false);
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loadActiveOrders]);

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
      setRowMsg({ id: t.id, kind: "ok", text: `Pay link sent (MVR ${Number(res.amount).toFixed(2)}) to ${res.sent_to}` });
    } catch (e) {
      setRowMsg({ id: t.id, kind: "err", text: (e as Error).message || "Couldn't send pay link" });
    } finally {
      setBusyId(null);
    }
  };

  /**
   * Cashier hits "Mark ready" — flips the order to status=ready, which
   * fires the existing "Ready for pickup!" SMS chain. Used in
   * cashier-only setups (no KDS terminal in the kitchen) so the
   * lifecycle SMS still goes out. Idempotent — if the order is already
   * ready (e.g. KDS bumped it first), the backend returns
   * {unchanged: true} and we silently skip the success toast.
   */
  const handleMarkReady = async (t: OpenTicket) => {
    setBusyId(t.id);
    setRowMsg(null);
    try {
      const res = await markOrderReady(t.id);
      patchTicket(t.id, { status: res.order.status });
      if (!res.unchanged) {
        setRowMsg({ id: t.id, kind: "ok", text: "Marked ready — customer notified." });
      }
    } catch (e) {
      setRowMsg({ id: t.id, kind: "err", text: (e as Error).message || "Couldn't mark ready" });
    } finally {
      setBusyId(null);
    }
  };

  /**
   * Cashier hits "Picked up" — flips the order to status=completed,
   * which removes it from the Active orders feed and fires
   * OrderCompleted (loyalty award, webhook notify, etc.). Backend
   * guards against unpaid orders, so the action is hidden from the
   * row when the ticket still owes a balance.
   */
  /**
   * Cashier voids an open ticket — opens the reason modal first,
   * then on Confirm calls `cancelOrder()` which atomically:
   *   - flips status → cancelled
   *   - returns POS-deducted stock to the shelves
   *   - releases promo / loyalty / gift-card holds
   *   - frees the dine-in table
   *   - audit-logs the cashier + reason
   *
   * Optimistically removes the ticket from the panel on success so
   * the cashier sees instant feedback (active_only filter would
   * exclude it on the next poll anyway). Errors fall through to the
   * row banner — common server-side rejection is "Order is paid —
   * issue a refund instead", and the cashier needs to see that.
   */
  const handleConfirmVoid = async () => {
    if (!voidPrompt) return;
    const t = voidPrompt.ticket;
    const reason = voidPrompt.reason.trim();
    if (reason.length === 0) return;

    setVoidBusy(true);
    try {
      await cancelOrder(t.id, reason);
      setTickets((curr) => curr.filter((row) => row.id !== t.id));
      setVoidPrompt(null);
      setRowMsg({ id: t.id, kind: "ok", text: `Ticket voided — ${reason}` });
    } catch (e) {
      setRowMsg({ id: t.id, kind: "err", text: (e as Error).message || "Couldn't void ticket" });
      setVoidPrompt(null);
    } finally {
      setVoidBusy(false);
    }
  };

  const handleMarkPickedUp = async (t: OpenTicket) => {
    setBusyId(t.id);
    setRowMsg(null);
    try {
      const res = await markOrderPickedUp(t.id);
      // Optimistic: drop from the list. A poll cycle would do it
      // anyway, but this avoids the half-second of "wait, did it
      // work?" between the tap and the next refresh.
      setTickets((curr) => curr.filter((row) => row.id !== t.id));
      if (res.unchanged) {
        // Already completed — no need to toast, just disappeared.
      }
    } catch (e) {
      setRowMsg({ id: t.id, kind: "err", text: (e as Error).message || "Couldn't mark picked up" });
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
      // Bug-047: when the cashier has popups blocked for the POS
      // (default on iPad Safari for any not-yet-trusted host),
      // `window.open` silently returns null and the cashier
      // assumes the print succeeded. Detect the null and surface
      // a clear "allow popups" message — and copy the link to the
      // clipboard as a fallback so they can paste it into a new
      // tab to print.
      const win = window.open(url, "_blank", "noopener,noreferrer");
      if (!win) {
        try { await navigator.clipboard.writeText(url); } catch { /* permissions */ }
        setRowMsg({
          id: t.id,
          kind: "err",
          text: "Print blocked by browser popup-blocker. Allow popups for the POS, or paste the copied link into a new tab.",
        });
      }
    } catch (e) {
      setRowMsg({ id: t.id, kind: "err", text: (e as Error).message || "Failed to open invoice" });
    } finally {
      setBusyId(null);
    }
  };

  /**
   * Merge flow — two-tap interaction. First tap picks the TARGET
   * (cashier explicitly chooses the survivor); panel header switches
   * to "select source to merge in". Second tap on any other row
   * runs the backend merge — items move, source is cancelled, both
   * rows reflect new state.
   */
  const handleStartMerge = (target: OpenTicket) => {
    setMergeTargetId(target.id);
    setRowMsg(null);
  };

  const handleCancelMerge = () => {
    setMergeTargetId(null);
    setMergeConfirm(null);
  };

  /**
   * Step 2 — cashier picked the source. Open the confirm modal
   * showing both tickets side-by-side so they can sanity-check
   * (matches the table-merge UX in admin which also confirms
   * before consolidating an active table's bill).
   */
  const handlePickMergeSource = (source: OpenTicket) => {
    if (mergeTargetId === null || source.id === mergeTargetId) {
      setMergeTargetId(null);
      return;
    }
    const target = tickets.find((t) => t.id === mergeTargetId);
    if (!target) {
      setMergeTargetId(null);
      return;
    }
    setMergeConfirm({ target, source });
  };

  /**
   * Step 3 — confirmation accepted. Runs the backend merge then
   * reloads the full ticket list so the TARGET row reflects its new
   * total/item-count (items moved over, totals recalculated by
   * OrderTotalsCalculator). Local optimistic patching is too
   * error-prone here: we'd need to recompute taxes/discounts/etc.
   * client-side and that drifts from the server source of truth.
   */
  const handleConfirmMerge = async () => {
    if (!mergeConfirm) return;
    const { target, source } = mergeConfirm;
    setMergeBusy(true);
    setRowMsg(null);
    try {
      await mergeOpenTickets(target.id, { source_id: source.id });
      // Full reload — pulls the updated target (new total + items)
      // and reflects the cancelled source falling out of the
      // active feed in one round-trip.
      const fresh = await loadActiveOrders();
      setTickets(fresh.data);
      setActiveTotal(fresh.total);
      setMergeTargetId(null);
      setMergeConfirm(null);
      setRowMsg({
        id: target.id,
        kind: "ok",
        text: `Merged ${source.order_number} into ${target.order_number}.`,
      });
    } catch (e) {
      setRowMsg({ id: source.id, kind: "err", text: (e as Error).message || "Couldn't merge" });
      // Leave the confirm modal open so the cashier can retry or
      // cancel cleanly — auto-dismissing it would lose context on
      // what just failed.
    } finally {
      setMergeBusy(false);
    }
  };

  const handleSplitConfirm = async (sourceId: number, itemIds: number[]) => {
    setBusyId(sourceId);
    setRowMsg(null);
    try {
      const res = await splitOpenTicket(sourceId, { item_ids: itemIds });
      setSplitFor(null);
      setRowMsg({
        id: sourceId,
        kind: "ok",
        text: `Split into order #${res.split.id} (MVR ${Number(res.split.total).toFixed(2)})`,
      });
      // Force reload to pull both the slimmed source AND the new
      // sibling ticket. Optimistic patch is awkward here (we don't
      // have the full row shape for the brand-new order locally).
      const fresh = await loadActiveOrders();
      setTickets(fresh.data);
      setActiveTotal(fresh.total);
    } catch (e) {
      setRowMsg({ id: sourceId, kind: "err", text: (e as Error).message || "Couldn't split" });
    } finally {
      setBusyId(null);
    }
  };

  // ── Derived: filtered ticket list ─────────────────────────────
  // ONE chip-filter at a time + an optional search. Stage of each
  // ticket maps to: held → parked, ready → ready, else → cooking.
  // Search is plain client-side .includes() across the obvious POS
  // identifiers — orders are <50 rows so server-side search would
  // be overkill. Table name + location are searched so the cashier
  // can type "T4" or "Patio".
  const filteredTickets = useMemo(() => {
    const stageOf = (status: string | null | undefined): "parked" | "cooking" | "ready" => {
      if (status === "held") return "parked";
      if (status === "ready") return "ready";
      return "cooking";
    };
    const q = search.trim().toLowerCase();
    return tickets.filter((t) => {
      if (activeFilter === "all") {
        // no chip-level filter
      } else if (activeFilter.startsWith("stage:")) {
        const want = activeFilter.slice(6) as "cooking" | "ready" | "parked";
        if (stageOf(t.status) !== want) return false;
      } else if (activeFilter.startsWith("type:")) {
        const want = activeFilter.slice(5);
        if (t.type !== want) return false;
      } else if (activeFilter === "payment:paid") {
        if (t.payment_status !== "paid") return false;
      } else if (activeFilter === "payment:unpaid") {
        if (t.payment_status === "paid") return false;
      }
      if (q.length > 0) {
        const tableHay = t.table
          ? `${t.table.name ?? ""} ${t.table.location ?? ""}`
          : "";
        const haystack = [
          t.order_number,
          t.ticket_name ?? "",
          t.ticket_note ?? "",
          t.customer?.name ?? "",
          t.customer?.phone ?? "",
          tableHay,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [tickets, activeFilter, search]);

  // Bug-028: chip badges must respect the SEARCH box (but NOT the
  // currently-active chip — switching chips is the whole point, so
  // we still want to see how many tickets sit in the *other*
  // buckets). Pre-filter on search-only and tally the buckets from
  // there. When search is empty this collapses back to the previous
  // "show total per bucket" behaviour, matching Loyverse.
  const searchScopedTickets = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tickets;
    return tickets.filter((t) => {
      const tableHay = t.table
        ? `${t.table.name ?? ""} ${t.table.location ?? ""}`
        : "";
      const haystack = [
        t.order_number,
        t.ticket_name ?? "",
        t.ticket_note ?? "",
        t.customer?.name ?? "",
        t.customer?.phone ?? "",
        tableHay,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [tickets, search]);

  const allCount = search.trim() ? searchScopedTickets.length : activeTotal;

  const paymentCounts = useMemo(() => {
    let paid = 0;
    let unpaid = 0;
    searchScopedTickets.forEach((t) => {
      if (t.payment_status === "paid") paid++;
      else unpaid++;
    });
    return { paid, unpaid };
  }, [searchScopedTickets]);

  const typeCounts = useMemo(() => {
    const counts = { dine_in: 0, takeaway: 0, online_pickup: 0, delivery: 0 };
    searchScopedTickets.forEach((t) => {
      if (t.type === "dine_in") counts.dine_in++;
      else if (t.type === "takeaway") counts.takeaway++;
      else if (t.type === "online_pickup") counts.online_pickup++;
      else if (t.type === "delivery") counts.delivery++;
    });
    return counts;
  }, [searchScopedTickets]);

  const stageCounts = useMemo(() => {
    const counts = { parked: 0, cooking: 0, ready: 0 };
    searchScopedTickets.forEach((t) => {
      if (t.status === "held") counts.parked++;
      else if (t.status === "ready") counts.ready++;
      else counts.cooking++;
    });
    return counts;
  }, [searchScopedTickets]);

  return (
    <PanelShell
      title={mergeTargetId !== null ? "Merge tickets — pick source" : "Active orders"}
      subtitle={
        mergeTargetId !== null
          ? `Tap any other ticket to preview the merge (you'll confirm before anything changes)`
          : listScope === "all"
            ? "All staff — parked, cooking, and ready-for-pickup"
            : "My tickets — ones I created on this shift"
      }
      onClose={onClose}
    >
      {/* ── Merge mode banner ───────────────────────────────────── */}
      {mergeTargetId !== null && (
        <div
          style={{
            padding: space.s + 2,
            marginBottom: space.s,
            borderRadius: radius.m,
            background: "#EFF6FF",
            border: "1px solid #BFDBFE",
            color: "#1E3A8A",
            fontSize: type.bodySm.fontSize,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: space.s,
          }}
        >
          <span style={{ fontWeight: 600 }}>🔀 Pick source for #{mergeTargetId} — you'll confirm before items move</span>
          <button
            onClick={handleCancelMerge}
            style={{
              padding: "4px 10px",
              borderRadius: 6,
              background: "#fff",
              border: "1px solid #93C5FD",
              color: "#1E40AF",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {mergeTargetId === null && (
        <div
          style={{
            marginBottom: space.s,
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexWrap: "wrap",
          }}
        >
          <ScopeChip
            active={listScope === "all"}
            onClick={() => {
              setListScope("all");
              setActiveFilter("all");
            }}
          >
            👥 All staff
          </ScopeChip>
          <ScopeChip
            active={listScope === "mine"}
            onClick={() => {
              setListScope("mine");
              setActiveFilter("all");
            }}
          >
            👤 Mine
          </ScopeChip>
        </div>
      )}

      {/* ── Filter bar ────────────────────────────────────────
            SINGLE-SELECT chip filter. At any moment exactly one
            chip is lit (or [All] when no filter is on). Tap any
            chip to switch the view to just that bucket. This is
            how Loyverse / Square / Toast handle their top-level
            order list filters — it prevents the "Ready + Pickup
            + Paid = No matches" problem you get with AND-stacked
            chips. Search narrows whatever bucket is currently
            selected.

            Dividers separate the four chip families visually
            (stage / type / payment) without implying that you
            can combine chips across them. */}
      <div
        style={{
          marginBottom: space.m,
          padding: space.s,
          background: "#F8FAFC",
          borderRadius: radius.m,
          border: `1px solid ${palette.border}`,
          display: "flex",
          alignItems: "center",
          gap: 6,
          flexWrap: "wrap",
        }}
      >
        <FilterGroup
          activeColor="#0F172A"
          options={[{ key: "all", label: "All", count: allCount }]}
          selected={activeFilter}
          onSelect={() => setActiveFilter("all")}
        />

        <Divider />

        {/* Stage — dark fill when active. */}
        <FilterGroup
          activeColor="#0F172A"
          options={[
            { key: "stage:cooking", label: "🍳 Cooking", count: stageCounts.cooking },
            { key: "stage:ready", label: "✅ Ready", count: stageCounts.ready },
            { key: "stage:parked", label: "📋 Parked", count: stageCounts.parked },
          ]}
          selected={activeFilter}
          onSelect={(k) => setActiveFilter(k as FilterKey)}
        />

        <Divider />

        {/* Type — blue when active. */}
        <FilterGroup
          activeColor="#1D4ED8"
          options={[
            { key: "type:dine_in", label: "🍽 Dine-in", count: typeCounts.dine_in },
            { key: "type:takeaway", label: "🥡 Takeaway", count: typeCounts.takeaway },
            { key: "type:online_pickup", label: "📦 Pickup", count: typeCounts.online_pickup },
            { key: "type:delivery", label: "🚗 Delivery", count: typeCounts.delivery },
          ]}
          selected={activeFilter}
          onSelect={(k) => setActiveFilter(k as FilterKey)}
        />

        <Divider />

        {/* Payment — green for paid, red for unpaid. */}
        <FilterGroup
          options={[
            { key: "payment:paid", label: "💳 Paid", count: paymentCounts.paid, activeColor: "#15803D" },
            { key: "payment:unpaid", label: "UNPAID", count: paymentCounts.unpaid, activeColor: "#B91C1C" },
          ]}
          selected={activeFilter}
          onSelect={(k) => setActiveFilter(k as FilterKey)}
        />

        {/* Spacer — pushes the search toggle to the right edge on
            wide rows. Collapses gracefully when chips wrap. */}
        <div style={{ flex: 1, minWidth: 8 }} />

        {/* Search toggle — reveals a slim search input on the
            second line. Closing also clears the search text so
            it can't quietly keep filtering. */}
        <button
          onClick={() => {
            setSearchOpen((v) => {
              const next = !v;
              if (!next) setSearch("");
              return next;
            });
          }}
          title="Search by name, phone, table, or order #"
          style={{
            padding: "6px 10px",
            borderRadius: 999,
            border: `1px solid ${searchOpen || search ? "#0F172A" : palette.border}`,
            background: searchOpen || search ? "#0F172A" : "#fff",
            color: searchOpen || search ? "#fff" : palette.panelInk,
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            whiteSpace: "nowrap",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          🔍 Search
        </button>

        {/* ── Search input (collapsible) ──────────────────────
              Sits on its own line below the chips when expanded.
              The full-width 100% basis + flex-wrap forces it onto
              the next visual row regardless of how the chips
              above wrapped. */}
        {searchOpen && (
          <div style={{ flexBasis: "100%", marginTop: 6 }}>
            <input
              type="search"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, phone, table, order # or ticket note…"
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: radius.m,
                border: `1px solid ${palette.border}`,
                background: "#fff",
                color: palette.panelInk,
                fontSize: 13,
                fontWeight: 500,
                outline: "none",
              }}
            />
          </div>
        )}
      </div>

      {loading && <p style={{ color: palette.panelMuted, fontSize: type.bodySm.fontSize }}>Loading…</p>}
      {err && <p style={{ color: palette.dangerDark, fontSize: type.bodySm.fontSize }}>{err}</p>}
      {!loading && tickets.length === 0 && (
        <EmptyState
          emoji="🎫"
          title="No active orders"
          body="Parked, cooking, and ready-for-pickup tickets will show up here."
        />
      )}
      {!loading && tickets.length > 0 && filteredTickets.length === 0 && (
        <EmptyState
          emoji="🔍"
          title="No matches"
          body="Tap [All] to see every active ticket, or change your search."
        />
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: space.s }}>
        {filteredTickets.map((t) => {
          const busy = busyId === t.id;
          const msg = rowMsg?.id === t.id ? rowMsg : null;

          // Stage derivation — single source of truth for which
          // badge + action buttons to render. Decoupled from
          // payment so a paid ticket can still be 'cooking', and
          // an unpaid ticket can still be 'ready'.
          //   parked   → held (kitchen hasn't seen it)
          //   cooking  → pending / in_progress / paid + fired
          //   ready    → kitchen says it's done
          // Anything else (completed, cancelled, refunded) should
          // not arrive here because active_only filters them out.
          let stage: "parked" | "cooking" | "ready";
          if (t.status === "held") stage = "parked";
          else if (t.status === "ready") stage = "ready";
          else stage = "cooking";

          const isPaid = t.payment_status === "paid";
          const isUnpaid = t.payment_status === "unpaid" || t.payment_status === "partial";
          const hasPhone = !!t.customer?.phone;

          // Stage badge config — colours and labels match the
          // mental model: red(parked/unpaid) → amber(cooking) →
          // green(ready) → grey(done). Cashier scans down the list
          // for whatever's most urgent.
          const stageBadge = {
            parked: { label: "📋 PARKED", color: "#475569", bg: "#F1F5F9", border: "#CBD5E1", title: "Kitchen has not seen this yet" },
            cooking: { label: "🍳 COOKING", color: "#A16207", bg: "#FEFCE8", border: "#FDE68A", title: "Kitchen is preparing this" },
            ready: { label: "✅ READY", color: "#047857", bg: "#ECFDF5", border: "#A7F3D0", title: "Ready for the customer to collect" },
          }[stage];

          // In merge mode every row that isn't the target is a
          // candidate source. The target highlights blue and shows
          // a hint instead of buttons.
          const isMergeTarget = mergeTargetId === t.id;
          const isMergeCandidate = mergeTargetId !== null && !isMergeTarget;

          // Bug-054: the whole card is the "open ticket to edit"
          // hit target now. Previously only the header strip (title +
          // badges + total) carried the onResume handler, so a tap
          // anywhere in the bottom half of the card — between action
          // buttons, on the items-count text, or on the customer-name
          // sub-line — did nothing. Cashiers reported "I had to tap
          // twice to open it." Every per-row action button already
          // calls e.stopPropagation() so promoting the handler to the
          // outer card doesn't accidentally fire them. Keyboard
          // (Enter / Space) and aria roles move up too so screen
          // readers see one consistent button-shaped target instead
          // of a nested one.
          const cardClickHandler = mergeTargetId === null
            ? () => onResume(t)
            : isMergeCandidate
              ? () => handlePickMergeSource(t)
              : undefined;
          return (
            <div
              key={t.id}
              role={cardClickHandler ? "button" : undefined}
              tabIndex={cardClickHandler ? 0 : undefined}
              onKeyDown={cardClickHandler ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  cardClickHandler();
                }
              } : undefined}
              title={mergeTargetId === null
                ? "Open ticket in main POS to add/remove items, charge, etc."
                : undefined}
              style={{
                padding: space.m,
                borderRadius: radius.l,
                background: isMergeTarget ? "#EFF6FF" : palette.panel,
                border: `1px solid ${isMergeTarget ? "#93C5FD" : palette.border}`,
                display: "flex",
                flexDirection: "column",
                gap: space.s,
                cursor: cardClickHandler ? "pointer" : "default",
              }}
              onClick={cardClickHandler}
            >
              <div
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: space.m }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 700, fontSize: type.body.fontSize, color: palette.panelInk }}>
                      {t.ticket_name || `Order ${t.order_number}`}
                    </div>
                    <span
                      title={stageBadge.title}
                      style={{
                        fontSize: 11, fontWeight: 800, letterSpacing: 0.4,
                        color: stageBadge.color, background: stageBadge.bg,
                        padding: "2px 6px", borderRadius: 4,
                        border: `1px solid ${stageBadge.border}`,
                      }}
                    >
                      {stageBadge.label}
                    </span>
                    {isPaid && (
                      <span
                        title="Customer has paid"
                        style={{
                          fontSize: 11, fontWeight: 800, letterSpacing: 0.4,
                          color: "#1E40AF", background: "#EFF6FF",
                          padding: "2px 6px", borderRadius: 4,
                          border: "1px solid #BFDBFE",
                        }}
                      >
                        💳 PAID
                      </span>
                    )}
                    {isUnpaid && (
                      <span
                        title="Customer has not paid yet"
                        style={{
                          fontSize: 11, fontWeight: 800, letterSpacing: 0.4,
                          color: "#B91C1C", background: "#FEF2F2",
                          padding: "2px 6px", borderRadius: 4,
                          border: "1px solid #FECACA",
                        }}
                      >
                        {t.payment_status === "partial" ? "PARTIAL" : "UNPAID"}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: type.caption.fontSize, color: palette.panelMuted, marginTop: 2 }}>
                    {(t.items?.length ?? 0)} items
                    {t.user?.name ? ` · by ${t.user.name}` : ""}
                    {t.ticket_note ? ` · ${t.ticket_note}` : ""}
                    {t.customer?.name ? ` · ${t.customer.name}` : ""}
                    {t.customer?.phone ? ` · ${t.customer.phone}` : ""}
                  </div>
                </div>
                <div style={{ fontWeight: 800, fontSize: type.subtitle.fontSize, color: palette.panelInk, whiteSpace: "nowrap" }}>
                  MVR {ticketDisplayTotal(t).toFixed(2)}
                </div>
              </div>

              <div style={{ display: "flex", gap: space.xs, flexWrap: "wrap" }}>
                {/*
                  ── Stage-appropriate primary action ──────────────
                  parked            → 🍳 Fire to kitchen
                  cooking + paid    → ✅ Mark ready
                  cooking + unpaid  → ✅ Mark ready (cashier can mark
                                       ready before payment — common
                                       when customer is at counter
                                       waiting to pay AND collect)
                  ready + paid      → 📦 Picked up
                  ready + unpaid    → 💳 Charge (must pay before pickup)
                */}
                {/* In merge mode all per-row actions are hidden so the
                    row-tap = "pick this as source" is the only thing
                    the cashier can do. Avoids a chip-tap accidentally
                    charging a ticket mid-merge. */}
                {mergeTargetId === null && (
                  <>
                    {stage === "parked" && (
                      <ActionButton
                        onClick={() => handleFireToKitchen(t)}
                        busy={busy}
                        bg="#A16207"
                        confirm
                        confirmLabel="Fire now? Tap to confirm"
                      >
                        🍳 Fire to kitchen
                      </ActionButton>
                    )}
                    {stage === "cooking" && (
                      <ActionButton
                        onClick={() => handleMarkReady(t)}
                        busy={busy}
                        bg="#047857"
                        confirm
                        confirmLabel="Send 'ready' SMS?"
                      >
                        ✅ Mark ready
                      </ActionButton>
                    )}
                    {stage === "ready" && isPaid && (
                      <ActionButton
                        onClick={() => handleMarkPickedUp(t)}
                        busy={busy}
                        bg="#0F766E"
                        confirm
                        confirmLabel="Confirm collected?"
                      >
                        📦 Picked up
                      </ActionButton>
                    )}
                    {/* Charge only when there's actual money to take.
                        Other states already have a primary action,
                        and the row click handles editing. */}
                    {isUnpaid && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onResume(t);
                        }}
                        disabled={busy}
                        style={{
                          ...btnPrimary(busy),
                          padding: `${space.s}px ${space.m}px`,
                          minHeight: 36, fontSize: type.bodySm.fontSize,
                        }}
                      >
                        💳 Charge
                      </button>
                    )}
                    {isUnpaid && hasPhone && (
                      <ActionButton
                        onClick={() => handleSendPayLink(t)}
                        busy={busy}
                        bg="#1D4ED8"
                        confirm
                        confirmLabel={`Send MVR ${ticketDisplayTotal(t).toFixed(2)} link?`}
                      >
                        💳 Send pay link
                      </ActionButton>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSendBill(t);
                      }}
                      disabled={busy}
                      style={{ ...btnSecondary(busy), padding: `${space.s}px ${space.m}px`, minHeight: 36, fontSize: type.bodySm.fontSize }}
                    >
                      📱 {busy ? "…" : "Send Bill SMS"}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePrintBill(t);
                      }}
                      disabled={busy}
                      style={{ ...btnSecondary(busy), padding: `${space.s}px ${space.m}px`, minHeight: 36, fontSize: type.bodySm.fontSize }}
                    >
                      🖨 Print Bill
                    </button>
                    {/* Merge / Split — keep them at the end since
                        they're rare actions. Hidden when paid since
                        the backend refuses to merge/split paid
                        orders anyway.
                        Bug-011: also hidden when payment_status is
                        "partial". Merging or splitting a ticket that
                        already has payments collected would strand
                        those payments against fewer / different
                        items: customer paid MVR 50 of MVR 100, we
                        split the ticket — the original keeps the
                        MVR 50 against (say) MVR 30 of items, the
                        sibling has MVR 70 owed with no payments.
                        Reconciliation nightmare. Cashier must void
                        existing payments first if they really need
                        to restructure a partially-paid ticket. */}
                    {t.payment_status === "unpaid" && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartMerge(t);
                        }}
                        disabled={busy}
                        title="Merge another open ticket into this one"
                        style={{
                          padding: `${space.s}px ${space.m}px`,
                          minHeight: 36, fontSize: type.bodySm.fontSize,
                          borderRadius: radius.m, fontWeight: 700,
                          background: "#fff", color: "#475569",
                          border: "1px solid #CBD5E1",
                          cursor: busy ? "not-allowed" : "pointer",
                        }}
                      >
                        🔀 Merge
                      </button>
                    )}
                    {t.payment_status === "unpaid" && (t.items?.length ?? 0) > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSplitFor(t);
                        }}
                        disabled={busy}
                        title="Split items off into a new ticket"
                        style={{
                          padding: `${space.s}px ${space.m}px`,
                          minHeight: 36, fontSize: type.bodySm.fontSize,
                          borderRadius: radius.m, fontWeight: 700,
                          background: "#fff", color: "#475569",
                          border: "1px solid #CBD5E1",
                          cursor: busy ? "not-allowed" : "pointer",
                        }}
                      >
                        ✂️ Split
                      </button>
                    )}
                    {/* Void — destructive action, hidden for paid tickets
                        because money-touching reversals must go through
                        the refund flow (cash drawer, ledger, etc.).
                        Two-step: this button opens VoidConfirmModal,
                        cashier types the reason, only then the cancel
                        API fires. Last in the row so it's farthest from
                        the primary tap targets — reduces fat-finger
                        misclicks on a busy ticket card. */}
                    {!isPaid && canVoidOrders && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setVoidPrompt({ ticket: t, reason: "" });
                        }}
                        disabled={busy}
                        title="Void this ticket (returns stock, releases holds)"
                        style={{
                          padding: `${space.s}px ${space.m}px`,
                          minHeight: 36, fontSize: type.bodySm.fontSize,
                          borderRadius: radius.m, fontWeight: 700,
                          background: "#fff", color: palette.dangerDark,
                          border: `1px solid ${palette.dangerDark}`,
                          cursor: busy ? "not-allowed" : "pointer",
                        }}
                      >
                        🗑️ Void
                      </button>
                    )}
                  </>
                )}
                {isMergeTarget && (
                  <span style={{ fontSize: type.bodySm.fontSize, color: "#1E40AF", fontWeight: 700 }}>
                    Target — pick a source ticket to merge in.
                  </span>
                )}
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
      {splitFor && (
        <SplitItemPicker
          ticket={splitFor}
          onCancel={() => setSplitFor(null)}
          onConfirm={(itemIds) => void handleSplitConfirm(splitFor.id, itemIds)}
        />
      )}
      {mergeConfirm && (
        <MergeConfirmModal
          target={mergeConfirm.target}
          source={mergeConfirm.source}
          busy={mergeBusy}
          onCancel={() => {
            if (mergeBusy) return;
            setMergeConfirm(null);
            // Leave mergeTargetId set so the cashier can pick a
            // different source without restarting the whole flow.
          }}
          onConfirm={() => void handleConfirmMerge()}
        />
      )}
      {voidPrompt && (
        <VoidConfirmModal
          ticket={voidPrompt.ticket}
          reason={voidPrompt.reason}
          busy={voidBusy}
          onReasonChange={(reason) => setVoidPrompt((p) => p ? { ...p, reason } : p)}
          onCancel={() => {
            if (voidBusy) return;
            setVoidPrompt(null);
          }}
          onConfirm={() => void handleConfirmVoid()}
        />
      )}
    </PanelShell>
  );
}

/**
 * Generic radio-style chip group used by the Active orders filter
 * bar. Single-select within the group — the per-group [All] chip is
 * just another option with key === "all". Counts on every chip
 * always reflect the unfiltered ticket set so cashiers can see at
 * a glance how many rows each chip would surface.
 *
 * `activeColor` can be set globally for the group, or per-option
 * (used by the Payment group where Paid/Unpaid have different
 * traffic-light colours).
 */
function ScopeChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "10px 14px",
        minHeight: 44,
        borderRadius: radius.m,
        border: `1px solid ${active ? "#7C3AED" : palette.border}`,
        background: active ? "#7C3AED" : "#fff",
        color: active ? "#fff" : palette.panelInk,
        fontSize: 13,
        fontWeight: 700,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

function FilterGroup({
  options,
  selected,
  onSelect,
  activeColor: groupActiveColor,
}: {
  options: ReadonlyArray<{ key: string; label: string; count: number; activeColor?: string }>;
  selected: string;
  onSelect: (key: string) => void;
  activeColor?: string;
}) {
  return (
    <>
      {options.map((opt) => {
        const active = opt.key === selected;
        const accent = opt.activeColor ?? groupActiveColor ?? "#0F172A";
        return (
          <button
            key={opt.key}
            onClick={() => onSelect(opt.key)}
            style={{
              // Bug-021: bumped to a WCAG-friendly 44px touch
              // target. Filter chips on the cashier's iPad are
              // hit with a thumb mid-service; the previous 6/10
              // padding made them ~28px tall and easy to miss.
              padding: "10px 14px",
              minHeight: 44,
              borderRadius: 999,
              border: `1px solid ${active ? accent : palette.border}`,
              background: active ? accent : "#fff",
              color: active ? "#fff" : palette.panelInk,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              whiteSpace: "nowrap",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>{opt.label}</span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                background: active ? "rgba(255,255,255,0.18)" : "#E2E8F0",
                color: active ? "#fff" : palette.panelMuted,
                padding: "1px 6px",
                borderRadius: 999,
                minWidth: 16,
                textAlign: "center",
              }}
            >
              {opt.count}
            </span>
          </button>
        );
      })}
    </>
  );
}

/**
 * Thin vertical pipe between filter groups. Cosmetic only; keeps the
 * visual grouping clear when chips wrap to multiple lines.
 */
function Divider() {
  return (
    <span
      aria-hidden
      style={{ width: 1, height: 18, background: palette.border, margin: "0 2px" }}
    />
  );
}

/**
 * Stage-action button used inside each ticket row. Centralises the
 * stopPropagation + busy/disabled styling so the row's own
 * click-to-edit handler doesn't fire when the cashier taps a chip.
 *
 * Pass `confirm` to require a TWO-TAP interaction before firing
 * `onClick`. First tap arms the button — it changes colour and swaps
 * its label to `confirmLabel`. Second tap inside the arm window
 * (2.5s) actually fires the action. Tapping anywhere else, or just
 * waiting, silently disarms. Used for every destructive POS action
 * (Fire to kitchen, Mark ready, Picked up, Send pay link) so a
 * mis-tap during a busy service doesn't print a chit, fire an SMS,
 * or complete an order by accident.
 */
function ActionButton({
  onClick,
  busy,
  bg,
  children,
  confirm = false,
  confirmLabel = "Tap again to confirm",
}: {
  onClick: () => void;
  busy: boolean;
  bg: string;
  children: React.ReactNode;
  confirm?: boolean;
  confirmLabel?: React.ReactNode;
}) {
  const [pending, setPending] = useState(false);
  const timerRef = useRef<number | null>(null);

  // Clean up the arm-timer on unmount so a ticket disappearing
  // mid-confirm (e.g. a poll cycle that drops the row) doesn't leak
  // a setState call into a torn-down tree.
  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    },
    [],
  );

  // Disarm whenever the parent flips `busy` (action in flight) — the
  // pending highlight would otherwise outlive the original tap that
  // triggered it and lie about the action state.
  useEffect(() => {
    if (busy && pending) {
      setPending(false);
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [busy, pending]);

  const handleTap = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    if (!confirm) {
      onClick();
      return;
    }
    if (pending) {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setPending(false);
      onClick();
    } else {
      setPending(true);
      timerRef.current = window.setTimeout(() => {
        setPending(false);
        timerRef.current = null;
      }, 2500);
    }
  };

  return (
    <button
      onClick={handleTap}
      disabled={busy}
      style={{
        padding: `${space.s}px ${space.m}px`,
        minHeight: 36,
        fontSize: type.bodySm.fontSize,
        borderRadius: radius.m,
        fontWeight: 700,
        // Pending state borrows the warning palette so it's
        // unmistakable that a second tap is destructive.
        background: pending ? "#B45309" : bg,
        color: "#fff",
        border: pending ? "2px solid #FBBF24" : "none",
        boxSizing: "border-box",
        cursor: busy ? "not-allowed" : "pointer",
      }}
    >
      {busy ? "…" : pending ? confirmLabel : children}
    </button>
  );
}

/**
 * Modal for selecting which items to peel off a ticket into a new
 * sibling. Used by the "Split" button. Backend rejects the operation
 * if all items are selected (would leave the source empty) or none,
 * so we mirror those guards client-side as disabled-button feedback.
 */
function SplitItemPicker({
  ticket,
  onCancel,
  onConfirm,
}: {
  ticket: OpenTicket;
  onCancel: () => void;
  onConfirm: (itemIds: number[]) => void;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const items = ticket.items ?? [];
  const totalCount = items.length;
  const allSelected = selected.size === totalCount;
  const noneSelected = selected.size === 0;
  const splitTotal = items
    .filter((it) => selected.has(it.id))
    .reduce((acc, it) => acc + Number(it.total_price ?? 0), 0);

  const toggle = (id: number) => {
    setSelected((curr) => {
      const next = new Set(curr);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Split ticket"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.4)",
        zIndex: z.modalBackdrop,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: space.l,
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(520px, 100%)",
          background: palette.panel,
          borderRadius: radius.xl,
          boxShadow: shadow.xl,
          padding: space.xl,
          display: "flex",
          flexDirection: "column",
          gap: space.m,
          maxHeight: "85vh",
          overflow: "hidden",
        }}
      >
        <div>
          <div style={{ ...type.subtitle, color: palette.panelInk }}>
            ✂️ Split items off ticket
          </div>
          <div style={{ ...type.bodySm, color: palette.panelMuted, marginTop: 4 }}>
            Order <strong style={{ color: palette.panelInk }}>{ticket.order_number}</strong> · pick the
            items to move into a brand-new ticket.
          </div>
        </div>
        <div
          style={{
            flex: 1,
            overflow: "auto",
            border: `1px solid ${palette.border}`,
            borderRadius: radius.m,
            padding: space.s,
            background: "#F8FAFC",
            display: "flex",
            flexDirection: "column",
            gap: space.xs,
          }}
        >
          {items.map((it) => {
            const checked = selected.has(it.id);
            return (
              <label
                key={it.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: space.s,
                  padding: space.s,
                  background: checked ? "#EFF6FF" : "#fff",
                  border: `1px solid ${checked ? "#93C5FD" : palette.border}`,
                  borderRadius: radius.s,
                  cursor: "pointer",
                  fontSize: type.bodySm.fontSize,
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(it.id)}
                  style={{ width: 18, height: 18, accentColor: "#1D4ED8" }}
                />
                <span style={{ flex: 1, color: palette.panelInk }}>
                  {it.quantity}× {it.item_name}
                </span>
                <span style={{ color: palette.panelMuted, fontWeight: 700, whiteSpace: "nowrap" }}>
                  MVR {Number(it.total_price ?? 0).toFixed(2)}
                </span>
              </label>
            );
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ ...type.bodySm, color: palette.panelMuted }}>
            {selected.size} of {totalCount} items · split MVR {splitTotal.toFixed(2)}
          </div>
          {allSelected && (
            <span style={{ ...type.caption, color: palette.dangerDark, fontWeight: 700 }}>
              Pick fewer — can't split every item.
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: space.s, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={btnSecondary()}>
            Cancel
          </button>
          <button
            onClick={() => onConfirm(Array.from(selected))}
            disabled={noneSelected || allSelected}
            style={btnPrimary(noneSelected || allSelected)}
          >
            Split into new ticket
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Confirmation dialog for merging two tickets. Shows both tickets
 * side-by-side with item counts + totals so the cashier can verify
 * the right two rows were picked before items become irreversible
 * (server cancels the source). Combined total is shown so the
 * cashier knows what the post-merge target will be charged.
 */
function MergeConfirmModal({
  target,
  source,
  busy,
  onCancel,
  onConfirm,
}: {
  target: OpenTicket;
  source: OpenTicket;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const combinedTotal = ticketDisplayTotal(target) + ticketDisplayTotal(source);
  // Bug-010: cross-stage merges leave kitchen state inconsistent.
  // - source has been fired but target is still parked → the
  //   kitchen chit for the source items survives, but the merged
  //   ticket is now in "parked" state and won't appear on KDS
  //   until the cashier explicitly fires the target. Cooks may
  //   already be prepping, customer waits.
  // - target has been fired but source is parked → opposite
  //   problem: merging adds NEW items into a ticket whose chit
  //   the cooks have already pulled. They'll miss the new lines
  //   unless the cashier remembers to reprint via the Edit flow.
  // In both cases we surface a yellow callout in the confirm modal
  // explaining what will happen so the cashier consciously makes
  // the trade-off (or backs out).
  const stageOf = (status: string | null | undefined, firedAt: string | null | undefined): "parked" | "cooking" => {
    if (status === "held" && !firedAt) return "parked";
    return "cooking";
  };
  const targetStage = stageOf(target.status, target.fired_at ?? null);
  const sourceStage = stageOf(source.status, source.fired_at ?? null);
  const crossStageWarning =
    targetStage !== sourceStage
      ? targetStage === "parked"
        ? "Source has already been fired to the kitchen — those items are being prepared. The merged ticket will be PARKED, so it won't appear on the KDS until you fire it. The cooks may finish the source items before you charge."
        : "Target is already cooking — its kitchen chit has been printed. The newly merged items WILL NOT auto-reprint. Open the merged ticket and tap 'Edit items' to reprint if the cooks need to see them."
      : null;
  const renderTicket = (t: OpenTicket, label: "Target — keeps" | "Source — cancelled") => (
    <div
      style={{
        flex: 1,
        padding: space.m,
        background: "#F8FAFC",
        borderRadius: radius.m,
        border: `1px solid ${palette.border}`,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 800, color: palette.panelMuted, letterSpacing: 0.5, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontWeight: 700, color: palette.panelInk, fontSize: type.body.fontSize }}>
        {t.ticket_name || t.order_number}
      </div>
      <div style={{ fontSize: type.caption.fontSize, color: palette.panelMuted }}>
        {(t.items?.length ?? 0)} items
        {t.customer?.name ? ` · ${t.customer.name}` : ""}
      </div>
      <div style={{ fontWeight: 800, color: palette.panelInk, fontSize: type.subtitle.fontSize, marginTop: 4 }}>
        MVR {ticketDisplayTotal(t).toFixed(2)}
      </div>
    </div>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Confirm merge"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.4)",
        zIndex: z.modalBackdrop,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: space.l,
      }}
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(540px, 100%)",
          background: palette.panel,
          borderRadius: radius.xl,
          boxShadow: shadow.xl,
          padding: space.xl,
          display: "flex",
          flexDirection: "column",
          gap: space.m,
        }}
      >
        <div>
          <div style={{ ...type.subtitle, color: palette.panelInk }}>🔀 Merge tickets?</div>
          <div style={{ ...type.bodySm, color: palette.panelMuted, marginTop: 4 }}>
            Items from the source ticket will move into the target. The source ticket will be
            <strong style={{ color: palette.dangerDark }}> cancelled</strong>.
          </div>
        </div>
        <div style={{ display: "flex", gap: space.s, alignItems: "stretch" }}>
          {renderTicket(target, "Target — keeps")}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, color: palette.panelMuted, flexShrink: 0 }}>
            ←
          </div>
          {renderTicket(source, "Source — cancelled")}
        </div>
        <div
          style={{
            padding: space.s + 2,
            background: "#EFF6FF",
            border: "1px solid #BFDBFE",
            borderRadius: radius.m,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ ...type.bodySm, color: "#1E40AF", fontWeight: 700 }}>
            Combined total
          </span>
          <span style={{ ...type.subtitle, color: "#1E40AF", fontWeight: 800 }}>
            MVR {combinedTotal.toFixed(2)}
          </span>
        </div>
        {crossStageWarning && (
          <div
            role="alert"
            style={{
              padding: space.m,
              background: "#FEF3C7",
              border: "1px solid #FBBF24",
              borderRadius: radius.m,
              display: "flex",
              gap: space.s,
              alignItems: "flex-start",
            }}
          >
            <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>⚠️</span>
            <span style={{ ...type.bodySm, color: "#78350F", fontWeight: 600, lineHeight: 1.4 }}>
              {crossStageWarning}
            </span>
          </div>
        )}
        <div style={{ display: "flex", gap: space.s, justifyContent: "flex-end" }}>
          <button onClick={onCancel} disabled={busy} style={btnSecondary(busy)}>
            Cancel
          </button>
          <button onClick={onConfirm} disabled={busy} style={btnPrimary(busy)}>
            {busy ? "Merging…" : "Confirm merge"}
          </button>
        </div>
      </div>
    </div>
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

/**
 * Two-step void confirm.
 *
 * The cashier already tapped 🗑️ Void on the row, this modal forces a
 * written reason (free-form, 1–255 chars) before enabling Confirm.
 * Designed to bias toward "honest manager review later" — a sloppy
 * cashier can type "x" and proceed, but the audit log will show the
 * lazy reason and that's its own signal.
 *
 * Surfaces what the void does so a junior cashier knows it's not a
 * trivial action:
 *   - returns deducted stock
 *   - releases promo / loyalty / gift-card holds
 *   - frees the dine-in table
 *
 * Esc cancels. Enter from the textarea is ignored on purpose so a
 * cashier composing a multi-line reason doesn't accidentally submit
 * mid-typing; they have to physically tap the red Confirm button.
 */
function VoidConfirmModal({
  ticket,
  reason,
  busy,
  onReasonChange,
  onCancel,
  onConfirm,
}: {
  ticket: OpenTicket;
  reason: string;
  busy: boolean;
  onReasonChange: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const total = ticketDisplayTotal(ticket);
  const label = ticket.ticket_name || `Order ${ticket.order_number}`;
  const itemCount = ticket.items?.length ?? 0;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Void ticket — reason required"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.5)",
        zIndex: z.modalBackdrop,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: space.l,
        animation: "pos-fade-in 120ms ease",
      }}
      onClick={() => {
        if (!busy) onCancel();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !busy) onCancel();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(460px, 100%)",
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
          <div style={{ ...type.subtitle, color: palette.dangerDark }}>🗑️ Void this ticket?</div>
          <div style={{ ...type.bodySm, color: palette.panelMuted, marginTop: 4 }}>
            <strong style={{ color: palette.panelInk }}>{label}</strong>
            {" · "}{itemCount} item{itemCount === 1 ? "" : "s"}
            {" · MVR "}{total.toFixed(2)}
          </div>
        </div>

        <div style={{
          background: "#FEF2F2",
          border: "1px solid #FCA5A5",
          borderRadius: radius.m,
          padding: space.m,
          fontSize: type.bodySm.fontSize,
          color: "#7F1D1D",
          lineHeight: 1.5,
        }}>
          Voiding will:
          <ul style={{ margin: `${space.xxs}px 0 0 ${space.l}px`, padding: 0 }}>
            <li>Return deducted stock to inventory</li>
            <li>Release any loyalty / promo / gift-card holds</li>
            <li>Free the dine-in table (if no other open ticket on it)</li>
            <li>Stay on record with your name + reason in the audit log</li>
          </ul>
        </div>

        <div>
          <label
            htmlFor="void-reason"
            style={{ ...type.label, color: palette.panelMuted, display: "block", marginBottom: space.xxs }}
          >
            Reason (required)
          </label>
          <textarea
            id="void-reason"
            autoFocus
            value={reason}
            onChange={(e) => onReasonChange(e.target.value.slice(0, 255))}
            placeholder="e.g. Customer changed mind, wrong order, walked out…"
            disabled={busy}
            rows={3}
            style={{
              ...inputField,
              width: "100%",
              fontSize: type.body.fontSize,
              resize: "vertical",
              minHeight: 72,
              fontFamily: "inherit",
            }}
          />
          <div style={{ ...type.caption, color: palette.panelMuted, marginTop: 4, textAlign: "right" }}>
            {reason.length}/255
          </div>
        </div>

        <div style={{ display: "flex", gap: space.s, justifyContent: "flex-end", marginTop: space.xs }}>
          <button type="button" onClick={onCancel} disabled={busy} style={btnSecondary(busy)}>
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || reason.trim().length === 0}
            style={{
              ...btnPrimary(busy || reason.trim().length === 0),
              background: busy || reason.trim().length === 0 ? "#FCA5A5" : palette.dangerDark,
            }}
          >
            {busy ? "Voiding…" : "🗑️ Confirm void"}
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
          fontSize: 26,
          cursor: "pointer",
          lineHeight: 1,
          // Bug-022: bumped from 32×32 to 44×44 to clear WCAG and
          // give cashiers a fat-finger-tolerant hit target. The
          // close × used to sit right next to the panel title so
          // a thumb aiming for "Active orders" could close the
          // pane by mistake.
          padding: 6,
          minHeight: 44,
          minWidth: 44,
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
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
