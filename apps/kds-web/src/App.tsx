import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getOrCreateDeviceId, writeStored } from "@shared/auth";
import {
  bumpOrder,
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
  const [activity, setActivity] = useState<KdsActivityRow[]>([]);

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
        fetchKdsOrders(authToken),
        fetchKdsMenuGroups(authToken).catch(() => [] as KdsMenuGroup[]),
        fetchKdsActivity(authToken).catch(() => [] as KdsActivityRow[]),
      ]);
      setOrders(data);
      setMenuGroups(groups);
      setActivity(activityRows);
      setErrorMessage("");

      const pendingLike = data.filter((o) =>
        ["pending", "paid", "partial"].includes(o.status),
      );
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

      for (const order of pendingLike) {
        const target = ticketPrepTarget(order);
        if (isLateTicket(order.created_at, target) && !lateAlertedRef.current.has(order.id)) {
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

  const handleSseEvent = useCallback(() => {
    if (token) void load(token);
  }, [token, load]);

  const { connected: sseConnected } = useKdsSse({
    token,
    onEvent: handleSseEvent,
    enabled: isLoggedIn,
  });

  useEffect(() => {
    if (!token || sseConnected) return;
    const poll = () => void load(token);
    const timerId = window.setInterval(poll, 15_000);
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

  const pendingOrders = useMemo(
    () => filteredOrders.filter((o) => ["pending", "paid", "partial"].includes(o.status)),
    [filteredOrders],
  );
  const inProgressOrders = useMemo(
    () => filteredOrders.filter((o) => ["in_progress", "preparing"].includes(o.status)),
    [filteredOrders],
  );
  const readyOrders = useMemo(
    () => filteredOrders.filter((o) => o.status === "ready"),
    [filteredOrders],
  );

  const avgWait = (items: KdsOrder[]) =>
    items.length
      ? Math.round(items.reduce((sum, t) => sum + minutesSince(t.created_at), 0) / items.length)
      : 0;

  void clockTick;

  const handle86 = (itemId: number, currentlyAvailable: boolean) => {
    if (!token) return;
    setEightySixing(itemId);
    markItem86(token, itemId)
      .then(() => void load(token))
      .catch(() => setErrorMessage(
        currentlyAvailable ? "Failed to mark item sold out." : "Failed to restore item.",
      ))
      .finally(() => setEightySixing(null));
  };

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
      .catch(() => setErrorMessage(`Failed to start order #${orderId}. Please retry.`));
  };

  const handleBump = (orderId: number) => {
    if (!token) return;
    bumpOrder(token, orderId)
      .then(() => void load(token))
      .catch(() => setErrorMessage(`Failed to complete order #${orderId}. Please retry.`));
  };

  const handleKitchenDone = (orderId: number) => {
    if (!token) return;
    kitchenDoneOrder(token, orderId)
      .then(() => void load(token))
      .catch(() => setErrorMessage(`Failed to mark order #${orderId} kitchen done.`));
  };

  const handleItemCooked = (orderId: number, itemId: number) => {
    if (!token) return;
    markOrderItemCooked(token, orderId, itemId)
      .then(() => void load(token))
      .catch(() => setErrorMessage("Failed to mark item cooked."));
  };

  const handlePrint = (orderId: number) => {
    if (!token) return;
    printKitchenTicket(token, orderId)
      .then(() => setErrorMessage(""))
      .catch(() => setErrorMessage(`Failed to queue print for order #${orderId}.`));
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
      .catch(() => setErrorMessage(`Failed to recall order #${orderId}. Please retry.`));
  };

  const toggleAudio = () => {
    const next = !audioOn;
    setAudioOn(next);
    setAudioEnabled(next);
  };

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
    const overdue = minutesSince(order.created_at) >= prepTarget
      && !["ready", "completed"].includes(order.status);
    const cooking = ["in_progress", "preparing"].includes(order.status);

    return (
      <article
        key={order.id}
        className="kds-ticket"
        data-urgency={urgencyLevel(order.created_at)}
        data-overdue={overdue ? "true" : "false"}
        data-testid="kds-ticket"
      >
        <div className="kds-ticket-head">
          <div className="kds-ticket-ref">
            <div className="kds-ticket-number">#{order.order_number}</div>
            <div className="kds-ticket-where">
              {overdue && <span className="kds-tag kds-tag--late">Overdue</span>}
              {order.delivery_island && (
                <span className="kds-tag kds-tag--delivery">🛵 {order.delivery_island}</span>
              )}
              {order.table_number && <span className="kds-tag">Table {order.table_number}</span>}
              {order.kitchen_done_at && <span className="kds-tag kds-tag--done">Kitchen done</span>}
            </div>
          </div>
          <div className="kds-timer">
            <div className="kds-timer-value">{elapsed(order.created_at)}</div>
            <div className="kds-timer-at">{formatTime(order.created_at)}</div>
          </div>
        </div>

        {order.notes && <p className="kds-ticket-note">{order.notes}</p>}

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
                </div>
                {item.modifiers && item.modifiers.length > 0 && (
                  <div className="kds-line-note kds-line-note--mods">
                    {item.modifiers.map((mod) => mod.modifier_name).join(" · ")}
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

        <div className="kds-actions">
          {["pending", "paid", "partial"].includes(order.status) && canStart && (
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
        </div>
      </article>
    );
  };

  const Lane = ({ title, items, flash }: { title: string; items: KdsOrder[]; flash?: boolean }) => (
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

  const overPrepTarget = [...pendingOrders, ...inProgressOrders]
    .filter((t) => minutesSince(t.created_at) >= ticketPrepTarget(t)).length;

  return (
    <div className="kds-shell">
      <header className="kds-topbar">
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

        <div className="kds-topbar-spacer" />

        <span className="kds-live" data-state={sseConnected ? "live" : "polling"}>
          {sseConnected ? "● Live" : isLoading ? "Refreshing…" : "○ Polling"}
        </span>
        <button type="button" className="kds-btn" onClick={toggleAudio} aria-pressed={audioOn}>
          {audioOn ? "🔔 Sound on" : "🔕 Sound off"}
        </button>
        {canCreatePurchaseRequest && (
          <button type="button" className="kds-btn kds-btn--primary" onClick={() => setPrOverlay("request")}>
            Request item
          </button>
        )}
        {canViewOwnPurchaseRequests && (
          <button type="button" className="kds-btn" onClick={() => setPrOverlay("my")}>My requests</button>
        )}
        {canBuyAssigned && (
          <button type="button" className="kds-btn" onClick={() => setPrOverlay("buying")}>Buying list</button>
        )}
        {canReceiveDeliveries && (
          <button type="button" className="kds-btn" onClick={() => setPrOverlay("receive")}>To receive</button>
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
      </header>

      {errorMessage && <div className="kds-banner" role="alert">{errorMessage}</div>}

      <main className={viewMode === "production" ? "kds-board kds-board--single" : "kds-board"}>
        {viewMode === "production" && token ? (
          <KitchenProductionPanel
            token={token}
            orders={orders}
            canProduce={canProduce}
            canPreparedStock={canPreparedStock}
            onRefresh={() => void load(token)}
          />
        ) : (
          <>
            <Lane title="Pending" items={pendingOrders} flash={newTicketFlash} />
            <Lane title="Cooking" items={inProgressOrders} />
            <Lane title="Ready" items={readyOrders} />
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
