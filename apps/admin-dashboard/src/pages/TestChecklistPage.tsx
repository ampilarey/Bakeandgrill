/**
 * Live Testing Checklist
 * Interactive step-by-step verification for all Bake & Grill features.
 * State is persisted in localStorage so progress survives page reloads.
 */
import { useState, useEffect } from 'react';

const SECTIONS = [
  {
    title: 'Staff Auth',
    icon: '🔐',
    items: [
      'Staff can log in to POS with PIN',
      'Wrong PIN is rejected with an error message',
      'Staff can log in to Admin dashboard',
      'Admin dashboard requires a valid staff token to access pages',
      'KDS login works with PIN + device ID',
      'KDS token persists after page refresh (no re-login needed)',
    ],
  },
  {
    title: 'POS — Order Flow',
    icon: '🖥️',
    items: [
      'Menu categories load in POS',
      'Items appear under the correct category',
      'Adding an item to the cart works',
      'Quantity increase/decrease works in cart',
      'Cash payment completes the order',
      'Card payment completes the order',
      'Split payment (cash + card) works',
      'Order number is generated (format: BG-YYYYMMDD-XXXX)',
      'Dine-in order can be held and resumed',
      'Discount amount can be applied to an order',
    ],
  },
  {
    title: 'KDS — Kitchen Display',
    icon: '👨‍🍳',
    items: [
      'New order appears on KDS within seconds of being placed',
      'Order can be started (status → in_progress)',
      'Order can be bumped (marked complete)',
      'Recalled orders reappear on KDS',
      'KDS shows order type (dine-in / takeaway / delivery)',
      'KDS shows notes if any were added',
    ],
  },
  {
    title: 'Online Order — Customer',
    icon: '📱',
    items: [
      'Customer can request OTP via phone number',
      'OTP SMS is received and can be verified',
      'Customer can browse the menu at /order/menu',
      'Customer can add items to cart',
      'Customer can apply a promo code',
      'Customer can place a takeaway order',
      'Order confirmation page loads with order number',
      'Order status page shows live status (/order/orders/:id)',
      'Customer can view their past orders',
    ],
  },
  {
    title: 'BML Payment',
    icon: '💳',
    items: [
      'BML payment button appears at checkout',
      'Clicking BML payment redirects to BML page',
      'Successful payment marks order as paid',
      'Failed/cancelled payment returns user to order page',
      'BML webhook is received and processed (check orders list)',
    ],
  },
  {
    title: 'Delivery',
    icon: '🛵',
    items: [
      'Customer can select delivery order type',
      'Delivery address fields appear (island, address, contact)',
      'Delivery fee is added to the order total',
      'Delivery orders appear in admin Delivery tab',
      'Delivery status can be updated by staff',
    ],
  },
  {
    title: 'Pre-Orders',
    icon: '📅',
    items: [
      '/order/pre-order page loads correctly',
      'Customer can browse and add items with quantities',
      'Fulfillment date picker enforces 24h minimum',
      'OTP login is required before submitting',
      'Pre-order is submitted and confirmation is shown',
      'Pre-order appears in admin panel',
    ],
  },
  {
    title: 'Loyalty & Promotions',
    icon: '⭐',
    items: [
      'Loyalty points are awarded after a completed order',
      'Customer can view their loyalty balance at /order/checkout',
      'Promo code validation works (valid code accepted)',
      'Invalid/expired promo code is rejected with message',
      'Promo discount is applied correctly to order total',
      'Referral code is generated for logged-in customer',
    ],
  },
  {
    title: 'Reviews & Reservations',
    icon: '⭐',
    items: [
      'Customer can submit a review for an item',
      'Review appears in admin Reviews section for moderation',
      'Approved review shows on the item page',
      'Reservation form at /order/reservations submits successfully',
      'Reservation appears in admin Reservations tab',
    ],
  },
  {
    title: 'Receipts & SMS',
    icon: '📄',
    items: [
      'Staff can send SMS receipt after payment',
      'SMS receipt is received on the customer\'s phone',
      'Email receipt can be sent (if configured)',
      'Receipt PDF can be generated and opened',
      'SMS logs appear in Admin → SMS page',
    ],
  },
  {
    title: 'Admin — Menu Management',
    icon: '🍽️',
    items: [
      'Can create a new menu category',
      'Can create a new menu item with price and image',
      'Item availability can be toggled on/off',
      'Changes to items appear immediately in the online order app',
      'Daily specials can be created and published',
    ],
  },
  {
    title: 'Admin — Reports & Analytics',
    icon: '📊',
    items: [
      'Reports page loads sales summary for today',
      'Sales breakdown shows items and categories',
      'Analytics peak hours chart renders',
      'Analytics retention and LTV tables load',
      'Date range filter updates report data',
    ],
  },
  {
    title: 'Admin — Staff & Devices',
    icon: '👤',
    items: [
      'Staff list loads in Admin → Staff',
      'New staff member can be created with a PIN',
      'Device can be registered with an identifier',
      'Inactive device is rejected when trying to place an order',
    ],
  },
  {
    title: 'Opening Hours',
    icon: '🕐',
    items: [
      '/hours page shows correct opening times',
      '/order/hours shows the same data (from API)',
      'Closed status shows correctly outside opening hours',
      'Special closure reason appears if configured',
    ],
  },
  {
    title: 'Redirects & Navigation',
    icon: '🔗',
    items: [
      '/menu redirects to /order/menu (301)',
      '/privacy redirects to /order/privacy (301)',
      '/pre-order redirects to /order/pre-order (301)',
      '/checkout redirects to /order/ (301)',
      '/order/privacy shows the React privacy page',
      '/kds/ loads the KDS app',
      '/pos/ loads the POS app',
      '/admin/ loads the admin dashboard',
    ],
  },
  {
    title: 'Security',
    icon: '🛡️',
    items: [
      'Customer OTP token cannot access /api/orders (staff list)',
      'Customer OTP token cannot access /api/suppliers',
      'Unauthenticated requests return 401',
      'X-Device-Identifier header is required for POS orders',
      'Demo PINs are NOT visible on KDS/POS login in production',
    ],
  },
];

