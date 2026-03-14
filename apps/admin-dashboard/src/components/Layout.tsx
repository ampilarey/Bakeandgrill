import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { logout, type StaffUser } from '../api';

// ── Nav groups ────────────────────────────────────────────────────────────────
const NAV_GROUPS = [
  {
    label: 'Operations',
    items: [
      { to: '/dashboard',   icon: '🏠', label: 'Dashboard'    },
      { to: '/orders',      icon: '📋', label: 'Orders'       },
      { to: '/kds',         icon: '👨‍🍳', label: 'Kitchen'      },
      { to: '/delivery',    icon: '🛵', label: 'Delivery'     },
    ],
  },
  {
    label: 'Sales & Marketing',
    items: [
      { to: '/menu',         icon: '🍽️', label: 'Menu'        },
      { to: '/promotions',   icon: '🏷️', label: 'Promos'      },
      { to: '/loyalty',      icon: '⭐', label: 'Loyalty'     },
      { to: '/sms',          icon: '📱', label: 'SMS'         },
      { to: '/reservations', icon: '📅', label: 'Reservations'},
    ],
  },
  {
    label: 'Finance',
    items: [
      { to: '/purchase-orders',      icon: '🛒', label: 'Purchases' },
      { to: '/invoices',             icon: '🧾', label: 'Invoices'  },
      { to: '/expenses',             icon: '💸', label: 'Expenses'  },
      { to: '/profit-loss',          icon: '💰', label: 'P&L'       },
      { to: '/supplier-intelligence',icon: '🏭', label: 'Suppliers' },
      { to: '/forecasts',            icon: '📈', label: 'Forecasts' },
      { to: '/reports',              icon: '📊', label: 'Reports'   },
      { to: '/analytics',            icon: '📉', label: 'Analytics' },
    ],
  },
  {
    label: 'Team',
    items: [
      { to: '/staff', icon: '👥', label: 'Staff' },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/webhooks',  icon: '🔔', label: 'Webhooks'      },
      { to: '/checklist', icon: '✅', label: 'Test Checklist' },
    ],
  },
];

// All items flat (for mobile bottom bar title lookup)
const ALL_NAV = NAV_GROUPS.flatMap((g) => g.items);

// ── Responsive hook ───────────────────────────────────────────────────────────
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isMobile;
}

