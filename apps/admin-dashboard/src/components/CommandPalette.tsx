import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { fetchOrders, fetchStaff } from '../api';

type Result = {
  id: string;
  label: string;
  sub?: string;
  icon: string;
  action: () => void;
};

const STATIC_LINKS: Result[] = [
  { id: 's-dashboard',   label: 'Dashboard',           icon: '🏠', sub: 'Overview', action: () => {} },
  { id: 's-orders',      label: 'Orders',              icon: '📋', sub: 'Manage orders', action: () => {} },
  { id: 's-kds',         label: 'Kitchen Display',     icon: '👨‍🍳', sub: 'KDS screen', action: () => {} },
  { id: 's-menu',        label: 'Menu',                icon: '🍽️', sub: 'Manage menu items', action: () => {} },
  { id: 's-staff',       label: 'Staff',               icon: '👥', sub: 'Manage team', action: () => {} },
  { id: 's-inventory',   label: 'Inventory',           icon: '📦', sub: 'Stock levels', action: () => {} },
  { id: 's-reports',     label: 'Reports',             icon: '📊', sub: 'Sales & analytics', action: () => {} },
  { id: 's-invoices',    label: 'Invoices',            icon: '🧾', sub: 'Billing', action: () => {} },
  { id: 's-expenses',    label: 'Expenses',            icon: '💸', sub: 'Operating costs', action: () => {} },
  { id: 's-customers',   label: 'Customers',           icon: '🙋', sub: 'Customer database', action: () => {} },
  { id: 's-loyalty',     label: 'Loyalty',             icon: '⭐', sub: 'Points & rewards', action: () => {} },
  { id: 's-promotions',  label: 'Promotions',          icon: '🏷️', sub: 'Discounts & offers', action: () => {} },
  { id: 's-giftcards',   label: 'Gift Cards',          icon: '🎁', sub: 'Issue & manage cards', action: () => {} },
  { id: 's-settings',    label: 'Settings',            icon: '⚙️', sub: 'System configuration', action: () => {} },
  { id: 's-shifts',      label: 'Shifts & Cash',       icon: '💰', sub: 'Cash drawer', action: () => {} },
  { id: 's-delivery',    label: 'Delivery',            icon: '🛵', sub: 'Delivery orders', action: () => {} },
  { id: 's-waste',       label: 'Waste Tracking',      icon: '🗑️', sub: 'Log waste', action: () => {} },
  { id: 's-pnl',         label: 'Profit & Loss',       icon: '📈', sub: 'Financial summary', action: () => {} },
  { id: 's-purchases',   label: 'Purchase Orders',     icon: '🛒', sub: 'Supplier orders', action: () => {} },
  { id: 's-tables',      label: 'Tables',              icon: '🪑', sub: 'Table management', action: () => {} },
  { id: 's-reservations',label: 'Reservations',        icon: '📅', sub: 'Bookings', action: () => {} },
  { id: 's-specials',    label: 'Daily Specials',      icon: '✨', sub: 'Today\'s specials', action: () => {} },
  { id: 's-refunds',     label: 'Refunds',             icon: '↩️', sub: 'Process refunds', action: () => {} },
  { id: 's-reviews',     label: 'Reviews',             icon: '⭐', sub: 'Customer reviews', action: () => {} },
  { id: 's-analytics',   label: 'Analytics',           icon: '📉', sub: 'Advanced analytics', action: () => {} },
  { id: 's-sms',         label: 'SMS Campaigns',       icon: '📱', sub: 'Messaging', action: () => {} },
];

