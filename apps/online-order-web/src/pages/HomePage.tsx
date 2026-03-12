import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchItems, fetchOpeningHoursStatus, API_ORIGIN } from '../api';
import type { Item } from '../api';

const FEATURES = [
  { initial: 'F', color: '#D4813A', title: 'Fresh Every Day', desc: 'Baked and grilled fresh each morning — no pre-made shortcuts.' },
  { initial: 'O', color: '#D4813A', title: 'Order Online', desc: 'Browse the menu and place your order in seconds, no app required.' },
  { initial: 'R', color: '#D4813A', title: 'Reserve a Table', desc: 'Book a spot ahead of time and arrive to a ready table.' },
  { initial: 'T', color: '#D4813A', title: 'Dine-In & Takeaway', desc: 'Enjoy your meal with us or take it home — your choice.' },
];

export function HomePage() {
  const [featuredItems, setFeaturedItems] = useState<Item[]>([]);
  const [isOpen, setIsOpen] = useState<boolean | null>(null);
  const [hoursMsg, setHoursMsg] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Bake & Grill — Fresh Food in Malé';
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
      {/* Hero */}
      <section style={{
        background: 'linear-gradient(135deg, #D4813A 0%, #B86820 50%, #1C1408 100%)',
        color: 'white',
        padding: '5rem 1.5rem 4rem',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(255,255,255,0.05) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(255,255,255,0.07) 0%, transparent 40%)', pointerEvents: 'none' }} />

        <div style={{ maxWidth: '760px', margin: '0 auto', position: 'relative' }}>
          {/* Status badge */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.12)', borderRadius: '999px', padding: '0.35rem 1rem', marginBottom: '1.5rem', fontSize: '0.85rem', fontWeight: 500 }}>
            {isOpen === null ? (
              <span>Checking status…</span>
            ) : isOpen ? (
              <><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#4caf50', display: 'inline-block' }} />Open Now</>
            ) : (
              <><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ff7043', display: 'inline-block' }} />{hoursMsg ?? 'Currently Closed'}</>
            )}
          </div>

          <h1 style={{ fontSize: 'clamp(2rem, 6vw, 3.5rem)', fontWeight: 800, lineHeight: 1.1, marginBottom: '1.25rem', letterSpacing: '-0.02em' }}>
            Fresh Bakes &amp;<br />
            <span style={{ color: '#fbbf24' }}>Grill Favourites</span>
          </h1>
          <p style={{ fontSize: 'clamp(1rem, 2.5vw, 1.2rem)', opacity: 0.85, lineHeight: 1.65, maxWidth: '560px', margin: '0 auto 2.5rem' }}>
            Authentic Dhivehi flavours, freshly baked pastries, and perfectly grilled dishes — right in the heart of Malé.
          </p>

          <div style={{ display: 'flex', gap: '0.875rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link
              to="/menu"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                background: 'white',
                color: '#D4813A',
                padding: '0.9rem 2rem',
                borderRadius: '999px',
                fontWeight: 700,
                fontSize: '1rem',
                textDecoration: 'none',
                transition: 'transform 0.15s, box-shadow 0.15s',
                boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              Order Now →
            </Link>
            <Link
              to="/reservations"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                background: 'rgba(255,255,255,0.12)',
                color: 'white',
                padding: '0.9rem 2rem',
                borderRadius: '999px',
                fontWeight: 600,
                fontSize: '1rem',
                textDecoration: 'none',
                border: '1px solid rgba(255,255,255,0.25)',
              }}
            >
              Reserve a Table
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section style={{ maxWidth: '1100px', margin: '0 auto', padding: '4rem 1.5rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <h2 style={{ fontSize: 'clamp(1.5rem, 4vw, 2.25rem)', fontWeight: 800, color: '#1C1408', marginBottom: '0.75rem' }}>
            Why Bake &amp; Grill?
          </h2>
          <p style={{ color: '#8B7355', fontSize: '1rem', maxWidth: '480px', margin: '0 auto' }}>
            We believe great food starts with fresh ingredients and genuine care.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem' }}>
          {FEATURES.map((f) => (
            <div
              key={f.title}
              style={{ background: 'white', border: '1px solid #EDE4D4', borderRadius: '16px', padding: '1.75rem', transition: 'all 0.2s' }}
              onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 8px 24px rgba(212,129,58,0.12)'; e.currentTarget.style.borderColor = '#D4813A'; e.currentTarget.style.transform = 'translateY(-3px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = '#EDE4D4'; e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: `${f.color}18`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: f.color,
                fontWeight: 800,
                fontSize: '1.1rem',
                marginBottom: '0.875rem',
              }}>
                {f.initial}
              </div>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1C1408', marginBottom: '0.5rem' }}>{f.title}</h3>
              <p style={{ fontSize: '0.875rem', color: '#8B7355', lineHeight: 1.6 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Popular Items */}
      {featuredItems.length > 0 && (
        <section style={{ background: '#FEF3E8', padding: '4rem 1.5rem' }}>
          <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '2rem' }}>
              <div>
                <h2 style={{ fontSize: 'clamp(1.5rem, 4vw, 2rem)', fontWeight: 800, color: '#1C1408', marginBottom: '0.25rem' }}>
                  Popular Items
                </h2>
                <p style={{ color: '#8B7355', fontSize: '0.9rem' }}>Our most loved dishes</p>
              </div>
              <Link
                to="/menu"
                style={{ color: '#D4813A', fontWeight: 600, fontSize: '0.9rem', textDecoration: 'none' }}
              >
                See full menu →
              </Link>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1.25rem' }}>
              {featuredItems.map((item) => {
                const imgSrc = item.image_url
                  ? item.image_url.startsWith('http')
                    ? item.image_url
                    : `${API_ORIGIN}${item.image_url.startsWith('/') ? '' : '/'}${item.image_url}`
                  : null;
                return (
                  <Link
                    key={item.id}
                    to="/menu"
                    style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', background: 'white', border: '1px solid #EDE4D4', borderRadius: '14px', overflow: 'hidden', transition: 'all 0.2s' }}
                    onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 8px 20px rgba(212,129,58,0.12)'; e.currentTarget.style.transform = 'translateY(-3px)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'translateY(0)'; }}
                  >
                    <div style={{
                      height: '140px',
                      background: imgSrc ? undefined : `linear-gradient(${45 + item.id * 30}deg, rgba(212,129,58,0.2), rgba(184,104,32,0.12))`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      overflow: 'hidden',
                    }}>
                      {imgSrc ? (
                        <img src={imgSrc} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                      ) : (
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(212,129,58,0.5)" strokeWidth="1.5" aria-hidden="true">
                          <path d="M3 6h18v2a6 6 0 01-6 6H9a6 6 0 01-6-6V6z" />
                          <path d="M6 18h12" /><path d="M9 14v4" /><path d="M15 14v4" />
                        </svg>
                      )}
                    </div>
                    <div style={{ padding: '0.875rem' }}>
                      <h3 style={{ fontSize: '0.925rem', fontWeight: 600, color: '#1C1408', marginBottom: '0.25rem' }}>{item.name}</h3>
                      <p style={{ fontSize: '0.875rem', fontWeight: 700, color: '#D4813A' }}>
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

      {/* CTA Banner */}
      <section style={{ background: '#1C1408', padding: '3.5rem 1.5rem', textAlign: 'center' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <h2 style={{ fontSize: 'clamp(1.5rem, 4vw, 2rem)', fontWeight: 800, color: 'white', marginBottom: '0.875rem' }}>
            Ready to Order?
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '1rem', marginBottom: '2rem', lineHeight: 1.65 }}>
            Browse our full menu and place your order in just a few taps.
          </p>
          <Link
            to="/menu"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: '#D4813A',
              color: 'white',
              padding: '0.875rem 2.25rem',
              borderRadius: '999px',
              fontWeight: 700,
              fontSize: '1rem',
              textDecoration: 'none',
              boxShadow: '0 4px 16px rgba(212,129,58,0.4)',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.background = '#B86820'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.background = '#D4813A'; }}
          >
            Browse Menu →
          </Link>
        </div>
      </section>
    </div>
  );
}
