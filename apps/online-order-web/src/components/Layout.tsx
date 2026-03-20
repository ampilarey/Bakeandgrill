import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';
import { useSiteSettings } from '../context/SiteSettingsContext';
import { useAuth } from '../context/AuthContext';
import { PrayerBar } from './PrayerBar';
import { WhatsAppIcon, ViberIcon, HomeIcon, MenuIcon, CartIcon, PhoneIcon, OrdersIcon } from './icons';
import { getCustomerMe } from '../api';


export function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { cart } = useCart();
  useLanguage(); // keep provider active for t() calls in child pages
  const cartCount = cart.reduce((s, e) => s + e.quantity, 0);
  const s = useSiteSettings();

  const siteName   = s.site_name        || 'Bake & Grill';
  const siteTagline= s.site_tagline     || 'Authentic Dhivehi cuisine, artisan pastries, and expertly grilled specialties — freshly made every day in the heart of Malé.';
  const logoUrl    = s.logo             || '/logo.png';
  const phone      = s.business_phone   || '+960 912 0011';
  const phoneTel   = 'tel:' + phone.replace(/[^+\d]/g, '');
  const email      = s.business_email   || 'hello@bakeandgrill.mv';
  const address    = s.business_address || 'Kalaafaanu Hingun, Malé, Maldives';
  const landmark   = s.business_landmark|| 'Near H. Sahara';
  const mapsUrl    = s.business_maps_url|| 'https://maps.google.com/?q=Kalaafaanu+Hingun+Male+Maldives';
  const waLink     = s.business_whatsapp|| 'https://wa.me/9609120011';
  const viberLink  = s.business_viber   || 'viber://chat?number=9609120011';

  // Split address into line1 / city for the footer
  const addrParts  = address.split(',');
  const addrLine1  = addrParts[0]?.trim() || address;
  const addrCity   = addrParts.slice(1).join(',').trim() || 'Maldives';

  const { token, customerName, clearAuth } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('theme') === 'dark');

  // If token exists but name is missing, hydrate from API
  useEffect(() => {
    let cancelled = false;
    const existingToken = localStorage.getItem('online_token');
    const existingName  = localStorage.getItem('online_customer_name');
    if (existingToken && !existingName) {
      getCustomerMe(existingToken)
        .then((r) => {
          if (cancelled) return;
          const n = r.customer.name ?? r.customer.phone ?? '';
          if (n) {
            localStorage.setItem('online_customer_name', n);
            window.dispatchEvent(new Event('auth_change'));
          }
        })
        .catch(() => {
          if (cancelled) return;
          clearAuth();
        });
    }
    return () => { cancelled = true; };
  }, [clearAuth]);

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? 'dark' : '';
    localStorage.setItem('theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  // Close "More" dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = () => {
    clearAuth();
    navigate('/');
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--color-bg)' }}>

      {/* A11Y-02: Skip to content link (visible on focus) */}
      <a href="#main-content" className="skip-link">Skip to content</a>

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
            <img src={logoUrl} alt={siteName} style={{ width: '38px', height: '38px', borderRadius: '9px' }} fetchPriority="high" decoding="async" />
            <span style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--color-dark)', letterSpacing: '-0.02em' }}>{siteName}</span>
          </a>

          {/* Desktop Nav */}
          <nav style={{ display: 'flex', alignItems: 'center', gap: '0.125rem', flex: 1, marginLeft: '0.75rem', minWidth: 0 }} className="desktop-nav" aria-label="Main navigation">

            {[
              { to: '/menu',      label: 'Menu' },
              { to: '/pre-order', label: 'Pre-Order' },
            ].map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                className="nav-link-hover"
                style={{ padding: '0.45rem 0.875rem', borderRadius: '8px', fontSize: '0.925rem', fontWeight: 500, color: 'var(--color-text-muted)', textDecoration: 'none' }}
              >
                {label}
              </Link>
            ))}

            {/* More dropdown — Hours & Contact */}
            <div ref={moreRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setMoreOpen((o) => !o)}
                className="nav-link-hover"
                style={{ padding: '0.45rem 0.75rem', borderRadius: '8px', fontSize: '0.925rem', fontWeight: 500, color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                aria-expanded={moreOpen}
                aria-haspopup="menu"
              >
                More
                <span style={{ fontSize: '0.6rem', opacity: 0.6, transition: 'transform 0.15s', transform: moreOpen ? 'rotate(180deg)' : 'none' }}>▼</span>
              </button>

              {moreOpen && (
                <div
                  role="menu"
                  style={{
                    position: 'absolute', top: 'calc(100% + 6px)', left: 0,
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '12px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
                    minWidth: '140px',
                    zIndex: 200,
                    overflow: 'hidden',
                    padding: '0.375rem',
                  }}
                >
                  {[
                    { href: '/hours',   label: '🕐  Hours' },
                    { href: '/contact', label: '📞  Contact' },
                  ].map(({ href, label }) => (
                    <a
                      key={href}
                      href={href}
                      role="menuitem"
                      onClick={() => setMoreOpen(false)}
                      style={{ display: 'block', padding: '0.55rem 0.875rem', borderRadius: '8px', fontSize: '0.9rem', fontWeight: 500, color: 'var(--color-text)', textDecoration: 'none', transition: 'background 0.12s' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface-alt)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      {label}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </nav>

          {/* Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
            <PrayerBar />

            {/* Dark mode toggle */}
            <button
              onClick={() => setDarkMode((d) => !d)}
              style={{ background: 'var(--color-surface-alt)', border: '1.5px solid var(--color-border)', borderRadius: '8px', width: '36px', height: '36px', cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
              aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              title={darkMode ? 'Light mode' : 'Dark mode'}
            >
              {darkMode ? '☀️' : '🌙'}
            </button>

            {/* Logged-in customer — show actions whenever we have a token (name may hydrate async) */}
            {token && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexWrap: 'wrap' }}>
                <Link
                  to="/order-history"
                  className="nav-link-hover order-history-header-btn"
                  style={{
                    padding: '0.4rem 0.65rem',
                    borderRadius: '8px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: 'var(--color-primary)',
                    textDecoration: 'none',
                    border: '1px solid rgba(217,119,6,0.35)',
                    background: 'var(--color-primary-light)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  My orders
                </Link>
                {customerName ? (
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: 500, maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} className="show-desktop">
                    Hi, {customerName}
                  </span>
                ) : null}
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
              to="/menu?openCart=1"
              className="nav-pill-hover"
              style={{
                display: 'flex', alignItems: 'center', gap: '0.35rem',
                padding: '0.5rem 1rem',
                background: 'var(--color-primary-light)',
                color: 'var(--color-primary)',
                border: '1.5px solid rgba(217,119,6,0.2)',
                borderRadius: '10px',
                fontSize: '0.875rem', fontWeight: 600,
                textDecoration: 'none',
                flexShrink: 0,
              }}
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
            {/* Menu + Pre-Order (React Router) */}
            {[
              { to: '/menu',      label: 'Order Menu' },
              { to: '/pre-order', label: 'Pre-Order (Events)' },
            ].map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                onClick={() => setMenuOpen(false)}
                style={{ display: 'block', padding: '0.625rem 0', fontSize: '0.95rem', fontWeight: 500, color: 'var(--color-text)', textDecoration: 'none', borderBottom: '1px solid var(--color-border)' }}
              >
                {label}
              </Link>
            ))}
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

      {/* Mobile prayer strip portal target */}
      <div id="prayer-strip-root" />

      {/* Page content */}
      <main style={{ flex: 1 }} id="main-content">
        <Outlet />
      </main>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="order-footer">
        <div className="order-footer-grid">

          {/* ── Brand (double width on desktop) ── */}
          <div className="order-footer-brand">
            <a href="/" className="order-footer-logo">
              <img src={logoUrl} alt={siteName} />
              {siteName}
            </a>
            <p>{siteTagline}</p>
            <div className="order-footer-btns">
              <a href={waLink} target="_blank" rel="noopener noreferrer" className="order-footer-wa" aria-label="Chat on WhatsApp">
                <WhatsAppIcon /> WhatsApp
              </a>
              <a href={viberLink} className="order-footer-viber" aria-label="Chat on Viber">
                <ViberIcon /> Viber
              </a>
            </div>
          </div>

          {/* ── Quick Links ── */}
          <div className="order-footer-col">
            <h4>Quick Links</h4>
            <a href="/">Home</a>
            <Link to="/menu">Order Online</Link>
            <Link to="/pre-order">Pre-Order (Events)</Link>
            <Link to="/order-history">Order History</Link>
            <a href="/hours">Opening Hours</a>
            <a href="/contact">Contact Us</a>
          </div>

          {/* ── Location ── */}
          <div className="order-footer-col">
            <h4>Location</h4>
            <p>{addrLine1}</p>
            <p>{addrCity}</p>
            {landmark && <p>{landmark}</p>}
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer">📍 Get directions</a>
          </div>

          {/* ── Contact ── */}
          <div className="order-footer-col">
            <h4>Contact</h4>
            <a href={phoneTel}>📞 {phone}</a>
            <a href={`mailto:${email}`}>✉ {email}</a>
            <div className="order-footer-legal">
              <Link to="/privacy">Privacy Policy</Link>
              <a href="/terms">Terms &amp; Conditions</a>
              <a href="/refund">Refund Policy</a>
              <a href="/admin" className="order-footer-staff">Staff Dashboard</a>
            </div>
          </div>
        </div>

        {/* ── Bottom bar ── */}
        <div className="order-footer-bottom">
          <span>© {new Date().getFullYear()} {siteName}. All rights reserved.</span>
          <span>{addrCity}</span>
        </div>
      </footer>

      {/* ── Mobile Bottom Navigation (visible ≤768 px) ─────────── */}
      <nav className="order-mobile-nav" aria-label="Mobile navigation">
        <div className="order-mob-grid">
          <a href="/" className={`order-mob-item${location.pathname === '/' ? ' order-mob-active' : ''}`}>
            <span className="order-mob-icon"><HomeIcon size={20} /></span>
            Home
          </a>
          <Link
            to="/menu"
            className={`order-mob-item${location.pathname === '/menu' ? ' order-mob-active' : ''}`}
          >
            <span className="order-mob-icon"><MenuIcon size={20} /></span>
            Menu
          </Link>
          <Link
            to="/menu?openCart=1"
            className="order-mob-item order-mob-order"
            aria-label={`Cart${cartCount > 0 ? ` — ${cartCount}` : ''}`}
          >
            <span className="order-mob-icon" style={{ position: 'relative' }}>
              <CartIcon size={20} />
              {cartCount > 0 && (
                <span style={{ position: 'absolute', top: '-6px', right: '-6px', background: 'var(--color-primary)', color: 'white', borderRadius: '999px', fontSize: '0.6rem', fontWeight: 700, padding: '0 0.3rem', minWidth: '14px', textAlign: 'center', lineHeight: '14px' }}>
                  {cartCount}
                </span>
              )}
            </span>
            {cartCount > 0 ? 'Cart' : 'Order'}
          </Link>
          <Link
            to="/order-history"
            className={`order-mob-item${location.pathname === '/order-history' ? ' order-mob-active' : ''}`}
          >
            <span className="order-mob-icon"><OrdersIcon size={20} /></span>
            Orders
          </Link>
          <a href="/contact" className="order-mob-item">
            <span className="order-mob-icon"><PhoneIcon size={20} /></span>
            Contact
          </a>
        </div>
      </nav>
    </div>
  );
}