const STORAGE_KEY = 'bg_test_checklist_v1';

function loadState(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch { return {}; }
}

export default function TestChecklistPage() {
  const [checked, setChecked] = useState<Record<string, boolean>>(loadState);
  const [filter, setFilter]   = useState<'all' | 'pending' | 'done'>('all');

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(checked));
  }, [checked]);

  function toggle(key: string) {
    setChecked(prev => ({ ...prev, [key]: !prev[key] }));
  }

  function resetAll() {
    if (window.confirm('Reset all checkboxes?')) setChecked({});
  }

  const total = SECTIONS.reduce((s, sec) => s + sec.items.length, 0);
  const done  = Object.values(checked).filter(Boolean).length;
  const pct   = total === 0 ? 0 : Math.round((done / total) * 100);

  const pctColor =
    pct === 100 ? '#10B981' : pct >= 60 ? '#F59E0B' : '#EF4444';

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 16px 80px' }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#111827', margin: 0 }}>
          🧪 Live Testing Checklist
        </h1>
        <p style={{ color: '#6B7280', fontSize: 13, marginTop: 4 }}>
          Verify every feature before going live. Progress is saved automatically.
        </p>
      </div>

      {/* Progress */}
      <div style={{ background: 'white', borderRadius: 14, padding: '16px 20px', border: '1px solid #E5E7EB', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 20 }}>
        <div style={{ flex: 1 }}>
          <div style={{ height: 10, background: '#F3F4F6', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: pctColor, borderRadius: 999, transition: 'width 0.4s ease' }} />
          </div>
          <p style={{ fontSize: 12, color: '#6B7280', marginTop: 6 }}>{done} of {total} checks passed</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: pctColor, lineHeight: 1 }}>{pct}%</div>
        </div>
        <button
          onClick={resetAll}
          style={{ background: '#F3F4F6', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600, color: '#6B7280', cursor: 'pointer' }}
        >
          Reset
        </button>
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {(['all', 'pending', 'done'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '5px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
              background: filter === f ? '#111827' : '#F3F4F6',
              color:      filter === f ? 'white'    : '#6B7280',
            }}
          >
            {f === 'all' ? 'All' : f === 'pending' ? 'Pending' : 'Passed'}
          </button>
        ))}
      </div>

      {/* Sections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {SECTIONS.map(section => {
          const visibleItems = section.items.filter(item => {
            const key = `${section.title}::${item}`;
            if (filter === 'done')    return !!checked[key];
            if (filter === 'pending') return !checked[key];
            return true;
          });
          if (!visibleItems.length) return null;

          const secDone  = section.items.filter(item => checked[`${section.title}::${item}`]).length;
          const secTotal = section.items.length;
          const allDone  = secDone === secTotal;

          return (
            <div key={section.title} style={{ background: 'white', border: `1px solid ${allDone ? '#6EE7B7' : '#E5E7EB'}`, borderRadius: 14, overflow: 'hidden' }}>
              {/* Section header */}
              <div style={{ padding: '12px 16px', background: allDone ? '#ECFDF5' : '#F9FAFB', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 18 }}>{section.icon}</span>
                  <span style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>{section.title}</span>
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 999,
                  background: allDone ? '#D1FAE5' : '#F3F4F6',
                  color:      allDone ? '#059669' : '#6B7280',
                }}>
                  {secDone}/{secTotal}
                </span>
              </div>

              {/* Items */}
              {visibleItems.map((item, i) => {
                const key    = `${section.title}::${item}`;
                const isDone = !!checked[key];
                return (
                  <label
                    key={item}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: 12, padding: '11px 16px',
                      cursor: 'pointer', borderTop: i === 0 ? 'none' : '1px solid #F3F4F6',
                      background: isDone ? '#F0FDF4' : 'white',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isDone}
                      onChange={() => toggle(key)}
                      style={{ marginTop: 2, width: 16, height: 16, accentColor: '#10B981', flexShrink: 0 }}
                    />
                    <span style={{ fontSize: 13, color: isDone ? '#9CA3AF' : '#374151', textDecoration: isDone ? 'line-through' : 'none', lineHeight: 1.5 }}>
                      {item}
                    </span>
                  </label>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* All done banner */}
      {pct === 100 && (
        <div style={{ marginTop: 24, background: '#ECFDF5', border: '1px solid #6EE7B7', borderRadius: 14, padding: '24px', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🎉</div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#065F46', margin: 0 }}>All checks passed!</h3>
          <p style={{ fontSize: 13, color: '#047857', marginTop: 6 }}>Bake &amp; Grill is ready to go live.</p>
        </div>
      )}
    </div>
  );
}
