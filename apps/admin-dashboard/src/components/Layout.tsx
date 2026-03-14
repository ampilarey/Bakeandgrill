import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { logout, type StaffUser } from '../api';

const NAV = [
  { to: '/dashboard',           icon: '🏠', label: 'Dashboard'        },
  { to: '/orders',              icon: '📋', label: 'Orders'           },
  { to: '/kds',                 icon: '👨‍🍳', label: 'Kitchen'          },
  { to: '/delivery',            icon: '🛵', label: 'Delivery'         },
  { to: '/menu',                icon: '🍽️', label: 'Menu'             },
  { to: '/promotions',          icon: '🏷️', label: 'Promos'           },
  { to: '/loyalty',             icon: '⭐', label: 'Loyalty'          },
  { to: '/sms',                 icon: '📱', label: 'SMS'              },
  { to: '/reservations',        icon: '📅', label: 'Reservations'     },
  { to: '/staff',               icon: '👥', label: 'Staff'            },
  { to: '/purchase-orders',     icon: '🛒', label: 'Purchases'        },
  { to: '/invoices',            icon: '🧾', label: 'Invoices'         },
  { to: '/expenses',            icon: '💸', label: 'Expenses'         },
  { to: '/profit-loss',         icon: '💰', label: 'P&L'              },
  { to: '/supplier-intelligence', icon: '🏭', label: 'Suppliers'      },
  { to: '/forecasts',           icon: '📈', label: 'Forecasts'        },
  { to: '/reports',             icon: '📊', label: 'Reports'          },
  { to: '/analytics',           icon: '📉', label: 'Analytics'        },
  { to: '/webhooks',            icon: '🔔', label: 'Webhooks'          },
  { to: '/checklist',           icon: '✅', label: 'Test Checklist'     },
];

export function Layout({
  user,
  children,
  onLogout,
}: {
  user: StaffUser;
  children: React.ReactNode;
  onLogout: () => void;
}) {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = async () => {
    try { await logout(); } catch { /* ignore */ }
    localStorage.removeItem('admin_token');
    onLogout();
    navigate('/login');
  };

  // UX-2: 30-minute idle timeout — clear token and redirect to login
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

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#FFFDF9' }}>
      {/* Sidebar */}
      <aside style={{
        width: collapsed ? 64 : 220,
        background: '#1C1408',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.2s',
        flexShrink: 0,
        position: 'sticky',
        top: 0,
        height: '100vh',
        overflowY: 'auto',
        overflowX: 'hidden',
      }}>
        {/* Logo */}
        <div style={{
          padding: collapsed ? '20px 12px' : '20px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          cursor: 'pointer',
        }} onClick={() => setCollapsed(!collapsed)}>
          <span style={{ fontSize: 22, flexShrink: 0 }}>🍞</span>
          {!collapsed && (
            <div>
              <div style={{ color: '#f8fafc', fontWeight: 800, fontSize: 14 }}>Bake & Grill</div>
              <div style={{ color: '#8B7355', fontSize: 11 }}>Admin</div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 0' }}>
          {NAV.map(({ to, icon, label }) => (
            <NavLink key={to} to={to} style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: collapsed ? '12px 20px' : '11px 20px',
              color: isActive ? '#D4813A' : '#94a3b8',
              textDecoration: 'none',
              fontWeight: isActive ? 700 : 400,
              fontSize: 14,
              background: isActive ? 'rgba(212,129,58,0.12)' : 'transparent',
              borderLeft: isActive ? '3px solid #D4813A' : '3px solid transparent',
              transition: 'all 0.15s',
              whiteSpace: 'nowrap',
            })}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>
              {!collapsed && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Footer: back-to-site + user + logout */}
        <div style={{ padding: '12px 0', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          {/* UX-1: back to main website */}
          <a
            href="/"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: collapsed ? '10px 20px' : '10px 20px',
              color: '#8B7355',
              textDecoration: 'none',
              fontSize: 13,
              fontWeight: 500,
              transition: 'color 0.15s',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = '#D4813A'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = '#8B7355'; }}
          >
            <span style={{ fontSize: 16, flexShrink: 0 }}>🌐</span>
            {!collapsed && <span>← Main Website</span>}
          </a>
        </div>

        <div style={{ padding: '12px 16px 16px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          {!collapsed && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ color: '#f8fafc', fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.name}
              </div>
              <div style={{ color: '#8B7355', fontSize: 11 }}>{user.role ?? 'Staff'}</div>
            </div>
          )}
          <button onClick={handleLogout} style={{
            background: 'rgba(239,68,68,0.12)',
            border: '1px solid rgba(239,68,68,0.2)',
            color: '#f87171',
            borderRadius: 8,
            padding: collapsed ? '8px' : '8px 14px',
            fontSize: 12,
            fontWeight: 600,
            width: '100%',
            cursor: 'pointer',
          }}>
            {collapsed ? '→' : 'Logout'}
          </button>
        </div>
      </aside>

      {/* Main */}
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
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#2A1E0C' }}>{title}</h1>
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
      background: c.bg,
      color: c.text,
      padding: '2px 10px',
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 600,
      display: 'inline-block',
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
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...variants[variant],
        padding: small ? '5px 12px' : '9px 18px',
        borderRadius: 9,
        fontSize: small ? 12 : 14,
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        transition: 'opacity 0.15s',
        ...style,
      }}
    >
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
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        border: '1px solid #EDE4D4',
        borderRadius: 9,
        padding: '9px 12px',
        fontSize: 14,
        color: '#2A1E0C',
        outline: 'none',
        width: '100%',
        background: '#fff',
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
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        border: '1px solid #EDE4D4',
        borderRadius: 9,
        padding: '9px 12px',
        fontSize: 14,
        color: '#2A1E0C',
        background: '#fff',
        cursor: 'pointer',
        ...style,
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

export function Spinner() {
  return (
    <div style={{ textAlign: 'center', padding: '48px', color: '#8B7355' }}>
      Loading…
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px', color: '#8B7355', fontSize: 14 }}>
      {message}
    </div>
  );
}

export function ErrorMsg({ message }: { message: string }) {
  return (
    <div style={{
      background: '#fee2e2',
      border: '1px solid #fecaca',
      color: '#991b1b',
      borderRadius: 10,
      padding: '12px 16px',
      fontSize: 13,
      marginBottom: 16,
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
