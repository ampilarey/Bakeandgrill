import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getOrCreateDeviceId, writeStored } from "@shared/auth";
import {
  bumpOrder,
  failureMessage,
  kdsToken,
  kdsUsername,
  KDS_DEVICE_ID_KEY,
  fetchKdsActivity,
  fetchKdsOrders,
  fetchKdsMenuGroups,
  fetchMe,
  hasKdsPermission,
  kitchenDoneOrder,
  markItem86,
  printKitchenTicket,
  recallOrder,
  registerKdsDevice,
  staffLogin,
  startOrder,
  markOrderItemCooked,
  type KdsActivityRow,
  type KdsMenuGroup,
  type KdsOrder,
  type KdsStaffUser,
} from "./api";
import { KdsPurchaseRequestOverlay } from "./components/KdsPurchaseRequestOverlay";
import { KitchenProductionPanel } from "./components/kitchen-production/KitchenProductionPanel";
import { useKdsSse } from "./hooks/useKdsSse";
import { isAudioEnabled, playChime, playLateAlert, setAudioEnabled } from "./utils/audio";
import { elapsed, isLateTicket, minutesSince, urgencyLevel } from "./utils/kdsDisplay";

const PREP_TARGET_DEFAULT = 12;

function ticketPrepTarget(order: KdsOrder): number {
  const times = order.items
    .map((line) => line.prep_time_minutes)
    .filter((v): v is number => v != null && v > 0);
  return times.length ? Math.max(...times) : PREP_TARGET_DEFAULT;
}

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/**
 * The column. Kitchen audit, 2026-09-26: from the server's lane, which reads
 * the kitchen's own timestamps; the status alone put a ticket paid mid-cook
 * back under Pending with the start button and the new-order chime.
 */
function laneOf(order: KdsOrder): "new" | "cooking" | "ready" | "cancelled" {
  if (order.kitchen_lane) return order.kitchen_lane;
  if (order.status === "cancelled") return "cancelled";
  if (order.status === "ready") return "ready";
  if (["in_progress", "preparing"].includes(order.status)) return "cooking";
  return "new";
}

/** When the ticket's clock started: fired, paid online, or a slot's lead time. */
const clockOf = (order: KdsOrder): string => order.kitchen_clock_at || order.created_at;

/**
 * Where the food is going, as the ticket's first tag. Delivery keeps its own
 * island tag below; the rest were not on the ticket at all, so a cook could
 * not tell a takeaway bag from a plate for table four.
 */
const ORDER_TYPE_LABEL: Record<string, string> = {
  dine_in: "Dine-in",
  takeaway: "Takeaway",
  online_pickup: "Pickup",
  catering: "Catering",
  wholesale: "Wholesale",
};

function orderTypeTag(type: string | undefined): string | null {
  if (!type || type === "delivery") return null;
  return ORDER_TYPE_LABEL[type] ?? type.replace(/_/g, " ");
}

/*
 * One column of the board. Defined here, at module level, on purpose: it
 * used to be declared inside App's render, which gave React a brand-new
 * component type on every render — every poll, every 30-second clock tick —
 * so each lane was torn down and rebuilt from scratch. A cook who had
 * scrolled a busy Cooking lane to the bottom was thrown back to the top of
 * it twice a minute.
 */
