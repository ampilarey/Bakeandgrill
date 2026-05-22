import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { useSse } from '../hooks/useSse';
import {
  fetchOrders, fetchOrder, holdOrder, resumeOrder, sendOrderBill,
  kdsStart, kdsBump, addOrderPayments,
  getReceiptLinkForOrder, sendReceiptForOrder,
  createInvoiceFromOrder, sendInvoiceToCustomer,
  fetchDeliveryDrivers, assignDeliveryDriver,
  fetchPosStaffOptions, fetchDevices,
  type Order, type DeliveryDriver,
} from '../api';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  Badge, Btn, Card, EmptyState, ErrorMsg,
  PageHeader, Select, Spinner, statColor,
} from '../components/Layout';
import { downloadCSV } from '../utils/csvExport';

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'payment_pending', label: 'Awaiting Payment' },
  { value: 'pending', label: 'Pending' },
  { value: 'paid', label: 'Paid' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'preparing', label: 'Preparing' },
  { value: 'held', label: 'On Hold' },
  { value: 'ready', label: 'Ready' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const TYPE_OPTIONS = [
  { value: '', label: 'All Types' },
  { value: 'dine_in', label: 'Dine In' },
  { value: 'takeaway', label: 'Takeaway' },
  { value: 'online_pickup', label: 'Online Pickup' },
  { value: 'delivery', label: 'Delivery' },
];

function typeLabel(t: string) {
  const m: Record<string, string> = {
    dine_in: 'Dine In', takeaway: 'Takeaway',
    online_pickup: 'Online Pickup', delivery: 'Delivery', preorder: 'Pre-order',
  };
  return m[t] ?? t;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function OrderDrawer({ orderId, onClose, onOrderUpdated }: {
  orderId: number;
  onClose: () => void;
  onOrderUpdated: () => void;
}) {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState('');
  const [actionErr, setActionErr] = useState('');
  const [toast, setToast] = useState('');
  const [showPayment, setShowPayment] = useState(false);
  const [payRows, setPayRows] = useState([{ method: 'cash', amount: '' }]);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [copyLinkBusy, setCopyLinkBusy] = useState(false);
  const [drivers, setDrivers] = useState<DeliveryDriver[]>([]);
  const [driverAssigning, setDriverAssigning] = useState(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const handleAssignDriver = async (driverId: number) => {
    if (!order) return;
    setDriverAssigning(true);
    try {
      const { order: updated } = await assignDeliveryDriver(order.id, driverId);
      setOrder(updated);
      onOrderUpdated();
      showToast(`Driver assigned.`);
    } catch (e) {
      setActionErr((e as Error).message);
    } finally {
      setDriverAssigning(false);
    }
  };

  const phone = order?.customer?.phone ?? order?.customer_phone ?? '';

  const handleCopyReceiptLink = async () => {
    if (!order) return;
    setCopyLinkBusy(true); setActionErr('');
    try {
      const { link } = await getReceiptLinkForOrder(order.id);
      await navigator.clipboard.writeText(link);
      showToast('Link copied to clipboard.');
    } catch (e) {
      setActionErr((e as Error).message);
    } finally {
      setCopyLinkBusy(false);
    }
  };

  const handleSendInvoiceSms = async () => {
    if (!order || !phone) { setActionErr('Customer phone is required.'); return; }
    setReceiptBusy(true); setActionErr('');
    try {
      // Create (or retrieve) the invoice for this order, then SMS it to the customer.
      const { invoice } = await createInvoiceFromOrder(order.id);
      await sendInvoiceToCustomer(invoice.id, phone);
      showToast(`Invoice sent to ${phone}.`);
      reload();
    } catch (e) {
      setActionErr((e as Error).message);
    } finally {
      setReceiptBusy(false);
    }
  };

  const handleSendReceiptSms = async () => {
    if (!order || !phone) { setActionErr('Customer phone is required.'); return; }
    setReceiptBusy(true); setActionErr('');
    try {
      await sendReceiptForOrder(order.id, { recipient: phone, channel: 'sms' });
      showToast(`Receipt link sent to ${phone}.`);
      reload();
    } catch (e) {
      setActionErr((e as Error).message);
    } finally {
      setReceiptBusy(false);
    }
  };

  const reload = () => {
    const controller = new AbortController();
    fetchOrder(orderId, controller.signal)
      .then((r) => { setOrder(r.order); setLoading(false); setActionErr(''); })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setLoading(false);
          setActionErr((err as Error).message || 'Failed to load order.');
        }
      });
    return () => controller.abort();
  };

  useEffect(() => {
    fetchDeliveryDrivers().then((r) => setDrivers(r.drivers ?? [])).catch(() => {/* non-critical */});
  }, []);

  useEffect(() => {
    setLoading(true);
    return reload();
  }, [orderId]);

  const doAction = async (key: string, fn: () => Promise<unknown>, label: string) => {
    setActing(key); setActionErr('');
    try {
      await fn();
      showToast(`${label} done.`);
      reload();
      onOrderUpdated();
    } catch (e) {
      // Surface failures as a toast in addition to the inline error
      // banner — the inline banner sits below the buttons and is easy
      // to miss when the drawer is scrolled, so cashiers were
      // re-clicking actions thinking nothing happened.
      const msg = (e as Error).message;
      setActionErr(msg);
      showToast(`${label} failed: ${msg}`);
    }
    finally { setActing(''); }
  };

  const handleAddPayment = async () => {
    if (!order) return;
    const payments = payRows
      .filter((r) => r.amount.trim())
      .map((r) => ({ method: r.method, amount: parseFloat(r.amount) }))
      .filter((r) => !isNaN(r.amount) && r.amount > 0);
    if (payments.length === 0) { setActionErr('Enter at least one payment amount.'); return; }
    setPaymentSaving(true); setActionErr('');
    try {
      await addOrderPayments(order.id, { payments });
      showToast('Payment recorded.');
      setShowPayment(false);
      setPayRows([{ method: 'cash', amount: '' }]);
      reload();
      onOrderUpdated();
    } catch (e) {
      const msg = (e as Error).message;
      setActionErr(msg);
      showToast(`Payment failed: ${msg}`);
    }
    finally { setPaymentSaving(false); }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      background: 'rgba(0,0,0,0.4)', display: 'flex',
      alignItems: 'stretch', justifyContent: 'flex-end',
    }} onClick={onClose}>
      <div className="order-detail-drawer" style={{
        width: 'min(420px, 100vw)', background: '#fff', height: '100%',
        overflowY: 'auto', padding: 24, boxShadow: '-4px 0 20px rgba(0,0,0,0.1)',
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontWeight: 800, fontSize: 18, color: '#1C1408' }}>
            {order ? `#${order.order_number}` : 'Order Details'}
          </h2>
          <button onClick={onClose} aria-label="Close order details" style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#9C8E7E' }}>✕</button>
        </div>

        {toast && (
          <div style={{ background: '#DCFCE7', color: '#166534', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{toast}</div>
        )}
        {actionErr && (
          <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{actionErr}</div>
        )}

        {loading && <Spinner />}
        {!loading && !order && <EmptyState message="Order not found." />}
        {order && (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              <Badge label={order.status} color={statColor(order.status)} />
              <Badge label={typeLabel(order.type)} color="blue" />
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
              {['pending', 'paid'].includes(order.status) && (
                <Btn small onClick={() => doAction('start', () => kdsStart(order.id), 'Start preparing')}>
                  {acting === 'start' ? '…' : '▶ Start Preparing'}
                </Btn>
              )}
              {['preparing', 'in_progress'].includes(order.status) && (
                <Btn small onClick={() => doAction('bump', () => kdsBump(order.id), 'Mark ready')}>
                  {acting === 'bump' ? '…' : '✓ Mark Ready'}
                </Btn>
              )}
              {order.status === 'held' && (
                <Btn small onClick={() => doAction('resume', () => resumeOrder(order.id), 'Order resumed')}>
                  {acting === 'resume' ? '…' : '▶ Resume Order'}
                </Btn>
              )}
              {['pending', 'paid', 'preparing', 'in_progress', 'ready'].includes(order.status) && (
                <Btn small variant="secondary" onClick={() => doAction('hold', () => holdOrder(order.id), 'Order held')}>
                  {acting === 'hold' ? '…' : '⏸ Hold'}
                </Btn>
              )}
              {order.type === 'dine_in' && ['ready', 'preparing', 'in_progress'].includes(order.status) && (
                <Btn small variant="secondary" onClick={() => doAction('bill', () => sendOrderBill(order.id), 'Bill sent')}>
                  {acting === 'bill' ? '…' : '🧾 Send Bill'}
                </Btn>
              )}
              {!['paid', 'completed', 'cancelled'].includes(order.status) && (
                <Btn small variant="secondary" onClick={() => { setShowPayment(true); setPayRows([{ method: 'cash', amount: String(parseFloat(String(order.total ?? 0)).toFixed(2)) }]); }}>
                  💵 Record Payment
                </Btn>
              )}
            </div>

            {phone && order.status !== 'cancelled' && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                <Btn
                  small
                  variant="secondary"
                  disabled={copyLinkBusy}
                  onClick={() => void handleCopyReceiptLink()}
                >
                  {copyLinkBusy ? '…' : 'Copy invoice / receipt link'}
                </Btn>
                {['paid', 'completed', 'refunded', 'delivered'].includes(order.status) ? (
                  <Btn small disabled={receiptBusy} onClick={() => void handleSendReceiptSms()}>
                    {receiptBusy ? '…' : '📱 Send receipt SMS'}
                  </Btn>
                ) : (
                  <Btn small disabled={receiptBusy} onClick={() => void handleSendInvoiceSms()}>
                    {receiptBusy ? '…' : '📱 Send invoice SMS'}
                  </Btn>
                )}
              </div>
            )}

            <div style={{ background: '#F8F6F3', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
              <Row label="Order #" value={order.order_number} />
              <Row label="Type" value={typeLabel(order.type)} />
              <Row label="Time" value={new Date(order.created_at).toLocaleString('en-MV', { timeZone: 'Indian/Maldives' })} />
              {order.table_number && <Row label="Table" value={order.table_number} />}
              {(order.customer?.name ?? order.customer_name) && (
                <Row label="Customer" value={(order.customer?.name ?? order.customer_name)!} />
              )}
              {(order.customer?.phone ?? order.customer_phone) && (
                <Row label="Phone" value={(order.customer?.phone ?? order.customer_phone)!} />
              )}
              {order.paid_at && <Row label="Paid at" value={new Date(order.paid_at).toLocaleString()} />}
              {order.user?.name && <Row label="Cashier" value={order.user.name} />}
              {order.device?.name && <Row label="Station" value={order.device.name} />}
              {order.shift?.id && <Row label="Shift" value={`#${order.shift.id}`} />}
            </div>

            {order.type === 'delivery' && order.delivery_address_line1 && (
              <div style={{ background: '#eff6ff', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
                <p style={{ fontWeight: 700, fontSize: 13, color: '#1e40af', marginBottom: 8 }}>Delivery Address</p>
                <p style={{ fontSize: 14 }}>{order.delivery_address_line1}</p>
                {order.delivery_island && <p style={{ fontSize: 13, color: '#6B5D4F' }}>{order.delivery_island}</p>}
                {order.delivery_contact_name && (
                  <p style={{ fontSize: 13, color: '#6B5D4F', marginTop: 4 }}>
                    {order.delivery_contact_name} · {order.delivery_contact_phone}
                  </p>
                )}
              </div>
            )}

            {order.type === 'delivery' && (
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontWeight: 700, fontSize: 13, color: '#6B5D4F', marginBottom: 8 }}>
                  🚗 Driver
                  {order.driver && <span style={{ marginLeft: 8, fontWeight: 400, fontSize: 12, color: '#16a34a' }}>✓ {order.driver.name}</span>}
                </p>
                {drivers.length > 0 ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <select
                      defaultValue={order.driver?.id ?? ''}
                      onChange={(e) => { if (e.target.value) void handleAssignDriver(Number(e.target.value)); }}
                      disabled={driverAssigning}
                      style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: '1.5px solid #E8E0D8', fontSize: 13, fontFamily: 'inherit', background: '#FAF7F3', color: '#1C1408', cursor: 'pointer' }}
                    >
                      <option value="">— select driver —</option>
                      {drivers.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}{d.phone ? ` (${d.phone})` : ''}</option>
                      ))}
                    </select>
                    {driverAssigning && <span style={{ fontSize: 12, color: '#9C8E7E' }}>Assigning…</span>}
                  </div>
                ) : (
                  <p style={{ fontSize: 13, color: '#9C8E7E' }}>No drivers registered.</p>
                )}
              </div>
            )}

            {order.items && order.items.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontWeight: 700, fontSize: 13, color: '#6B5D4F', marginBottom: 8 }}>Items</p>
                {order.items.map((item) => (
                  <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, paddingBottom: 6, marginBottom: 6, borderBottom: '1px solid #F0EBE5' }}>
                    <span>{item.quantity}× {item.item_name}{item.variant_name ? ` – ${item.variant_name}` : ''}</span>
                    <span style={{ color: '#D4813A', fontWeight: 600 }}>MVR {parseFloat(String(item.total_price ?? 0)).toFixed(2)}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 16, paddingTop: 8 }}>
                  <span>Total</span>
                  <span>MVR {parseFloat(String(order.total ?? 0)).toFixed(2)}</span>
                </div>
              </div>
            )}

            {showPayment && (
              <div style={{ background: '#F9F5F0', border: '1px solid #E8E0D8', borderRadius: 12, padding: 16, marginBottom: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#1C1408', marginBottom: 12 }}>Record Payment</div>
                {payRows.map((row, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                    <select
                      value={row.method}
                      onChange={(e) => setPayRows((rs) => rs.map((r, j) => j === i ? { ...r, method: e.target.value } : r))}
                      style={{ height: 34, padding: '0 8px', border: '1.5px solid #E8E0D8', borderRadius: 8, fontSize: 12, fontFamily: 'inherit', background: '#fff', flex: '0 0 110px' }}
                    >
                      {['cash', 'card', 'bml_pay', 'bank_transfer', 'other'].map((m) => (
                        <option key={m} value={m}>{m.replace('_', ' ').toUpperCase()}</option>
                      ))}
                    </select>
                    <input
                      type="number" min="0" step="0.01"
                      placeholder="0.00"
                      value={row.amount}
                      onChange={(e) => setPayRows((rs) => rs.map((r, j) => j === i ? { ...r, amount: e.target.value } : r))}
                      style={{ flex: 1, height: 34, padding: '0 8px', border: '1.5px solid #E8E0D8', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }}
                    />
                    {payRows.length > 1 && (
                      <button onClick={() => setPayRows((rs) => rs.filter((_, j) => j !== i))}
                        style={{ background: 'none', border: 'none', fontSize: 16, color: '#9C8E7E', cursor: 'pointer', padding: '0 4px' }}>✕</button>
                    )}
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <button
                    onClick={() => setPayRows((rs) => [...rs, { method: 'cash', amount: '' }])}
                    style={{ fontSize: 12, color: '#D4813A', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: 0 }}
                  >
                    + Split payment
                  </button>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                    <button onClick={() => { setShowPayment(false); setPayRows([{ method: 'cash', amount: '' }]); }}
                      style={{ fontSize: 12, color: '#9C8E7E', background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
                    <button
                      onClick={() => void handleAddPayment()}
                      disabled={paymentSaving}
                      style={{ fontSize: 12, fontWeight: 700, color: '#fff', background: '#D4813A', border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', opacity: paymentSaving ? 0.6 : 1 }}
                    >
                      {paymentSaving ? '…' : 'Confirm'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {order.notes && (
              <div style={{ background: '#fefce8', borderRadius: 10, padding: '12px 14px', fontSize: 13, color: '#713f12' }}>
                📝 {order.notes}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
      <span style={{ color: '#9C8E7E' }}>{label}</span>
      <span style={{ fontWeight: 600, color: '#1C1408' }}>{value}</span>
    </div>
  );
}

type SortKey = 'order_number' | 'total' | 'created_at';
type SortDir = 'asc' | 'desc';

export function OrdersPage() {
    usePageTitle('Orders');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  // Manager's "show me cooking-but-unpaid only" view — useful at end
  // of service for chasing phone-call pickup customers who collected
  // their food without paying. Persisted via URL query param? Out of
  // scope for v1 — defaults to off, manager flips it on as needed.
  const [unpaidOnly, setUnpaidOnly] = useState(false);
  const [cashierFilter, setCashierFilter] = useState('');
  const [deviceFilter, setDeviceFilter] = useState('');
  const [staffOptions, setStaffOptions] = useState<{ id: number; name: string }[]>([]);
  const [deviceOptions, setDeviceOptions] = useState<{ id: number; name: string }[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [quickActing, setQuickActing] = useState<number | null>(null);
  const [smsBusy, setSmsBusy] = useState<number | null>(null);
  const [rowToast, setRowToast] = useState<{ id: number; msg: string } | null>(null);

  const showRowToast = (id: number, msg: string) => {
    setRowToast({ id, msg });
    setTimeout(() => setRowToast(null), 2500);
  };

  const quickAdvance = async (o: Order) => {
    setQuickActing(o.id);
    try {
      if (['pending', 'paid'].includes(o.status)) await kdsStart(o.id);
      else if (['in_progress', 'preparing', 'ready'].includes(o.status)) await kdsBump(o.id);
      else if (o.status === 'held') await resumeOrder(o.id);
      else return;
      void load();
    } catch { /* non-blocking */ } finally { setQuickActing(null); }
  };

  const quickLabel = (status: string): string | null => {
    if (['pending', 'paid'].includes(status))                  return '▶ Cook';
    if (['in_progress', 'preparing'].includes(status))         return '✓ Ready';
    if (status === 'ready')                                    return '✓ Done';
    if (status === 'held')                                     return '▶ Resume';
    return null;
  };

  const sendSmsReceipt = async (o: Order) => {
    const phone = o.customer?.phone ?? o.customer_phone ?? '';
    if (!phone) { showRowToast(o.id, 'No phone number'); return; }
    setSmsBusy(o.id);
    try {
      await sendReceiptForOrder(o.id, { recipient: phone, channel: 'sms' });
      showRowToast(o.id, '✓ SMS sent');
    } catch { showRowToast(o.id, 'SMS failed'); } finally { setSmsBusy(null); }
  };

  useEffect(() => {
    fetchPosStaffOptions().then((r) => setStaffOptions(r.staff ?? [])).catch(() => undefined);
    fetchDevices().then((r) => setDeviceOptions((r.data ?? []).map((d) => ({ id: d.id, name: d.name })))).catch(() => undefined);
  }, []);

  // Debounce search input 400 ms
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  const sortedOrders = [...orders].sort((a, b) => {
    let cmp = 0;
    if (sortKey === 'order_number') cmp = a.order_number.localeCompare(b.order_number);
    else if (sortKey === 'total') cmp = Number(a.total ?? 0) - Number(b.total ?? 0);
    else cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const SortArrow = ({ col }: { col: SortKey }) => (
    <span style={{ marginLeft: 4, opacity: sortKey === col ? 1 : 0.25, fontSize: 10 }}>
      {sortKey === col ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
    </span>
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchOrders({
        status: statusFilter || undefined,
        type: typeFilter || undefined,
        page,
        per_page: perPage,
        search: debouncedSearch || undefined,
        unpaid_only: unpaidOnly || undefined,
        user_id: cashierFilter ? Number(cashierFilter) : undefined,
        device_id: deviceFilter ? Number(deviceFilter) : undefined,
      });
      setOrders(res.data ?? []);
      setTotalPages(res.meta?.last_page ?? 1);
    } catch (e) {
      // Don't silently leave an empty list — the inline error banner
      // tells the user what went wrong (network, 401, 500) instead of
      // a deceptive "No orders match your filters." empty state.
      setError(`Failed to load orders: ${(e as Error).message}`);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter, page, perPage, debouncedSearch, unpaidOnly, cashierFilter, deviceFilter]);

  useEffect(() => { void load(); }, [load]);

  // SSE: reload the current page whenever an order event arrives
  const handleSseEvent = useCallback(() => { void load(); }, [load]);
  const { connected: sseConnected } = useSse('/stream/orders', { onEvent: handleSseEvent });

  // Fallback polling — activates only when SSE drops (network degraded)
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);
  useEffect(() => {
    if (sseConnected) return;
    const t = setInterval(() => void loadRef.current(), 30_000);
    return () => clearInterval(t);
  }, [sseConnected]);

  return (
    <>
      <PageHeader
        title="Orders"
        subtitle="All customer and POS orders"
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="secondary" onClick={() => downloadCSV('orders', orders.map((o) => ({ 'Order #': o.order_number, Type: o.type, Status: o.status, Customer: o.customer?.name ?? '', Total: `MVR ${Number(o.total ?? 0).toFixed(2)}`, Time: o.created_at })))}>Export CSV</Btn>
            <Btn onClick={load} variant="secondary">↻ Refresh</Btn>
          </div>
        }
      />

      {error && <ErrorMsg message={error} />}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search order # or customer…"
          style={{ flex: '1 1 200px', minWidth: 180, maxWidth: 280, padding: '7px 12px', border: '1.5px solid #E8E0D8', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', background: '#fff', color: '#1C1408', outline: 'none' }}
        />
        <Select value={statusFilter} onChange={(v) => { setStatusFilter(v); setPage(1); }} options={STATUS_OPTIONS} style={{ width: 160 }} />
        <Select value={typeFilter} onChange={(v) => { setTypeFilter(v); setPage(1); }} options={TYPE_OPTIONS} style={{ width: 160 }} />
        <select
          value={cashierFilter}
          onChange={(e) => { setCashierFilter(e.target.value); setPage(1); }}
          style={{ padding: '7px 12px', border: '1.5px solid #E8E0D8', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', background: '#fff', minWidth: 140 }}
        >
          <option value="">All cashiers</option>
          {staffOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select
          value={deviceFilter}
          onChange={(e) => { setDeviceFilter(e.target.value); setPage(1); }}
          style={{ padding: '7px 12px', border: '1.5px solid #E8E0D8', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', background: '#fff', minWidth: 140 }}
        >
          <option value="">All stations</option>
          {deviceOptions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        {/* Toggle-chip for the phone-call pickup chase view. Styled
            as a button so it visually reads as a state, not a filter
            dropdown — chip flips red when active so a manager doing
            end-of-day reconciliation can't miss that the list is
            filtered. */}
        <button
          type="button"
          onClick={() => { setUnpaidOnly((v) => !v); setPage(1); }}
          aria-pressed={unpaidOnly}
          title="Show only cooking-but-unpaid orders"
          style={{
            padding: '7px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700,
            border: unpaidOnly ? '1.5px solid #B91C1C' : '1.5px solid #E8E0D8',
            background: unpaidOnly ? '#FEF2F2' : '#fff',
            color: unpaidOnly ? '#B91C1C' : '#6B5D4F',
            cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >
          {unpaidOnly ? '● ' : '○ '}Unpaid only
        </button>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#6B5D4F' }}>
          Per page:
          <select
            value={perPage}
            onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
            style={{ padding: '4px 8px', borderRadius: 8, border: '1px solid #E8E0D8', fontSize: 13, fontFamily: 'inherit' }}
          >
            {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>

      {loading && orders.length === 0 ? (
        <Spinner />
      ) : orders.length === 0 ? (
        <Card><EmptyState message="No orders found." /></Card>
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-scroll" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#F8F6F3', borderBottom: '1px solid #E8E0D8' }}>
                <th
                  onClick={() => handleSort('order_number')}
                  style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: '#9C8E7E', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', cursor: 'pointer', userSelect: 'none', position: 'sticky', top: 0, background: '#F8F6F3' }}
                >Order # <SortArrow col="order_number" /></th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: '#9C8E7E', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', position: 'sticky', top: 0, background: '#F8F6F3' }}>Type</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: '#9C8E7E', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', position: 'sticky', top: 0, background: '#F8F6F3' }}>Status</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: '#9C8E7E', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', position: 'sticky', top: 0, background: '#F8F6F3' }}>Customer</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: '#9C8E7E', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', position: 'sticky', top: 0, background: '#F8F6F3' }}>Cashier</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: '#9C8E7E', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', position: 'sticky', top: 0, background: '#F8F6F3' }}>Station</th>
                <th
                  onClick={() => handleSort('total')}
                  style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: '#9C8E7E', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', cursor: 'pointer', userSelect: 'none', position: 'sticky', top: 0, background: '#F8F6F3' }}
                >Total <SortArrow col="total" /></th>
                <th
                  onClick={() => handleSort('created_at')}
                  style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: '#9C8E7E', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', cursor: 'pointer', userSelect: 'none', position: 'sticky', top: 0, background: '#F8F6F3' }}
                >Time <SortArrow col="created_at" /></th>
                <th style={{ padding: '12px 16px', position: 'sticky', top: 0, background: '#F8F6F3' }} />
              </tr>
            </thead>
            <tbody>
              {sortedOrders.map((o) => (
                <tr key={o.id} style={{ borderBottom: '1px solid #F0EBE5', transition: 'background 0.1s' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#FDF8F4'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ''; }}>
                  <td style={{ padding: '12px 16px', fontWeight: 700, color: '#1C1408' }}>
                    #{o.order_number}
                    {o.type === 'delivery' && <span style={{ marginLeft: 6, fontSize: 12 }}>🛵</span>}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <Badge label={typeLabel(o.type)} color="blue" />
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                      <Badge label={o.status} color={statColor(o.status)} />
                      {/* Pickup phone-call workflow surface:
                          🍳 COOKING — kitchen has the chit (fired_at set)
                                       AND status is still active. Hidden
                                       once paid or completed (no chasing
                                       needed) and on held tickets (kitchen
                                       hasn't seen it).
                          UNPAID    — payment_status != paid AND order is
                                       still active. The most chase-worthy
                                       signal for the manager. */}
                      {o.fired_at && ['pending', 'in_progress', 'preparing', 'ready'].includes(o.status) && (
                        <span
                          title="Kitchen is cooking this"
                          style={{
                            fontSize: 10, fontWeight: 800, letterSpacing: 0.4,
                            color: '#047857', background: '#ECFDF5',
                            padding: '2px 5px', borderRadius: 4,
                            border: '1px solid #A7F3D0',
                          }}
                        >
                          🍳 COOKING
                        </span>
                      )}
                      {(o.payment_status === 'unpaid' || o.payment_status === 'partial') &&
                        !['cancelled', 'refunded', 'completed', 'paid'].includes(o.status) && (
                        <span
                          title={o.payment_status === 'partial' ? 'Partially paid' : 'Not paid yet'}
                          style={{
                            fontSize: 10, fontWeight: 800, letterSpacing: 0.4,
                            color: '#B91C1C', background: '#FEF2F2',
                            padding: '2px 5px', borderRadius: 4,
                            border: '1px solid #FECACA',
                          }}
                        >
                          {o.payment_status === 'partial' ? 'PARTIAL' : 'UNPAID'}
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', color: '#6B5D4F' }}>
                    {o.customer?.name ?? o.customer_name ?? o.table_number ?? '—'}
                  </td>
                  <td style={{ padding: '12px 16px', color: '#6B5D4F', fontSize: 13 }}>
                    {o.user?.name ?? '—'}
                  </td>
                  <td style={{ padding: '12px 16px', color: '#9C8E7E', fontSize: 12 }}>
                    {o.device?.name ?? '—'}
                  </td>
                  <td style={{ padding: '12px 16px', fontWeight: 600, color: '#D4813A' }}>
                    MVR {parseFloat(String(o.total ?? 0)).toFixed(2)}
                  </td>
                  <td style={{ padding: '12px 16px', color: '#9C8E7E', fontSize: 12 }}>
                    {timeAgo(o.created_at)}
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'nowrap' }}>
                      {/* Quick status advance */}
                      {quickLabel(o.status) && (
                        <button
                          onClick={() => void quickAdvance(o)}
                          disabled={quickActing === o.id}
                          title="Advance order to next status"
                          style={{
                            fontSize: 11, fontWeight: 700, padding: '4px 8px',
                            borderRadius: 7, border: '1px solid #D4813A',
                            background: quickActing === o.id ? '#F8F6F3' : 'rgba(212,129,58,0.1)',
                            color: '#D4813A', cursor: 'pointer', whiteSpace: 'nowrap',
                            opacity: quickActing === o.id ? 0.6 : 1,
                          }}
                        >
                          {quickActing === o.id ? '…' : quickLabel(o.status)}
                        </button>
                      )}
                      {/* Receipt SMS */}
                      {(o.customer?.phone ?? o.customer_phone) && (
                        <button
                          onClick={() => void sendSmsReceipt(o)}
                          disabled={smsBusy === o.id}
                          title="Send receipt via SMS"
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            width: 28, height: 28, borderRadius: 7,
                            border: '1px solid #E8E0D8', background: '#F8F6F3',
                            cursor: 'pointer', color: rowToast?.id === o.id ? '#22c55e' : '#9C8E7E',
                            fontSize: 11, fontWeight: 700,
                            opacity: smsBusy === o.id ? 0.5 : 1,
                          }}
                        >
                          {rowToast?.id === o.id ? '✓' : <MessageSquare size={13} />}
                        </button>
                      )}
                      <Btn small onClick={() => setSelectedId(o.id)} variant="ghost">View</Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '16px' }}>
              <Btn small variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Prev</Btn>
              <span style={{ lineHeight: '30px', fontSize: 13, color: '#6B5D4F' }}>Page {page} of {totalPages}</span>
              <Btn small variant="secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next →</Btn>
            </div>
          )}
        </Card>
      )}

      {selectedId && (
        <OrderDrawer
          orderId={selectedId}
          onClose={() => setSelectedId(null)}
          onOrderUpdated={() => void load()}
        />
      )}
    </>
  );
}
