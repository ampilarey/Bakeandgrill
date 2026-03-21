import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchItems, fetchOpeningHoursStatus, API_ORIGIN } from '../api';
import type { Item, OpeningHoursStatus } from '../api';
import { WhatsAppIcon, ViberIcon } from '../components/icons';
import { usePageTitle } from '../hooks/usePageTitle';
import { useSiteSettingsContext } from '../context/SiteSettingsContext';
import { OpeningStatusBadge } from '../components/OpeningStatusBadge';
import { HeroCarousel } from '../components/HeroCarousel';

// ─── Category shortcuts data ──────────────────────────────────────────────────
const CATEGORIES = [
  { icon: '🥐', name: 'Hedhikaa', slug: 'hedhikaa', hook: 'Ready by 7am, made the right way', color: '#fef3e8' },
  { icon: '🍞', name: 'Fresh Bakes', slug: 'fresh-bakes', hook: 'Croissants that crackle. Baked at dawn.', color: '#fff7ed' },
  { icon: '🔥', name: 'Grills', slug: 'grills', hook: 'Proper char. Proper flavor.', color: '#fef2f2' },
  { icon: '🎂', name: 'Special Orders', slug: 'special-orders', hook: 'Cakes made to order. Call ahead.', color: '#fdf4ff' },
];

