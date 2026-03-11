import { useEffect, useState } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';

export function Layout() {
  const navigate = useNavigate();
  const { cart } = useCart();
  const { lang, setLang } = useLanguage();
  const cartCount = cart.reduce((s, e) => s + e.quantity, 0);

  const [token, setToken] = useState<string | null>(() => localStorage.getItem('online_token'));
  const [customerName, setCustomerName] = useState<string | null>(() => localStorage.getItem('online_customer_name'));
  const [menuOpen, setMenuOpen] = useState(false);

  // Keep auth state in sync with localStorage (e.g. after login in CheckoutPage)
  useEffect(() => {
    const sync = () => {
      setToken(localStorage.getItem('online_token'));
      setCustomerName(localStorage.getItem('online_customer_name'));
    };
    window.addEventListener('storage', sync);
    window.addEventListener('auth_change', sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('auth_change', sync);
    };
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('online_token');
    localStorage.removeItem('online_customer_name');
    setToken(null);
    setCustomerName(null);
    navigate('/');
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#fff' }}>
      {/* Header */}
      <header style={{
        position: 'sticky',
        top: 0,
        background: 'rgba(255,255,255,0.97)',
        borderBottom: '1px solid #e9ecef',
        zIndex: 100,
        boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
        backdropFilter: 'blur(8px)',
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 1.5rem', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
          {/* Logo */}
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', textDecoration: 'none', flexShrink: 0 }}>
            <img src="/logo.png" alt="Bake & Grill" style={{ width: '40px', height: '40px', borderRadius: '10px' }} />
            <span style={{ fontSize: '1.15rem', fontWeight: 700, color: '#1c1e21' }}>Bake &amp; Grill</span>
          </Link>

          {/* Desktop Nav */}
          <nav style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flex: 1, marginLeft: '1rem' }} className="desktop-nav">
            {[
              { to: '/', label: 'Home' },
              { to: '/menu', label: 'Menu' },
              { to: '/about', label: 'About' },
              { to: '/contact', label: 'Contact' },
              { to: '/hours', label: 'Hours' },
            ].map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                style={{ padding: '0.4rem 0.875rem', borderRadius: '8px', fontSize: '0.9rem', fontWeight: 500, color: '#636e72', textDecoration: 'none', transition: 'all 0.15s' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#f1f3f5'; e.currentTarget.style.color = '#1c1e21'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#636e72'; }}
              >
                {label}
              </Link>
            ))}
          </nav>

          {/* Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
            {/* Language toggle */}
            <button
              onClick={() => setLang(lang === 'en' ? 'dv' : 'en')}
              style={{ padding: '0.35rem 0.75rem', background: '#f1f3f5', border: 'none', borderRadius: '999px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', color: '#495057', fontFamily: 'inherit', lineHeight: 1 }}
              title="Toggle language"
            >
              {lang === 'en' ? 'ދިވެހި' : 'EN'}
            </button>

            {token ? (
              <>
                {customerName && (
                  <span style={{ fontSize: '0.85rem', color: '#636e72', display: 'none' }} className="show-desktop">
                    Hi, {customerName}
                  </span>
                )}
                <button
                  onClick={handleLogout}
                  style={{ padding: '0.4rem 0.875rem', background: 'transparent', border: '1px solid #dee2e6', borderRadius: '999px', fontSize: '0.85rem', color: '#636e72', cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  Logout
                </button>
              </>
            ) : (
              <Link
                to="/menu"
                style={{ padding: '0.4rem 0.875rem', background: 'transparent', border: '1px solid #dee2e6', borderRadius: '999px', fontSize: '0.85rem', color: '#636e72', textDecoration: 'none' }}
              >
                Sign In
              </Link>
            )}

            {/* Cart button */}
            <Link
              to="/menu"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem',
                padding: '0.45rem 1rem',
                background: '#1ba3b9',
                color: 'white',
                borderRadius: '999px',
                fontSize: '0.875rem',
                fontWeight: 600,
                textDecoration: 'none',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#1591a6'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#1ba3b9'; }}
            >
              <span>Cart</span>
              {cartCount > 0 && (
                <span style={{ background: 'rgba(255,255,255,0.3)', borderRadius: '999px', padding: '0.1rem 0.45rem', fontSize: '0.75rem', fontWeight: 700 }}>
                  {cartCount}
                </span>
              )}
            </Link>

            {/* Mobile menu toggle */}
            <button
              className="mobile-menu-btn"
              onClick={() => setMenuOpen((o) => !o)}
              style={{ display: 'none', background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', color: '#1c1e21', fontSize: '1.4rem' }}
              aria-label="Menu"
            >
              {menuOpen ? '✕' : '☰'}
            </button>
          </div>
        </div>

        {/* Mobile dropdown nav */}
        {menuOpen && (
          <div style={{ borderTop: '1px solid #e9ecef', background: 'white', padding: '0.75rem 1.5rem 1rem' }} className="mobile-nav-dropdown">
            {[
              { to: '/', label: 'Home' },
              { to: '/menu', label: 'Menu' },
              { to: '/about', label: 'About' },
              { to: '/contact', label: 'Contact' },
              { to: '/hours', label: 'Hours' },
            ].map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                onClick={() => setMenuOpen(false)}
                style={{ display: 'block', padding: '0.6rem 0', fontSize: '0.95rem', fontWeight: 500, color: '#1c1e21', textDecoration: 'none', borderBottom: '1px solid #f1f3f5' }}
              >
                {label}
              </Link>
            ))}
          </div>
        )}
      </header>

      {/* Page content */}
      <main style={{ flex: 1 }}>
        <Outlet />
      </main>

      {/* Footer */}
      <footer style={{ background: '#1c1e21', color: 'white', padding: '3rem 1.5rem 2rem', marginTop: '4rem' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '2rem', paddingBottom: '2rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            <div>
              <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none', marginBottom: '0.75rem' }}>
                <img src="/logo.png" alt="" style={{ width: '32px', height: '32px', borderRadius: '8px' }} />
                <span style={{ fontSize: '1rem', fontWeight: 700, color: 'white' }}>Bake &amp; Grill</span>
              </Link>
              <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.875rem', lineHeight: 1.6 }}>
                Authentic Dhivehi cuisine, fresh pastries, and premium grills in Malé.
              </p>
            </div>
            <div>
              <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.35)', marginBottom: '1rem', fontWeight: 700 }}>Pages</h4>
              {[
                { to: '/menu', label: 'Menu' },
                { to: '/hours', label: 'Opening Hours' },
                { to: '/contact', label: 'Contact Us' },
                { to: '/about', label: 'About Us' },
                { to: '/reservations', label: 'Reserve a Table' },
              ].map(({ to, label }) => (
                <Link key={to} to={to} style={{ display: 'block', color: 'rgba(255,255,255,0.6)', fontSize: '0.875rem', marginBottom: '0.5rem', textDecoration: 'none' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'white'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; }}
                >
                  {label}
                </Link>
              ))}
            </div>
            <div>
              <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.35)', marginBottom: '1rem', fontWeight: 700 }}>Location</h4>
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.875rem', marginBottom: '0.375rem' }}>Majeedhee Magu</p>
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.875rem', marginBottom: '0.375rem' }}>Malé, Maldives</p>
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.875rem' }}>Near ferry terminal</p>
            </div>
            <div>
              <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.35)', marginBottom: '1rem', fontWeight: 700 }}>Contact</h4>
              <a href="tel:+9609120011" style={{ display: 'block', color: 'rgba(255,255,255,0.6)', fontSize: '0.875rem', marginBottom: '0.5rem', textDecoration: 'none' }}>+960 9120011</a>
              <a href="mailto:hello@bakeandgrill.mv" style={{ display: 'block', color: 'rgba(255,255,255,0.6)', fontSize: '0.875rem', marginBottom: '0.5rem', textDecoration: 'none' }}>hello@bakeandgrill.mv</a>
              <a href="https://wa.me/9609120011" target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', background: '#25D366', color: 'white', padding: '0.4rem 0.875rem', borderRadius: '999px', fontSize: '0.8rem', fontWeight: 600, textDecoration: 'none', marginTop: '0.25rem' }}>
                WhatsApp
              </a>
            </div>
          </div>
          <div style={{ paddingTop: '1.5rem', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', color: 'rgba(255,255,255,0.3)', fontSize: '0.8rem' }}>
            <span>© {new Date().getFullYear()} Bake & Grill. All rights reserved.</span>
            <span style={{ color: 'rgba(255,255,255,0.3)' }}>Privacy Policy</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
