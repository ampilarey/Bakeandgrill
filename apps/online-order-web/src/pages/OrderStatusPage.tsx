import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { getOrderDetail, getOrderByTrackingToken, getReorderPayload, initiateOnlinePayment, initiatePartialPayment, getWaitTimeEstimate, getMyReferralCode, cancelCustomerOrder, type OrderDetail, type OrderItem as OrderDetailItem, API_ORIGIN } from "../api";
import { ReviewForm } from "../components/ReviewForm";
import { BrandedHeader } from "../components/BrandedHeader";
import { WhatsAppIcon, ViberIcon } from "../components/icons";
import { useCart } from "../context/CartContext";
import { usePushNotifications } from "../hooks/usePushNotifications";
import { useSiteSettings } from "../context/SiteSettingsContext";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { isGiftCardOrder } from "../utils/giftCardOrder";
import { applyReorderPayloadToCart } from "../utils/applyReorderToCart";
import {
  clearCheckoutPendingOrderId,
  writeCheckoutPendingOrderId,
} from "../utils/checkoutPendingOrder";

type PaymentState = "CONFIRMED" | "FAILED" | "PENDING" | null;

// ─── Driver Tracker ───────────────────────────────────────────────────────────

type DriverLocationData = {
  latitude: number;
  longitude: number;
  recorded_at: string;
  driver?: { name: string; phone: string } | null;
};

