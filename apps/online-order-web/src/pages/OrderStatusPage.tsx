import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { getOrderDetail, getOrderByTrackingToken, type OrderDetail, type OrderItem as OrderDetailItem, API_ORIGIN } from "../api";
import { ReviewForm } from "../components/ReviewForm";
import { BrandedHeader } from "../components/BrandedHeader";
import { WhatsAppIcon, ViberIcon } from "../components/icons";
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
        const res = await fetch(`${API_ORIGIN}/api/driver/deliveries/${orderId}/location`, {
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
      borderRadius: '1rem', padding: '1rem', color: 'white',
    }}>
      <p style={{ fontSize: 'var(--text-sm)', fontWeight: 700, margin: '0 0 0.5rem', opacity: 0.85 }}>🚀 Your driver is on the way!</p>
      {driver && <p style={{ fontSize: 'var(--text-body)', fontWeight: 700, margin: '0 0 0.25rem' }}>🛵 {driver.name}</p>}
      {location ? (
        <p style={{ fontSize: 'var(--text-xs)', margin: '0 0 0.75rem', opacity: 0.8 }}>
          Last seen: {Math.floor((Date.now() - new Date(location.recorded_at).getTime()) / 60000)} min ago
        </p>
      ) : (
        <p style={{ fontSize: 'var(--text-xs)', margin: '0 0 0.75rem', opacity: 0.8 }}>Locating driver…</p>
      )}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        {mapsUrl && (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              flex: 1, textAlign: 'center', background: 'rgba(255,255,255,0.2)',
              color: 'white', fontWeight: 700, fontSize: 'var(--text-sm)', padding: '0.625rem 0',
              borderRadius: '0.625rem', textDecoration: 'none',
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
              color: 'white', fontWeight: 700, fontSize: 'var(--text-sm)', padding: '0.625rem 0',
              borderRadius: '0.625rem', textDecoration: 'none',
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
              color: 'white', fontWeight: 700, fontSize: 'var(--text-sm)', padding: '0.625rem 0',
              borderRadius: '0.625rem', textDecoration: 'none',
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

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-base)', paddingTop: '0.625rem' }}>
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

  const paymentState = searchParams.get("payment") as PaymentState;
  const trackingToken = searchParams.get("tok");

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [liveConnected, setLiveConnected] = useState(false);
  const [reviewDone, setReviewDone] = useState(false);

  const token = readToken();
  const esRef = useRef<EventSource | null>(null);
  // Guard so clearCart() is called at most once per page visit, regardless of
  // how many times order.status re-renders in a confirmed state (F-4).
  const cartClearedRef = useRef(false);

  // useCallback gives a stable reference so polling intervals don't capture stale closures
  const loadOrder = useCallback(async () => {
    if (!orderId) return;
    try {
      if (trackingToken) {
        // Public link — no login required
        const res = await getOrderByTrackingToken(trackingToken);
        setOrder(res.order);
      } else if (token) {
        const res = await getOrderDetail(token, parseInt(orderId, 10));
        setOrder(res.order);
      } else {
        setError("Please log in to view your order.");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token, trackingToken, orderId]);

  useEffect(() => {
    document.title = order?.order_number
      ? `Order #${order.order_number} — Bake & Grill`
      : 'Order Status — Bake & Grill';
  }, [order?.order_number]);

  useEffect(() => {
    if (paymentState === "CONFIRMED" && !cartClearedRef.current) {
      cartClearedRef.current = true;
      clearCart();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentState]);

  // Clear cart once the order has a confirmed/paid status —
  // covers the case where the user arrives via SMS tracking link (?tok=)
  // after a successful payment redirect, without the ?payment=CONFIRMED param.
  useEffect(() => {
    if (
      order &&
      ['pending', 'paid', 'preparing', 'ready', 'completed'].includes(order.status) &&
      !cartClearedRef.current
    ) {
      cartClearedRef.current = true;
      clearCart();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.status]);

  useEffect(() => { void loadOrder(); }, [loadOrder]);

  // SSE real-time tracking
  useEffect(() => {
    if (!orderId) return;
    const controller = new AbortController();
    const startStream = async () => {
      let ticketParam = "";
      if (token) {
        try {
          const res = await fetch(`${API_ORIGIN}/api/orders/${orderId}/stream-ticket`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            signal: controller.signal,
          });
          if (res.ok) {
            const data = await res.json() as { ticket: string };
            ticketParam = `?ticket=${encodeURIComponent(data.ticket)}`;
          }
        } catch (err) {
          if ((err as Error).name === 'AbortError') return;
        }
      }
      if (controller.signal.aborted) return;
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
      controller.abort();
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

  const waLink    = s.business_whatsapp || 'https://wa.me/9609120011';
  const viberLink = s.business_viber   || 'viber://chat?number=9609120011';
  const phone     = s.business_phone   || '+960 912 0011';
  const phoneTel  = 'tel:' + phone.replace(/[^+\d]/g, '');

  const liveIndicator = liveConnected ? (
    <span style={{ fontSize: '0.6875rem', color: 'var(--color-success)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
      <span style={{ width: '0.4375rem', height: '0.4375rem', borderRadius: '50%', background: 'var(--color-success)', display: 'inline-block', animation: 'pulse-dot 2s infinite' }} />
      Live
    </span>
  ) : null;

  return (
    <div style={S.page}>

      {/* ── Branded header ───────────────────────────────── */}
      <BrandedHeader
        onBack={() => navigate('/')}
        backLabel="← Menu"
        rightSlot={liveIndicator ?? undefined}
      />

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
                marginLeft: '0.75rem', padding: '0.375rem 0.875rem', fontSize: 'var(--text-sm)', fontWeight: 600,
                background: 'var(--color-surface)', color: 'var(--color-error)', border: '1.5px solid var(--color-error)',
                borderRadius: '0.5rem', cursor: 'pointer',
              }}
            >
              Try again
            </button>
          </div>
        )}

        {/* ── Order content ─────────────────────────────── */}
        {!loading && order && statusInfo && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            {/* Status hero card */}
            <div style={{
              ...S.card,
              background: isCancelled ? 'var(--color-error-bg)' : statusInfo.bg,
              borderColor: isCancelled ? 'rgba(220,38,38,0.2)' : 'transparent',
            }}>
              {/* Icon + label */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                <div style={{
                  width: '3.5rem', height: '3.5rem',
                  borderRadius: '50%',
                  background: 'var(--color-surface-alt)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.625rem', flexShrink: 0,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                }}>
                  {statusInfo.icon}
                </div>
                <div>
                  <p style={{ fontSize: '1.25rem', fontWeight: 800, color: statusInfo.color, margin: 0, letterSpacing: '-0.025em' }}>
                    {statusInfo.label}
                  </p>
                  <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', margin: '0.25rem 0 0', lineHeight: 1.4 }}>
                    {statusInfo.sub}
                  </p>
                  {statusInfo.next && !isCancelled && (
                    <p style={{ fontSize: 'var(--text-xs)', color: statusInfo.color, margin: '0.375rem 0 0', fontWeight: 600, opacity: 0.8 }}>
                      {statusInfo.next}
                    </p>
                  )}
                </div>
              </div>

              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', fontWeight: 600, margin: '0 0 0.75rem', letterSpacing: '0.04em', textTransform: 'uppercase' as const }}>
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
                        <div key={step.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.375rem' }}>
                          <div style={{
                            width: '1.75rem', height: '1.75rem', borderRadius: '50%',
                            background: (done || active) ? statusInfo.color : 'var(--color-surface)',
                            border: `2.5px solid ${(done || active) ? statusInfo.color : 'var(--color-border)'}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.6875rem', fontWeight: 800,
                            color: (done || active) ? 'white' : 'var(--color-text-muted)',
                            boxShadow: active ? `0 0 0 5px ${statusInfo.color}22` : 'none',
                            animation: active ? 'stepper-pulse 2s ease-in-out infinite' : 'none',
                            transition: 'all 0.3s',
                          }}>
                            {done ? '✓' : i + 1}
                          </div>
                          <span style={{
                            fontSize: '0.625rem', fontWeight: active ? 700 : 500,
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
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 'var(--text-lg)', color: 'var(--color-text)', borderTop: '2px solid var(--color-border)', paddingTop: '0.75rem', marginTop: '0.75rem' }}>
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
                <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-text)', margin: 0 }}>{order.delivery_address_line1}</p>
                {order.delivery_island && <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-text-muted)', margin: '0.25rem 0 0' }}>{order.delivery_island}</p>}
                {order.delivery_contact_name && (
                  <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-text)', margin: '0.5rem 0 0' }}>
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
                  <div key={item.id} style={{ display: 'flex', alignItems: 'flex-start', paddingBottom: '0.625rem', marginBottom: '0.625rem', borderBottom: '1px solid var(--color-border)' }}>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontWeight: 600, fontSize: 'var(--text-base)', color: 'var(--color-text)' }}>{item.item_name}</span>
                      {item.modifiers && item.modifiers.length > 0 && (
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: '0.125rem' }}>
                          + {item.modifiers.map((m) => m.name ?? '').join(', ')}
                        </div>
                      )}
                    </div>
                    <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)', marginRight: '0.75rem' }}>×{item.quantity}</span>
                    <span style={{ fontWeight: 700, color: 'var(--color-primary)', fontSize: 'var(--text-base)' }}>
                      MVR {parseFloat(String(item.total_price ?? 0)).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Refresh note */}
            <p style={{ textAlign: 'center', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
              {liveConnected
                ? '🟢 Live tracking enabled — updates instantly'
                : '🔄 Auto-refreshing every 10 seconds'}
            </p>

            {/* Push notification opt-in banner */}
            {pushSupported && !pushSubscribed && !isCancelled && !isDone && token && (
              <div style={{
                ...S.card,
                display: 'flex', alignItems: 'center', gap: '0.875rem',
                background: 'linear-gradient(135deg, var(--color-primary-light) 0%, var(--color-surface) 100%)',
                borderColor: 'rgba(234, 88, 12, 0.2)',
              }}>
                <div style={{ fontSize: '1.75rem', flexShrink: 0 }}>🔔</div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 700, fontSize: 'var(--text-base)', margin: '0 0 0.125rem', color: 'var(--color-text)' }}>
                    Get notified when your order is ready
                  </p>
                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', margin: 0 }}>
                    We'll send you a push notification as your order progresses.
                  </p>
                </div>
                <button
                  onClick={() => void pushSubscribe()}
                  disabled={pushLoading}
                  style={{
                    background: 'var(--color-primary)', color: 'white',
                    border: 'none', borderRadius: '0.625rem',
                    padding: '0.5rem 1rem', fontSize: 'var(--text-sm)', fontWeight: 700,
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
              <p style={{ textAlign: 'center', fontSize: 'var(--text-xs)', color: 'var(--color-success)' }}>
                🔔 Push notifications enabled — you'll be notified when your order status changes.
              </p>
            )}

            {/* Review form */}
            {token && ['completed', 'paid'].includes(order.status) && !reviewDone && (
              <ReviewForm orderId={order.id} token={token} onDone={() => setReviewDone(true)} />
            )}

            {/* Support block */}
            <div style={{ ...S.card, textAlign: 'center', padding: '1.375rem 1.5rem' }}>
              <p style={{ fontWeight: 700, color: 'var(--color-text)', fontSize: 'var(--text-body)', marginBottom: '0.25rem' }}>
                Need help with your order?
              </p>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: '0.875rem' }}>
                We reply within 10 minutes on WhatsApp and Viber
              </p>
              <div style={{ display: 'flex', gap: '0.625rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                <a
                  href={`${waLink}?text=Hi%2C+I+need+help+with+order+%23${order.order_number}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4375rem', padding: '0.625rem 1.125rem', background: '#25d366', color: 'white', borderRadius: '0.625rem', fontWeight: 700, fontSize: 'var(--text-sm)', textDecoration: 'none' }}
                  aria-label="Contact us on WhatsApp"
                >
                  <WhatsAppIcon /> WhatsApp
                </a>
                <a
                  href={viberLink}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4375rem', padding: '0.625rem 1.125rem', background: '#7360f2', color: 'white', borderRadius: '0.625rem', fontWeight: 700, fontSize: 'var(--text-sm)', textDecoration: 'none' }}
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
                borderRadius: '0.75rem', padding: '0.875rem 1.5rem',
                fontSize: 'var(--text-body)', fontWeight: 700,
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
                <p style={{ color: 'var(--color-success)', fontWeight: 700, textAlign: 'center', marginBottom: '0.5rem', fontSize: 'var(--text-lg)' }}>
                  Payment received!
                </p>
                <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', marginBottom: '1rem' }}>
                  Your order has been confirmed. Check your email or WhatsApp for details.
                </p>
              </>
            ) : (
              <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', marginBottom: '1rem' }}>
                Order not found. Please sign in to view your order.
              </p>
            )}
            <button style={{ background: 'var(--color-primary)', color: 'white', border: 'none', borderRadius: '0.75rem', padding: '0.75rem 1.5rem', fontSize: 'var(--text-body)', fontWeight: 700, cursor: 'pointer', width: '100%', fontFamily: 'inherit' }} onClick={() => navigate('/')}>
              Back to menu
            </button>
          </div>
        )}
      </div>

      {/* ── Footer ───────────────────────────────────────── */}
      <footer style={{
        borderTop: '1px solid var(--color-border)',
        background: 'var(--color-surface)',
        padding: '1.25rem var(--page-gutter) 1.75rem',
        marginTop: 'auto',
        textAlign: 'center',
      }}>
        <div style={{ maxWidth: 'min(600px, 100%)', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '0.625rem', alignItems: 'center' }}>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', margin: 0 }}>
            Need help?{' '}
            <a href={`${waLink}?text=Hi%2C+I+need+help+with+my+order`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
              WhatsApp us
            </a>
            {' · '}
            <a href={phoneTel} style={{ color: 'var(--color-primary)', fontWeight: 600 }}>{phone}</a>
          </p>
          <a href="/" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textDecoration: 'none' }}>
            ← Back to main website
          </a>
        </div>
      </footer>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = {
  page: {
    minHeight: '100vh',
    background: 'var(--color-bg)',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    display: 'flex',
    flexDirection: 'column' as const,
  } as React.CSSProperties,

  container: {
    maxWidth: 'min(600px, 100%)', margin: '0 auto',
    padding: '1.25rem var(--page-gutter) 2.5rem',
    display: 'flex', flexDirection: 'column' as const, gap: '1rem',
  } as React.CSSProperties,

  card: {
    background: 'var(--color-surface)',
    borderRadius: '1rem', padding: '1.25rem',
    boxShadow: 'var(--shadow-sm)',
    border: '1px solid var(--color-border)',
  } as React.CSSProperties,

  cardTitle: {
    fontSize: 'var(--text-xs)', fontWeight: 700,
    textTransform: 'uppercase' as const, letterSpacing: '0.08em',
    color: 'var(--color-text-muted)', margin: '0 0 0.5rem',
  } as React.CSSProperties,
} as const;