// ── Layout ────────────────────────────────────────────────────────────────────
export function Layout({
  user,
  children,
  onLogout,
}: {
  user: StaffUser;
  children: React.ReactNode;
  onLogout: () => void;
}) {
  const navigate    = useNavigate();
  const location    = useLocation();
  const isMobile    = useIsMobile();
  const [collapsed, setCollapsed]       = useState(false);
  const [drawerOpen, setDrawerOpen]     = useState(false);
  const drawerRef   = useRef<HTMLDivElement>(null);

  // Current page label for mobile header
  const currentPage = ALL_NAV.find((n) => location.pathname.startsWith(n.to))?.label ?? 'Admin';

  const handleLogout = async () => {
    try { await logout(); } catch { /* ignore */ }
    localStorage.removeItem('admin_token');
    onLogout();
    navigate('/login');
  };

  // Close drawer on navigation
  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  // Close drawer on outside click
  useEffect(() => {
    if (!drawerOpen) return;
    const handler = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        setDrawerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [drawerOpen]);

  // 30-minute idle timeout
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const IDLE_MS = 30 * 60 * 1000;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        localStorage.removeItem('admin_token');
        onLogout();
        navigate('/login');
      }, IDLE_MS);
    };
    const events = ['click', 'keydown', 'mousemove', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, reset));
    reset();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [navigate, onLogout]);

  // ── Nav content (shared between sidebar and drawer) ───────────────────────
  const NavContent = ({ onClose }: { onClose?: () => void }) => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Logo header */}
      <div style={{
        padding: '18px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <img src="/logo.png" alt="Bake & Grill" style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0 }} />
        {(!collapsed || isMobile) && (
          <div>
            <div style={{ color: '#f8fafc', fontWeight: 800, fontSize: 13 }}>Bake & Grill</div>
            <div style={{ color: '#8B7355', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Admin</div>
          </div>
        )}
        {onClose && (
          <button onClick={onClose} style={{
            marginLeft: 'auto', background: 'none', border: 'none',
            color: '#8B7355', cursor: 'pointer', fontSize: 18, padding: 4,
          }}>✕</button>
        )}
      </div>

      {/* Grouped nav */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            {/* Group label — hide when collapsed on desktop */}
            {(!collapsed || isMobile) && (
              <div style={{
                padding: '12px 20px 4px',
                fontSize: 10, fontWeight: 700,
                color: '#5C4A30',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}>
                {group.label}
              </div>
            )}
            {collapsed && !isMobile && <div style={{ height: 8 }} />}

            {group.items.map(({ to, icon, label }) => (
              <NavLink key={to} to={to} style={({ isActive }) => ({
                display: 'flex', alignItems: 'center',
                gap: 10,
                padding: collapsed && !isMobile ? '10px 0' : '9px 20px',
                justifyContent: collapsed && !isMobile ? 'center' : 'flex-start',
                color: isActive ? '#D4813A' : '#94a3b8',
                textDecoration: 'none',
                fontWeight: isActive ? 700 : 400,
                fontSize: 13,
                background: isActive ? 'rgba(212,129,58,0.12)' : 'transparent',
                borderLeft: collapsed && !isMobile ? 'none' : (isActive ? '3px solid #D4813A' : '3px solid transparent'),
                borderRight: collapsed && !isMobile && isActive ? '3px solid #D4813A' : 'none',
                transition: 'all 0.15s',
                whiteSpace: 'nowrap',
              })}>
                <span style={{ fontSize: 17, flexShrink: 0 }}>{icon}</span>
                {(!collapsed || isMobile) && <span>{label}</span>}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', padding: '10px 0 0' }}>
        <a href="/" style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: collapsed && !isMobile ? '10px 0' : '10px 20px',
          justifyContent: collapsed && !isMobile ? 'center' : 'flex-start',
          color: '#8B7355', textDecoration: 'none', fontSize: 12, whiteSpace: 'nowrap',
        }}>
          <span style={{ fontSize: 15, flexShrink: 0 }}>🌐</span>
          {(!collapsed || isMobile) && <span>← Main Website</span>}
        </a>
      </div>

      <div style={{ padding: '10px 14px 16px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        {(!collapsed || isMobile) && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ color: '#f8fafc', fontWeight: 600, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user.name}
            </div>
            <div style={{ color: '#8B7355', fontSize: 10, textTransform: 'capitalize' }}>{user.role ?? 'Staff'}</div>
          </div>
        )}
        <button onClick={handleLogout} style={{
          background: 'rgba(239,68,68,0.12)',
          border: '1px solid rgba(239,68,68,0.2)',
          color: '#f87171',
          borderRadius: 8,
          padding: collapsed && !isMobile ? '7px' : '7px 12px',
          fontSize: 11, fontWeight: 600, width: '100%', cursor: 'pointer',
        }}>
          {collapsed && !isMobile ? '⇥' : 'Logout'}
        </button>
      </div>
    </div>
  );

  // ── Mobile layout ─────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#FFFDF9' }}>

        {/* Mobile top header */}
        <header style={{
          background: '#1C1408',
          display: 'flex', alignItems: 'center',
          padding: '0 16px', height: 52, flexShrink: 0,
          position: 'sticky', top: 0, zIndex: 100,
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}>
          <button
            onClick={() => setDrawerOpen(true)}
            style={{ background: 'none', border: 'none', color: '#D4813A', fontSize: 22, cursor: 'pointer', padding: '4px 8px 4px 0', lineHeight: 1 }}
          >
            ☰
          </button>
          <img src="/logo.png" alt="" style={{ width: 26, height: 26, borderRadius: 6, marginRight: 8 }} />
          <span style={{ color: '#f8fafc', fontWeight: 700, fontSize: 15, flex: 1 }}>{currentPage}</span>
          <span style={{ color: '#8B7355', fontSize: 11 }}>{user.name}</span>
        </header>

        {/* Drawer overlay */}
        {drawerOpen && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.5)',
          }}>
            <div ref={drawerRef} style={{
              position: 'absolute', left: 0, top: 0, bottom: 0,
              width: 260,
              background: '#1C1408',
              display: 'flex', flexDirection: 'column',
              boxShadow: '4px 0 20px rgba(0,0,0,0.4)',
              animation: 'slideIn 0.2s ease',
            }}>
              <NavContent onClose={() => setDrawerOpen(false)} />
            </div>
          </div>
        )}

        {/* Page content */}
        <main style={{ flex: 1, padding: '16px', minWidth: 0, overflowX: 'hidden' }}>
          {children}
        </main>

        <style>{`
          @keyframes slideIn { from { transform: translateX(-100%); } to { transform: translateX(0); } }
        `}</style>
      </div>
    );
  }

  // ── Desktop layout ────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#FFFDF9' }}>
      <aside style={{
        width: collapsed ? 56 : 220,
        background: '#1C1408',
        flexShrink: 0,
        position: 'sticky', top: 0,
        height: '100vh',
        transition: 'width 0.2s',
        overflowY: 'auto', overflowX: 'hidden',
      }}>
        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          style={{
            position: 'absolute', top: 14, right: collapsed ? 6 : 10,
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
            color: '#8B7355', borderRadius: 6, width: 22, height: 22,
            fontSize: 10, cursor: 'pointer', zIndex: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? '›' : '‹'}
        </button>
        <NavContent />
      </aside>

      <main style={{ flex: 1, minWidth: 0, padding: '24px', overflowY: 'auto' }}>
        {children}
      </main>
    </div>
  );
}

