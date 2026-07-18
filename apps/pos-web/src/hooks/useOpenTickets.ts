import { useCallback, useEffect, useMemo, useState } from "react";
import {
  cancelOrder,
  fetchActiveOrdersMine,
  fetchActiveOrdersOnline,
  fetchActiveOrdersVenueWide,
  fireOrderToKitchen,
  markOrderPickedUp,
  markOrderReady,
  startOrderCooking,
  mergeOpenTickets,
  sendBill,
  sendPayLink,
  splitOpenTicket,
} from "../api";
import {
  type OpenTicket,
  ticketStage,
  type TicketStage,
} from "../utils/openTicketUtils";
import { compareTicketsByAge } from "../utils/ticketAging";

export type { OpenTicket, TicketStage };

export type OpenTicketsFilterKey =
  | "all"
  | "stage:queued" | "stage:cooking" | "stage:ready" | "stage:parked"
  | "type:dine_in" | "type:takeaway" | "type:online_pickup" | "type:delivery"
  | "payment:paid" | "payment:unpaid";

const POLL_MS = 30_000;

export type UseOpenTicketsOptions = {
  /** Prefill for Send Bill when the ticket has no linked customer. */
  cartCustomerPhone?: string | null;
};

export function useOpenTickets({ cartCustomerPhone }: UseOpenTicketsOptions = {}) {
  const [tickets, setTickets] = useState<OpenTicket[]>([]);
  /** Server total for the current list scope (may exceed loaded rows). */
  const [activeTotal, setActiveTotal] = useState(0);
  // Default all-staff so the list matches the sales-page badge. Cashiers
  // can narrow to tickets they created via the scope chips.
  const [listScope, setListScope] = useState<"all" | "mine" | "online">("all");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [rowMsg, setRowMsg] = useState<{ id: number; text: string; kind: "ok" | "err" } | null>(null);

  useEffect(() => {
    if (!rowMsg) return;
    const ms = rowMsg.kind === "err" ? 10000 : 6000;
    const handle = window.setTimeout(() => setRowMsg(null), ms);
    return () => window.clearTimeout(handle);
  }, [rowMsg]);

  const [phonePrompt, setPhonePrompt] = useState<{
    ticket: OpenTicket;
    phone: string;
    purpose: "bill" | "pay_link";
  } | null>(null);

  const [activeFilter, setActiveFilter] = useState<OpenTicketsFilterKey>("all");
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [, setAgeTick] = useState(0);

  useEffect(() => {
    const timerId = window.setInterval(() => setAgeTick((t) => t + 1), 30_000);
    return () => window.clearInterval(timerId);
  }, []);

  const [mergeTargetId, setMergeTargetId] = useState<number | null>(null);
  const [mergeConfirm, setMergeConfirm] = useState<{ target: OpenTicket; source: OpenTicket } | null>(null);
  const [mergeBusy, setMergeBusy] = useState(false);
  const [splitFor, setSplitFor] = useState<OpenTicket | null>(null);

  const loadActiveOrders = useCallback(async () => {
    if (listScope === "mine") {
      return fetchActiveOrdersMine();
    }
    if (listScope === "online") {
      return fetchActiveOrdersOnline();
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
        if (!cancelled && showSpinner) setErr((e as Error).message);
      } finally {
        if (!cancelled && showSpinner) setLoading(false);
      }
    };

    void reload(true);

    const interval = window.setInterval(() => {
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

  const patchTicket = useCallback((id: number, patch: Partial<OpenTicket>) => {
    setTickets((curr) =>
      curr.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }, []);

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

  const doSendPayLink = async (t: OpenTicket, phone?: string) => {
    setBusyId(t.id);
    setRowMsg(null);
    try {
      const res = await sendPayLink(t.id, phone);
      setRowMsg({ id: t.id, kind: "ok", text: `Pay link sent (MVR ${Number(res.amount).toFixed(2)}) to ${res.sent_to}` });
    } catch (e) {
      setRowMsg({ id: t.id, kind: "err", text: (e as Error).message || "Couldn't send pay link" });
    } finally {
      setBusyId(null);
    }
  };

  const handleSendPayLink = (t: OpenTicket) => {
    const linkedPhone = t.customer?.phone ?? null;
    if (linkedPhone) {
      void doSendPayLink(t, linkedPhone);
      return;
    }
    setPhonePrompt({ ticket: t, phone: cartCustomerPhone ?? "", purpose: "pay_link" });
  };

  const handleStartCooking = async (t: OpenTicket) => {
    setBusyId(t.id);
    setRowMsg(null);
    try {
      const res = await startOrderCooking(t.id);
      patchTicket(t.id, { status: res.order.status });
      if (!res.unchanged) {
        setRowMsg({ id: t.id, kind: "ok", text: "Cooking — sent to kitchen." });
      }
    } catch (e) {
      setRowMsg({ id: t.id, kind: "err", text: (e as Error).message || "Couldn't start cooking" });
    } finally {
      setBusyId(null);
    }
  };

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

  const confirmVoidTicket = async (t: OpenTicket, reason: string) => {
    const trimmed = reason.trim();
    if (trimmed.length === 0) return false;

    try {
      await cancelOrder(t.id, trimmed);
      setTickets((curr) => curr.filter((row) => row.id !== t.id));
      setRowMsg({ id: t.id, kind: "ok", text: `Ticket voided — ${trimmed}` });
      return true;
    } catch (e) {
      setRowMsg({ id: t.id, kind: "err", text: (e as Error).message || "Couldn't void ticket" });
      return false;
    }
  };

  const handleMarkPickedUp = async (t: OpenTicket) => {
    setBusyId(t.id);
    setRowMsg(null);
    try {
      const res = await markOrderPickedUp(t.id);
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

  const doSendBill = async (t: OpenTicket, phone: string) => {
    setBusyId(t.id);
    setRowMsg(null);
    try {
      const res = await sendBill(t.id, phone);
      setRowMsg({ id: t.id, kind: "ok", text: `Bill sent to ${phone}` });
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

  const handleSendBill = (t: OpenTicket) => {
    const linkedPhone = t.customer?.phone ?? null;
    if (linkedPhone) {
      void doSendBill(t, linkedPhone);
      return;
    }
    setPhonePrompt({ ticket: t, phone: cartCustomerPhone ?? "", purpose: "bill" });
  };

  const submitPhonePrompt = async () => {
    if (!phonePrompt) return;
    const phone = phonePrompt.phone.trim();
    if (!phone) return;
    const ticket = phonePrompt.ticket;
    const purpose = phonePrompt.purpose;
    setPhonePrompt(null);
    if (purpose === "pay_link") {
      await doSendPayLink(ticket, phone);
      return;
    }
    await doSendBill(ticket, phone);
  };

  const handlePrintBill = async (t: OpenTicket) => {
    setBusyId(t.id);
    setRowMsg(null);
    try {
      const res = await sendBill(t.id);
      const link = res.link;
      const url = link.includes("?") ? `${link}&print=1` : `${link}?print=1`;
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

  const handleStartMerge = (target: OpenTicket) => {
    setMergeTargetId(target.id);
    setRowMsg(null);
  };

  const handleCancelMerge = () => {
    setMergeTargetId(null);
    setMergeConfirm(null);
  };

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

  const handleConfirmMerge = async () => {
    if (!mergeConfirm) return;
    const { target, source } = mergeConfirm;
    setMergeBusy(true);
    setRowMsg(null);
    try {
      await mergeOpenTickets(target.id, { source_id: source.id });
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
      const fresh = await loadActiveOrders();
      setTickets(fresh.data);
      setActiveTotal(fresh.total);
    } catch (e) {
      setRowMsg({ id: sourceId, kind: "err", text: (e as Error).message || "Couldn't split" });
    } finally {
      setBusyId(null);
    }
  };

  const filteredTickets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tickets
      .filter((t) => {
        if (activeFilter === "all") {
          // no chip-level filter
        } else if (activeFilter.startsWith("stage:")) {
          const want = activeFilter.slice(6) as TicketStage;
          if (ticketStage(t.status) !== want) return false;
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
      })
      .slice()
      .sort((a, b) => compareTicketsByAge(a, b, ticketStage));
  }, [tickets, activeFilter, search]);

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
    const counts = { parked: 0, queued: 0, cooking: 0, ready: 0 };
    searchScopedTickets.forEach((t) => {
      counts[ticketStage(t.status)]++;
    });
    return counts;
  }, [searchScopedTickets]);

  const selectListScope = useCallback((scope: "all" | "mine" | "online") => {
    setListScope(scope);
    setActiveFilter("all");
  }, []);

  const toggleSearchOpen = useCallback(() => {
    setSearchOpen((v) => {
      const next = !v;
      if (!next) setSearch("");
      return next;
    });
  }, []);

  return {
    tickets,
    loading,
    err,
    listScope,
    selectListScope,
    busyId,
    rowMsg,
    phonePrompt,
    setPhonePrompt,
    activeFilter,
    setActiveFilter,
    searchOpen,
    search,
    setSearch,
    toggleSearchOpen,
    mergeTargetId,
    mergeConfirm,
    setMergeConfirm,
    mergeBusy,
    splitFor,
    setSplitFor,
    filteredTickets,
    allCount,
    paymentCounts,
    typeCounts,
    stageCounts,
    handleFireToKitchen,
    handleSendPayLink,
    handleStartCooking,
    handleMarkReady,
    confirmVoidTicket,
    handleMarkPickedUp,
    handleSendBill,
    submitPhonePrompt,
    handlePrintBill,
    handleStartMerge,
    handleCancelMerge,
    handlePickMergeSource,
    handleConfirmMerge,
    handleSplitConfirm,
  };
}
