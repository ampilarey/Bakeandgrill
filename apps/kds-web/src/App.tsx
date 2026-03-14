import { useEffect, useMemo, useState } from "react";
import {
  bumpOrder,
  fetchKdsOrders,
  recallOrder,
  staffLogin,
  startOrder,
  type KdsOrder,
} from "./api";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  completed: "Completed",
};

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [pin, setPin] = useState("");
  const [deviceId, setDeviceId] = useState(
    () => localStorage.getItem("kds_device_id") ?? `KDS-${Math.random().toString(36).slice(2, 7).toUpperCase()}`
  );
  const [token, setToken] = useState<string | null>(null);
  const [orders, setOrders] = useState<KdsOrder[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Restore session from localStorage on mount so refresh doesn't log staff out
  useEffect(() => {
    const saved = localStorage.getItem("kds_token");
    if (saved) {
      setToken(saved);
      setIsLoggedIn(true);
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    let isMounted = true;
    let consecutiveErrors = 0;
    let timerId: number;

    const scheduleNext = () => {
      if (!isMounted) return;
      // Back off to 15s after 3 consecutive failures, otherwise 5s
      const delay = consecutiveErrors >= 3 ? 15000 : 5000;
      timerId = window.setTimeout(poll, delay);
    };

    const poll = async () => {
      try {
        const data = await fetchKdsOrders(token);
        if (!isMounted) return;
        setOrders(data);
        setErrorMessage("");
        consecutiveErrors = 0;
      } catch (error: unknown) {
        if (!isMounted) return;
        const status = (error as { status?: number })?.status;
        if (status === 401) { handleLogout(); return; }
        consecutiveErrors++;
        if (consecutiveErrors >= 3) setErrorMessage("Connection lost. Retrying…");
      } finally {
        if (isMounted) setIsLoading(false);
        scheduleNext();
      }
    };

    setIsLoading(true);
    poll();

    return () => {
      isMounted = false;
      window.clearTimeout(timerId);
    };
  }, [token]);

  const pendingOrders = useMemo(
    () => orders.filter((order) => order.status === "pending"),
    [orders]
  );
  const inProgressOrders = useMemo(
    () => orders.filter((order) => order.status === "in_progress"),
    [orders]
  );
  const completedOrders = useMemo(
    () => orders.filter((order) => order.status === "completed"),
    [orders]
  );

  const handleLogin = async () => {
    setErrorMessage("");
    if (pin.trim().length < 4) {
      setErrorMessage("Enter a valid PIN.");
      return;
    }

    try {
      const tokenValue = await staffLogin(pin.trim(), deviceId.trim());
      localStorage.setItem("kds_token", tokenValue);
      localStorage.setItem("kds_device_id", deviceId.trim());
      setToken(tokenValue);
      setIsLoggedIn(true);
      setPin("");
    } catch (error) {
      setErrorMessage("Login failed. Check your PIN.");
    }
  };

  const handleStart = (orderId: number) => {
    if (!token) return;
    startOrder(token, orderId)
      .then(() => {
        setOrders((current) =>
          current.map((order) =>
            order.id === orderId ? { ...order, status: "in_progress" } : order
          )
        );
      })
      .catch(() => setErrorMessage(`Failed to start order #${orderId}. Please retry.`));
  };

  const handleBump = (orderId: number) => {
    if (!token) return;
    bumpOrder(token, orderId)
      .then(() => {
        setOrders((current) =>
          current.map((order) =>
            order.id === orderId ? { ...order, status: "completed" } : order
          )
        );
      })
      .catch(() => setErrorMessage(`Failed to complete order #${orderId}. Please retry.`));
  };

  const handleLogout = () => {
    localStorage.removeItem("kds_token");
    setToken(null);
    setIsLoggedIn(false);
    setOrders([]);
  };

  const handleRecall = (orderId: number) => {
    if (!token) return;
    recallOrder(token, orderId)
      .then(() => {
        setOrders((current) =>
          current.map((order) =>
            order.id === orderId ? { ...order, status: "pending" } : order
          )
        );
      })
      .catch(() => setErrorMessage(`Failed to recall order #${orderId}. Please retry.`));
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: '#1C1408' }}>
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
          <h1 className="text-2xl font-semibold" style={{ color: '#2A1E0C' }}>
            Bake & Grill KDS
          </h1>
          <p className="mt-1" style={{ color: '#8B7355' }}>PIN login for staff</p>
          <div className="mt-6 space-y-4">
            <label className="block text-sm font-medium" style={{ color: '#2A1E0C' }}>
              Device ID
            </label>
            <input
              className="w-full rounded-lg px-3 py-2"
              style={{ border: '1px solid #EDE4D4' }}
              value={deviceId}
              onChange={(event) => setDeviceId(event.target.value)}
            />
            <label className="block text-sm font-medium" style={{ color: '#2A1E0C' }}>PIN</label>
            <input
              type="password"
              className="w-full rounded-lg px-3 py-2"
              style={{ border: '1px solid #EDE4D4' }}
              value={pin}
              onChange={(event) => setPin(event.target.value)}
            />
            <button
              className="w-full rounded-lg text-white py-2 font-semibold transition"
              style={{ background: '#D4813A' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#B86820'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#D4813A'; }}
              onClick={handleLogin}
            >
              Login
            </button>
            {errorMessage && (
              <p className="text-sm text-rose-600">{errorMessage}</p>
            )}
          </div>
          <div className="mt-4 text-center">
            <a href="/" className="text-sm" style={{ color: '#8B7355', textDecoration: 'none' }}>
              ← Main Website
            </a>
          </div>
          {import.meta.env.DEV && (
            <p className="text-xs mt-4" style={{ color: '#8B7355' }}>Dev PIN: 1234</p>
          )}
        </div>
      </div>
    );
  }

  const renderTicket = (order: KdsOrder) => (
    <div
      key={order.id}
      className="bg-white rounded-xl shadow-sm p-4 space-y-3"
      style={{ border: '1px solid #EDE4D4' }}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm" style={{ color: '#8B7355' }}>{STATUS_LABELS[order.status]}</p>
          <p className="text-lg font-semibold" style={{ color: '#2A1E0C' }}>
            {order.order_number}
          </p>
        </div>
        <span className="text-xs" style={{ color: '#8B7355' }}>{formatTime(order.created_at)}</span>
      </div>
      <div className="space-y-2">
        {order.items.map((item) => (
          <div key={item.id} className="text-sm" style={{ color: '#2A1E0C' }}>
            <span className="font-semibold">{item.quantity}x</span> {item.item_name}
            {item.modifiers && item.modifiers.length > 0 && (
              <div className="text-xs mt-1" style={{ color: '#8B7355' }}>
                {item.modifiers.map((mod) => mod.modifier_name).join(", ")}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        {order.status === "pending" && (
          <button
            className="flex-1 rounded-lg text-white py-2 text-sm font-semibold"
            style={{ background: '#1C1408' }}
            onClick={() => handleStart(order.id)}
          >
            Start
          </button>
        )}
        {order.status === "in_progress" && (
          <button
            className="flex-1 rounded-lg bg-emerald-600 text-white py-2 text-sm font-semibold"
            onClick={() => handleBump(order.id)}
          >
            Bump ✓
          </button>
        )}
        {order.status === "completed" && (
          <button
            className="flex-1 rounded-lg py-2 text-sm font-semibold"
            style={{ border: '1px solid #EDE4D4', color: '#8B7355' }}
            onClick={() => handleRecall(order.id)}
          >
            Recall
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen" style={{ background: '#FFFDF9', color: '#2A1E0C' }}>
      <header className="flex items-center justify-between px-6 py-4 bg-white shadow-sm" style={{ borderBottom: '1px solid #EDE4D4' }}>
        <div>
          <h1 className="text-xl font-semibold" style={{ color: '#2A1E0C' }}>Bake & Grill KDS</h1>
          <p className="text-sm" style={{ color: '#8B7355' }}>Device {deviceId}</p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm" style={{ color: '#8B7355' }}>
            {isLoading ? "Refreshing..." : "● Live"}
          </span>
          <a href="/" className="text-xs" style={{ color: '#8B7355', textDecoration: 'none' }}>← Site</a>
          <button
            className="text-xs underline"
            style={{ color: '#8B7355', background: 'none', border: 'none', cursor: 'pointer' }}
            onClick={handleLogout}
          >
            Logout
          </button>
        </div>
      </header>

      <main className="grid grid-cols-3 gap-4 p-6">
        <section className="space-y-3">
          <h2 className="text-sm font-semibold" style={{ color: '#8B7355' }}>Pending</h2>
          {pendingOrders.length === 0 && (
            <p className="text-sm" style={{ color: '#8B7355', opacity: 0.6 }}>No pending tickets.</p>
          )}
          {pendingOrders.map(renderTicket)}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold" style={{ color: '#8B7355' }}>In Progress</h2>
          {inProgressOrders.length === 0 && (
            <p className="text-sm" style={{ color: '#8B7355', opacity: 0.6 }}>No orders in progress.</p>
          )}
          {inProgressOrders.map(renderTicket)}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold" style={{ color: '#8B7355' }}>Completed</h2>
          {completedOrders.length === 0 && (
            <p className="text-sm" style={{ color: '#8B7355', opacity: 0.6 }}>No completed orders.</p>
          )}
          {completedOrders.map(renderTicket)}
        </section>
      </main>
    </div>
  );
}

export default App;