// ── Shared UI primitives ──────────────────────────────────────────────────────

export function PageHeader({ title, subtitle, action }: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#2A1E0C', margin: 0 }}>{title}</h1>
        {subtitle && <p style={{ color: '#8B7355', fontSize: 14, marginTop: 2 }}>{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: '#fff',
      borderRadius: 14,
      border: '1px solid #EDE4D4',
      padding: '20px 24px',
      boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
      ...style,
    }}>
      {children}
    </div>
  );
}

export function Badge({ label, color }: { label: string; color: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    green:  { bg: '#dcfce7', text: '#166534' },
    yellow: { bg: '#fef9c3', text: '#854d0e' },
    blue:   { bg: '#dbeafe', text: '#1e40af' },
    red:    { bg: '#fee2e2', text: '#991b1b' },
    gray:   { bg: '#f1f5f9', text: '#475569' },
    teal:   { bg: '#ccfbf1', text: '#115e59' },
    orange: { bg: '#ffedd5', text: '#9a3412' },
  };
  const c = colors[color] ?? colors.gray;
  return (
    <span style={{
      background: c.bg, color: c.text,
      padding: '2px 10px', borderRadius: 999,
      fontSize: 12, fontWeight: 600, display: 'inline-block',
    }}>
      {label}
    </span>
  );
}

export function Btn({
  children, onClick, variant = 'primary', disabled, small, style,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  small?: boolean;
  style?: React.CSSProperties;
}) {
  const variants = {
    primary:   { background: '#D4813A', color: '#fff', border: 'none' },
    secondary: { background: '#FEF3E8', color: '#2A1E0C', border: '1px solid #EDE4D4' },
    danger:    { background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca' },
    ghost:     { background: 'transparent', color: '#8B7355', border: '1px solid #EDE4D4' },
  };
  return (
    <button onClick={onClick} disabled={disabled} style={{
      ...variants[variant],
      padding: small ? '5px 12px' : '9px 18px',
      borderRadius: 9, fontSize: small ? 12 : 14, fontWeight: 600,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.6 : 1, transition: 'opacity 0.15s',
      ...style,
    }}>
      {children}
    </button>
  );
}

export function Input({
  value, onChange, placeholder, type = 'text', style,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  style?: React.CSSProperties;
}) {
  return (
    <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder} style={{
        border: '1px solid #EDE4D4', borderRadius: 9,
        padding: '9px 12px', fontSize: 14, color: '#2A1E0C',
        outline: 'none', width: '100%', background: '#fff', boxSizing: 'border-box',
        ...style,
      }}
    />
  );
}

export function Select({
  value, onChange, options, style,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  style?: React.CSSProperties;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{
      border: '1px solid #EDE4D4', borderRadius: 9,
      padding: '9px 12px', fontSize: 14, color: '#2A1E0C',
      background: '#fff', cursor: 'pointer', ...style,
    }}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

export function Spinner() {
  return <div style={{ textAlign: 'center', padding: '48px', color: '#8B7355' }}>Loading…</div>;
}

export function EmptyState({ message }: { message: string }) {
  return <div style={{ textAlign: 'center', padding: '48px', color: '#8B7355', fontSize: 14 }}>{message}</div>;
}

export function ErrorMsg({ message }: { message: string }) {
  return (
    <div style={{
      background: '#fee2e2', border: '1px solid #fecaca',
      color: '#991b1b', borderRadius: 10, padding: '12px 16px',
      fontSize: 13, marginBottom: 16,
    }}>
      {message}
    </div>
  );
}

export function statColor(status: string): string {
  const map: Record<string, string> = {
    pending: 'yellow', preparing: 'blue', in_progress: 'blue', ready: 'teal',
    paid: 'green', completed: 'gray', cancelled: 'red',
    out_for_delivery: 'teal', draft: 'gray', sent: 'green',
    failed: 'red', active: 'green', expired: 'gray',
  };
  return map[status] ?? 'gray';
}