export function HomePage() {
  const [featuredItems, setFeaturedItems] = useState<Item[]>([]);
  const [isOpen, setIsOpen] = useState<boolean | null>(null);
  const [hoursMsg, setHoursMsg] = useState<string | null>(null);
  const [todayHours, setTodayHours] = useState<OpeningHoursStatus['today']>(null);
  const { settings: s, trustItems, heroSlides } = useSiteSettingsContext();

  const waLink    = s.business_whatsapp || 'https://wa.me/9609120011';
  const viberLink = s.business_viber   || 'viber://chat?number=9609120011';

  usePageTitle(null);

  useEffect(() => {
    fetchItems().then((res) => {
      setFeaturedItems(res.data.slice(0, 4));
    }).catch((e: unknown) => { console.error('Failed to load featured items', e); });

    fetchOpeningHoursStatus().then(({ open, message, today }) => {
      setIsOpen(open);
      setHoursMsg(message ?? null);
      setTodayHours(today ?? null);
    }).catch(() => setIsOpen(true));
  }, []);

  const statusBadge =
    isOpen !== null ? (
      <OpeningStatusBadge
        open={isOpen}
        today={todayHours}
        closedDetail={hoursMsg}
        className="opening-status-badge-hero"
        timeDisplay="24h"
      />
    ) : null;

  const gradientHeroFallback = (
    <section
      className="home-hero"
      style={{
        background: 'linear-gradient(135deg, var(--color-primary-light) 0%, #fff7ed 40%, var(--color-surface-alt) 100%)',
        borderBottom: '1px solid var(--color-border)',
        padding: '3.5rem var(--page-gutter) 3rem',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {statusBadge}
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>
        <span className="home-banner-eyebrow">Malé&apos;s neighbourhood café</span>
        <h1 className="home-banner-title">
          Where Dhivehi breakfast
          <br />
          meets <em>artisan baking</em>
        </h1>
        <p className="home-banner-sub">
          Real food. Proper char. Baked fresh every morning at 5am.
        </p>
        <div className="home-banner-ctas">
          <Link to="/menu" className="home-banner-cta-primary btn-primary-hover">
            Order Now →
          </Link>
          <Link to="/menu" className="home-banner-cta-secondary btn-ghost-hover">
            View Menu
          </Link>
        </div>
      </div>
    </section>
  );

  return (
    <div>

      <HeroCarousel
        slides={heroSlides}
        apiOrigin={API_ORIGIN}
        fallback={gradientHeroFallback}
        statusSlot={statusBadge}
      />

      {/* ── Trust strip (Blade .trust-strip parity) ───────────────────────── */}
      <div className="order-trust-strip">
        <div className="order-trust-inner">
          {trustItems.map((ti, i) => (
            <div key={i} className="order-trust-item">
              <div className="order-trust-icon-wrap">{ti.icon ?? ''}</div>
              <div className="order-trust-text">
                <strong>{ti.heading ?? ''}</strong>
                <span>{ti.subtext ?? ''}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Category shortcuts ────────────────────────────────── */}
      <section className="home-section" style={{ paddingLeft: 'var(--page-gutter)', paddingRight: 'var(--page-gutter)', maxWidth: 'var(--layout-max)', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-primary)', marginBottom: '0.4rem' }}>
            What we're known for
          </p>
          <h2 style={{ fontSize: 'clamp(1.4rem, 4vw, 2rem)', fontWeight: 800, color: 'var(--color-dark)', letterSpacing: '-0.03em' }}>
            Made for Malé
          </h2>
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1rem',
        }}>
          {CATEGORIES.map((cat) => (
            <Link
              key={cat.name}
              to={`/menu?category=${cat.slug}`}
              className="cat-card-hover"
              style={{
                display: 'block',
                background: cat.color,
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-2xl)',
                padding: '1.5rem',
                textDecoration: 'none',
              }}
            >
              <div style={{ fontSize: '2rem', marginBottom: '0.75rem', lineHeight: 1 }}>{cat.icon}</div>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-dark)', marginBottom: '0.35rem' }}>{cat.name}</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', lineHeight: 1.5, margin: 0 }}>{cat.hook}</p>
              <div style={{ marginTop: '0.875rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-primary)' }}>
                Order →
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Popular Items ─────────────────────────────────────── */}
      {featuredItems.length > 0 && (
        <section className="home-section" style={{ background: 'var(--color-surface-alt)', paddingLeft: 'var(--page-gutter)', paddingRight: 'var(--page-gutter)', borderTop: '1px solid var(--color-border)' }}>
          <div style={{ maxWidth: 'var(--layout-max)', margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
              <div>
                <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-primary)', marginBottom: '0.25rem' }}>
                  🔥 Most ordered
                </p>
                <h2 style={{ fontSize: 'clamp(1.3rem, 3.5vw, 1.75rem)', fontWeight: 800, color: 'var(--color-dark)', letterSpacing: '-0.03em', margin: 0 }}>
                  Popular right now
                </h2>
              </div>
              <Link
                to="/menu"
                style={{ color: 'var(--color-primary)', fontWeight: 600, fontSize: 'var(--text-base)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
              >
                See full menu →
              </Link>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' }}>
              {featuredItems.map((item) => {
                const imgSrc = item.image_url
                  ? item.image_url.startsWith('http') ? item.image_url : `${API_ORIGIN}${item.image_url.startsWith('/') ? '' : '/'}${item.image_url}`
                  : null;
                return (
                  <Link
                    key={item.id}
                    to={`/menu?item=${item.id}`}
                    className="feat-card-hover"
                    style={{
                      textDecoration: 'none',
                      display: 'flex', flexDirection: 'column',
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-2xl)',
                      overflow: 'hidden',
                    }}
                  >
                    <div style={{
                      height: '150px', flexShrink: 0, overflow: 'hidden',
                      background: imgSrc ? undefined : 'linear-gradient(135deg, var(--color-primary-light), #f7e0c4)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {imgSrc ? (
                        <img src={imgSrc} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" decoding="async" />
                      ) : (
                        <span style={{ fontSize: '2.5rem', opacity: 0.4 }}>🍽️</span>
                      )}
                    </div>
                    <div style={{ padding: '0.875rem 1rem' }}>
                      <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--color-text)', marginBottom: '0.375rem', lineHeight: 1.3 }}>
                        {item.name}
                      </h3>
                      <p style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--color-primary)', margin: 0 }}>
                        MVR {Number(item.base_price).toFixed(2)}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ── Chat with us ──────────────────────────────────────── */}
      <section className="home-section" style={{
        paddingLeft: 'var(--page-gutter)',
        paddingRight: 'var(--page-gutter)',
        borderTop: '1px solid var(--color-border)',
        background: 'var(--color-surface)',
      }}>
        <div className="chat-block" style={{ maxWidth: '440px', margin: '0 auto' }}>
          <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>💬</p>
          <p className="chat-block-heading">Questions? We reply fast.</p>
          <p className="chat-block-sub" style={{ marginBottom: '1.25rem' }}>
            Reach us on WhatsApp or Viber — usually within 10 minutes.
          </p>
          <div className="chat-btns">
            <a
              href={waLink}
              target="_blank"
              rel="noopener noreferrer"
              className="chat-btn chat-btn-wa"
              aria-label="Chat on WhatsApp"
            >
              <WhatsAppIcon /> WhatsApp
            </a>
            <a
              href={viberLink}
              className="chat-btn chat-btn-viber"
              aria-label="Chat on Viber"
            >
              <ViberIcon /> Viber
            </a>
          </div>
        </div>
      </section>

      {/* ── Browse menu CTA ───────────────────────────────────── */}
      <section className="home-section" style={{ background: 'var(--color-footer-bg)', paddingLeft: 'var(--page-gutter)', paddingRight: 'var(--page-gutter)', textAlign: 'center' }}>
        <div style={{ maxWidth: '520px', margin: '0 auto' }}>
          <h2 style={{ fontSize: 'clamp(1.4rem, 4vw, 2rem)', fontWeight: 800, color: 'white', marginBottom: '0.75rem', letterSpacing: '-0.03em' }}>
            Hungry? Browse the menu.
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 'var(--text-body)', marginBottom: '1.75rem', lineHeight: 1.65 }}>
            Order in seconds — no app needed.
          </p>
          <Link
            to="/menu"
            className="btn-primary-hover"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
              background: 'var(--color-primary)',
              color: 'white',
              padding: '0.875rem 2.25rem',
              borderRadius: 'var(--radius-full)',
              fontWeight: 700, fontSize: 'var(--text-md)',
              boxShadow: '0 4px 18px var(--color-primary-glow)',
              textDecoration: 'none',
            }}
          >
            Browse Full Menu →
          </Link>
        </div>
      </section>

    </div>
  );
}
