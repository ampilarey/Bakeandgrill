import { useEffect, useState } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';

// ── SVG icons ─────────────────────────────────────────────────────────────────
function WhatsAppIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}
function ViberIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M11.4 0C5.7.3 1.2 4.8.9 10.5c-.2 3.4.8 6.5 2.7 8.9L2.2 24l4.8-1.4c1.4.7 3 1.1 4.7 1.1 6.1 0 11.1-5 11.1-11.1S17.9 0 11.8 0h-.4zm.5 2c5.1 0 9.1 4 9.1 9.1s-4 9.1-9.1 9.1c-1.6 0-3.2-.4-4.5-1.2l-.3-.2-3 .9.9-2.9-.2-.3C3.7 15.2 3.1 13.1 3.1 11 3.1 5.9 7.2 2 12.1 2h-.2zm-.8 3.2c-.3 0-.8.1-1.2.5C9.5 6.3 8.8 7 8.8 8.5s1 3 1.2 3.2c.2.2 2 3 4.8 4.2.7.3 1.2.4 1.6.5.7.2 1.3.1 1.8-.1.5-.3 1.6-1.5 1.8-2.3.2-.7.1-1.3-.1-1.5-.1-.2-.4-.3-.8-.5s-2.3-1.1-2.6-1.2c-.3-.1-.6-.2-.8.2-.2.3-.9 1.1-1.1 1.3-.2.2-.4.2-.7.1-.3-.1-1.3-.5-2.5-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6.2-.2.4-.4.5-.6.2-.2.2-.4.3-.6.1-.2 0-.4-.1-.6-.1-.1-.8-1.9-1.1-2.7-.2-.5-.5-.5-.7-.5z"/>
    </svg>
  );
}


