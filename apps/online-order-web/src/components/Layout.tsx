import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';
import { useSiteSettings } from '../context/SiteSettingsContext';
import { useAuth } from '../context/AuthContext';
import { PrayerBar } from './PrayerBar';
import { OrderStatusBar } from './OrderStatusBar';
import { WhatsAppIcon, ViberIcon, HomeIcon, MenuIcon, CartIcon, PreOrderIcon, ClockIcon, PhoneIcon } from './icons';
import { getCustomerMe } from '../api';


export function Layout() {
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
          const raw = r.customer.phone ?? r.customer.name ?? '';
          const n = r.customer.phone ? raw.replace(/^\+?960/, '') : raw;
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

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--color-bg)' }}>

      {/* A11Y-02: Skip to content link (visible on focus) */}
      <a href="#main-content" className="skip-link">Skip to content</a>

      {/* ── Header ─────────────────────────────────────────────── */}
      <header
        className="order-app-header"
        style={{
          position: 'sticky', top: 0,
          borderBottom: '1px solid var(--color-border)',
          zIndex: 'var(--z-header)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
        }}
      >
        <div className="order-header-inner" style={{ justifyContent: 'space-between' }}>

          {/* Logo — links to main website */}
          <a href="/" className="order-header-brand" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', textDecoration: 'none', flexShrink: 0 }}>
            <img src={logoUrl} alt={siteName} className="order-header-brand-logo" style={{ width: '38px', height: '38px', borderRadius: '9px' }} fetchPriority="high" decoding="async" />
            <span className="order-header-brand-name" style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--color-dark)', letterSpacing: '-0.02em' }}>{siteName}</span>
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
                    zIndex: 'var(--z-dropdown)',
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
              style={{ background: 'var(--color-surface-alt)', border: '1.5px solid var(--color-border)', borderRadius: '8px', width: '40px', height: '40px', cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
              aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              title={darkMode ? 'Light mode' : 'Dark mode'}
            >
              {darkMode ? '☀️' : '🌙'}
            </button>

            {/* Logged-in customer — "Hi, number" pill links to account on all screen sizes */}
            {token && (
              <div className="order-header-account" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                {/* Desktop: "Hi, name" text + My Account link */}
                {customerName && (
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: 500, maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} className="show-desktop">
                    Hi, {customerName}
                  </span>
                )}
                <Link
                  to="/account"
                  style={{ padding: '0.35rem 0.7rem', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: '8px', fontSize: '0.8rem', color: 'var(--color-text-muted)', fontFamily: 'inherit', fontWeight: 500, whiteSpace: 'nowrap', textDecoration: 'none' }}
                  className="show-desktop"
                >
                  My Account
                </Link>
                {/* Mobile: tappable pill showing phone number → account */}
                <Link
                  to="/account"
                  className="show-mobile"
                  style={{ alignItems: 'center', gap: '0.3rem', padding: '0.3rem 0.65rem', background: 'var(--color-surface-alt)', border: '1px solid var(--color-border)', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', textDecoration: 'none', whiteSpace: 'nowrap' }}
                  aria-label="My account"
                >
                  👤 {customerName ?? 'Account'}
                </Link>
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
          </div>
        </div>

      </header>

      {/* ── Order status bar — below header, same as main website on mobile ── */}
      <OrderStatusBar />

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
            <Link to="/account">My Account</Link>
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
            to="/pre-order"
            className={`order-mob-item order-mob-preorder${location.pathname === '/pre-order' ? ' order-mob-active' : ''}`}
          >
            <span className="order-mob-icon"><PreOrderIcon size={20} /></span>
            Pre-order
          </Link>
          <a href="/hours" className={`order-mob-item${location.pathname === '/hours' ? ' order-mob-active' : ''}`}>
            <span className="order-mob-icon"><ClockIcon size={20} /></span>
            Hours
          </a>
          <a href="/contact" className={`order-mob-item${location.pathname === '/contact' ? ' order-mob-active' : ''}`}>
            <span className="order-mob-icon"><PhoneIcon size={20} /></span>
            Contact
          </a>
        </div>
      </nav>
    </div>
  );
}
