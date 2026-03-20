import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { getOrderDetail, type OrderDetail, type OrderItem as OrderDetailItem, API_ORIGIN } from "../api";
import { ReviewForm } from "../components/ReviewForm";
import { useCart } from "../context/CartContext";
import { usePushNotifications } from "../hooks/usePushNotifications";
import { useSiteSettings } from "../context/SiteSettingsContext";

type PaymentState = "CONFIRMED" | "FAILED" | "PENDING" | null;

function readToken(): string | null {
  return localStorage.getItem("online_token");
}

// ─── Driver Tracker ───────────────────────────────────────────────────────────

type DriverLocationData = {
  latitude: number;
  longitude: number;
  recorded_at: string;
  driver?: { name: string; phone: string } | null;
};

function DriverTracker({ orderId, token }: { orderId: number; token: string | null }) {
  const [data, setData] = useState<{ location: DriverLocationData | null; driver: { name: string; phone: string } | null } | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/driver/deliveries/${orderId}/location`, {
          headers: {
            Accept: 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        if (res.ok) {
          const json = await res.json() as { location: DriverLocationData | null; driver: { name: string; phone: string } | null };
          setData(json);
        }
      } catch { /* ignore */ }
    };
    void load();
    const id = setInterval(() => void load(), 10_000);
    return () => clearInterval(id);
  }, [orderId, token]);

  const location = data?.location;
  const driver = data?.driver;

  const mapsUrl = location
    ? `https://maps.google.com/?q=${location.latitude},${location.longitude}`
    : null;

  const waLink = driver?.phone
    ? `https://wa.me/${driver.phone.replace(/\s+/g, '').replace(/^\+/, '')}`
    : null;

  return (
    <div style={{
      background: 'linear-gradient(135deg, #D4813A, #B5681F)',
      borderRadius: 16, padding: 16, color: 'white',
    }}>
      <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 8px', opacity: 0.85 }}>🚀 Your driver is on the way!</p>
      {driver && <p style={{ fontSize: 15, fontWeight: 700, margin: '0 0 4px' }}>🛵 {driver.name}</p>}
      {location ? (
        <p style={{ fontSize: 12, margin: '0 0 12px', opacity: 0.8 }}>
          Last seen: {Math.floor((Date.now() - new Date(location.recorded_at).getTime()) / 60000)} min ago
        </p>
      ) : (
        <p style={{ fontSize: 12, margin: '0 0 12px', opacity: 0.8 }}>Locating driver…</p>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        {mapsUrl && (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              flex: 1, textAlign: 'center', background: 'rgba(255,255,255,0.2)',
              color: 'white', fontWeight: 700, fontSize: 13, padding: '10px 0',
              borderRadius: 10, textDecoration: 'none',
            }}
          >
            📍 Track on Map
          </a>
        )}
        {driver?.phone && (
          <a
            href={`tel:${driver.phone}`}
            style={{
              flex: 1, textAlign: 'center', background: 'rgba(255,255,255,0.2)',
              color: 'white', fontWeight: 700, fontSize: 13, padding: '10px 0',
              borderRadius: 10, textDecoration: 'none',
            }}
          >
            📞 Call
          </a>
        )}
        {waLink && (
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              flex: 1, textAlign: 'center', background: '#25D366',
              color: 'white', fontWeight: 700, fontSize: 13, padding: '10px 0',
              borderRadius: 10, textDecoration: 'none',
            }}
          >
            💬 WhatsApp
          </a>
        )}
      </div>
    </div>
  );
}

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, {
  label: string; sub: string; next?: string;
  color: string; bg: string; icon: string;
}> = {
  pending: {
    label: "Payment received!",
    sub: "Your payment is confirmed and your order is in the queue.",
    next: "Up next: kitchen will start preparing",
    color: "#92400e", bg: "#fef3c7", icon: "⏳",
  },
  paid: {
    label: "Order confirmed!",
    sub: "Payment received. The kitchen is being notified.",
    next: "Up next: kitchen will start preparing",
    color: "#065f46", bg: "#d1fae5", icon: "✅",
  },
  preparing: {
    label: "Being prepared",
    sub: "Your food is being freshly made right now.",
    next: "Up next: ready for pickup or delivery",
    color: "#1e40af", bg: "#dbeafe", icon: "👨‍🍳",
  },
  ready: {
    label: "Ready!",
    sub: "Your order is ready.",
    next: undefined,
    color: "#065f46", bg: "#d1fae5", icon: "🎉",
  },
  out_for_delivery: {
    label: "Out for delivery",
    sub: "Your order is on the way. Estimated: 15–30 min.",
    next: undefined,
    color: "#c2410c", bg: "#ffedd5", icon: "🛵",
  },
  picked_up: {
    label: "Driver picked up your order",
    sub: "Your driver has collected your order and is heading your way!",
    next: undefined,
    color: "#c2410c", bg: "#ffedd5", icon: "✅",
  },
  on_the_way: {
    label: "Driver is on the way!",
    sub: "Your order is almost there. Keep an eye out for your driver.",
    next: undefined,
    color: "#9a3412", bg: "#fed7aa", icon: "🏃",
  },
  delivered: {
    label: "Delivered!",
    sub: "Your order has been delivered. Enjoy your meal!",
    next: undefined,
    color: "#065f46", bg: "#d1fae5", icon: "🎉",
  },
  completed: {
    label: "Delivered!",
    sub: "Your order was delivered. Enjoy your meal!",
    next: undefined,
    color: "#6b7280", bg: "#f3f4f6", icon: "🎉",
  },
  cancelled: {
    label: "Order cancelled",
    sub: "This order was cancelled. Contact us if you have questions.",
    next: undefined,
    color: "#991b1b", bg: "#fee2e2", icon: "✕",
  },
};