function DriverTracker({ orderId, authenticated }: { orderId: number; authenticated: boolean }) {
  const { t } = useLanguage();
  const [data, setData] = useState<{ location: DriverLocationData | null; driver: { name: string; phone: string } | null; eta_minutes?: number | null } | null>(null);
  const [fetchErr, setFetchErr] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API_ORIGIN}/api/driver/deliveries/${orderId}/location`, {
          credentials: authenticated ? 'include' : 'same-origin',
          headers: { Accept: 'application/json' },
        });
        if (res.ok) {
          const json = await res.json() as { location: DriverLocationData | null; driver: { name: string; phone: string } | null; eta_minutes?: number | null };
          setData(json);
          setFetchErr(false);
        } else {
          setFetchErr(true);
        }
      } catch {
        setFetchErr(true);
      }
    };
    void load();
    const id = setInterval(() => void load(), 10_000);
    return () => clearInterval(id);
  }, [orderId, authenticated]);

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
      <p style={{ fontSize: 'var(--text-sm)', fontWeight: 700, margin: '0 0 0.5rem', opacity: 0.85 }}>🚀 {t('track.driver.title')}</p>
      {data?.eta_minutes != null && (
        <p style={{ fontSize: 'var(--text-base)', fontWeight: 800, margin: '0 0 0.35rem' }}>
          {t('track.driver.eta_estimate').replace('{n}', String(data.eta_minutes))}
        </p>
      )}
      {driver && <p style={{ fontSize: 'var(--text-body)', fontWeight: 700, margin: '0 0 0.25rem' }}>🛵 {driver.name}</p>}
      {location ? (
        <p style={{ fontSize: 'var(--text-xs)', margin: '0 0 0.75rem', opacity: 0.8 }}>
          {(() => {
            const ts = Date.parse(location.recorded_at);
            return Number.isFinite(ts)
              ? t('track.driver.last_seen').replace('{n}', String(Math.floor((Date.now() - ts) / 60000)))
              : t('track.driver.last_unknown');
          })()}
        </p>
      ) : fetchErr ? (
        <p style={{ fontSize: 'var(--text-xs)', margin: '0 0 0.75rem', opacity: 0.8 }}>{t('track.driver.loc_unavailable')}</p>
      ) : (
        <p style={{ fontSize: 'var(--text-xs)', margin: '0 0 0.75rem', opacity: 0.8 }}>{t('track.driver.locating')}</p>
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
            📍 {t('track.driver.track_map')}
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
            📞 {t('track.driver.call')}
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
            💬 {t('track.driver.whatsapp')}
          </a>
        )}
      </div>
    </div>
  );
}

// ─── Status config (copy via track.status.* keys) ─────────────────────────────
const STATUS_CONFIG: Record<string, {
  labelKey: string; subKey: string; nextKey?: string;
  color: string; bg: string; icon: string;
}> = {
  payment_pending: {
    labelKey: "track.status.payment_pending.label",
    subKey: "track.status.payment_pending.sub",
    nextKey: "track.status.payment_pending.next",
    color: "var(--color-primary)", bg: "var(--color-primary-light)", icon: "⏳",
  },
  pending: {
    labelKey: "track.status.pending.label",
    subKey: "track.status.pending.sub",
    nextKey: "track.status.pending.next",
    color: "var(--color-warning)", bg: "var(--color-warning-bg)", icon: "✅",
  },
  paid: {
    labelKey: "track.status.paid.label",
    subKey: "track.status.paid.sub",
    nextKey: "track.status.paid.next",
    color: "var(--color-success)", bg: "var(--color-success-bg)", icon: "✅",
  },
  preparing: {
    labelKey: "track.status.preparing.label",
    subKey: "track.status.preparing.sub",
    nextKey: "track.status.preparing.next",
    color: "var(--color-primary)", bg: "var(--color-primary-light)", icon: "👨‍🍳",
  },
  in_progress: {
    labelKey: "track.status.in_progress.label",
    subKey: "track.status.in_progress.sub",
    nextKey: "track.status.in_progress.next",
    color: "var(--color-primary)", bg: "var(--color-primary-light)", icon: "👨‍🍳",
  },
  ready: {
    labelKey: "track.status.ready.label",
    subKey: "track.status.ready.sub",
    color: "var(--color-success)", bg: "var(--color-success-bg)", icon: "🎉",
  },
  out_for_delivery: {
    labelKey: "track.status.out_for_delivery.label",
    subKey: "track.status.out_for_delivery.sub",
    color: "var(--color-warning)", bg: "var(--color-warning-bg)", icon: "🛵",
  },
  picked_up: {
    labelKey: "track.status.picked_up.label",
    subKey: "track.status.picked_up.sub",
    color: "var(--color-warning)", bg: "var(--color-warning-bg)", icon: "✅",
  },
  on_the_way: {
    labelKey: "track.status.on_the_way.label",
    subKey: "track.status.on_the_way.sub",
    color: "var(--color-warning)", bg: "var(--color-warning-bg)", icon: "🏃",
  },
  delivered: {
    labelKey: "track.status.delivered.label",
    subKey: "track.status.delivered.sub",
    color: "var(--color-success)", bg: "var(--color-success-bg)", icon: "🎉",
  },
  completed: {
    labelKey: "track.status.completed.label",
    subKey: "track.status.completed.sub",
    color: "var(--color-text-muted)", bg: "var(--color-surface-alt)", icon: "🎉",
  },
  cancelled: {
    labelKey: "track.status.cancelled.label",
    subKey: "track.status.cancelled.sub",
    color: "var(--color-error)", bg: "var(--color-error-bg)", icon: "✕",
  },
  refunded: {
    labelKey: "track.status.refunded.label",
    subKey: "track.status.refunded.sub",
    color: "var(--color-error)", bg: "var(--color-error-bg)", icon: "✕",
  },
};

// ─── Progress steps ───────────────────────────────────────────────────────────
const STEPS = [
  { key: "pending",    labelKey: "track.step.received" },
  { key: "preparing",  labelKey: "track.step.preparing" },
  { key: "ready",      labelKey: "track.step.ready" },
  { key: "completed",  labelKey: "track.step.done" },
];
function stepIndex(status: string): number {
  const normalised = status === "paid" || status === "in_progress" ? "preparing"
    : status === "payment_pending" ? "pending"
    : status;
  const s = STEPS.findIndex((s) => s.key === normalised);
  // delivery statuses sit between ready and completed
  if (['out_for_delivery', 'picked_up', 'on_the_way', 'delivered'].includes(status)) return 2;
  if (status === "completed") return 3;
  return s;
}

const ORDER_TYPE_KEYS: Record<string, string> = {
  dine_in: "track.type.dine_in",
  takeaway: "track.type.takeaway",
  online_pickup: "track.type.online_pickup",
  delivery: "track.type.delivery",
  preorder: "track.type.preorder",
};

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
  const { orderId, trackingToken: trackingTokenFromPath } = useParams<{ orderId?: string; trackingToken?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { clearCart, addItem } = useCart();
  const s = useSiteSettings();
  const { isAuthenticated, authReady } = useAuth();
  const { t } = useLanguage();

  const paymentState = searchParams.get("payment") as PaymentState;
  const trackingToken = trackingTokenFromPath ?? searchParams.get("tok");

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [liveConnected, setLiveConnected] = useState(false);
  const [reviewDone, setReviewDone] = useState(false);
  const [showPaymentBanner, setShowPaymentBanner] = useState(true);
  const [isPaying, setIsPaying] = useState(false);
  const [payError, setPayError] = useState("");
  const [partialAmountMvr, setPartialAmountMvr] = useState("");
  const [reordering, setReordering] = useState(false);
  const [waitMinutes, setWaitMinutes] = useState<number | null>(null);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const [cancelSuccess, setCancelSuccess] = useState("");

  const esRef = useRef<EventSource | null>(null);
  // Guard so clearCart() is called at most once per page visit, regardless of
  // how many times order.status re-renders in a confirmed state (F-4).
  const cartClearedRef = useRef(false);

  // useCallback gives a stable reference so polling intervals don't capture stale closures
  const loadOrder = useCallback(async () => {
    if (!trackingToken && !orderId) return;

    const parsedId = orderId ? parseInt(orderId, 10) : NaN;
    if (!trackingToken && !Number.isFinite(parsedId)) {
      setError(t("track.err_invalid_id"));
      setLoading(false);
      return;
    }

    // Auth race: without a tracking token we cannot decide "need link / login"
    // until the session check finishes. Stay in loading — do not flash an error.
    if (!trackingToken && !authReady) {
      setLoading(true);
      return;
    }

    try {
      if (trackingToken) {
        // Public link — no login required
        const res = await getOrderByTrackingToken(trackingToken);
        setOrder(res.order);
        setError("");
      } else if (isAuthenticated) {
        const res = await getOrderDetail(parsedId);
        setOrder(res.order);
        setError("");
      } else {
        setError(t("track.err_need_link"));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, authReady, trackingToken, orderId, t]);

  useEffect(() => {
    document.title = order?.order_number
      ? `${t("track.page_title_num").replace("{n}", order.order_number)} — Bake & Grill`
      : `${t("track.page_title")} — Bake & Grill`;
  }, [order?.order_number, t]);

  useEffect(() => {
    if (order && isGiftCardOrder(order)) {
      void navigate(`/gift-cards/success?orderId=${order.id}`, { replace: true });
    }
  }, [order, navigate]);

  useEffect(() => {
    if (!order || !['pending', 'paid', 'confirmed', 'preparing', 'in_progress', 'ready'].includes(order.status)) {
      return;
    }
    getWaitTimeEstimate()
      .then(({ wait_minutes, queue_depth }) => {
        if (queue_depth > 0) setWaitMinutes(wait_minutes);
      })
      .catch(() => { /* non-blocking */ });
  }, [order?.status, order?.id]);

  useEffect(() => {
    if (!isAuthenticated) {
      setReferralCode(null);
      return;
    }
    getMyReferralCode()
      .then((res) => setReferralCode(res.code ?? null))
      .catch(() => setReferralCode(null));
  }, [isAuthenticated]);

  // ONL-002: only trust the SERVER for "is this order paid?". The
  // ?payment=CONFIRMED query param can be forged by anyone pasting a
  // URL — previously the cart was wiped and a success banner shown
  // purely on the strength of that string, even if the user never
  // completed checkout.
  // Now we additionally require the server-reported payment_status,
  // and we only clear the cart once we've seen a paid order on this
  // visit (cartClearedRef guard).
  const remainingLaar = order?.remaining_balance_laar ?? (
    order && order.payment_status !== 'paid'
      ? (order.total_laar ?? Math.round((order.total ?? 0) * 100))
      : 0
  );
  const remainingMvr = remainingLaar / 100;

  const serverPaymentConfirmed =
    !!order && (order.payment_status === 'paid' || remainingLaar <= 0);

  const needsRemainingPayment =
    !!order &&
    !!isAuthenticated &&
    remainingLaar > 0 &&
    !['cancelled', 'refunded', 'completed'].includes(order.status) &&
    order.payment_status !== 'paid';

  const needsPaymentRetry =
    needsRemainingPayment && order?.status === 'payment_pending';

  const redirectToPayment = (paymentUrl: string | null | undefined) => {
    if (!paymentUrl) {
      throw new Error(t("track.err_pay_start"));
    }
    window.location.href = paymentUrl;
  };

  const handlePayAgain = async () => {
    if (!order || !isAuthenticated) {
      setPayError(t("track.err_sign_in_pay"));
      navigate("/checkout");
      return;
    }
    setIsPaying(true);
    setPayError("");
    try {
      writeCheckoutPendingOrderId(order.id);
      const payment = await initiateOnlinePayment(order.id);
      redirectToPayment(payment.payment_url);
    } catch (e) {
      setPayError((e as Error).message);
      setIsPaying(false);
    }
  };

  const handlePayPartial = async () => {
    if (!order || !isAuthenticated) {
      setPayError(t("track.err_sign_in_pay"));
      return;
    }
    const amountLaar = Math.round(parseFloat(partialAmountMvr) * 100);
    if (!Number.isFinite(amountLaar) || amountLaar <= 0) {
      setPayError(t("track.err_amount"));
      return;
    }
    if (amountLaar > remainingLaar) {
      setPayError(t("track.err_amount_max").replace("{amount}", remainingMvr.toFixed(2)));
      return;
    }
    setIsPaying(true);
    setPayError("");
    try {
      writeCheckoutPendingOrderId(order.id);
      const payment = await initiatePartialPayment(
        order.id,
        amountLaar,
        `web-partial:${order.id}:${amountLaar}:${Date.now()}`,
      );
      redirectToPayment(payment.payment_url);
    } catch (e) {
      setPayError((e as Error).message);
      setIsPaying(false);
    }
  };

  useEffect(() => {
    if (serverPaymentConfirmed && !cartClearedRef.current) {
      cartClearedRef.current = true;
      clearCart();
      // Paid successfully — do not let the next checkout reuse this order id.
      clearCheckoutPendingOrderId();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverPaymentConfirmed]);

  useEffect(() => { void loadOrder(); }, [loadOrder]);

  // SSE real-time tracking (requires numeric order id from loaded order or URL)
  useEffect(() => {
    const streamOrderId = order?.id ?? (orderId ? parseInt(orderId, 10) : NaN);
    if (!Number.isFinite(streamOrderId)) return;
    const controller = new AbortController();
    const startStream = async () => {
      let ticketParam = "";
      if (isAuthenticated) {
        try {
          const res = await fetch(`${API_ORIGIN}/api/orders/${streamOrderId}/stream-ticket`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
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
      const sseUrl = `${API_ORIGIN}/api/stream/order-status/${streamOrderId}${ticketParam}`;
      const es = new EventSource(sseUrl, { withCredentials: false });
      const handleStatus = (e: MessageEvent) => {
        try {
          const payload = JSON.parse(e.data) as {
            status: string;
            payment_status?: string;
            paid_at?: string;
          };
          setOrder(prev => prev ? {
            ...prev,
            status: payload.status,
            payment_status: payload.payment_status ?? prev.payment_status,
            paid_at: payload.paid_at ?? prev.paid_at,
          } : prev);
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
  }, [order?.id, orderId, isAuthenticated]);

  // Fallback polling — uses stable loadOrder reference from useCallback
  useEffect(() => {
    if (liveConnected) return;
    const interval = setInterval(() => void loadOrder(), 10_000);
    return () => clearInterval(interval);
  }, [liveConnected, loadOrder]);

  const statusMeta = order ? STATUS_CONFIG[order.status] : null;
  const statusInfo = order
    ? (statusMeta
      ? {
          label: t(statusMeta.labelKey),
          sub: t(statusMeta.subKey),
          next: statusMeta.nextKey ? t(statusMeta.nextKey) : undefined,
          color: statusMeta.color,
          bg: statusMeta.bg,
          icon: statusMeta.icon,
        }
      : {
          label: order.status,
          sub: '',
          color: 'var(--color-text-muted)',
          bg: 'var(--color-surface-alt)',
          icon: '📋',
        })
    : null;
  const orderTypeLabel = (type: string) => {
    const key = ORDER_TYPE_KEYS[type];
    return key ? t(key) : type;
  };

  const isCancelled = order?.status === 'cancelled' || order?.status === 'refunded';
  const isDone = order?.status === 'completed';
  const canSelfCancel = Boolean(isAuthenticated && order?.can_cancel);

  const handleConfirmCancel = async () => {
    if (!order) return;
    setCancelling(true);
    setCancelError("");
    try {
      const result = await cancelCustomerOrder(order.id);
      setOrder((prev) => prev ? {
        ...prev,
        status: result.order.status,
        payment_status: result.order.payment_status ?? prev.payment_status,
        fired_at: result.order.fired_at ?? null,
        can_cancel: false,
        reservation: result.order.reservation
          ? { ...(prev.reservation ?? { date: '', time_slot: '', party_size: 0, table: null }), ...result.order.reservation }
          : prev.reservation,
      } : prev);
      setCancelSuccess(result.refunded ? t('track.cancel.done_paid') : t('track.cancel.done_unpaid'));
      setShowCancelConfirm(false);
    } catch {
      setCancelError(t('track.cancel.error'));
    } finally {
      setCancelling(false);
    }
  };
  const pointsEarned = order?.loyalty_points_earned ?? 0;
  const showPointsCelebration =
    pointsEarned > 0 &&
    (serverPaymentConfirmed || isDone);
  const activeStep = order ? stepIndex(order.status) : -1;

  const handleShareOrder = async () => {
    if (!order) return;
    const referralLine = referralCode
      ? `\n${t('track.share_referral').replace('{code}', referralCode)}`
      : '';
    const shareText = `${t('track.share_text').replace('{n}', order.order_number)}${referralLine}`;
    const shareUrl = window.location.origin + '/order';
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Bake & Grill', text: shareText, url: shareUrl });
      } else {
        await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
        alert(t('track.share_copied'));
      }
    } catch {
      /* user cancelled share */
    }
  };

  const handleOrderAgain = async () => {
    if (!order) return;
    if (!isDone) {
      navigate('/');
      return;
    }
    if (!isAuthenticated) {
      navigate('/account');
      return;
    }
    setReordering(true);
    try {
      // Force a fresh checkout order — never resume pay on this one.
      clearCheckoutPendingOrderId();
      const payload = await getReorderPayload(order.id);
      clearCart();
      const { added, needsPickerCount } = applyReorderPayloadToCart(payload, addItem);
      if (needsPickerCount > 0 && added === 0) {
        navigate('/menu');
        return;
      }
      navigate(needsPickerCount > 0 ? '/menu' : '/checkout');
    } catch {
      navigate('/menu');
    } finally {
      setReordering(false);
    }
  };

  const { supported: pushSupported, subscribed: pushSubscribed, loading: pushLoading, subscribe: pushSubscribe } = usePushNotifications(isAuthenticated);

  const waLink    = s.business_whatsapp || 'https://wa.me/9609120011';
  const viberLink = s.business_viber   || 'viber://chat?number=9609120011';
  const phone     = s.business_phone   || '+960 912 0011';
  const phoneTel  = 'tel:' + phone.replace(/[^+\d]/g, '');

  const liveIndicator = liveConnected ? (
    <span style={{ fontSize: '0.6875rem', color: 'var(--color-success)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
      <span style={{ width: '0.4375rem', height: '0.4375rem', borderRadius: '50%', background: 'var(--color-success)', display: 'inline-block', animation: 'pulse-dot 2s infinite' }} />
      {t('track.live')}
    </span>
  ) : null;

  return (
    <div style={S.page}>

      {/* ── Branded header ───────────────────────────────── */}
      <BrandedHeader
        onBack={() => navigate('/')}
        backLabel={t('header.back_home')}
        rightSlot={liveIndicator ?? undefined}
      />

      <div style={S.container}>

        {/* ── Payment result banners ─────────────────────── */}
        {/* Only show while status is still payment_pending — once status card shows
            "Order confirmed!" or better, this banner would be redundant. */}
        {paymentState === "CONFIRMED" && serverPaymentConfirmed && showPaymentBanner && order?.status === "payment_pending" && (
          <div className="banner banner-success animate-fade-in">
            <span className="banner-icon">🎉</span>
            <div style={{ flex: 1 }}>
              <p className="banner-title">{t('track.pay_ok_title')}</p>
              <p className="banner-sub">{t('track.pay_ok_sub')}</p>
            </div>
            <button
              onClick={() => setShowPaymentBanner(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', color: 'var(--color-success)', padding: '0 0.25rem' }}
              aria-label={t('track.dismiss')}
            >✕</button>
          </div>
        )}
        {paymentState === "FAILED" && (
          <div className="banner banner-error animate-fade-in">
            <span className="banner-icon">❌</span>
            <div style={{ flex: 1 }}>
              <p className="banner-title">{t('track.pay_fail_title')}</p>
              <p className="banner-sub">{t('track.pay_fail_sub_before')}{' '}
                <a
                  href={s.business_whatsapp || 'https://wa.me/9609120011'}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'inherit', fontWeight: 700, textDecoration: 'underline' }}
                >
                  {t('track.pay_fail_wa')}
                </a>{' '}
                {t('track.pay_fail_sub_after')}
              </p>
              {payError && (
                <p style={{ margin: '0.5rem 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-error)' }}>{payError}</p>
              )}
              {needsPaymentRetry && (
                <button
                  type="button"
                  onClick={() => void handlePayAgain()}
                  disabled={isPaying}
                  style={{
                    marginTop: '0.75rem',
                    width: '100%',
                    padding: '0.75rem 1rem',
                    borderRadius: '0.625rem',
                    border: 'none',
                    background: 'var(--color-error)',
                    color: 'white',
                    fontWeight: 700,
                    fontSize: 'var(--text-sm)',
                    cursor: isPaying ? 'wait' : 'pointer',
                    fontFamily: 'inherit',
                    opacity: isPaying ? 0.8 : 1,
                  }}
                >
                  {isPaying ? t('track.pay_starting') : t('track.pay_again')}
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Loading ────────────────────────────────────── */}
        {loading && !error && (
          <div style={S.card} data-testid="order-status-loading">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="skeleton" style={{ height: 80, borderRadius: 12 }} />
              <div className="skeleton" style={{ height: 60, borderRadius: 12 }} />
              <div className="skeleton" style={{ height: 120, borderRadius: 12 }} />
            </div>
          </div>
        )}

        {/* ── Error ─────────────────────────────────────── */}
        {/* Mutually exclusive with order content — never show both. */}
        {!loading && error && (
          <div className="banner banner-error" data-testid="order-status-error">
            <span className="banner-icon">⚠️</span>
            <div style={{ flex: 1 }}>
              <p className="banner-title">{t('track.load_fail_title')}</p>
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
              {t('common.try_again')}
            </button>
          </div>
        )}

        {/* ── Order content ─────────────────────────────── */}
        {!loading && !error && order && statusInfo && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }} data-testid="order-status-content">

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

              {(needsPaymentRetry || (needsRemainingPayment && order.payment_status === 'partial')) && paymentState !== "FAILED" && (
                <div style={{ marginBottom: '1rem' }}>
                  <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', margin: '0 0 0.75rem' }}>
                    {order.payment_status === 'partial'
                      ? t('track.pay_remaining').replace('{amount}', remainingMvr.toFixed(2))
                      : t('track.pay_pending')}
                  </p>
                  {payError && (
                    <p style={{ margin: '0 0 0.5rem', fontSize: 'var(--text-xs)', color: 'var(--color-error)' }}>{payError}</p>
                  )}
                  <button
                    type="button"
                    onClick={() => void handlePayAgain()}
                    disabled={isPaying}
                    style={{
                      width: '100%',
                      padding: '0.875rem 1rem',
                      borderRadius: '0.75rem',
                      border: 'none',
                      background: 'var(--color-primary)',
                      color: 'white',
                      fontWeight: 700,
                      fontSize: 'var(--text-body)',
                      cursor: isPaying ? 'wait' : 'pointer',
                      fontFamily: 'inherit',
                      boxShadow: '0 4px 14px var(--color-primary-glow)',
                      opacity: isPaying ? 0.85 : 1,
                      marginBottom: order.payment_status === 'partial' ? '0.75rem' : 0,
                    }}
                  >
                    {isPaying ? t('track.pay_starting') : t('track.pay_mvr').replace('{amount}', remainingMvr.toFixed(2))}
                  </button>
                  {order.payment_status === 'partial' && (
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        max={remainingMvr}
                        value={partialAmountMvr}
                        onChange={(e) => setPartialAmountMvr(e.target.value)}
                        placeholder={t('track.pay_custom_ph')}
                        style={{
                          flex: 1,
                          padding: '0.65rem 0.75rem',
                          borderRadius: '0.5rem',
                          border: '1px solid var(--color-border)',
                          fontFamily: 'inherit',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => void handlePayPartial()}
                        disabled={isPaying || !partialAmountMvr}
                        style={{
                          padding: '0.65rem 0.85rem',
                          borderRadius: '0.5rem',
                          border: '1px solid var(--color-border)',
                          background: 'var(--color-surface)',
                          fontWeight: 600,
                          cursor: isPaying ? 'wait' : 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        {t('track.pay_part')}
                      </button>
                    </div>
                  )}
                </div>
              )}

              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', fontWeight: 600, margin: '0 0 0.75rem', letterSpacing: '0.04em', textTransform: 'uppercase' as const }}>
                {t('track.order_hash').replace('{n}', order.order_number)}
              </p>

              {/* Vertical timeline — hide for cancelled */}
              {!isCancelled && (
                <div className="order-timeline">
                  {STEPS.map((step, i) => {
                    const done   = i < activeStep;
                    const active = i === activeStep;
                    return (
                      <div key={step.key} className="order-timeline__row">
                        <div className="order-timeline__indicator">
                          <div className={[
                            'order-timeline__dot',
                            done   ? 'is-done'   : '',
                            active ? 'is-active' : '',
                          ].filter(Boolean).join(' ')}>
                            {done ? '✓' : i + 1}
                          </div>
                          {i < STEPS.length - 1 && (
                            <div className={`order-timeline__connector${done ? ' is-done' : ''}`} />
                          )}
                        </div>
                        <div className="order-timeline__content">
                          <span className={[
                            'order-timeline__step-name',
                            done   ? 'is-done'   : '',
                            active ? 'is-active' : '',
                          ].filter(Boolean).join(' ')}>
                            {t(step.labelKey)}
                          </span>
                          {active && (
                            <span className="order-timeline__step-sub">{statusInfo.sub}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {showPointsCelebration && (
              <div style={{
                ...S.card,
                background: 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)',
                borderColor: 'rgba(252, 211, 77, 0.45)',
                textAlign: 'center',
                padding: '1.375rem 1.25rem',
              }}>
                <p style={{ fontSize: '1.75rem', margin: '0 0 0.35rem' }}>🎉</p>
                <p style={{ fontSize: 'var(--text-body)', fontWeight: 800, color: '#92400E', margin: '0 0 0.25rem' }}>
                  {t('track.points_title').replace('{n}', pointsEarned.toLocaleString())}
                </p>
                <p style={{ fontSize: 'var(--text-sm)', color: '#B45309', margin: 0 }}>
                  {t('track.points_sub')}
                </p>
              </div>
            )}

            {/* Order details card */}
            <div style={S.card}>
              <p style={S.cardTitle}>{t('track.details')}</p>
              <DetailRow label={t('track.label_number')} value={`#${order.order_number}`} />
              <DetailRow label={t('track.label_type')} value={orderTypeLabel(order.type)} />
              <DetailRow label={t('track.label_status')} value={statusInfo.label} />
              {(order.estimated_wait_minutes ?? waitMinutes) != null && ['pending', 'paid', 'confirmed', 'preparing', 'in_progress', 'ready'].includes(order.status) && (
                <DetailRow label={t('track.label_wait')} value={t('track.wait_min').replace('{n}', String(order.estimated_wait_minutes ?? waitMinutes))} />
              )}
              {order.pickup_slot_at && (
                <DetailRow label={t('track.label_pickup')} value={new Date(order.pickup_slot_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} />
              )}
              {order.fulfil_date && (
                <DetailRow
                  label="Collect on"
                  value={new Date(`${order.fulfil_date}T12:00:00`).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                />
              )}
              {order.reservation && (
                <>
                  <DetailRow
                    label="Your table"
                    value={
                      order.reservation.table
                        ? `${order.reservation.table.name} · reserved for ${order.reservation.time_slot}`
                        : `Reserved for ${order.reservation.time_slot}`
                    }
                  />
                  <DetailRow label="Party size" value={`${order.reservation.party_size} people`} />
                </>
              )}
              {order.paid_at && (
                <DetailRow label={t('track.label_paid_at')} value={new Date(order.paid_at).toLocaleString()} />
              )}

              {/* Receipt breakdown */}
              {order.subtotal != null && (
                <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--color-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', paddingBottom: '0.375rem' }}>
                    <span>{t('track.subtotal')}</span>
                    <span>MVR {parseFloat(String(order.subtotal)).toFixed(2)}</span>
                  </div>
                  {(order.promo_discount_laar ?? 0) > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)', color: 'var(--color-success)', paddingBottom: '0.375rem' }}>
                      <span>🏷️ {t('track.promo')}</span>
                      <span>-MVR {((order.promo_discount_laar ?? 0) / 100).toFixed(2)}</span>
                    </div>
                  )}
                  {(order.loyalty_discount_laar ?? 0) > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)', color: 'var(--color-success)', paddingBottom: '0.375rem' }}>
                      <span>⭐ {t('track.loyalty')}</span>
                      <span>-MVR {((order.loyalty_discount_laar ?? 0) / 100).toFixed(2)}</span>
                    </div>
                  )}
                  {(order.gift_card_discount_laar ?? 0) > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)', color: 'var(--color-success)', paddingBottom: '0.375rem' }}>
                      <span>🎁 {t('track.gift_card')}</span>
                      <span>-MVR {((order.gift_card_discount_laar ?? 0) / 100).toFixed(2)}</span>
                    </div>
                  )}
                  {(order.referral_discount_laar ?? 0) > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)', color: 'var(--color-success)', paddingBottom: '0.375rem' }}>
                      <span>👥 {t('track.referral')}</span>
                      <span>-MVR {((order.referral_discount_laar ?? 0) / 100).toFixed(2)}</span>
                    </div>
                  )}
                  {(order.delivery_fee ?? 0) > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', paddingBottom: '0.375rem' }}>
                      <span>🛵 {t('track.delivery')}</span>
                      <span>+MVR {parseFloat(String(order.delivery_fee)).toFixed(2)}</span>
                    </div>
                  )}
                  {order.tax_amount != null && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', paddingBottom: '0.375rem' }}>
                      <span>{t('track.gst')}</span>
                      <span>MVR {parseFloat(String(order.tax_amount)).toFixed(2)}</span>
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 'var(--text-lg)', color: 'var(--color-text)', borderTop: '2px solid var(--color-border)', paddingTop: '0.75rem', marginTop: '0.75rem' }}>
                <span>{t('track.total')}</span>
                <span style={{ color: 'var(--color-primary)' }}>
                  MVR {parseFloat(String(order.total ?? 0)).toFixed(2)}
                </span>
              </div>
            </div>

            {/* Driver tracking — shown when driver is on the way */}
            {order.type === 'delivery' && ['picked_up', 'on_the_way'].includes(order.status) && (
              <DriverTracker orderId={order.id} authenticated={isAuthenticated} />
            )}

            {/* Delivery address */}
            {order.type === 'delivery' && order.delivery_address_line1 && (
              <div style={S.card}>
                <p style={S.cardTitle}>{t('track.delivery_address')}</p>
                <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-text)', margin: 0 }}>{order.delivery_address_line1}</p>
                {order.delivery_island && <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-text-muted)', margin: '0.25rem 0 0' }}>{order.delivery_island}</p>}
                {order.delivery_contact_name && (
                  <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-text)', margin: '0.5rem 0 0' }}>
                    {t('track.contact').replace('{name}', order.delivery_contact_name)}{order.delivery_contact_phone && ` · ${order.delivery_contact_phone}`}
                  </p>
                )}
              </div>
            )}

            {order.type === 'delivery' && order.proof_of_delivery_url && ['delivered', 'completed'].includes(order.status) && (
              <div style={S.card}>
                <p style={S.cardTitle}>{t('track.proof_title')}</p>
                <a
                  href={order.proof_of_delivery_url.startsWith('http')
                    ? order.proof_of_delivery_url
                    : `${API_ORIGIN}${order.proof_of_delivery_url.startsWith('/') ? '' : '/'}${order.proof_of_delivery_url}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'block',
                    borderRadius: '0.75rem',
                    overflow: 'hidden',
                    border: '1px solid var(--color-border)',
                    textDecoration: 'none',
                  }}
                >
                  <img
                    src={order.proof_of_delivery_url.startsWith('http')
                      ? order.proof_of_delivery_url
                      : `${API_ORIGIN}${order.proof_of_delivery_url.startsWith('/') ? '' : '/'}${order.proof_of_delivery_url}`}
                    alt={t('track.proof_view')}
                    style={{ width: '100%', display: 'block', maxHeight: 280, objectFit: 'cover' }}
                  />
                  <p style={{
                    margin: 0,
                    padding: '0.65rem 0.85rem',
                    fontSize: 'var(--text-sm)',
                    fontWeight: 700,
                    color: 'var(--color-primary)',
                    background: 'var(--color-surface-alt)',
                  }}>
                    {t('track.proof_view')}
                  </p>
                </a>
              </div>
            )}

            {/* Items ordered */}
            {order.items && order.items.length > 0 && (
              <div style={S.card}>
                <p style={S.cardTitle}>{t('track.items')}</p>
                {order.items.map((item: OrderDetailItem) => (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      paddingBottom: '0.625rem',
                      marginBottom: '0.625rem',
                      borderBottom: '1px solid var(--color-border)',
                      paddingLeft: item.parent_order_item_id ? 12 : 0,
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <span style={{
                        fontWeight: item.parent_order_item_id ? 500 : 600,
                        fontSize: item.parent_order_item_id ? 'var(--text-sm)' : 'var(--text-base)',
                        color: 'var(--color-text)',
                      }}>
                        {item.parent_order_item_id ? `↳ ${item.item_name}` : item.item_name}
                      </span>
                      {item.variant_name && (
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: '0.125rem' }}>
                          {item.variant_name}
                        </div>
                      )}
                      {item.packaging_option_name && (
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: '0.125rem' }}>
                          + {item.packaging_option_name}
                        </div>
                      )}
                      {item.modifiers && item.modifiers.length > 0 && (
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: '0.125rem' }}>
                          + {item.modifiers.map((m) => m.name ?? m.modifier_name ?? '').filter(Boolean).join(', ')}
                        </div>
                      )}
                    </div>
                    <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)', marginRight: '0.75rem' }}>×{item.quantity}</span>
                    <span style={{ fontWeight: 700, color: 'var(--color-primary)', fontSize: 'var(--text-base)' }}>
                      {item.parent_order_item_id && Number(item.total_price) === 0
                        ? '—'
                        : `MVR ${parseFloat(String(item.total_price ?? 0)).toFixed(2)}`}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Refresh note */}
            <p style={{ textAlign: 'center', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
              {liveConnected
                ? `🟢 ${t('track.refresh_live')}`
                : `🔄 ${t('track.refresh_poll')}`}
            </p>

            {/* Push notification opt-in banner */}
            {pushSupported && !pushSubscribed && !isCancelled && !isDone && isAuthenticated && (
              <div style={{
                ...S.card,
                display: 'flex', alignItems: 'center', gap: '0.875rem',
                background: 'linear-gradient(135deg, var(--color-primary-light) 0%, var(--color-surface) 100%)',
                borderColor: 'rgba(234, 88, 12, 0.2)',
              }}>
                <div style={{ fontSize: '1.75rem', flexShrink: 0 }}>🔔</div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 700, fontSize: 'var(--text-base)', margin: '0 0 0.125rem', color: 'var(--color-text)' }}>
                    {t('track.push_title')}
                  </p>
                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', margin: 0 }}>
                    {t('track.push_sub')}
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
                  {pushLoading ? '…' : t('track.push_enable')}
                </button>
              </div>
            )}
            {pushSupported && pushSubscribed && !isCancelled && !isDone && (
              <p style={{ textAlign: 'center', fontSize: 'var(--text-xs)', color: 'var(--color-success)' }}>
                🔔 {t('track.push_on')}
              </p>
            )}

            {/* Review form */}
            {isAuthenticated && ['completed', 'paid', 'delivered'].includes(order.status) && !reviewDone && (
              <ReviewForm orderId={order.id} onDone={() => setReviewDone(true)} />
            )}

            {/* Customer self-cancel (unstarted only) */}
            {canSelfCancel && (
              <div style={{ ...S.card, padding: '1.25rem 1.375rem' }}>
                {cancelSuccess ? (
                  <p style={{ margin: 0, fontWeight: 700, color: 'var(--color-success)', fontSize: 'var(--text-body)' }}>
                    {cancelSuccess}
                  </p>
                ) : !showCancelConfirm ? (
                  <>
                    <button
                      type="button"
                      onClick={() => { setShowCancelConfirm(true); setCancelError(''); }}
                      style={{
                        width: '100%', background: 'transparent', color: 'var(--color-danger, #b91c1c)',
                        border: '1px solid var(--color-border)', borderRadius: '0.625rem',
                        padding: '0.75rem 1rem', fontWeight: 700, fontSize: 'var(--text-sm)',
                        cursor: 'pointer', fontFamily: 'inherit', minHeight: 44,
                      }}
                    >
                      {t('track.cancel.button')}
                    </button>
                  </>
                ) : (
                  <div>
                    <p style={{ fontWeight: 700, fontSize: 'var(--text-body)', margin: '0 0 0.35rem', color: 'var(--color-text)' }}>
                      {t('track.cancel.confirm_title')}
                    </p>
                    <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', margin: '0 0 1rem' }}>
                      {t('track.cancel.confirm_body')}
                    </p>
                    {cancelError && (
                      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-danger, #b91c1c)', margin: '0 0 0.75rem' }}>
                        {cancelError}
                      </p>
                    )}
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        disabled={cancelling}
                        onClick={() => void handleConfirmCancel()}
                        style={{
                          flex: 1, minHeight: 44, background: 'var(--color-danger, #b91c1c)', color: 'white',
                          border: 'none', borderRadius: '0.625rem', padding: '0.65rem 1rem',
                          fontWeight: 700, fontSize: 'var(--text-sm)', cursor: cancelling ? 'not-allowed' : 'pointer',
                          fontFamily: 'inherit', opacity: cancelling ? 0.7 : 1,
                        }}
                      >
                        {cancelling ? t('track.cancel.working') : t('track.cancel.confirm_yes')}
                      </button>
                      <button
                        type="button"
                        disabled={cancelling}
                        onClick={() => { setShowCancelConfirm(false); setCancelError(''); }}
                        style={{
                          flex: 1, minHeight: 44, background: 'var(--color-surface-alt)', color: 'var(--color-text)',
                          border: '1px solid var(--color-border)', borderRadius: '0.625rem', padding: '0.65rem 1rem',
                          fontWeight: 700, fontSize: 'var(--text-sm)', cursor: 'pointer', fontFamily: 'inherit',
                        }}
                      >
                        {t('track.cancel.confirm_no')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {cancelSuccess && !canSelfCancel && (
              <p style={{ textAlign: 'center', fontWeight: 700, color: 'var(--color-success)', fontSize: 'var(--text-body)', margin: 0 }}>
                {cancelSuccess}
              </p>
            )}

            {/* Support block */}
            <div style={{ ...S.card, textAlign: 'center', padding: '1.375rem 1.5rem' }}>
              <p style={{ fontWeight: 700, color: 'var(--color-text)', fontSize: 'var(--text-body)', marginBottom: '0.25rem' }}>
                {t('track.help_title')}
              </p>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: '0.875rem' }}>
                {t('track.help_sub')}
              </p>
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                <a
                  href={phoneTel}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', padding: '0.55rem 1rem', background: 'var(--color-surface-alt)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', fontWeight: 700, fontSize: 'var(--text-sm)', textDecoration: 'none' }}
                  aria-label={t('track.call_aria')}
                >
                  📞 {t('track.call')}
                </a>
                <a
                  href={`${waLink}?text=Hi%2C+I+need+help+with+order+%23${order.order_number}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4375rem', padding: '0.55rem 1rem', background: '#25d366', color: 'white', borderRadius: 'var(--radius-lg)', fontWeight: 700, fontSize: 'var(--text-sm)', textDecoration: 'none' }}
                  aria-label={t('track.wa_aria')}
                >
                  <WhatsAppIcon /> {t('track.whatsapp')}
                </a>
                <a
                  href={viberLink}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4375rem', padding: '0.55rem 1rem', background: '#7360f2', color: 'white', borderRadius: 'var(--radius-lg)', fontWeight: 700, fontSize: 'var(--text-sm)', textDecoration: 'none' }}
                  aria-label={t('track.viber_aria')}
                >
                  <ViberIcon /> {t('track.viber')}
                </a>
                {s.business_maps_url && (
                  <a
                    href={s.business_maps_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', padding: '0.55rem 1rem', background: 'var(--color-surface-alt)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', fontWeight: 700, fontSize: 'var(--text-sm)', textDecoration: 'none' }}
                    aria-label={t('track.directions_aria')}
                  >
                    📍 {t('track.directions')}
                  </a>
                )}
              </div>
            </div>

            {/* CTA */}
            {isDone && (
              <button
                type="button"
                onClick={() => void handleShareOrder()}
                style={{
                  background: 'var(--color-surface)',
                  color: 'var(--color-primary)',
                  border: '1.5px solid var(--color-primary)',
                  borderRadius: '0.75rem', padding: '0.75rem 1.5rem',
                  fontSize: 'var(--text-sm)', fontWeight: 700,
                  cursor: 'pointer', width: '100%', fontFamily: 'inherit',
                  marginBottom: '0.625rem',
                }}
              >
                📤 {t('track.share')}
              </button>
            )}
            <button
              type="button"
              style={{
                background: isDone ? 'var(--color-primary)' : 'var(--color-surface)',
                color: isDone ? 'white' : 'var(--color-primary)',
                border: isDone ? 'none' : '1.5px solid var(--color-primary)',
                borderRadius: '0.75rem', padding: '0.875rem 1.5rem',
                fontSize: 'var(--text-body)', fontWeight: 700,
                cursor: isDone && reordering ? 'wait' : 'pointer', width: '100%', fontFamily: 'inherit',
                boxShadow: isDone ? '0 4px 14px var(--color-primary-glow)' : 'none',
                transition: 'all 0.15s',
                opacity: reordering ? 0.85 : 1,
              }}
              disabled={reordering}
              onClick={() => void handleOrderAgain()}
            >
              {reordering ? t('track.reordering') : isDone ? `🔁 ${t('track.reorder')}` : t('track.back_menu')}
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
                  {t('track.payment_received')}
                </p>
                <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', marginBottom: '1rem' }}>
                  {t('track.payment_received_sub')}
                </p>
              </>
            ) : (
              <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', marginBottom: '1rem' }}>
                {t('track.not_found')}
              </p>
            )}
            <button style={{ background: 'var(--color-primary)', color: 'white', border: 'none', borderRadius: '0.75rem', padding: '0.75rem 1.5rem', fontSize: 'var(--text-body)', fontWeight: 700, cursor: 'pointer', width: '100%', fontFamily: 'inherit' }} onClick={() => navigate('/')}>
              {t('track.back_menu_cta')}
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
            {t('track.footer_help')}{' '}
            <a href={`${waLink}?text=Hi%2C+I+need+help+with+my+order`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
              {t('track.footer_wa')}
            </a>
            {' · '}
            <a href={phoneTel} style={{ color: 'var(--color-primary)', fontWeight: 600 }}>{phone}</a>
          </p>
          <a href="/" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textDecoration: 'none' }}>
            {t('track.footer_site')}
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
    fontFamily: "var(--font-ui)",
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
