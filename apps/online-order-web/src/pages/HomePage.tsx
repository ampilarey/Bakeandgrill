import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchItems, fetchOpeningHoursStatus, API_ORIGIN } from '../api';
import { BIZ } from '../constants/biz';
import type { Item } from '../api';

// ─── WhatsApp + Viber SVG icons ───────────────────────────────────────────────
function WhatsAppIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}
function ViberIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M11.4 0C5.7.3 1.2 4.8.9 10.5c-.2 3.4.8 6.5 2.7 8.9L2.2 24l4.8-1.4c1.4.7 3 1.1 4.7 1.1 6.1 0 11.1-5 11.1-11.1S17.9 0 11.8 0h-.4zm.5 2c5.1 0 9.1 4 9.1 9.1s-4 9.1-9.1 9.1c-1.6 0-3.2-.4-4.5-1.2l-.3-.2-3 .9.9-2.9-.2-.3C3.7 15.2 3.1 13.1 3.1 11 3.1 5.9 7.2 2 12.1 2h-.2zm-.8 3.2c-.3 0-.8.1-1.2.5C9.5 6.3 8.8 7 8.8 8.5s1 3 1.2 3.2c.2.2 2 3 4.8 4.2.7.3 1.2.4 1.6.5.7.2 1.3.1 1.8-.1.5-.3 1.6-1.5 1.8-2.3.2-.7.1-1.3-.1-1.5-.1-.2-.4-.3-.8-.5s-2.3-1.1-2.6-1.2c-.3-.1-.6-.2-.8.2-.2.3-.9 1.1-1.1 1.3-.2.2-.4.2-.7.1-.3-.1-1.3-.5-2.5-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6.2-.2.4-.4.5-.6.2-.2.2-.4.3-.6.1-.2 0-.4-.1-.6-.1-.1-.8-1.9-1.1-2.7-.2-.5-.5-.5-.7-.5z"/>
    </svg>
  );
}

// ─── Category shortcuts data ──────────────────────────────────────────────────
const CATEGORIES = [
  { icon: '🥐', name: 'Hedhikaa', hook: 'Ready by 7am, made the right way', color: '#fef3e8' },
  { icon: '🍞', name: 'Fresh Bakes', hook: 'Croissants that crackle. Baked at dawn.', color: '#fff7ed' },
  { icon: '🔥', name: 'Grills', hook: 'Proper char. Proper flavor.', color: '#fef2f2' },
  { icon: '🎂', name: 'Special Orders', hook: 'Cakes made to order. Call ahead.', color: '#fdf4ff' },
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

  useEffect(() => {
    document.title = 'Bake & Grill — Dhivehi Breakfast & Artisan Baking';
  }, []);

  useEffect(() => {
    fetchItems().then((res) => {
      setFeaturedItems(res.data.slice(0, 4));
    }).catch(() => {});

    fetchOpeningHoursStatus().then(({ open, message }) => {
      setIsOpen(open);
      setHoursMsg(message ?? null);
    }).catch(() => setIsOpen(true));
  }, []);

  return (
    <div>

      {/* ── Hero ──────────────────────────────────────────────── */}
      <section style={{
        background: 'var(--color-surface-alt)',
        borderBottom: '1px solid var(--color-border)',
        padding: '3rem 1.5rem 2.75rem',
        textAlign: 'center',
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
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                background: 'var(--color-primary)',
                color: 'white',
                padding: '0.9rem 2rem',
                borderRadius: 'var(--radius-full)',
                fontWeight: 700, fontSize: '1rem',
                boxShadow: '0 4px 16px var(--color-primary-glow)',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-primary-hover)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--color-primary)'; e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              Order Now →
            </Link>
            <Link
              to="/menu"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                background: 'transparent',
                color: 'var(--color-text)',
                padding: '0.9rem 2rem',
                borderRadius: 'var(--radius-full)',
                fontWeight: 600, fontSize: '1rem',
                border: '1.5px solid var(--color-border)',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-primary)'; e.currentTarget.style.color = 'var(--color-primary)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-text)'; }}
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
              to="/menu"
              style={{
                display: 'block',
                background: cat.color,
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-2xl)',
                padding: '1.5rem',
                textDecoration: 'none',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 12px 32px rgba(28,20,8,0.1)'; e.currentTarget.style.borderColor = 'var(--color-primary)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = 'var(--color-border)'; }}
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
                    to="/menu"
                    style={{
                      textDecoration: 'none',
                      display: 'flex', flexDirection: 'column',
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-2xl)',
                      overflow: 'hidden',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 10px 28px rgba(28,20,8,0.1)'; e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.borderColor = 'rgba(217,119,6,0.4)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = 'var(--color-border)'; }}
                  >
                    {/* Image */}
                    <div style={{
                      height: '150px', flexShrink: 0, overflow: 'hidden',
                      background: imgSrc ? undefined : 'linear-gradient(135deg, var(--color-primary-light), #f7e0c4)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {imgSrc ? (
                        <img src={imgSrc} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
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
                        MVR {parseFloat(String(item.base_price)).toFixed(2)}
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
              href={BIZ.whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="chat-btn chat-btn-wa"
              aria-label="Chat on WhatsApp"
            >
              <WhatsAppIcon /> WhatsApp
            </a>
            <a
              href={BIZ.viber}
              className="chat-btn chat-btn-viber"
              aria-label="Chat on Viber"
            >
              <ViberIcon /> Viber
            </a>
          </div>
        </div>
      </section>

      {/* ── Browse menu CTA ───────────────────────────────────── */}
      <section style={{ background: 'var(--color-dark)', padding: '3rem 1.5rem', textAlign: 'center' }}>
        <div style={{ maxWidth: '520px', margin: '0 auto' }}>
          <h2 style={{ fontSize: 'clamp(1.4rem, 4vw, 2rem)', fontWeight: 800, color: 'white', marginBottom: '0.75rem', letterSpacing: '-0.03em' }}>
            Hungry? Browse the menu.
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.9375rem', marginBottom: '1.75rem', lineHeight: 1.65 }}>
            Order in seconds — no app needed.
          </p>
          <Link
            to="/menu"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
              background: 'var(--color-primary)',
              color: 'white',
              padding: '0.875rem 2.25rem',
              borderRadius: 'var(--radius-full)',
              fontWeight: 700, fontSize: '1rem',
              boxShadow: '0 4px 18px var(--color-primary-glow)',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-primary-hover)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--color-primary)'; e.currentTarget.style.transform = 'translateY(0)'; }}
          >
            Browse Full Menu →
          </Link>
        </div>
      </section>

    </div>
  );
}
