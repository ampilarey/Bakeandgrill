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
  const [deviceId, setDeviceId] = useState("KDS-001");
  const [token, setToken] = useState<string | null>(null);
  const [orders, setOrders] = useState<KdsOrder[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      return;
    }
    let isMounted = true;

    const loadOrders = async () => {
      setIsLoading(true);
      try {
        const data = await fetchKdsOrders(token);
        if (isMounted) {
          setOrders(data);
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage("Unable to load tickets.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadOrders();
    const timer = window.setInterval(loadOrders, 5000);
    return () => {
      isMounted = false;
      window.clearInterval(timer);
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
      setToken(tokenValue);
      setIsLoggedIn(true);
      setPin("");
    } catch (error) {
      setErrorMessage("Login failed. Check your PIN.");
    }
  };

  const handleStart = (orderId: number) => {
    if (!token) {
      return;
    }
    startOrder(token, orderId).then(() => {
      setOrders((current) =>
        current.map((order) =>
          order.id === orderId ? { ...order, status: "in_progress" } : order
        )
      );
    });
  };

  const handleBump = (orderId: number) => {
    if (!token) {
      return;
    }
    bumpOrder(token, orderId).then(() => {
      setOrders((current) =>
        current.map((order) =>
          order.id === orderId ? { ...order, status: "completed" } : order
        )
      );
    });
  };

  const handleRecall = (orderId: number) => {
    if (!token) {
      return;
    }
    recallOrder(token, orderId).then(() => {
      setOrders((current) =>
        current.map((order) =>
          order.id === orderId ? { ...order, status: "pending" } : order
        )
      );
    });
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
          <h1 className="text-2xl font-semibold text-slate-900">
            Bake & Grill KDS
          </h1>
          <p className="text-slate-500 mt-1">PIN login for staff</p>
          <div className="mt-6 space-y-4">
            <label className="block text-sm font-medium text-slate-700">
              Device ID
            </label>
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
              value={deviceId}
              onChange={(event) => setDeviceId(event.target.value)}
            />
            <label className="block text-sm font-medium text-slate-700">PIN</label>
            <input
              type="password"
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
              value={pin}
              onChange={(event) => setPin(event.target.value)}
            />
            <button
              className="w-full rounded-lg bg-orange-600 text-white py-2 font-semibold hover:bg-orange-700 transition"
              onClick={handleLogin}
            >
              Login
            </button>
            {errorMessage && (
              <p className="text-sm text-rose-600">{errorMessage}</p>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-6">Demo PIN: 1234</p>
        </div>
      </div>
    );
  }

  const renderTicket = (order: KdsOrder) => (
    <div
      key={order.id}
      className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-3"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">{STATUS_LABELS[order.status]}</p>
          <p className="text-lg font-semibold text-slate-900">
            {order.order_number}
          </p>
        </div>
        <span className="text-xs text-slate-500">{formatTime(order.created_at)}</span>
      </div>
      <div className="space-y-2">
        {order.items.map((item) => (
          <div key={item.id} className="text-sm text-slate-700">
            <span className="font-semibold">{item.quantity}x</span> {item.item_name}
            {item.modifiers && item.modifiers.length > 0 && (
              <div className="text-xs text-slate-500 mt-1">
                {item.modifiers.map((mod) => mod.modifier_name).join(", ")}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        {order.status === "pending" && (
          <button
            className="flex-1 rounded-lg bg-slate-900 text-white py-2 text-sm font-semibold"
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
            Bump
          </button>
        )}
        {order.status === "completed" && (
          <button
            className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-semibold text-slate-600"
            onClick={() => handleRecall(order.id)}
          >
            Recall
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="flex items-center justify-between px-6 py-4 bg-white shadow-sm">
        <div>
          <h1 className="text-xl font-semibold">Bake & Grill KDS</h1>
          <p className="text-sm text-slate-500">Device {deviceId}</p>
        </div>
        <div className="text-sm text-slate-500">
          {isLoading ? "Refreshing..." : "Live"}
        </div>
      </header>

      <main className="grid grid-cols-3 gap-4 p-6">
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-600">Pending</h2>
          {pendingOrders.length === 0 && (
            <p className="text-sm text-slate-400">No pending tickets.</p>
          )}
          {pendingOrders.map(renderTicket)}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-600">In Progress</h2>
          {inProgressOrders.length === 0 && (
            <p className="text-sm text-slate-400">No orders in progress.</p>
          )}
          {inProgressOrders.map(renderTicket)}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-600">Completed</h2>
          {completedOrders.length === 0 && (
            <p className="text-sm text-slate-400">No completed orders.</p>
          )}
          {completedOrders.map(renderTicket)}
        </section>
      </main>
    </div>
  );
}

export default App;
