import { useEffect, useMemo, useState } from "react";
import {
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

  // ── Filter state ──────────────────────────────────────────────
  // Single-row compact filter bar:
  //   [All] [Cooking] [Ready] [Parked]   Type ▾   ✕ Clear
  // Stage chips are one-tap (most common workflow filter); Type is a
  // dropdown to save horizontal space (4 types don't fit as chips
  // alongside the 4 stage chips on tablet widths). Clear surfaces
  // only when at least one filter is non-default.
  type TypeFilter = "all" | "dine_in" | "takeaway" | "online_pickup";
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  type StageFilter = "all" | "parked" | "cooking" | "ready";
  const [stageFilter, setStageFilter] = useState<StageFilter>("all");
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);

  // Reset to default — used by the ✕ Clear button. Tied to a single
  // helper so we never miss a filter when we add more later.
  const clearFilters = () => {
    setStageFilter("all");
    setTypeFilter("all");
  };
  const hasActiveFilters = stageFilter !== "all" || typeFilter !== "all";

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

  useEffect(() => {
    let cancelled = false;

    const reload = async (showSpinner: boolean) => {
      if (cancelled) return;
      try {
        if (showSpinner) setLoading(true);
        const res = await fetchReceipts({
          // active_only is the new default — superset of open_only.
          // Includes paid-but-cooking and ready-but-not-yet-picked-up
          // tickets so the cashier sees the full pipeline, not just
          // the unpaid slice.
          active_only: true,
          device_identifier: deviceId,
          per_page: 50,
        });
        if (!cancelled) {
          setTickets(res.data);
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
      window.open(url, "_blank", "noopener,noreferrer");
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
      const fresh = await fetchReceipts({
        active_only: true,
        device_identifier: deviceId,
        per_page: 50,
      });
      setTickets(fresh.data);
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
        text: `Split into order #${res.split.id} (MVR ${res.split.total.toFixed(2)})`,
      });
      // Force reload to pull both the slimmed source AND the new
      // sibling ticket. Optimistic patch is awkward here (we don't
      // have the full row shape for the brand-new order locally).
      const fresh = await fetchReceipts({
        active_only: true,
        device_identifier: deviceId,
        per_page: 50,
      });
      setTickets(fresh.data);
    } catch (e) {
      setRowMsg({ id: sourceId, kind: "err", text: (e as Error).message || "Couldn't split" });
    } finally {
      setBusyId(null);
    }
  };

  // ── Derived: filtered ticket list ─────────────────────────────
  // Stage derivation lives in the row map too (for the badge), but
  // we need it here for stage-filter matching. Keep both in sync.
  const filteredTickets = useMemo(() => {
    const stageOf = (status: string | null | undefined): "parked" | "cooking" | "ready" => {
      if (status === "held") return "parked";
      if (status === "ready") return "ready";
      return "cooking";
    };
    return tickets.filter((t) => {
      if (typeFilter !== "all" && t.type !== typeFilter) return false;
      if (stageFilter !== "all" && stageOf(t.status) !== stageFilter) return false;
      return true;
    });
  }, [tickets, typeFilter, stageFilter]);

  // Counts for the chip badges — recomputed on the unfiltered set so
  // the chip count always shows the TOTAL of each bucket, not the
  // intersection with whatever filter is active. Counter-intuitive
  // otherwise (cashier sees "Pickup 0" when filtering by Dine-in).
  const typeCounts = useMemo(() => {
    const counts = { all: tickets.length, dine_in: 0, takeaway: 0, online_pickup: 0 };
    tickets.forEach((t) => {
      if (t.type === "dine_in") counts.dine_in++;
      else if (t.type === "takeaway") counts.takeaway++;
      else if (t.type === "online_pickup") counts.online_pickup++;
    });
    return counts;
  }, [tickets]);

  const stageCounts = useMemo(() => {
    const counts = { all: tickets.length, parked: 0, cooking: 0, ready: 0 };
    tickets.forEach((t) => {
      if (t.status === "held") counts.parked++;
      else if (t.status === "ready") counts.ready++;
      else counts.cooking++;
    });
    return counts;
  }, [tickets]);

  return (
    <PanelShell
      title={mergeTargetId !== null ? "Merge tickets — pick source" : "Active orders"}
      subtitle={
        mergeTargetId !== null
          ? `Tap any other ticket to preview the merge (you'll confirm before anything changes)`
          : "Parked, cooking, and ready-for-pickup tickets"
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

      {/* ── Compact one-row filter bar ─────────────────────────
            Layout:  [All N] [Cooking N] [Ready N] [Parked N]  Type ▾  ✕ Clear
            - Stage chips on the left as single-tap toggles.
            - Type as a dropdown (4 types alongside 4 stage chips
              would wrap on tablet widths and break the one-row goal).
            - ✕ Clear only renders when ≥1 filter is non-default.
            Chip counts always reflect the unfiltered tickets so the
            cashier knows what's available in each bucket regardless
            of the active filter. */}
      <div
        style={{
          marginBottom: space.m,
          padding: space.s,
          background: "#F8FAFC",
          borderRadius: radius.m,
          border: `1px solid ${palette.border}`,
          display: "flex",
          alignItems: "center",
          gap: space.xs,
          flexWrap: "wrap",
        }}
      >
        {/* Stage chips — single-tap. Inline style so they sit
            flush in the same row as the type dropdown. */}
        {([
          { key: "all", label: "All", count: stageCounts.all },
          { key: "cooking", label: "🍳 Cooking", count: stageCounts.cooking },
          { key: "ready", label: "✅ Ready", count: stageCounts.ready },
          { key: "parked", label: "📋 Parked", count: stageCounts.parked },
        ] as const).map((opt) => {
          const active = opt.key === stageFilter;
          return (
            <button
              key={opt.key}
              onClick={() => setStageFilter(opt.key)}
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                border: `1px solid ${active ? "#0F172A" : palette.border}`,
                background: active ? "#0F172A" : "#fff",
                color: active ? "#fff" : palette.panelInk,
                fontSize: 12,
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

        {/* Type dropdown — anchored to the right side of the row so
            it groups with the Clear button visually. */}
        <div style={{ position: "relative", marginLeft: "auto" }}>
          <button
            onClick={() => setTypeMenuOpen((v) => !v)}
            style={{
              padding: "6px 12px",
              borderRadius: 999,
              border: `1px solid ${typeFilter !== "all" ? "#1D4ED8" : palette.border}`,
              background: typeFilter !== "all" ? "#EFF6FF" : "#fff",
              color: typeFilter !== "all" ? "#1E40AF" : palette.panelInk,
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              whiteSpace: "nowrap",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {(() => {
              const labels: Record<TypeFilter, string> = {
                all: "All types",
                dine_in: "🍽 Dine-in",
                takeaway: "🥡 Takeaway",
                online_pickup: "📦 Pickup",
              };
              return labels[typeFilter];
            })()}
            <span style={{ fontSize: 9 }}>▾</span>
          </button>
          {typeMenuOpen && (
            <>
              {/* Click-away catcher — fixed inset so a tap anywhere
                  outside the menu closes it. Sits below the menu in
                  z-order so the menu itself stays clickable. */}
              <div
                onClick={() => setTypeMenuOpen(false)}
                style={{
                  position: "fixed",
                  inset: 0,
                  zIndex: z.modalBackdrop - 1,
                }}
              />
              <div
                role="menu"
                style={{
                  position: "absolute",
                  top: "calc(100% + 4px)",
                  right: 0,
                  background: "#fff",
                  border: `1px solid ${palette.border}`,
                  borderRadius: radius.m,
                  boxShadow: shadow.m,
                  zIndex: z.modalBackdrop,
                  minWidth: 180,
                  padding: 4,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                {([
                  { key: "all", label: "All types", count: typeCounts.all },
                  { key: "dine_in", label: "🍽 Dine-in", count: typeCounts.dine_in },
                  { key: "takeaway", label: "🥡 Takeaway", count: typeCounts.takeaway },
                  { key: "online_pickup", label: "📦 Pickup", count: typeCounts.online_pickup },
                ] as const).map((opt) => {
                  const active = opt.key === typeFilter;
                  return (
                    <button
                      key={opt.key}
                      onClick={() => {
                        setTypeFilter(opt.key);
                        setTypeMenuOpen(false);
                      }}
                      style={{
                        padding: "8px 12px",
                        background: active ? "#EFF6FF" : "transparent",
                        color: active ? "#1E40AF" : palette.panelInk,
                        border: "none",
                        borderRadius: radius.s,
                        textAlign: "left",
                        fontSize: 13,
                        fontWeight: active ? 800 : 600,
                        cursor: "pointer",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 12,
                      }}
                    >
                      <span>{opt.label}</span>
                      <span style={{ fontSize: 11, color: palette.panelMuted, fontWeight: 700 }}>
                        {opt.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Clear — only when at least one filter deviates from
            the default. Avoids "✕ Clear" being a permanent
            no-op button at end of row. */}
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            title="Reset filters"
            style={{
              padding: "6px 10px",
              borderRadius: 999,
              background: "transparent",
              border: "none",
              color: palette.panelMuted,
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            ✕ Clear
          </button>
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
          body="Try widening the filters above."
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

          return (
            <div
              key={t.id}
              style={{
                padding: space.m,
                borderRadius: radius.l,
                background: isMergeTarget ? "#EFF6FF" : palette.panel,
                border: `1px solid ${isMergeTarget ? "#93C5FD" : palette.border}`,
                display: "flex",
                flexDirection: "column",
                gap: space.s,
                cursor: isMergeCandidate ? "pointer" : "default",
              }}
              onClick={isMergeCandidate ? () => handlePickMergeSource(t) : undefined}
            >
              <div
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: space.m, cursor: mergeTargetId === null ? "pointer" : undefined }}
                role={mergeTargetId === null ? "button" : undefined}
                tabIndex={mergeTargetId === null ? 0 : undefined}
                onClick={mergeTargetId === null ? () => onResume(t) : undefined}
                onKeyDown={mergeTargetId === null ? (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onResume(t);
                  }
                } : undefined}
                title={mergeTargetId === null ? "Open ticket in main POS to add/remove items, charge, etc." : undefined}
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
                      <ActionButton onClick={() => handleFireToKitchen(t)} busy={busy} bg="#A16207">
                        🍳 Fire to kitchen
                      </ActionButton>
                    )}
                    {stage === "cooking" && (
                      <ActionButton onClick={() => handleMarkReady(t)} busy={busy} bg="#047857">
                        ✅ Mark ready
                      </ActionButton>
                    )}
                    {stage === "ready" && isPaid && (
                      <ActionButton onClick={() => handleMarkPickedUp(t)} busy={busy} bg="#0F766E">
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
                      <ActionButton onClick={() => handleSendPayLink(t)} busy={busy} bg="#1D4ED8">
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
                        orders anyway. */}
                    {!isPaid && (
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
                    {!isPaid && (t.items?.length ?? 0) > 1 && (
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
    </PanelShell>
  );
}

/**
 * Stage-action button used inside each ticket row. Centralises the
 * stopPropagation + busy/disabled styling so the row's own
 * click-to-edit handler doesn't fire when the cashier taps a chip.
 */
function ActionButton({
  onClick,
  busy,
  bg,
  children,
}: {
  onClick: () => void;
  busy: boolean;
  bg: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      disabled={busy}
      style={{
        padding: `${space.s}px ${space.m}px`,
        minHeight: 36,
        fontSize: type.bodySm.fontSize,
        borderRadius: radius.m,
        fontWeight: 700,
        background: bg,
        color: "#fff",
        border: "none",
        cursor: busy ? "not-allowed" : "pointer",
      }}
    >
      {busy ? "…" : children}
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
  const combinedTotal = Number(target.total) + Number(source.total);
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
        MVR {Number(t.total).toFixed(2)}
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
