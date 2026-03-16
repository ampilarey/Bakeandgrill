import { NavLink } from 'react-router-dom';

const ITEMS = [
  { to: '/',        icon: '🚚', label: 'Active'  },
  { to: '/history', icon: '📋', label: 'History' },
  { to: '/profile', icon: '👤', label: 'Profile' },
];

export default function BottomNav() {
  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      background: 'rgba(255,253,249,0.97)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      borderTop: '1px solid var(--color-border)',
      boxShadow: '0 -2px 12px rgba(0,0,0,0.06)',
      paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))',
      zIndex: 100,
    }}>
      <div style={{ display: 'flex' }}>
        {ITEMS.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            style={({ isActive }) => ({
              flex: 1, display: 'flex', flexDirection: 'column' as const,
              alignItems: 'center', gap: 3, padding: '10px 0',
              color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
              textDecoration: 'none', fontSize: '0.6rem', fontWeight: 700,
              textTransform: 'uppercase' as const, letterSpacing: '0.05em',
              transition: 'color 0.15s',
            })}
          >
            {({ isActive }) => (
              <>
                <span style={{ fontSize: '1.25rem', lineHeight: 1 }}>{item.icon}</span>
                <span style={{ color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)' }}>
                  {item.label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
