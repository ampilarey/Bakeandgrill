import { useEffect, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { getOrderDetail, type OrderDetail, type OrderDetailItem } from "../api";

type PaymentState = "CONFIRMED" | "FAILED" | "PENDING" | null;

function readToken(): string | null {
  return localStorage.getItem("online_token");
}


const STATUS_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  pending: { label: "Order Received", color: "#856404", icon: "⏳" },
  preparing: { label: "Being Prepared", color: "#0d6efd", icon: "👨‍🍳" },
  ready: { label: "Ready for Pickup / Delivery", color: "#28a745", icon: "✅" },
  out_for_delivery: { label: "Out for Delivery", color: "#1ba3b9", icon: "🛵" },
  completed: { label: "Completed", color: "#6c757d", icon: "🎉" },
  cancelled: { label: "Cancelled", color: "#dc3545", icon: "❌" },
  paid: { label: "Paid — Preparing", color: "#28a745", icon: "✅" },
};

export function OrderStatusPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const paymentState = searchParams.get("payment") as PaymentState;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const token = readToken();

  const loadOrder = async () => {
    if (!token || !orderId) return;
    try {
      const res = await getOrderDetail(token, parseInt(orderId, 10));
      setOrder(res.order);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // Clear cart only after BML confirms payment success
  useEffect(() => {
    if (paymentState === "CONFIRMED") {
      localStorage.removeItem("bakegrill_cart");
    }
  }, [paymentState]);

  // Initial load + polling every 10 seconds
  useEffect(() => {
    void loadOrder();
    const interval = setInterval(() => void loadOrder(), 10_000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, token]);

  const statusInfo = order
    ? STATUS_LABELS[order.status] ?? { label: order.status, color: "#495057", icon: "📋" }
    : null;

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <button style={styles.backBtn} onClick={() => navigate("/")}>
          ← Back to menu
        </button>
        <span style={styles.headerTitle}>Order Status</span>
      </header>

      <div style={styles.container}>
        {/* Payment result banner */}
        {paymentState === "CONFIRMED" && (
          <div style={styles.successBanner}>
            <span style={{ fontSize: 28 }}>🎉</span>
            <div>
              <p style={{ fontWeight: 700, fontSize: 18, margin: 0 }}>
                Payment Successful!
              </p>
              <p style={{ margin: 0, fontSize: 14, opacity: 0.9 }}>
                Your order has been confirmed.
              </p>
            </div>
          </div>
        )}

        {paymentState === "FAILED" && (
          <div style={styles.errorBanner}>
            <span style={{ fontSize: 28 }}>❌</span>
            <div>
              <p style={{ fontWeight: 700, fontSize: 18, margin: 0 }}>
                Payment Failed
              </p>
              <p style={{ margin: 0, fontSize: 14, opacity: 0.9 }}>
                Please try paying again or contact us.
              </p>
            </div>
          </div>
        )}

        {loading && (
          <div style={styles.card}>
            <p style={{ color: "#6c757d", textAlign: "center" }}>Loading order…</p>
          </div>
        )}

        {error && (
          <div style={styles.card}>
            <p style={{ color: "#dc3545" }}>{error}</p>
          </div>
        )}

        {!loading && order && statusInfo && (
          <>
            {/* Status card */}
            <div style={styles.card}>
              <div style={styles.statusRow}>
                <span style={{ fontSize: 48 }}>{statusInfo.icon}</span>
                <div>
                  <p
                    style={{
                      fontSize: 22,
                      fontWeight: 800,
                      color: statusInfo.color,
                      margin: 0,
                    }}
                  >
                    {statusInfo.label}
                  </p>
                  <p style={{ color: "#6c757d", fontSize: 14, margin: "4px 0 0" }}>
                    Order #{order.order_number}
                  </p>
                </div>
              </div>

              {/* Progress bar */}
              <div style={styles.progressBar}>
                {["pending", "preparing", "ready", "completed"].map((s) => (
                  <div
                    key={s}
                    style={{
                      ...styles.progressStep,
                      background: isStatusAtLeast(order.status, s)
                        ? "#1ba3b9"
                        : "#dee2e6",
                    }}
                  />
                ))}
              </div>
              <div style={styles.progressLabels}>
                <span>Received</span>
                <span>Preparing</span>
                <span>Ready</span>
                <span>Done</span>
              </div>
            </div>

            {/* Order details */}
            <div style={styles.card}>
              <h2 style={styles.sectionTitle}>Order Details</h2>
              <DetailRow label="Order number" value={order.order_number} />
              <DetailRow label="Type" value={orderTypeLabel(order.type)} />
              <DetailRow label="Status" value={statusInfo.label} />
              {order.paid_at && (
                <DetailRow
                  label="Paid at"
                  value={new Date(order.paid_at).toLocaleString()}
                />
              )}
              <div style={styles.totalRow}>
                <span>Total</span>
                <span>
                  MVR{" "}
                  {typeof order.total === "number"
                    ? order.total.toFixed(2)
                    : order.total}
                </span>
              </div>
            </div>

            {/* Delivery address (if delivery) */}
            {order.type === "delivery" && order.delivery_address_line1 && (
              <div style={styles.card}>
                <h2 style={styles.sectionTitle}>Delivery Address</h2>
                <p style={{ margin: 0, fontSize: 14, color: "#212529" }}>
                  {order.delivery_address_line1}
                </p>
                {order.delivery_island && (
                  <p style={{ margin: "4px 0 0", fontSize: 14, color: "#6c757d" }}>
                    {order.delivery_island}
                  </p>
                )}
                {order.delivery_contact_name && (
                  <p style={{ margin: "8px 0 0", fontSize: 14, color: "#495057" }}>
                    Contact: {order.delivery_contact_name}
                    {order.delivery_contact_phone &&
                      ` · ${order.delivery_contact_phone}`}
                  </p>
                )}
              </div>
            )}

            {/* Items list */}
            {order.items && order.items.length > 0 && (
              <div style={styles.card}>
                <h2 style={{ ...styles.sectionTitle, marginBottom: 16 }}>Items Ordered</h2>
                {order.items.map((item: OrderDetailItem) => (
                  <div key={item.id} style={styles.itemRow}>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{item.item_name}</span>
                      {item.modifiers && item.modifiers.length > 0 && (
                        <div style={{ fontSize: 12, color: "#6c757d", marginTop: 2 }}>
                          + {item.modifiers.map((m) => m.name).join(", ")}
                        </div>
                      )}
                    </div>
                    <span style={{ color: "#6c757d", fontSize: 14, marginRight: 12 }}>×{item.quantity}</span>
                    <span style={{ fontWeight: 600, color: "#1ba3b9", fontSize: 14 }}>
                      MVR {item.total_price.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Auto-refresh note */}
            <p style={styles.refreshNote}>
              🔄 This page refreshes automatically every 10 seconds.
            </p>

            {/* CTA */}
            <button
              style={styles.primaryBtn}
              onClick={() => navigate("/")}
            >
              Order more
            </button>
          </>
        )}

        {!loading && !order && !error && (
          <div style={styles.card}>
            <p style={{ color: "#6c757d", textAlign: "center" }}>
              Order not found. Please sign in to view your order.
            </p>
            <button
              style={{ ...styles.primaryBtn, marginTop: 12 }}
              onClick={() => navigate("/")}
            >
              Back to menu
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_ORDER = ["pending", "paid", "preparing", "ready", "out_for_delivery", "completed"];

function isStatusAtLeast(current: string, target: string): boolean {
  const ci = STATUS_ORDER.indexOf(current);
  const ti = STATUS_ORDER.indexOf(target);
  if (ci === -1 || ti === -1) return false;
  return ci >= ti;
}

function orderTypeLabel(type: string): string {
  const map: Record<string, string> = {
    dine_in: "Dine In",
    takeaway: "Takeaway",
    online_pickup: "Takeaway (Online)",
    delivery: "Delivery",
    preorder: "Pre-order",
  };
  return map[type] ?? type;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.detailRow}>
      <span style={{ color: "#6c757d" }}>{label}</span>
      <span style={{ fontWeight: 500, color: "#212529" }}>{value}</span>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f8f9fa",
    fontFamily: "'Inter', sans-serif",
  } as React.CSSProperties,

  header: {
    position: "sticky" as const,
    top: 0,
    background: "#fff",
    borderBottom: "1px solid #e9ecef",
    padding: "12px 24px",
    display: "flex",
    alignItems: "center",
    gap: 16,
    zIndex: 100,
    boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
  } as React.CSSProperties,

  backBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "#1ba3b9",
    fontSize: 15,
    fontWeight: 600,
    padding: "4px 8px",
  } as React.CSSProperties,

  headerTitle: {
    fontWeight: 700,
    fontSize: 18,
    color: "#212529",
    flex: 1,
  } as React.CSSProperties,

  container: {
    maxWidth: 640,
    margin: "0 auto",
    padding: "24px 16px",
    display: "flex",
    flexDirection: "column" as const,
    gap: 16,
  } as React.CSSProperties,

  successBanner: {
    background: "linear-gradient(135deg, #28a745, #20c997)",
    color: "#fff",
    borderRadius: 16,
    padding: "20px 24px",
    display: "flex",
    alignItems: "center",
    gap: 16,
  } as React.CSSProperties,

  errorBanner: {
    background: "linear-gradient(135deg, #dc3545, #e83e8c)",
    color: "#fff",
    borderRadius: 16,
    padding: "20px 24px",
    display: "flex",
    alignItems: "center",
    gap: 16,
  } as React.CSSProperties,

  card: {
    background: "#fff",
    borderRadius: 16,
    padding: "20px 24px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
    border: "1px solid #e9ecef",
  } as React.CSSProperties,

  statusRow: {
    display: "flex",
    alignItems: "center",
    gap: 20,
    marginBottom: 24,
  } as React.CSSProperties,

  progressBar: {
    display: "flex",
    gap: 4,
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 6,
  } as React.CSSProperties,

  progressStep: {
    flex: 1,
    borderRadius: 4,
    transition: "background 0.3s",
  } as React.CSSProperties,

  progressLabels: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 11,
    color: "#6c757d",
  } as React.CSSProperties,

  sectionTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: "#212529",
    paddingBottom: 12,
    borderBottom: "1px solid #f0f0f0",
    marginBottom: 16,
    margin: 0,
  } as React.CSSProperties,

  detailRow: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 14,
    marginTop: 10,
  } as React.CSSProperties,

  totalRow: {
    display: "flex",
    justifyContent: "space-between",
    fontWeight: 800,
    fontSize: 18,
    color: "#212529",
    borderTop: "2px solid #e9ecef",
    paddingTop: 12,
    marginTop: 12,
  } as React.CSSProperties,

  primaryBtn: {
    background: "linear-gradient(135deg, #1ba3b9, #0d7a8a)",
    color: "#fff",
    border: "none",
    borderRadius: 12,
    padding: "14px 24px",
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
    width: "100%",
  } as React.CSSProperties,

  refreshNote: {
    textAlign: "center" as const,
    fontSize: 12,
    color: "#6c757d",
  } as React.CSSProperties,

  itemRow: {
    display: "flex",
    alignItems: "flex-start",
    paddingBottom: 10,
    marginBottom: 10,
    borderBottom: "1px solid #f0f0f0",
  } as React.CSSProperties,
} as const;