function Lane({ title, items, flash, renderTicket }: {
  title: string;
  items: KdsOrder[];
  flash?: boolean;
  renderTicket: (order: KdsOrder) => ReactNode;
}) {
  return (
    <section className="kds-lane" data-testid={`kds-lane-${title.toLowerCase()}`}>
      <div className="kds-lane-head" data-flash={flash ? "true" : "false"}>
        <h2 className="kds-lane-title">{title}{flash ? " — new!" : ""}</h2>
        <span className="kds-lane-count">{items.length}</span>
      </div>
      <div className="kds-lane-body">
        {items.length === 0
          ? <p className="kds-lane-empty">Nothing here.</p>
          : items.map(renderTicket)}
      </div>
    </section>
  );
}

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState(() => kdsUsername.get() ?? "");
  const [pin, setPin] = useState("");
  const [staffUser, setStaffUser] = useState<KdsStaffUser | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  // getOrCreateDeviceId falls back when crypto.randomUUID is unavailable.
  // That call is secure-context only, so a kitchen screen reached over plain
  // HTTP used to throw here while the component was initialising and render
  // nothing at all.
  const [deviceId, setDeviceId] = useState(() => getOrCreateDeviceId(KDS_DEVICE_ID_KEY, 'KDS'));
  const [token, setToken] = useState<string | null>(null);
  const [orders, setOrders] = useState<KdsOrder[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [newTicketFlash, setNewTicketFlash] = useState(false);
  const [audioOn, setAudioOn] = useState(isAudioEnabled);
  const [clockTick, setClockTick] = useState(0);
  const [stationFilter, setStationFilter] = useState<number | "all">("all");
  const [menuGroups, setMenuGroups] = useState<KdsMenuGroup[]>([]);
  const [eightySixing, setEightySixing] = useState<number | null>(null);
  const [prOverlay, setPrOverlay] = useState<null | "request" | "my" | "buying" | "receive">(null);
  const [viewMode, setViewMode] = useState<"board" | "production">("board");
  // Off by default: the board is for cooking, and who-did-what is a
  // question asked occasionally rather than read continuously.
  const [showActivity, setShowActivity] = useState(false);
  // On a phone the bar's nine buttons took four rows — a third of the screen
  // before the first ticket. The ones a cook reaches for between tickets
  // stay out; the rest sit behind "More". Desktop shows everything.
  const [moreOpen, setMoreOpen] = useState(false);
  const [activity, setActivity] = useState<KdsActivityRow[]>([]);
  // Pickups booked for later today, held off the board until their lead time.
  const [laterToday, setLaterToday] = useState(0);

  const prevPendingIdsRef = useRef<Set<number>>(new Set());
  const isFirstLoadRef = useRef(true);
  const lateAlertedRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    const saved = kdsToken.get();
    if (saved) {
      setToken(saved);
      fetchMe(saved)
        .then((me) => {
          setStaffUser(me);
          setPermissions(me.permissions ?? []);
          if (hasKdsPermission(me.permissions ?? [], "kds.view")) {
            setIsLoggedIn(true);
          } else {
            kdsToken.clear();
            setToken(null);
            setErrorMessage("No KDS access for this account.");
          }
        })
        .catch(() => {
          kdsToken.clear();
          setToken(null);
        });
    }
  }, []);

  const load = useCallback(async (authToken: string) => {
    try {
      const [data, groups, activityRows] = await Promise.all([
        fetchKdsOrders(authToken, (meta) => setLaterToday(meta.laterToday)),
        fetchKdsMenuGroups(authToken).catch(() => [] as KdsMenuGroup[]),
        fetchKdsActivity(authToken).catch(() => [] as KdsActivityRow[]),
      ]);
      setOrders(data);
      setMenuGroups(groups);
      setActivity(activityRows);
      setErrorMessage("");

      const pendingLike = data.filter((o) => laneOf(o) === "new");
      const newIds = pendingLike
        .filter((o) => !prevPendingIdsRef.current.has(o.id))
        .map((o) => o.id);
      prevPendingIdsRef.current = new Set(pendingLike.map((o) => o.id));

      if (!isFirstLoadRef.current && newIds.length > 0) {
        playChime();
        setNewTicketFlash(true);
        setTimeout(() => setNewTicketFlash(false), 2500);
      }
      isFirstLoadRef.current = false;

      // Late alarm for tickets still being cooked as well as those not yet
      // started (kitchen audit, 2026-09-26: a stuck Cooking ticket never sounded).
      for (const order of data.filter((o) => ["new", "cooking"].includes(laneOf(o)))) {
        const target = ticketPrepTarget(order);
        if (isLateTicket(clockOf(order), target) && !lateAlertedRef.current.has(order.id)) {
          lateAlertedRef.current.add(order.id);
          playLateAlert();
        }
      }
    } catch (error: unknown) {
      const status = (error as { status?: number })?.status;
      if (status === 401) {
        kdsToken.clear();
        setToken(null);
        setIsLoggedIn(false);
        setOrders([]);
        isFirstLoadRef.current = true;
        prevPendingIdsRef.current = new Set();
        lateAlertedRef.current = new Set();
        return;
      }
      setErrorMessage("Connection lost. Retrying…");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    setIsLoading(true);
    void load(token);
  }, [token, load]);

  // Every order change now sends an event, so a burst (a payment touching
  // several rows) is folded into one reload.
  const sseReloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSseEvent = useCallback(() => {
    if (!token) return;
    if (sseReloadTimer.current) clearTimeout(sseReloadTimer.current);
    sseReloadTimer.current = setTimeout(() => {
      sseReloadTimer.current = null;
      void load(token);
    }, 300);
  }, [token, load]);
  useEffect(() => () => {
    if (sseReloadTimer.current) clearTimeout(sseReloadTimer.current);
  }, []);

  const { connected: sseConnected } = useKdsSse({
    token,
    onEvent: handleSseEvent,
    enabled: isLoggedIn,
  });

  // Fifteen seconds while polling is all there is; a slow backstop even
  // while the stream is live, so a missed event costs a minute, not a service.
  useEffect(() => {
    if (!token) return;
    const poll = () => void load(token);
    const timerId = window.setInterval(poll, sseConnected ? 60_000 : 15_000);
    return () => window.clearInterval(timerId);
  }, [token, sseConnected, load]);

  useEffect(() => {
    if (!token) return;
    const timerId = window.setInterval(() => setClockTick((t) => t + 1), 30_000);
    return () => window.clearInterval(timerId);
  }, [token]);

  const filteredOrders = useMemo(() => {
    if (stationFilter === "all") return orders;
    return orders.filter((order) =>
      order.items.some((line) => line.menu_group_id === stationFilter),
    );
  }, [orders, stationFilter]);

  // A cancelled ticket stays a few minutes, flagged, in the lane where the
  // cook last saw it: Cooking once started, Pending before.
  const pendingOrders = useMemo(
    () => filteredOrders.filter((o) => laneOf(o) === "new"
      || (laneOf(o) === "cancelled" && !o.kitchen_started_at)),
    [filteredOrders],
  );
  const inProgressOrders = useMemo(
    () => filteredOrders.filter((o) => laneOf(o) === "cooking"
      || (laneOf(o) === "cancelled" && !!o.kitchen_started_at)),
    [filteredOrders],
  );
  const readyOrders = useMemo(
    () => filteredOrders.filter((o) => laneOf(o) === "ready"),
    [filteredOrders],
  );

  const avgWait = (items: KdsOrder[]) => {
    const live = items.filter((t) => laneOf(t) !== "cancelled");
    return live.length
      ? Math.round(live.reduce((sum, t) => sum + minutesSince(clockOf(t)), 0) / live.length)
      : 0;
  };

  void clockTick;

  const handle86 = (itemId: number, currentlyAvailable: boolean) => {
    if (!token) return;
    setEightySixing(itemId);
    // The state the button showed, not a toggle.
    markItem86(token, itemId, !currentlyAvailable)
      .then(() => void load(token))
      .catch((err: unknown) => setErrorMessage(failureMessage(
        err,
        currentlyAvailable ? "Failed to mark item sold out." : "Failed to restore item.",
      )))
      .finally(() => setEightySixing(null));
  };

  // Once per sign-in: the screen introduces itself so it is listed by name
  // under Devices. Failing to is not worth a banner — the first action will
  // say what is wrong, with the server's own words.
  useEffect(() => {
    if (!isLoggedIn || !token) return;
    void registerKdsDevice(token, deviceId.trim()).catch(() => undefined);
  }, [isLoggedIn, token, deviceId]);

  const canStart = hasKdsPermission(permissions, "kds.start_order");
  const canKitchenDone = hasKdsPermission(permissions, "kds.mark_kitchen_done");
  const canBump = hasKdsPermission(permissions, "kds.bump_order");
  const canRecall = hasKdsPermission(permissions, "kds.recall_order");
  const can86 = hasKdsPermission(permissions, "kds.manage_availability");
  const canPrint = hasKdsPermission(permissions, "kds.print_ticket");
  const canCreatePurchaseRequest = hasKdsPermission(permissions, "purchase_requests.create");
  const canViewOwnPurchaseRequests = hasKdsPermission(permissions, "purchase_requests.view_own");
  const canBuyAssigned = hasKdsPermission(permissions, "purchase_requests.buy");
  // The delivery arrives at the kitchen door, so the cook standing there can
  // take it in. Whoever bought it still cannot — the server decides that.
  const canReceiveDeliveries = hasKdsPermission(permissions, "purchase_requests.receive");
  const canProduce = hasKdsPermission(permissions, "kitchen.production.create");
  const canPreparedStock = hasKdsPermission(permissions, "kitchen.production.create");

  const handleLogin = async () => {
    setErrorMessage("");
    if (username.trim().length < 3) {
      setErrorMessage("Enter your email or phone.");
      return;
    }
    if (pin.trim().length < 4) {
      setErrorMessage("Enter a valid PIN.");
      return;
    }

    try {
      const tokenValue = await staffLogin(username.trim(), pin.trim(), deviceId.trim());
      const me = await fetchMe(tokenValue);
      if (!hasKdsPermission(me.permissions ?? [], "kds.view")) {
        setErrorMessage("No KDS access for this account.");
        return;
      }
      kdsToken.set(tokenValue);
      kdsUsername.set(username.trim());
      writeStored(KDS_DEVICE_ID_KEY, deviceId.trim());
      setStaffUser(me);
      setPermissions(me.permissions ?? []);
      isFirstLoadRef.current = true;
      prevPendingIdsRef.current = new Set();
      lateAlertedRef.current = new Set();
      setToken(tokenValue);
      setIsLoggedIn(true);
      setPin("");
    } catch {
      setErrorMessage("Login failed. Check your email/phone and PIN.");
    }
  };

  const handleStart = (orderId: number) => {
    if (!token) return;
    startOrder(token, orderId)
      .then(() => void load(token))
      .catch((err: unknown) => setErrorMessage(failureMessage(err, `Failed to start order #${orderId}. Please retry.`)));
  };

  const handleBump = (orderId: number) => {
    if (!token) return;
    bumpOrder(token, orderId)
      .then(() => void load(token))
      .catch((err: unknown) => setErrorMessage(failureMessage(err, `Failed to complete order #${orderId}. Please retry.`)));
  };

  const handleKitchenDone = (orderId: number) => {
    if (!token) return;
    kitchenDoneOrder(token, orderId)
      .then(() => void load(token))
      .catch((err: unknown) => setErrorMessage(failureMessage(err, `Failed to mark order #${orderId} kitchen done.`)));
  };

  const handleItemCooked = (orderId: number, itemId: number) => {
    if (!token) return;
    markOrderItemCooked(token, orderId, itemId)
      .then(() => void load(token))
      .catch((err: unknown) => setErrorMessage(failureMessage(err, "Failed to mark item cooked.")));
  };

  const handlePrint = (orderId: number) => {
    if (!token) return;
    printKitchenTicket(token, orderId)
      .then(() => setErrorMessage(""))
      .catch((err: unknown) => setErrorMessage(failureMessage(err, `Failed to queue print for order #${orderId}.`)));
  };

  const handleLogout = () => {
    kdsToken.clear();
    setToken(null);
    setStaffUser(null);
    setPermissions([]);
    setIsLoggedIn(false);
    setOrders([]);
    isFirstLoadRef.current = true;
    prevPendingIdsRef.current = new Set();
    lateAlertedRef.current = new Set();
  };

  const handleRecall = (orderId: number) => {
    if (!token) return;
    recallOrder(token, orderId)
      .then(() => void load(token))
      .catch((err: unknown) => setErrorMessage(failureMessage(err, `Failed to recall order #${orderId}. Please retry.`)));
  };

  const toggleAudio = () => {
    const next = !audioOn;
    setAudioOn(next);
    setAudioEnabled(next);
  };

  // A screen with a keyboard attached — a laptop in the pass, a tablet in a
  // case — can type the PIN as well as tap it, as the till can. Only while
  // signed out, and never while the cursor is in a text field.
  const loginRef = useRef(handleLogin);
  loginRef.current = handleLogin;
  useEffect(() => {
    if (isLoggedIn) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.tagName === "INPUT") return;
      if (/^[0-9]$/.test(e.key)) setPin((p) => (p.length < 8 ? p + e.key : p));
      else if (e.key === "Backspace") setPin((p) => p.slice(0, -1));
      else if (e.key === "Escape") setPin("");
      else if (e.key === "Enter") void loginRef.current();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isLoggedIn]);

  if (!isLoggedIn) {
    const appendPin = (d: string) => { if (pin.length < 8) setPin((p) => p + d); };
    const backPin = () => setPin((p) => p.slice(0, -1));
    const clearPin = () => setPin("");

    return (
      <div className="kds-signin">
        <div className="kds-signin-card">
          <div style={{ textAlign: "center", marginBottom: 22 }}>
            <img src="/logo.png" alt="Bake &amp; Grill" style={{ width: 60, height: 60, borderRadius: 14, marginBottom: 10 }} />
            <p style={{ color: "var(--kds-ink-dim)", fontSize: 15, margin: 0, fontWeight: 700 }}>
              Kitchen Display — sign in
            </p>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label className="kds-field" htmlFor="kds-username">Email or phone</label>
            <input
              id="kds-username"
              className="kds-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
              autoComplete="username"
            />
          </div>

          <div style={{ marginBottom: 18 }}>
            <label className="kds-field" htmlFor="kds-device">Device ID</label>
            <input
              id="kds-device"
              className="kds-input"
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 18, minHeight: 30, alignItems: "center" }}>
            {pin.length === 0 ? (
              <span style={{ color: "var(--kds-ink-faint)", fontSize: 14 }}>Enter your PIN below</span>
            ) : (
              Array.from({ length: pin.length }).map((_, i) => (
                <div key={i} style={{ width: 15, height: 15, borderRadius: "50%", background: "var(--kds-accent)" }} />
              ))
            )}
          </div>

          {errorMessage && (
            <div className="kds-banner" style={{ margin: "0 0 14px" }} role="alert">
              {errorMessage}
            </div>
          )}

          <div className="kds-keypad">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((d) => (
              <button
                key={d || "blank"}
                type="button"
                className="kds-key"
                aria-label={d === "⌫" ? "Delete last digit" : d === "" ? undefined : `Digit ${d}`}
                onClick={() => {
                  if (d === "⌫") backPin();
                  else if (d !== "") appendPin(d);
                }}
                disabled={d === ""}
                style={d === "⌫" ? { color: "var(--kds-accent)" } : undefined}
              >
                {d}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button type="button" className="kds-btn" style={{ flex: 1, minHeight: 52 }} onClick={clearPin}>
              Clear
            </button>
            <button
              type="button"
              className="kds-btn kds-btn--primary"
              style={{ flex: 2, minHeight: 52, opacity: pin.length < 4 ? 0.5 : 1 }}
              disabled={pin.length < 4}
              onClick={() => void handleLogin()}
            >
              Sign in →
            </button>
          </div>

          <div style={{ marginTop: 14, textAlign: "center" }}>
            <a href="/" style={{ fontSize: 13, color: "var(--kds-ink-faint)", textDecoration: "none" }}>← Main website</a>
          </div>

          {import.meta.env.DEV && (
            <p style={{ fontSize: 11, color: "var(--kds-ink-faint)", marginTop: 12, textAlign: "center", lineHeight: 1.6 }}>
              Dev PINs: Owner (1111) · Admin (2222) · Manager (3333) · Cashier (4444)
            </p>
          )}
        </div>
      </div>
    );
  }

  const renderTicket = (order: KdsOrder) => {
    const prepTarget = ticketPrepTarget(order);
    const lane = laneOf(order);
    const cancelled = lane === "cancelled";
    const clock = clockOf(order);
    const overdue = !cancelled && minutesSince(clock) >= prepTarget
      && !["ready", "completed"].includes(order.status);
    const cooking = lane === "cooking";

    return (
      <article
        key={order.id}
        className={cancelled ? "kds-ticket kds-ticket--cancelled" : "kds-ticket"}
        data-urgency={cancelled ? "cancelled" : urgencyLevel(clock)}
        data-overdue={overdue ? "true" : "false"}
        data-lane={lane}
        data-testid="kds-ticket"
      >
        {cancelled && (
          <div className="kds-cancelled" role="alert" data-testid="kds-cancelled">
            CANCELLED — stop, do not make
          </div>
        )}
        <div className="kds-ticket-head">
          <div className="kds-ticket-ref">
            <div className="kds-ticket-number">#{order.order_number}</div>
            <div className="kds-ticket-where">
              {overdue && <span className="kds-tag kds-tag--late">Overdue</span>}
              {orderTypeTag(order.type) && (
                <span className="kds-tag kds-tag--type" data-testid="kds-order-type">{orderTypeTag(order.type)}</span>
              )}
              {order.type === "delivery" && (
                <span className="kds-tag kds-tag--delivery">🛵 {order.delivery_island || "Delivery"}</span>
              )}
              {order.table_number && <span className="kds-tag">Table {order.table_number}</span>}
              {order.pickup_slot_at && (
                <span className="kds-tag kds-tag--slot" data-testid="kds-pickup-time">
                  For {formatTime(order.pickup_slot_at)}
                </span>
              )}
              {order.kitchen_done_at && <span className="kds-tag kds-tag--done">Kitchen done</span>}
            </div>
          </div>
          <div className="kds-timer">
            <div className="kds-timer-value">{cancelled ? "—" : elapsed(clock)}</div>
            <div className="kds-timer-at">{formatTime(clock)}</div>
          </div>
        </div>

        {order.notes && <p className="kds-ticket-note">{order.notes}</p>}
        {order.customer_notes && (
          <p className="kds-ticket-note" data-testid="kds-customer-note">Customer: {order.customer_notes}</p>
        )}

        <div className="kds-lines">
          {order.items.map((item) => (
            <div
              key={item.id}
              className="kds-line"
              data-child={item.parent_order_item_id ? "true" : "false"}
              data-testid={item.parent_order_item_id ? "kds-platter-child" : "kds-line"}
            >
              <div className="kds-qty">{item.quantity}×</div>
              <div className="kds-line-body">
                <div className="kds-dish">
                  {item.parent_order_item_id ? `↳ ${item.item_name}` : item.item_name}
                  {item.variant_name && (
                    <span className="kds-variant" data-testid="kds-variant"> · {item.variant_name}</span>
                  )}
                </div>
                {item.modifiers && item.modifiers.length > 0 && (
                  <div className="kds-line-note kds-line-note--mods">
                    {item.modifiers.map((mod) => mod.modifier_name).join(" · ")}
                  </div>
                )}
                {/* The cashier's per-line note — "no onions", "well done" —
                    was sent by the till and printed on paper, but the screen
                    dropped it. It is the one line a cook must not miss. */}
                {item.notes && (
                  <div className="kds-line-note kds-line-note--instruction" data-testid="kds-line-note">
                    {item.notes}
                  </div>
                )}
                {/* A fixed bundle used to print as one line with its name, so
                    the kitchen had to know the recipe from memory. Indented
                    like a platter's picks — same shape on the ticket, because
                    it is the same question. */}
                {item.bundle_contents && item.bundle_contents.length > 0 && (
                  <div className="kds-sub" data-testid="kds-bundle-contents">
                    {item.bundle_contents.map((row, i) => (
                      <div key={`${row.name}-${i}`}>↳ {row.quantity}× {row.name}</div>
                    ))}
                  </div>
                )}
                {item.kitchen_produced_qty != null && (
                  <div className="kds-line-note kds-line-note--cooked">
                    Cooked {item.kitchen_produced_qty}/{item.quantity}
                  </div>
                )}
                {/* The recipe's method, folded away: typed in the recipe
                    editor and, until the 2026-09-17 audit, shown nowhere. */}
                {item.recipe_instructions && (
                  <details className="kds-recipe" data-testid="kds-recipe">
                    <summary>How to make</summary>
                    <div className="kds-recipe-body">{item.recipe_instructions}</div>
                  </details>
                )}
              </div>
              <div className="kds-line-actions">
                {canProduce && cooking && (item.kitchen_produced_qty ?? 0) < item.quantity && (
                  <button
                    type="button"
                    className="kds-chip kds-chip--cooked"
                    onClick={() => handleItemCooked(order.id, item.id)}
                  >
                    Cooked
                  </button>
                )}
                {item.item_id && can86 ? (
                  <button
                    type="button"
                    className={item.is_available === false ? "kds-chip kds-chip--restore" : "kds-chip kds-chip--86"}
                    onClick={() => handle86(item.item_id!, item.is_available !== false)}
                    disabled={eightySixing === item.item_id}
                  >
                    {eightySixing === item.item_id ? "…" : item.is_available === false ? "Restore" : "Sold out"}
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        {!cancelled && <div className="kds-actions">
          {lane === "new" && canStart && (
            <button type="button" className="kds-action kds-action--start" onClick={() => handleStart(order.id)}>
              Start cooking
            </button>
          )}
          {cooking && (
            <>
              {canKitchenDone && !order.kitchen_done_at && (
                <button type="button" className="kds-action kds-action--done" onClick={() => handleKitchenDone(order.id)}>
                  Kitchen done
                </button>
              )}
              {order.kitchen_done_at && (
                <div className="kds-waiting">Waiting for cashier to mark ready</div>
              )}
              {!canKitchenDone && !order.kitchen_done_at && (
                <div className="kds-waiting">Ready? Tell the cashier — they mark it from POS</div>
              )}
              {canPrint && (
                <button type="button" className="kds-action kds-action--quiet" onClick={() => handlePrint(order.id)}>
                  Print
                </button>
              )}
            </>
          )}
          {order.status === "ready" && (
            <>
              {canBump && (
                <button type="button" className="kds-action kds-action--complete" onClick={() => handleBump(order.id)}>
                  Complete ✓
                </button>
              )}
              {canRecall && (
                <button type="button" className="kds-action kds-action--quiet" onClick={() => handleRecall(order.id)}>
                  Recall
                </button>
              )}
            </>
          )}
        </div>}
      </article>
    );
  };

  const overPrepTarget = [...pendingOrders, ...inProgressOrders]
    .filter((t) => laneOf(t) !== "cancelled" && minutesSince(clockOf(t)) >= ticketPrepTarget(t)).length;

  return (
    <div className="kds-shell">
      <header className="kds-topbar" data-more={moreOpen ? "true" : "false"}>
        <h1 className="kds-brand">Bake &amp; Grill KDS</h1>
        <span className="kds-who">
          {staffUser?.name ?? "Kitchen"} · {deviceId}
        </span>

        <select
          className="kds-select"
          aria-label="Station"
          value={stationFilter === "all" ? "all" : String(stationFilter)}
          onChange={(e) => setStationFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
        >
          <option value="all">All stations</option>
          {menuGroups.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>

        {/* The four figures that used to cost ninety pixels of board, inline.
            A chef checks these between tickets, not while reading one. */}
        <div className="kds-vitals">
          <span className="kds-vital">
            <span className="kds-vital-value">{avgWait(pendingOrders)}m</span>
            <span className="kds-vital-label">wait</span>
          </span>
          <span className="kds-vital">
            <span className="kds-vital-value">{avgWait(inProgressOrders)}m</span>
            <span className="kds-vital-label">cooking</span>
          </span>
          <span className="kds-vital">
            <span className="kds-vital-value" style={{ color: overPrepTarget > 0 ? "var(--kds-late)" : undefined }}>
              {overPrepTarget}
            </span>
            <span className="kds-vital-label">over target</span>
          </span>
        </div>

        {laterToday > 0 && (
          <span className="kds-later" data-testid="kds-later-today" title="Pickups booked for later today. Each one comes onto the board before its time.">
            {laterToday} later today
          </span>
        )}

        <div className="kds-topbar-spacer" />

        <span className="kds-live" data-state={sseConnected ? "live" : "polling"}>
          {sseConnected ? "● Live" : isLoading ? "Refreshing…" : "○ Polling"}
        </span>
        {canCreatePurchaseRequest && (
          <button type="button" className="kds-btn kds-btn--primary" onClick={() => setPrOverlay("request")}>
            Request item
          </button>
        )}
        {canProduce && (
          <button
            type="button"
            className={viewMode === "production" ? "kds-btn kds-btn--on" : "kds-btn"}
            onClick={() => setViewMode((m) => (m === "board" ? "production" : "board"))}
          >
            {viewMode === "production" ? "Ticket board" : "Production"}
          </button>
        )}
        <button
          type="button"
          className="kds-btn kds-more"
          aria-expanded={moreOpen}
          aria-controls="kds-topbar-tools"
          onClick={() => setMoreOpen((v) => !v)}
        >
          {moreOpen ? "Less ▴" : "More ▾"}
        </button>
        <div className="kds-topbar-tools" id="kds-topbar-tools" data-testid="kds-topbar-tools">
          <button type="button" className="kds-btn" onClick={toggleAudio} aria-pressed={audioOn}>
            {audioOn ? "🔔 Sound on" : "🔕 Sound off"}
          </button>
          {canViewOwnPurchaseRequests && (
            <button type="button" className="kds-btn" onClick={() => setPrOverlay("my")}>My requests</button>
          )}
          {canBuyAssigned && (
            <button type="button" className="kds-btn" onClick={() => setPrOverlay("buying")}>Buying list</button>
          )}
          {canReceiveDeliveries && (
            <button type="button" className="kds-btn" onClick={() => setPrOverlay("receive")}>To receive</button>
          )}
          {activity.length > 0 && (
            <button
              type="button"
              className="kds-btn"
              onClick={() => setShowActivity((v) => !v)}
              aria-expanded={showActivity}
            >
              {showActivity ? "Hide activity" : "Activity"}
            </button>
          )}
          <button type="button" className="kds-btn" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      {errorMessage && <div className="kds-banner" role="alert">{errorMessage}</div>}

      <main className={viewMode === "production" ? "kds-board kds-board--single" : "kds-board"}>
        {viewMode === "production" && token ? (
          <KitchenProductionPanel
            token={token}
            orders={orders}
            canProduce={canProduce}
            canPreparedStock={canPreparedStock}
            userId={staffUser?.id ?? null}
            onRefresh={() => void load(token)}
          />
        ) : (
          <>
            <Lane title="Pending" items={pendingOrders} flash={newTicketFlash} renderTicket={renderTicket} />
            <Lane title="Cooking" items={inProgressOrders} renderTicket={renderTicket} />
            <Lane title="Ready" items={readyOrders} renderTicket={renderTicket} />
          </>
        )}
      </main>

      {/* Who did what, on request. It is a manager's question, and on a board
          it was costing four lines of ticket space to answer it unasked. */}
      {showActivity && activity.length > 0 && (
        <div className="kds-activity">
          {activity.slice(0, 8).map((row) => (
            <div key={row.id} className="kds-activity-row">
              <span>
                <strong>{row.user_name}</strong>
                {" · "}
                {row.action.replace(/^order\.|^item\.|^kitchen\./, "").replace(/_/g, " ")}
                {row.model_id != null ? ` #${row.model_id}` : ""}
              </span>
              <span>{row.created_at ? formatTime(row.created_at) : ""}</span>
            </div>
          ))}
        </div>
      )}

      {prOverlay && token && (
        <KdsPurchaseRequestOverlay token={token} mode={prOverlay} onClose={() => setPrOverlay(null)} />
      )}
    </div>
  );
}

export default App;
