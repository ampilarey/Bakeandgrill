import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  bumpOrder,
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
  type KdsMenuGroup,
  type KdsOrder,
  type KdsStaffUser,
} from "./api";
import { useKdsSse } from "./hooks/useKdsSse";
import { isAudioEnabled, playChime, playLateAlert, setAudioEnabled } from "./utils/audio";
import { elapsed, isLateTicket, minutesSince, urgencyColor } from "./utils/kdsDisplay";

const PREP_TARGET_DEFAULT = 12;

function ticketPrepTarget(order: KdsOrder): number {
  const times = order.items
    .map((line) => line.prep_time_minutes)
    .filter((v): v is number => v != null && v > 0);
  return times.length ? Math.max(...times) : PREP_TARGET_DEFAULT;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  paid: "Paid — waiting",
  partial: "Partial paid",
  in_progress: "In Progress",
  preparing: "Preparing",
  ready: "Ready",
};

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState(() => localStorage.getItem("kds_username") ?? "");
  const [pin, setPin] = useState("");
  const [staffUser, setStaffUser] = useState<KdsStaffUser | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [deviceId, setDeviceId] = useState(() => {
    const stored = localStorage.getItem("kds_device_id");
    if (stored) return stored;
    const id = `KDS-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    localStorage.setItem("kds_device_id", id);
    return id;
  });
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

  const prevPendingIdsRef = useRef<Set<number>>(new Set());
  const isFirstLoadRef = useRef(true);
  const lateAlertedRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    const saved = localStorage.getItem("kds_token");
    if (saved) {
      setToken(saved);
      fetchMe(saved)
        .then((me) => {
          setStaffUser(me);
          setPermissions(me.permissions ?? []);
          if (hasKdsPermission(me.permissions ?? [], "kds.view")) {
            setIsLoggedIn(true);
          } else {
            localStorage.removeItem("kds_token");
            setToken(null);
            setErrorMessage("No KDS access for this account.");
          }
        })
        .catch(() => {
          localStorage.removeItem("kds_token");
          setToken(null);
        });
    }
  }, []);

  const load = useCallback(async (authToken: string) => {
    try {
      const [data, groups] = await Promise.all([
        fetchKdsOrders(authToken),
        fetchKdsMenuGroups(authToken).catch(() => [] as KdsMenuGroup[]),
      ]);
      setOrders(data);
      setMenuGroups(groups);
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
        localStorage.removeItem("kds_token");
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

  const handle86 = (itemId: number) => {
    if (!token) return;
    setEightySixing(itemId);
    markItem86(token, itemId)
      .then(() => void load(token))
      .catch(() => setErrorMessage("Failed to mark item sold out."))
      .finally(() => setEightySixing(null));
  };

  const canStart = hasKdsPermission(permissions, "kds.start_order");
  const canKitchenDone = hasKdsPermission(permissions, "kds.mark_kitchen_done");
  const canBump = hasKdsPermission(permissions, "kds.bump_order");
  const canRecall = hasKdsPermission(permissions, "kds.recall_order");
  const can86 = hasKdsPermission(permissions, "kds.manage_availability");
  const canPrint = hasKdsPermission(permissions, "kds.print_ticket");

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
      localStorage.setItem("kds_token", tokenValue);
      localStorage.setItem("kds_username", username.trim());
      localStorage.setItem("kds_device_id", deviceId.trim());
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

  const handlePrint = (orderId: number) => {
    if (!token) return;
    printKitchenTicket(token, orderId)
      .then(() => setErrorMessage(""))
      .catch(() => setErrorMessage(`Failed to queue print for order #${orderId}.`));
  };

  const handleLogout = () => {
    localStorage.removeItem("kds_token");
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
      <div style={{
        minHeight: "100vh",
        background: "#1C1408",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}>
        <div style={{
          background: "#fff",
          borderRadius: 20,
          padding: "40px 36px",
          width: "100%",
          maxWidth: 380,
          boxShadow: "0 24px 64px rgba(0,0,0,0.4)",
        }}>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <img src="/logo.png" alt="Bake & Grill" style={{ width: 64, height: 64, borderRadius: 14, marginBottom: 10, display: "inline-block" }} />
            <p style={{ color: "#8B7355", fontSize: 14, margin: 0 }}>Kitchen Display — sign in</p>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#8B7355", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Email or phone
            </label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              style={{
                width: "100%", boxSizing: "border-box",
                borderRadius: 10, padding: "10px 12px",
                border: "1px solid #EDE4D4", fontSize: 14,
                color: "#2A1E0C", background: "#FFFDF9", outline: "none",
              }}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#8B7355", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Device ID
            </label>
            <input
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
              style={{
                width: "100%", boxSizing: "border-box",
                borderRadius: 10, padding: "10px 12px",
                border: "1px solid #EDE4D4", fontSize: 14,
                color: "#2A1E0C", background: "#FFFDF9", outline: "none",
              }}
            />
          </div>

          <div style={{
            display: "flex", justifyContent: "center", gap: 10,
            marginBottom: 20, minHeight: 48, alignItems: "center",
          }}>
            {pin.length === 0 ? (
              <span style={{ color: "#C4A882", fontSize: 14 }}>Enter your PIN below</span>
            ) : (
              Array.from({ length: pin.length }).map((_, i) => (
                <div key={i} style={{
                  width: 16, height: 16, borderRadius: "50%",
                  background: "#D4813A", transition: "all 0.1s",
                }} />
              ))
            )}
          </div>

          {errorMessage && (
            <div style={{
              background: "#fee2e2", color: "#991b1b", borderRadius: 10,
              padding: "10px 14px", fontSize: 13, marginBottom: 14, textAlign: "center",
            }}>
              {errorMessage}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((d) => (
              <button
                key={d || "blank"}
                onClick={() => {
                  if (d === "⌫") backPin();
                  else if (d !== "") appendPin(d);
                }}
                disabled={d === ""}
                style={{
                  height: 56, borderRadius: 12, border: "1px solid #EDE4D4",
                  background: d === "⌫" ? "#FFF3E8" : d === "" ? "transparent" : "#FFFDF9",
                  fontSize: 18, fontWeight: 700,
                  color: d === "⌫" ? "#D4813A" : "#2A1E0C",
                  cursor: d === "" ? "default" : "pointer",
                }}
              >
                {d}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button onClick={clearPin} style={{
              flex: 1, height: 48, borderRadius: 12,
              border: "1px solid #EDE4D4", background: "#FFFDF9",
              fontSize: 14, fontWeight: 600, color: "#8B7355", cursor: "pointer",
            }}>
              Clear
            </button>
            <button onClick={() => void handleLogin()} disabled={pin.length < 4} style={{
              flex: 2, height: 48, borderRadius: 12, border: "none",
              background: pin.length < 4 ? "#F5C99A" : "#D4813A",
              fontSize: 14, fontWeight: 700, color: "#fff",
              cursor: pin.length < 4 ? "default" : "pointer",
            }}>
              Sign In →
            </button>
          </div>

          <div style={{ marginTop: 16, textAlign: "center" }}>
            <a href="/" style={{ fontSize: 12, color: "#C4A882", textDecoration: "none" }}>← Main Website</a>
          </div>

          {import.meta.env.DEV && (
            <p style={{ fontSize: 11, color: "#C4A882", marginTop: 12, textAlign: "center", lineHeight: 1.6 }}>
              Dev PINs: Owner (1111) · Admin (2222) · Manager (3333) · Cashier (4444)
            </p>
          )}
        </div>
      </div>
    );
  }

  const renderTicket = (order: KdsOrder) => {
    const urgency = urgencyColor(order.created_at);
    const prepTarget = ticketPrepTarget(order);
    const overdue = minutesSince(order.created_at) >= prepTarget
      && !["ready", "completed"].includes(order.status);

    return (
      <div
        key={order.id}
        className="bg-white rounded-xl shadow-sm p-4 space-y-3"
        style={{ border: `2px solid ${urgency.faint}` }}
      >
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm" style={{ color: "#8B7355" }}>{STATUS_LABELS[order.status] ?? order.status}</p>
            <p className="text-lg font-semibold" style={{ color: "#2A1E0C" }}>
              #{order.order_number}
            </p>
            {overdue && (
              <span style={{ fontSize: 11, fontWeight: 700, color: "#ef4444", background: "#FEE2E2", padding: "2px 6px", borderRadius: 999 }}>
                OVERDUE
              </span>
            )}
            {order.delivery_island && (
              <p className="text-xs" style={{ color: "#D4813A" }}>🛵 {order.delivery_island}</p>
            )}
            {order.kitchen_done_at && (
              <span style={{ fontSize: 11, fontWeight: 700, color: "#047857", background: "#ECFDF5", padding: "2px 6px", borderRadius: 999 }}>
                Kitchen done
              </span>
            )}
            {order.table_number && (
              <p className="text-xs" style={{ color: "#8B7355" }}>Table {order.table_number}</p>
            )}
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ color: urgency.solid, fontSize: 14, fontWeight: 700 }}>
              {elapsed(order.created_at)}
            </div>
            <span className="text-xs" style={{ color: "#8B7355" }}>{formatTime(order.created_at)}</span>
          </div>
        </div>
        <div className="space-y-2">
          {order.items.map((item) => (
            <div key={item.id} className="text-sm flex justify-between gap-2" style={{ color: "#2A1E0C" }}>
              <div>
                <span className="font-semibold">{item.quantity}x</span> {item.item_name}
                {item.modifiers && item.modifiers.length > 0 && (
                  <div className="text-xs mt-1" style={{ color: "#8B7355" }}>
                    {item.modifiers.map((mod) => mod.modifier_name).join(", ")}
                  </div>
                )}
              </div>
              {item.item_id && can86 ? (
                <button
                  type="button"
                  onClick={() => handle86(item.item_id!)}
                  disabled={eightySixing === item.item_id}
                  style={{
                    fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 6,
                    border: "1px solid #FECACA", background: "#FEF2F2", color: "#991B1B", cursor: "pointer", flexShrink: 0,
                  }}
                >
                  {eightySixing === item.item_id ? "…" : "86"}
                </button>
              ) : null}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {["pending", "paid", "partial"].includes(order.status) && canStart && (
            <button
              className="flex-1 rounded-lg text-white py-2 text-sm font-semibold"
              style={{ background: "#1C1408" }}
              onClick={() => handleStart(order.id)}
            >
              Start
            </button>
          )}
          {["in_progress", "preparing"].includes(order.status) && (
            <>
              {canKitchenDone && !order.kitchen_done_at && (
                <button
                  className="flex-1 rounded-lg text-white py-2 text-sm font-semibold"
                  style={{ background: "#047857" }}
                  onClick={() => handleKitchenDone(order.id)}
                >
                  Kitchen done
                </button>
              )}
              {order.kitchen_done_at && (
                <div
                  className="flex-1 rounded-lg py-2 text-sm font-semibold text-center"
                  style={{ background: "#ECFDF5", color: "#047857", border: "1px solid #A7F3D0" }}
                >
                  Waiting for cashier to mark ready
                </div>
              )}
              {!canKitchenDone && !order.kitchen_done_at && (
                <div
                  className="flex-1 rounded-lg py-2 text-sm font-semibold text-center"
                  style={{ background: "#EFF6FF", color: "#1E40AF", border: "1px dashed #BFDBFE" }}
                >
                  Ready? Tell cashier — they mark ready from POS
                </div>
              )}
              {canPrint && (
                <button
                  className="rounded-lg py-2 px-3 text-sm font-semibold"
                  style={{ border: "1px solid #EDE4D4", color: "#8B7355" }}
                  onClick={() => handlePrint(order.id)}
                >
                  Print
                </button>
              )}
            </>
          )}
          {order.status === "ready" && (
            <>
              {canBump && (
              <button
                className="flex-1 rounded-lg bg-emerald-600 text-white py-2 text-sm font-semibold"
                onClick={() => handleBump(order.id)}
              >
                Complete ✓
              </button>
              )}
              {canRecall && (
              <button
                className="rounded-lg py-2 px-3 text-sm font-semibold"
                style={{ border: "1px solid #EDE4D4", color: "#8B7355" }}
                onClick={() => handleRecall(order.id)}
              >
                Recall
              </button>
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  const Column = ({
    title,
    items,
    flash,
  }: {
    title: string;
    items: KdsOrder[];
    flash?: boolean;
  }) => (
    <section className="space-y-3">
      <h2
        className="text-sm font-semibold"
        style={{
          color: flash ? "#92400E" : "#8B7355",
          background: flash ? "rgba(245,158,11,0.12)" : "transparent",
          padding: flash ? "6px 10px" : 0,
          borderRadius: 8,
        }}
      >
        {title} ({items.length}){flash ? " — NEW!" : ""}
      </h2>
      {items.length === 0 && (
        <p className="text-sm" style={{ color: "#8B7355", opacity: 0.6 }}>No tickets.</p>
      )}
      {items.map(renderTicket)}
    </section>
  );

  return (
    <div className="min-h-screen" style={{ background: "#FFFDF9", color: "#2A1E0C" }}>
      <header className="flex items-center justify-between px-6 py-4 bg-white shadow-sm" style={{ borderBottom: "1px solid #EDE4D4" }}>
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "#2A1E0C" }}>Bake & Grill KDS</h1>
          <p className="text-sm" style={{ color: "#8B7355" }}>
            {staffUser?.name ?? "Kitchen"}{staffUser?.role === "kitchen_staff" ? " · Kitchen Staff" : staffUser?.role ? ` · ${staffUser.role}` : ""} · Device {deviceId}
          </p>
        </div>
        <div className="flex items-center gap-4 flex-wrap justify-end">
          <span className="text-sm" style={{ color: sseConnected ? "#047857" : "#B45309", fontWeight: 600 }}>
            {sseConnected ? "● Live (SSE)" : isLoading ? "Refreshing…" : "○ Polling (15s)"}
          </span>
          <button
            type="button"
            onClick={toggleAudio}
            className="text-xs"
            style={{ color: "#8B7355", background: "none", border: "1px solid #EDE4D4", borderRadius: 8, padding: "4px 10px", cursor: "pointer" }}
          >
            {audioOn ? "🔔 Sound on" : "🔕 Sound off"}
          </button>
          <button
            type="button"
            onClick={() => token && void load(token)}
            className="text-xs"
            style={{ color: "#8B7355", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
          >
            Refresh
          </button>
          <a href="/" className="text-xs" style={{ color: "#8B7355", textDecoration: "none" }}>← Site</a>
          <button
            className="text-xs underline"
            style={{ color: "#8B7355", background: "none", border: "none", cursor: "pointer" }}
            onClick={handleLogout}
          >
            Logout
          </button>
        </div>
      </header>

      {errorMessage && (
        <div style={{ margin: 16, padding: 12, background: "#FEF2F2", color: "#991B1B", borderRadius: 10, fontSize: 13 }}>
          {errorMessage}
        </div>
      )}

      <div style={{ display: "flex", gap: 12, padding: "12px 16px 0", flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ fontSize: 13, color: "#8B7355", display: "flex", alignItems: "center", gap: 8 }}>
          Station
          <select
            value={stationFilter === "all" ? "all" : String(stationFilter)}
            onChange={(e) => setStationFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
            style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #EDE4D4", fontFamily: "inherit" }}
          >
            <option value="all">All stations</option>
            {menuGroups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </label>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
        gap: 12,
        padding: "12px 16px",
      }}>
        {[
          { label: "Pending avg wait", value: `${avgWait(pendingOrders)}m`, color: "#f59e0b" },
          { label: "Cooking avg wait", value: `${avgWait(inProgressOrders)}m`, color: "#3b82f6" },
          { label: "Ready queue", value: String(readyOrders.length), color: "#22c55e" },
          {
            label: "Over prep target",
            value: String([...pendingOrders, ...inProgressOrders].filter((t) => minutesSince(t.created_at) >= ticketPrepTarget(t)).length),
            color: "#ef4444",
          },
        ].map((stat) => (
          <div key={stat.label} style={{ background: "#fff", border: "1px solid #EDE4D4", borderRadius: 12, padding: "10px 12px" }}>
            <p style={{ margin: 0, fontSize: 11, color: "#8B7355" }}>{stat.label}</p>
            <p style={{ margin: "4px 0 0", fontSize: 20, fontWeight: 800, color: stat.color }}>{stat.value}</p>
          </div>
        ))}
      </div>

      <main className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2 md:p-6 lg:grid-cols-3">
        <Column title="Pending" items={pendingOrders} flash={newTicketFlash} />
        <Column title="Cooking" items={inProgressOrders} />
        <Column title="Ready" items={readyOrders} />
      </main>
    </div>
  );
}

export default App;