const PAGE_ROUTES: Record<string, string> = {
  's-dashboard': '/dashboard', 's-orders': '/orders', 's-kds': '/kds',
  's-menu': '/menu', 's-staff': '/staff', 's-inventory': '/inventory',
  's-reports': '/reports', 's-invoices': '/invoices', 's-expenses': '/expenses',
  's-customers': '/customers', 's-loyalty': '/loyalty', 's-promotions': '/promotions',
  's-giftcards': '/gift-cards', 's-settings': '/settings', 's-shifts': '/shifts',
  's-delivery': '/delivery', 's-waste': '/waste-logs', 's-pnl': '/profit-loss',
  's-purchases': '/purchase-orders', 's-tables': '/tables', 's-reservations': '/reservations',
  's-specials': '/specials', 's-refunds': '/refunds', 's-reviews': '/reviews',
  's-analytics': '/analytics', 's-sms': '/sms',
};

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: Props) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Focus input when opened; reset dynamic cache on close
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelected(0);
      dynamicLoaded.current = false;
      cachedOrders.current = [];
      cachedStaff.current  = [];
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Build static results with navigation actions
  const buildStatic = (q: string): Result[] => {
    const lower = q.toLowerCase();
    return STATIC_LINKS
      .filter((l) => !q || l.label.toLowerCase().includes(lower) || (l.sub ?? '').toLowerCase().includes(lower))
      .slice(0, q ? 6 : 8)
      .map((l) => ({
        ...l,
        action: () => { navigate(PAGE_ROUTES[l.id] ?? '/dashboard'); onClose(); },
      }));
  };

  // Cache for dynamic data so we don't refetch on every keystroke
  const cachedOrders = useRef<Array<{ id: number; order_number: string; status: string; total: number }>>([]);
  const cachedStaff  = useRef<Array<{ id: number; name: string; email?: string; role?: string; role_name?: string }>>([]);
  const dynamicLoaded = useRef(false);

  // Search orders + staff dynamically
  const runSearch = async (q: string) => {
    if (q.length < 2) {
      setResults(buildStatic(q));
      return;
    }
    setLoading(true);
    const staticR = buildStatic(q);
    setResults(staticR);
    try {
      // Load dynamic data once per palette open
      if (!dynamicLoaded.current) {
        const [ordersRes, staffRes] = await Promise.allSettled([
          fetchOrders({ per_page: 30 }),
          fetchStaff(),
        ]);
        if (ordersRes.status === 'fulfilled') cachedOrders.current = (ordersRes.value.data ?? []) as typeof cachedOrders.current;
        if (staffRes.status === 'fulfilled')  cachedStaff.current  = (staffRes.value.staff ?? []) as typeof cachedStaff.current;
        dynamicLoaded.current = true;
      }

      const qLower = q.toLowerCase();
      const dynResults: Result[] = [];

      // Filter orders by order number
      cachedOrders.current
        .filter((o) => String(o.order_number).toLowerCase().includes(qLower))
        .slice(0, 4)
        .forEach((o) => {
          dynResults.push({
            id: `o-${o.id}`,
            label: `Order #${o.order_number}`,
            sub: `${o.status} · MVR ${Number(o.total ?? 0).toFixed(2)}`,
            icon: '📋',
            action: () => { navigate('/orders'); onClose(); },
          });
        });

      // Filter staff by name/email
      cachedStaff.current
        .filter((s) => s.name.toLowerCase().includes(qLower) || (s.email ?? '').toLowerCase().includes(qLower))
        .slice(0, 3)
        .forEach((s) => {
          dynResults.push({
            id: `st-${s.id}`,
            label: s.name,
            sub: `Staff · ${s.role_name ?? s.role ?? ''}`,
            icon: '👤',
            action: () => { navigate('/staff'); onClose(); },
          });
        });

      setResults([...staticR, ...dynResults]);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!open) return;
    setSelected(0);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => void runSearch(query), 200);
    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open]);

  // Initial empty state
  useEffect(() => {
    if (open && !query) setResults(buildStatic(''));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected((s) => Math.min(s + 1, results.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)); }
    if (e.key === 'Enter' && results[selected]) { results[selected].action(); }
  };

  // Scroll selected into view
  useEffect(() => {
    const el = listRef.current?.children[selected] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '12vh',
        animation: 'fadeSlideIn 0.12s ease',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 560, background: '#fff',
          borderRadius: 16, boxShadow: '0 24px 64px rgba(0,0,0,0.22)',
          overflow: 'hidden',
          border: '1px solid #E8E0D8',
        }}
      >
        {/* Search input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid #F0EBE5' }}>
          <Search size={18} style={{ color: '#9C8E7E', flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search pages, orders, staff…"
            style={{
              flex: 1, border: 'none', outline: 'none',
              fontSize: 15, color: '#1C1408', fontFamily: 'inherit',
              background: 'transparent',
            }}
          />
          {loading && <span style={{ fontSize: 12, color: '#9C8E7E' }}>…</span>}
          <button
            onClick={onClose}
            style={{ border: 'none', background: '#F0EBE5', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: '#6B5D4F', fontSize: 11, fontWeight: 600, fontFamily: 'inherit' }}
          >
            esc
          </button>
        </div>

        {/* Results */}
        <div ref={listRef} style={{ maxHeight: 380, overflowY: 'auto' }}>
          {results.length === 0 ? (
            <div style={{ padding: '32px 18px', textAlign: 'center', color: '#9C8E7E', fontSize: 13 }}>
              <X size={20} style={{ display: 'block', margin: '0 auto 8px', opacity: 0.4 }} />
              No results for &ldquo;{query}&rdquo;
            </div>
          ) : (
            results.map((r, i) => (
              <button
                key={r.id}
                onClick={r.action}
                onMouseEnter={() => setSelected(i)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  width: '100%', padding: '10px 18px',
                  border: 'none', borderBottom: '1px solid #F8F6F3',
                  background: i === selected ? '#FEF3E8' : '#fff',
                  cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                  transition: 'background 0.1s',
                }}
              >
                <span style={{ fontSize: 18, flexShrink: 0, lineHeight: 1 }}>{r.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: i === selected ? '#D4813A' : '#1C1408' }}>
                    {r.label}
                  </p>
                  {r.sub && <p style={{ margin: 0, fontSize: 11, color: '#9C8E7E' }}>{r.sub}</p>}
                </div>
                {i === selected && (
                  <span style={{ fontSize: 10, color: '#D4813A', fontWeight: 700, flexShrink: 0 }}>↵ Go</span>
                )}
              </button>
            ))
          )}
        </div>

        <div style={{ padding: '8px 18px', borderTop: '1px solid #F0EBE5', display: 'flex', gap: 16, fontSize: 11, color: '#9C8E7E' }}>
          <span>↑↓ navigate</span>
          <span>↵ select</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
