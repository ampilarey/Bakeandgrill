import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchItems, fetchOpeningHoursStatus, API_ORIGIN } from '../api';
import type { Item } from '../api';
import { WhatsAppIcon, ViberIcon } from '../components/icons';
import { usePageTitle } from '../hooks/usePageTitle';
import { useSiteSettings } from '../context/SiteSettingsContext';

// ─── Category shortcuts data ──────────────────────────────────────────────────
const CATEGORIES = [
  { icon: '🥐', name: 'Hedhikaa', slug: 'hedhikaa', hook: 'Ready by 7am, made the right way', color: '#fef3e8' },
  { icon: '🍞', name: 'Fresh Bakes', slug: 'fresh-bakes', hook: 'Croissants that crackle. Baked at dawn.', color: '#fff7ed' },
  { icon: '🔥', name: 'Grills', slug: 'grills', hook: 'Proper char. Proper flavor.', color: '#fef2f2' },
  { icon: '🎂', name: 'Special Orders', slug: 'special-orders', hook: 'Cakes made to order. Call ahead.', color: '#fdf4ff' },
];

const TRUST_CHIPS = [
  { icon: '🌅', text: 'Baked at 5am daily' },
  { icon: '⚡', text: '30–45 min delivery' },
  { icon: '🏠', text: 'Family-owned' },
  { icon: '💳', text: 'BML + Cash on delivery' },
];

export function HomePage() {
  const [featuredItems, setFeaturedItems] = useState<Item[]>([]);
  const [isOpen, setIsOpen] = useState<boolean | null>(null);
  const [hoursMsg, setHoursMsg] = useState<string | null>(null);
  const s = useSiteSettings();

  const waLink    = s.business_whatsapp || 'https://wa.me/9609120011';
  const viberLink = s.business_viber   || 'viber://chat?number=9609120011';

  usePageTitle(null);

  useEffect(() => {
    fetchItems().then((res) => {
      setFeaturedItems(res.data.slice(0, 4));
    }).catch((e: unknown) => { console.error('Failed to load featured items', e); });

    fetchOpeningHoursStatus().then(({ open, message }) => {
      setIsOpen(open);
      setHoursMsg(message ?? null);
    }).catch(() => setIsOpen(true));
  }, []);

  return (
    <div>

      {/* ── Hero ──────────────────────────────────────────────── */}
      <section style={{
        background: 'linear-gradient(135deg, var(--color-primary-light) 0%, #fff7ed 40%, var(--color-surface-alt) 100%)',
        borderBottom: '1px solid var(--color-border)',
        padding: '3.5rem 1.5rem 3rem',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>

          {/* Status badge */}
          {isOpen !== null && (
            <div style={{ marginBottom: '1.5rem' }}>
              <span className={`status-chip ${isOpen ? 'status-open' : 'status-closed'}`}>
                <span className="status-chip-dot" />
                {isOpen ? 'Open now' : (hoursMsg ?? 'Currently closed')}
              </span>
            </div>
          )}

          <h1 style={{
            fontSize: 'clamp(1.875rem, 6vw, 3rem)',
            fontWeight: 800,
            lineHeight: 1.1,
            letterSpacing: '-0.035em',
            color: 'var(--color-dark)',
            marginBottom: '0.875rem',
          }}>
            Where Dhivehi breakfast<br />
            <span style={{ color: 'var(--color-primary)' }}>meets artisan baking</span>
          </h1>

          <p style={{
            fontSize: 'clamp(1rem, 2.5vw, 1.1rem)',
            color: 'var(--color-text-muted)',
            lineHeight: 1.7,
            maxWidth: '480px',
            margin: '0 auto 2rem',
          }}>
            Real food. Proper char. Baked fresh every morning in the heart of Malé.
          </p>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link
              to="/menu"
              className="btn-primary-hover"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                background: 'var(--color-primary)',
                color: 'white',
                padding: '0.9rem 2rem',
                borderRadius: 'var(--radius-full)',
                fontWeight: 700, fontSize: '1rem',
                boxShadow: '0 4px 16px var(--color-primary-glow)',
                textDecoration: 'none',
              }}
            >
              Order Now →
            </Link>
            <Link
              to="/menu"
              className="btn-ghost-hover"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                background: 'transparent',
                color: 'var(--color-text)',
                padding: '0.9rem 2rem',
                borderRadius: 'var(--radius-full)',
                fontWeight: 600, fontSize: '1rem',
                border: '1.5px solid var(--color-border)',
                textDecoration: 'none',
              }}
            >
              Browse Menu
            </Link>
          </div>
        </div>
      </section>

      {/* ── Trust chips ───────────────────────────────────────── */}
      <div style={{
        background: 'var(--color-surface)',
        borderBottom: '1px solid var(--color-border)',
        padding: '0.875rem 1.5rem',
        overflowX: 'auto',
      }}>
        <div style={{
          display: 'flex', gap: '0.625rem',
          justifyContent: 'center',
          flexWrap: 'wrap',
          maxWidth: '900px', margin: '0 auto',
        }}>
          {TRUST_CHIPS.map((chip) => (
            <div key={chip.text} className="trust-chip">
              <span className="trust-chip-icon">{chip.icon}</span>
              {chip.text}
            </div>
          ))}
        </div>
      </div>

      {/* ── Category shortcuts ────────────────────────────────── */}
      <section style={{ padding: '2.5rem 1.5rem', maxWidth: '1100px', margin: '0 auto' }}>
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
        <section style={{ background: 'var(--color-surface-alt)', padding: '2.5rem 1.5rem', borderTop: '1px solid var(--color-border)' }}>
          <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
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
                style={{ color: 'var(--color-primary)', fontWeight: 600, fontSize: '0.875rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
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
                    {/* Image */}
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
                    {/* Info */}
                    <div style={{ padding: '0.875rem 1rem' }}>
                      <h3 style={{ fontSize: '0.925rem', fontWeight: 600, color: 'var(--color-text)', marginBottom: '0.375rem', lineHeight: 1.3 }}>
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
      <section style={{
        padding: '2.5rem 1.5rem',
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
      <section style={{ background: 'var(--color-footer-bg)', padding: '3rem 1.5rem', textAlign: 'center' }}>
        <div style={{ maxWidth: '520px', margin: '0 auto' }}>
          <h2 style={{ fontSize: 'clamp(1.4rem, 4vw, 2rem)', fontWeight: 800, color: 'white', marginBottom: '0.75rem', letterSpacing: '-0.03em' }}>
            Hungry? Browse the menu.
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.9375rem', marginBottom: '1.75rem', lineHeight: 1.65 }}>
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
              fontWeight: 700, fontSize: '1rem',
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