export function Layout() {
  const navigate = useNavigate();
  const { cart } = useCart();
  useLanguage(); // keep provider active for t() calls in child pages
  const cartCount = cart.reduce((s, e) => s + e.quantity, 0);

  const [token, setToken] = useState<string | null>(() => localStorage.getItem('online_token'));
  const [customerName, setCustomerName] = useState<string | null>(() => localStorage.getItem('online_customer_name'));
  const [menuOpen, setMenuOpen] = useState(false);

  // Validate token on mount — clear it if it's clearly stale (no customer name)
  useEffect(() => {
    const t = localStorage.getItem('online_token');
    const name = localStorage.getItem('online_customer_name');
    if (t && !name) {
      localStorage.removeItem('online_token');
      setToken(null);
    }
  }, []);

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
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--color-bg)' }}>

      {/* ── Header ─────────────────────────────────────────────── */}
      <header style={{
        position: 'sticky', top: 0,
        background: 'rgba(255, 251, 245, 0.94)',
        borderBottom: '1px solid var(--color-border)',
        zIndex: 100,
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
      }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 1.5rem', height: '68px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>

          {/* Logo — links to main website */}
          <a href="/" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', textDecoration: 'none', flexShrink: 0 }}>
            <img src="/logo.png" alt="Bake & Grill" style={{ width: '38px', height: '38px', borderRadius: '9px' }} />
            <span style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--color-dark)', letterSpacing: '-0.02em' }}>Bake &amp; Grill</span>
          </a>

          {/* Desktop Nav — main site links use <a>, order links use Link */}
          <nav style={{ display: 'flex', alignItems: 'center', gap: '0.125rem', flex: 1, marginLeft: '0.75rem' }} className="desktop-nav" aria-label="Main navigation">

            {/* ← Back to website — most prominent nav item */}
            <a
              href="/"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                padding: '0.45rem 0.875rem',
                borderRadius: '8px', fontSize: '0.875rem',
                fontWeight: 600, color: 'var(--color-primary)',
                textDecoration: 'none', transition: 'all 0.15s',
                background: 'var(--color-primary-light)',
                border: '1px solid rgba(217,119,6,0.2)',
                marginRight: '0.25rem',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-primary)'; e.currentTarget.style.color = 'white'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--color-primary-light)'; e.currentTarget.style.color = 'var(--color-primary)'; }}
            >
              ← Website
            </a>

            {/* Order app nav (React Router) */}
            <Link
              to="/menu"
              style={{ padding: '0.45rem 0.875rem', borderRadius: '8px', fontSize: '0.925rem', fontWeight: 500, color: 'var(--color-text-muted)', textDecoration: 'none', transition: 'all 0.15s' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-primary-light)'; e.currentTarget.style.color = 'var(--color-primary)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-muted)'; }}
            >
              Menu
            </Link>

            {/* Main site links — regular anchor tags */}
            {[
              { href: '/hours',   label: 'Hours' },
              { href: '/contact', label: 'Contact' },
            ].map(({ href, label }) => (
              <a
                key={href}
                href={href}
                style={{ padding: '0.45rem 0.875rem', borderRadius: '8px', fontSize: '0.925rem', fontWeight: 500, color: 'var(--color-text-muted)', textDecoration: 'none', transition: 'all 0.15s' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-primary-light)'; e.currentTarget.style.color = 'var(--color-primary)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-muted)'; }}
              >
                {label}
              </a>
            ))}
          </nav>

          {/* Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>

            {/* Only show account info when the customer is actually logged in */}
            {token && customerName && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: 500, maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} className="show-desktop">
                  Hi, {customerName}
                </span>
                <button
                  onClick={handleLogout}
                  style={{ padding: '0.35rem 0.7rem', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: '8px', fontSize: '0.8rem', color: 'var(--color-text-muted)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500, whiteSpace: 'nowrap' }}
                  aria-label="Log out"
                >
                  Sign out
                </button>
              </div>
            )}

            {/* Cart button */}
            <Link
              to="/menu"
              style={{
                display: 'flex', alignItems: 'center', gap: '0.35rem',
                padding: '0.5rem 1rem',
                background: 'var(--color-primary-light)',
                color: 'var(--color-primary)',
                border: '1.5px solid rgba(217,119,6,0.2)',
                borderRadius: '10px',
                fontSize: '0.875rem', fontWeight: 600,
                textDecoration: 'none', transition: 'all 0.15s',
                flexShrink: 0,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-primary)'; e.currentTarget.style.color = 'white'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--color-primary-light)'; e.currentTarget.style.color = 'var(--color-primary)'; }}
              aria-label={`Cart — ${cartCount} item${cartCount !== 1 ? 's' : ''}`}
            >
              🛒 Cart
              {cartCount > 0 && (
                <span style={{ background: 'var(--color-primary)', color: 'white', borderRadius: '999px', padding: '0.1rem 0.45rem', fontSize: '0.72rem', fontWeight: 700 }}>
                  {cartCount}
                </span>
              )}
            </Link>

            {/* Mobile menu toggle */}
            <button
              className="mobile-menu-btn"
              onClick={() => setMenuOpen((o) => !o)}
              style={{ display: 'none', background: 'none', border: 'none', cursor: 'pointer', padding: '0.35rem', color: 'var(--color-dark)', fontSize: '1.35rem', lineHeight: 1 }}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
            >
              {menuOpen ? '✕' : '☰'}
            </button>
          </div>
        </div>

        {/* Mobile dropdown nav */}
        {menuOpen && (
          <div style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-surface)', padding: '0.75rem 1.5rem 1rem' }}>
            {/* Back to main website — first and most visible */}
            <a
              href="/"
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 0', fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-primary)', textDecoration: 'none', borderBottom: '1px solid var(--color-border)' }}
            >
              ← Back to main website
            </a>
            {/* Menu (React Router) */}
            <Link
              to="/menu"
              onClick={() => setMenuOpen(false)}
              style={{ display: 'block', padding: '0.625rem 0', fontSize: '0.95rem', fontWeight: 500, color: 'var(--color-text)', textDecoration: 'none', borderBottom: '1px solid var(--color-border)' }}
            >
              Order Menu
            </Link>
            {/* Main site links */}
            {[
              { href: '/hours',   label: 'Opening Hours' },
              { href: '/contact', label: 'Contact Us' },
            ].map(({ href, label }) => (
              <a
                key={href}
                href={href}
                style={{ display: 'block', padding: '0.625rem 0', fontSize: '0.95rem', fontWeight: 500, color: 'var(--color-text)', textDecoration: 'none', borderBottom: '1px solid var(--color-border)' }}
              >
                {label}
              </a>
            ))}
          </div>
        )}
      </header>

      {/* Page content */}
      <main style={{ flex: 1 }} id="main-content">
        <Outlet />
      </main>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer style={{ background: 'var(--color-dark)', color: 'white', padding: '4rem 1.5rem 2rem', marginTop: '5rem' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '2.5rem',
            paddingBottom: '2.5rem',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
          }}>

            {/* Brand */}
            <div>
              <a href="/" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none', marginBottom: '0.875rem' }}>
                <img src="/logo.png" alt="" style={{ width: '34px', height: '34px', borderRadius: '8px' }} />
                <span style={{ fontSize: '1rem', fontWeight: 800, color: 'white', letterSpacing: '-0.02em' }}>Bake &amp; Grill</span>
              </a>
              <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.875rem', lineHeight: 1.65, marginBottom: '1.25rem' }}>
                Authentic Dhivehi cuisine, artisan pastries, and premium grills. Freshly made every day in Malé.
              </p>
              {/* WhatsApp + Viber */}
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <a
                  href="https://wa.me/9609120011"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', background: '#25D366', color: 'white', padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 700, textDecoration: 'none', transition: 'all 0.15s' }}
                  aria-label="WhatsApp"
                >
                  <WhatsAppIcon /> WhatsApp
                </a>
                <a
                  href="viber://chat?number=%2B9609120011"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', background: '#7360F2', color: 'white', padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 700, textDecoration: 'none', transition: 'all 0.15s' }}
                  aria-label="Viber"
                >
                  <ViberIcon /> Viber
                </a>
              </div>
            </div>

            {/* Quick links — mix of order app + main site */}
            <div>
              <h4 style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.35)', marginBottom: '1rem', fontWeight: 700 }}>
                Quick Links
              </h4>
              {/* React Router link for Menu */}
              <Link
                to="/menu"
                style={{ display: 'block', color: 'rgba(255,255,255,0.65)', fontSize: '0.875rem', marginBottom: '0.5rem', textDecoration: 'none' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'white'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.65)'; }}
              >
                Order Online
              </Link>
              {/* Main website links */}
              {[
                { href: '/',        label: 'Main Website' },
                { href: '/hours',   label: 'Opening Hours' },
                { href: '/contact', label: 'Contact Us' },
                { href: '/privacy', label: 'Privacy Policy' },
              ].map(({ href, label }) => (
                <a
                  key={href}
                  href={href}
                  style={{ display: 'block', color: 'rgba(255,255,255,0.65)', fontSize: '0.875rem', marginBottom: '0.5rem', textDecoration: 'none' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'white'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.65)'; }}
                >
                  {label}
                </a>
              ))}
            </div>

            {/* Location */}
            <div>
              <h4 style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.35)', marginBottom: '1rem', fontWeight: 700 }}>
                Location
              </h4>
              <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.875rem', marginBottom: '0.375rem' }}>Kalaafaanu Hingun</p>
              <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.875rem', marginBottom: '0.375rem' }}>Malé, Maldives</p>
              <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.875rem', marginBottom: '1rem' }}>Near H. Sahara</p>
              <a
                href="https://maps.google.com/?q=Kalaafaanu+Hingun+Male+Maldives"
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', textDecoration: 'none' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'white'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; }}
              >
                📍 Get directions
              </a>
            </div>

            {/* Contact */}
            <div>
              <h4 style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.35)', marginBottom: '1rem', fontWeight: 700 }}>
                Contact
              </h4>
              <a href="tel:+9609120011" style={{ display: 'block', color: 'rgba(255,255,255,0.65)', fontSize: '0.875rem', marginBottom: '0.5rem', textDecoration: 'none' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'white'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.65)'; }}
              >
                📞 +960 9120011
              </a>
              <a href="mailto:hello@bakeandgrill.mv" style={{ display: 'block', color: 'rgba(255,255,255,0.65)', fontSize: '0.875rem', marginBottom: '0.5rem', textDecoration: 'none' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'white'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.65)'; }}
              >
                ✉ hello@bakeandgrill.mv
              </a>
              <a
                href="https://wa.me/9609120011"
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'block', color: 'rgba(255,255,255,0.65)', fontSize: '0.875rem', marginBottom: '0.5rem', textDecoration: 'none' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'white'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.65)'; }}
              >
                💬 WhatsApp
              </a>
              <a
                href="viber://chat?number=%2B9609120011"
                style={{ display: 'block', color: 'rgba(255,255,255,0.65)', fontSize: '0.875rem', textDecoration: 'none' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'white'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.65)'; }}
              >
                📱 Viber
              </a>
            </div>
          </div>

          {/* Bottom bar */}
          <div style={{ paddingTop: '1.5rem', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', color: 'rgba(255,255,255,0.3)', fontSize: '0.8rem', alignItems: 'center' }}>
            <span>© {new Date().getFullYear()} Bake &amp; Grill. All rights reserved.</span>
            <div style={{ display: 'flex', gap: '1.25rem' }}>
              <a href="/privacy" style={{ color: 'rgba(255,255,255,0.3)', textDecoration: 'none' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.3)'; }}
              >
                Privacy Policy
              </a>
              <a href="/admin" style={{ color: 'rgba(255,255,255,0.15)', textDecoration: 'none', fontSize: '0.75rem' }}>
                Staff
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