// ─── Progress steps ───────────────────────────────────────────────────────────
const STEPS = [
  { key: "pending",    label: "Received" },
  { key: "preparing",  label: "Preparing" },
  { key: "ready",      label: "Ready" },
  { key: "completed",  label: "Done" },
];
function stepIndex(status: string): number {
  const normalised = status === "paid" ? "preparing" : status;
  const s = STEPS.findIndex((s) => s.key === normalised);
  // delivery statuses sit between ready and completed
  if (['out_for_delivery', 'picked_up', 'on_the_way', 'delivered'].includes(status)) return 2;
  if (status === "completed") return 3;
  return s;
}

function orderTypeLabel(type: string): string {
  const map: Record<string, string> = {
    dine_in: "Dine In", takeaway: "Takeaway",
    online_pickup: "Takeaway (Online)", delivery: "Delivery", preorder: "Pre-order",
  };
  return map[type] ?? type;
}

// ─── Subcomponents ────────────────────────────────────────────────────────────
function WhatsAppIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}
function ViberIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M11.4 0C5.7.3 1.2 4.8.9 10.5c-.2 3.4.8 6.5 2.7 8.9L2.2 24l4.8-1.4c1.4.7 3 1.1 4.7 1.1 6.1 0 11.1-5 11.1-11.1S17.9 0 11.8 0h-.4zm.5 2c5.1 0 9.1 4 9.1 9.1s-4 9.1-9.1 9.1c-1.6 0-3.2-.4-4.5-1.2l-.3-.2-3 .9.9-2.9-.2-.3C3.7 15.2 3.1 13.1 3.1 11 3.1 5.9 7.2 2 12.1 2h-.2zm-.8 3.2c-.3 0-.8.1-1.2.5C9.5 6.3 8.8 7 8.8 8.5s1 3 1.2 3.2c.2.2 2 3 4.8 4.2.7.3 1.2.4 1.6.5.7.2 1.3.1 1.8-.1.5-.3 1.6-1.5 1.8-2.3.2-.7.1-1.3-.1-1.5-.1-.2-.4-.3-.8-.5s-2.3-1.1-2.6-1.2c-.3-.1-.6-.2-.8.2-.2.3-.9 1.1-1.1 1.3-.2.2-.4.2-.7.1-.3-.1-1.3-.5-2.5-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6.2-.2.4-.4.5-.6.2-.2.2-.4.3-.6.1-.2 0-.4-.1-.6-.1-.1-.8-1.9-1.1-2.7-.2-.5-.5-.5-.7-.5z"/>
    </svg>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, paddingTop: 10 }}>
      <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
      <span style={{ fontWeight: 600, color: 'var(--color-text)' }}>{value}</span>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export function OrderStatusPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { clearCart } = useCart();
  const s = useSiteSettings();
  const waLink    = s.business_whatsapp || 'https://wa.me/9609120011';
  const viberLink = s.business_viber   || 'viber://chat?number=9609120011';

  const paymentState = searchParams.get("payment") as PaymentState;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [liveConnected, setLiveConnected] = useState(false);
  const [reviewDone, setReviewDone] = useState(false);

  const token = readToken();
  const esRef = useRef<EventSource | null>(null);

  // useCallback gives a stable reference so polling intervals don't capture stale closures
  const loadOrder = useCallback(async () => {
    if (!token || !orderId) return;
    try {
      const res = await getOrderDetail(token, parseInt(orderId, 10));
      setOrder(res.order);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token, orderId]);

  useEffect(() => {
    document.title = order?.order_number
      ? `Order #${order.order_number} — Bake & Grill`
      : 'Order Status — Bake & Grill';
  }, [order?.order_number]);

  useEffect(() => {
    if (paymentState === "CONFIRMED") clearCart();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentState]);

  useEffect(() => { void loadOrder(); }, [loadOrder]);

  // SSE real-time tracking
  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    const startStream = async () => {
      let ticketParam = "";
      if (token) {
        try {
          const res = await fetch(`${API_ORIGIN}/api/orders/${orderId}/stream-ticket`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          });
          if (res.ok) {
            const data = await res.json() as { ticket: string };
            ticketParam = `?ticket=${encodeURIComponent(data.ticket)}`;
          }
        } catch { /* ignore */ }
      }
      if (cancelled) return;
      const sseUrl = `${API_ORIGIN}/api/stream/order-status/${orderId}${ticketParam}`;
      const es = new EventSource(sseUrl, { withCredentials: false });
      const handleStatus = (e: MessageEvent) => {
        try {
          const payload = JSON.parse(e.data) as { status: string; paid_at?: string };
          setOrder(prev => prev ? { ...prev, status: payload.status, paid_at: payload.paid_at ?? prev.paid_at } : prev);
          setLiveConnected(true);
        } catch { /* ignore */ }
      };
      es.addEventListener("order.updated",   handleStatus);
      es.addEventListener("order.paid",      handleStatus);
      es.addEventListener("order.completed", handleStatus);
      es.addEventListener("order.cancelled", handleStatus);
      es.onerror = () => { setLiveConnected(false); es.close(); esRef.current = null; };
      esRef.current = es;
    };
    void startStream();
    return () => {
      cancelled = true;
      if (esRef.current) { esRef.current.close(); esRef.current = null; }
    };
  }, [orderId, token]);

  // Fallback polling — uses stable loadOrder reference from useCallback
  useEffect(() => {
    if (liveConnected) return;
    const interval = setInterval(() => void loadOrder(), 10_000);
    return () => clearInterval(interval);
  }, [liveConnected, loadOrder]);

  const statusInfo = order ? (STATUS_CONFIG[order.status] ?? {
    label: order.status, sub: '', color: 'var(--color-text-muted)', bg: 'var(--color-surface-alt)', icon: '📋',
  }) : null;

  const isCancelled = order?.status === 'cancelled';
  const isDone = order?.status === 'completed';
  const activeStep = order ? stepIndex(order.status) : -1;

  const { supported: pushSupported, subscribed: pushSubscribed, loading: pushLoading, subscribe: pushSubscribe } = usePushNotifications(token);

  return (
    <div style={S.page}>

      {/* ── Header ───────────────────────────────────────── */}
      <header style={S.header}>
        <button style={S.backBtn} onClick={() => navigate("/")} aria-label="Back to menu">
          ← Back to menu
        </button>
        <span style={S.headerTitle}>Order Status</span>
        {liveConnected && (
          <span style={{ fontSize: 11, color: 'var(--color-success)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-success)', display: 'inline-block', animation: 'pulse-dot 2s infinite' }} />
            Live
          </span>
        )}
      </header>

      <div style={S.container}>

        {/* ── Payment result banners ─────────────────────── */}
        {paymentState === "CONFIRMED" && (
          <div className="banner banner-success animate-fade-in">
            <span className="banner-icon">🎉</span>
            <div>
              <p className="banner-title">Payment successful!</p>
              <p className="banner-sub">Your order has been confirmed and sent to the kitchen.</p>
            </div>
          </div>
        )}
        {paymentState === "FAILED" && (
          <div className="banner banner-error animate-fade-in">
            <span className="banner-icon">❌</span>
            <div>
              <p className="banner-title">Payment failed</p>
              <p className="banner-sub">Please try paying again or contact us for help.</p>
            </div>
          </div>
        )}

        {/* ── Loading ────────────────────────────────────── */}
        {loading && (
          <div style={S.card}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="skeleton" style={{ height: 80, borderRadius: 12 }} />
              <div className="skeleton" style={{ height: 60, borderRadius: 12 }} />
              <div className="skeleton" style={{ height: 120, borderRadius: 12 }} />
            </div>
          </div>
        )}

        {/* ── Error ─────────────────────────────────────── */}
        {error && (
          <div className="banner banner-error">
            <span className="banner-icon">⚠️</span>
            <div style={{ flex: 1 }}>
              <p className="banner-title">Couldn't load your order</p>
              <p className="banner-sub">{error}</p>
            </div>
            <button
              onClick={() => window.location.reload()}
              style={{
                marginLeft: 12, padding: '6px 14px', fontSize: 13, fontWeight: 600,
                background: 'var(--color-surface)', color: 'var(--color-error)', border: '1.5px solid var(--color-error)',
                borderRadius: 8, cursor: 'pointer',
              }}
            >
              Try again
            </button>
          </div>
        )}

        {/* ── Order content ─────────────────────────────── */}
        {!loading && order && statusInfo && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Status hero card */}
            <div style={{
              ...S.card,
              background: isCancelled ? 'var(--color-error-bg)' : statusInfo.bg,
              borderColor: isCancelled ? 'rgba(220,38,38,0.2)' : 'transparent',
            }}>
              {/* Icon + label */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                <div style={{
                  width: 56, height: 56,
                  borderRadius: '50%',
                  background: 'var(--color-surface-alt)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 26, flexShrink: 0,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                }}>
                  {statusInfo.icon}
                </div>
                <div>
                  <p style={{ fontSize: 20, fontWeight: 800, color: statusInfo.color, margin: 0, letterSpacing: '-0.025em' }}>
                    {statusInfo.label}
                  </p>
                  <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '4px 0 0', lineHeight: 1.4 }}>
                    {statusInfo.sub}
                  </p>
                  {statusInfo.next && !isCancelled && (
                    <p style={{ fontSize: 12, color: statusInfo.color, margin: '6px 0 0', fontWeight: 600, opacity: 0.8 }}>
                      {statusInfo.next}
                    </p>
                  )}
                </div>
              </div>

              <p style={{ fontSize: 13, color: 'var(--color-text-muted)', fontWeight: 600, margin: '0 0 12px', letterSpacing: '0.04em', textTransform: 'uppercase' as const }}>
                Order #{order.order_number}
              </p>

              {/* Stepper — hide for cancelled */}
              {!isCancelled && (
                <div style={{ position: 'relative' }}>
                  {/* Background rail */}
                  <div style={{ position: 'absolute', top: 13, left: '12.5%', right: '12.5%', height: 3, background: 'var(--color-border)', borderRadius: 99 }} />
                  {/* Filled rail */}
                  <div style={{
                    position: 'absolute', top: 13, left: '12.5%',
                    height: 3,
                    background: statusInfo.color,
                    borderRadius: 99,
                    width: activeStep < 0 ? '0%' : `${Math.min(100, (activeStep / (STEPS.length - 1)) * 100)}%`,
                    transition: 'width 0.6s ease',
                  }} />
                  {/* Steps */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative', zIndex: 1 }}>
                    {STEPS.map((step, i) => {
                      const done   = i < activeStep;
                      const active = i === activeStep;
                      return (
                        <div key={step.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                          <div style={{
                            width: 28, height: 28, borderRadius: '50%',
                            background: (done || active) ? statusInfo.color : 'var(--color-surface)',
                            border: `2.5px solid ${(done || active) ? statusInfo.color : 'var(--color-border)'}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 11, fontWeight: 800,
                            color: (done || active) ? 'white' : 'var(--color-text-muted)',
                            boxShadow: active ? `0 0 0 5px ${statusInfo.color}22` : 'none',
                            animation: active ? 'stepper-pulse 2s ease-in-out infinite' : 'none',
                            transition: 'all 0.3s',
                          }}>
                            {done ? '✓' : i + 1}
                          </div>
                          <span style={{
                            fontSize: 10, fontWeight: active ? 700 : 500,
                            color: (done || active) ? statusInfo.color : 'var(--color-text-muted)',
                            textAlign: 'center', lineHeight: 1.2,
                            whiteSpace: 'nowrap',
                          }}>
                            {step.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Order details card */}
            <div style={S.card}>
              <p style={S.cardTitle}>Order Details</p>
              <DetailRow label="Order number" value={`#${order.order_number}`} />
              <DetailRow label="Type" value={orderTypeLabel(order.type)} />
              <DetailRow label="Status" value={statusInfo.label} />
              {order.paid_at && (
                <DetailRow label="Paid at" value={new Date(order.paid_at).toLocaleString()} />
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 18, color: 'var(--color-text)', borderTop: '2px solid var(--color-border)', paddingTop: 12, marginTop: 12 }}>
                <span>Total</span>
                <span style={{ color: 'var(--color-primary)' }}>
                  MVR {parseFloat(String(order.total ?? 0)).toFixed(2)}
                </span>
              </div>
            </div>

            {/* Driver tracking — shown when driver is on the way */}
            {order.type === 'delivery' && ['picked_up', 'on_the_way'].includes(order.status) && (
              <DriverTracker orderId={order.id} token={token} />
            )}

            {/* Delivery address */}
            {order.type === 'delivery' && order.delivery_address_line1 && (
              <div style={S.card}>
                <p style={S.cardTitle}>Delivery Address</p>
                <p style={{ fontSize: 14, color: 'var(--color-text)', margin: 0 }}>{order.delivery_address_line1}</p>
                {order.delivery_island && <p style={{ fontSize: 14, color: 'var(--color-text-muted)', margin: '4px 0 0' }}>{order.delivery_island}</p>}
                {order.delivery_contact_name && (
                  <p style={{ fontSize: 14, color: 'var(--color-text)', margin: '8px 0 0' }}>
                    Contact: {order.delivery_contact_name}{order.delivery_contact_phone && ` · ${order.delivery_contact_phone}`}
                  </p>
                )}
              </div>
            )}

            {/* Items ordered */}
            {order.items && order.items.length > 0 && (
              <div style={S.card}>
                <p style={S.cardTitle}>Items Ordered</p>
                {order.items.map((item: OrderDetailItem) => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'flex-start', paddingBottom: 10, marginBottom: 10, borderBottom: '1px solid var(--color-border)' }}>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text)' }}>{item.item_name}</span>
                      {item.modifiers && item.modifiers.length > 0 && (
                        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
                          + {item.modifiers.map((m) => m.name ?? '').join(', ')}
                        </div>
                      )}
                    </div>
                    <span style={{ color: 'var(--color-text-muted)', fontSize: 13, marginRight: 12 }}>×{item.quantity}</span>
                    <span style={{ fontWeight: 700, color: 'var(--color-primary)', fontSize: 14 }}>
                      MVR {parseFloat(String(item.total_price ?? 0)).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Refresh note */}
            <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--color-text-muted)' }}>
              {liveConnected
                ? '🟢 Live tracking enabled — updates instantly'
                : '🔄 Auto-refreshing every 10 seconds'}
            </p>

            {/* Push notification opt-in banner */}
            {pushSupported && !pushSubscribed && !isCancelled && !isDone && token && (
              <div style={{
                ...S.card,
                display: 'flex', alignItems: 'center', gap: 14,
                background: 'linear-gradient(135deg, var(--color-primary-light) 0%, var(--color-surface) 100%)',
                borderColor: 'rgba(234, 88, 12, 0.2)',
              }}>
                <div style={{ fontSize: 28, flexShrink: 0 }}>🔔</div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 700, fontSize: 14, margin: '0 0 2px', color: 'var(--color-text)' }}>
                    Get notified when your order is ready
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0 }}>
                    We'll send you a push notification as your order progresses.
                  </p>
                </div>
                <button
                  onClick={() => void pushSubscribe()}
                  disabled={pushLoading}
                  style={{
                    background: 'var(--color-primary)', color: 'white',
                    border: 'none', borderRadius: '10px',
                    padding: '8px 16px', fontSize: 13, fontWeight: 700,
                    cursor: pushLoading ? 'not-allowed' : 'pointer',
                    flexShrink: 0, fontFamily: 'inherit',
                    opacity: pushLoading ? 0.7 : 1,
                  }}
                >
                  {pushLoading ? '…' : 'Enable'}
                </button>
              </div>
            )}
            {pushSupported && pushSubscribed && !isCancelled && !isDone && (
              <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--color-success)' }}>
                🔔 Push notifications enabled — you'll be notified when your order status changes.
              </p>
            )}

            {/* Review form */}
            {token && ['completed', 'paid'].includes(order.status) && !reviewDone && (
              <ReviewForm orderId={order.id} token={token} onDone={() => setReviewDone(true)} />
            )}

            {/* Support block */}
            <div style={{ ...S.card, textAlign: 'center', padding: '1.375rem 1.5rem' }}>
              <p style={{ fontWeight: 700, color: 'var(--color-text)', fontSize: '0.9375rem', marginBottom: 4 }}>
                Need help with your order?
              </p>
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 14 }}>
                We reply within 10 minutes on WhatsApp and Viber
              </p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                <a
                  href={`${waLink}?text=Hi%2C+I+need+help+with+order+%23${order.order_number}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '0.625rem 1.125rem', background: '#25d366', color: 'white', borderRadius: '10px', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}
                  aria-label="Contact us on WhatsApp"
                >
                  <WhatsAppIcon /> WhatsApp
                </a>
                <a
                  href={viberLink}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '0.625rem 1.125rem', background: '#7360f2', color: 'white', borderRadius: '10px', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}
                  aria-label="Contact us on Viber"
                >
                  <ViberIcon /> Viber
                </a>
              </div>
            </div>

            {/* CTA */}
            <button
              style={{
                background: isDone ? 'var(--color-primary)' : 'var(--color-surface)',
                color: isDone ? 'white' : 'var(--color-primary)',
                border: isDone ? 'none' : '1.5px solid var(--color-primary)',
                borderRadius: '12px', padding: '14px 24px',
                fontSize: 15, fontWeight: 700,
                cursor: 'pointer', width: '100%', fontFamily: 'inherit',
                boxShadow: isDone ? '0 4px 14px var(--color-primary-glow)' : 'none',
                transition: 'all 0.15s',
              }}
              onClick={() => navigate('/')}
            >
              {isDone ? 'Order again' : '← Back to menu'}
            </button>
          </div>
        )}

        {/* ── Not found ─────────────────────────────────── */}
        {!loading && !order && !error && (
          <div style={S.card} className="animate-fade-in">
            {paymentState === 'CONFIRMED' ? (
              // Payment was confirmed but we can't load the order (e.g. private
              // browsing or session expired). Don't show a confusing "not found"
              // message right after a successful payment.
              <>
                <p style={{ color: 'var(--color-success)', fontWeight: 700, textAlign: 'center', marginBottom: 8, fontSize: 18 }}>
                  Payment received!
                </p>
                <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', marginBottom: 16 }}>
                  Your order has been confirmed. Check your email or WhatsApp for details.
                </p>
              </>
            ) : (
              <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', marginBottom: 16 }}>
                Order not found. Please sign in to view your order.
              </p>
            )}
            <button style={{ background: 'var(--color-primary)', color: 'white', border: 'none', borderRadius: '12px', padding: '12px 24px', fontSize: 15, fontWeight: 700, cursor: 'pointer', width: '100%', fontFamily: 'inherit' }} onClick={() => navigate('/')}>
              Back to menu
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = {
  page: {
    minHeight: '100vh',
    background: 'var(--color-bg)',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
  } as React.CSSProperties,

  header: {
    position: 'sticky' as const, top: 0,
    background: 'var(--color-header-bg)',
    backdropFilter: 'blur(12px)',
    borderBottom: '1px solid var(--color-border)',
    padding: '12px 20px',
    display: 'flex', alignItems: 'center', gap: 16,
    zIndex: 100, boxShadow: '0 1px 8px rgba(0,0,0,0.04)',
  } as React.CSSProperties,

  backBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--color-primary)', fontSize: 14, fontWeight: 600,
    padding: '4px 8px', borderRadius: '6px', fontFamily: 'inherit',
  } as React.CSSProperties,

  headerTitle: {
    fontWeight: 700, fontSize: 17,
    color: 'var(--color-text)', flex: 1,
  } as React.CSSProperties,

  container: {
    maxWidth: 600, margin: '0 auto',
    padding: '20px 16px 40px',
    display: 'flex', flexDirection: 'column' as const, gap: 16,
  } as React.CSSProperties,

  card: {
    background: 'var(--color-surface)',
    borderRadius: '16px', padding: '20px',
    boxShadow: 'var(--shadow-sm)',
    border: '1px solid var(--color-border)',
  } as React.CSSProperties,

  cardTitle: {
    fontSize: 12, fontWeight: 700,
    textTransform: 'uppercase' as const, letterSpacing: '0.08em',
    color: 'var(--color-text-muted)', marginBottom: 4, margin: '0 0 8px',
  } as React.CSSProperties,
} as const;
