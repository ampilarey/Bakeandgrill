import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchItems, fetchOpeningHoursStatus, API_ORIGIN } from '../api';
import type { Item } from '../api';

const FEATURES = [
  { icon: '🔥', title: 'Fresh Every Day', desc: 'Baked and grilled fresh each morning — no pre-made shortcuts.' },
  { icon: '📱', title: 'Order Online', desc: 'Browse the menu and place your order in seconds, no app required.' },
  { icon: '📅', title: 'Reserve a Table', desc: 'Book a spot ahead of time and arrive to a ready table.' },
  { icon: '🏠', title: 'Dine-In & Takeaway', desc: 'Enjoy your meal with us or take it home — your choice.' },
];

export function HomePage() {
  const [featuredItems, setFeaturedItems] = useState<Item[]>([]);
  const [isOpen, setIsOpen] = useState<boolean | null>(null);
  const [hoursMsg, setHoursMsg] = useState<string | null>(null);

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
        background: 'linear-gradient(135deg, #1ba3b9 0%, #0e7d90 50%, #1c1e21 100%)',
        color: 'white',
        padding: '5rem 1.5rem 4rem',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Background pattern */}
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(255,255,255,0.05) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(255,255,255,0.07) 0%, transparent 40%)', pointerEvents: 'none' }} />

        <div style={{ maxWidth: '760px', margin: '0 auto', position: 'relative' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.12)', borderRadius: '999px', padding: '0.35rem 1rem', marginBottom: '1.5rem', fontSize: '0.85rem', fontWeight: 500 }}>
            {isOpen === null ? (
              <span>Loading…</span>
            ) : isOpen ? (
              <><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#4caf50', display: 'inline-block' }} /> Open Now</>
            ) : (
              <><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ff7043', display: 'inline-block' }} /> {hoursMsg ?? 'Currently Closed'}</>
            )}
          </div>

          <h1 style={{ fontSize: 'clamp(2rem, 6vw, 3.5rem)', fontWeight: 800, lineHeight: 1.1, marginBottom: '1.25rem', letterSpacing: '-0.02em' }}>
            Fresh Bakes &<br />
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
                background: '#fbbf24',
                color: '#1c1e21',
                padding: '0.9rem 2rem',
                borderRadius: '999px',
                fontWeight: 700,
                fontSize: '1rem',
                textDecoration: 'none',
                transition: 'transform 0.15s, box-shadow 0.15s',
                boxShadow: '0 4px 16px rgba(251,191,36,0.35)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(251,191,36,0.45)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(251,191,36,0.35)'; }}
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
                backdropFilter: 'blur(4px)',
              }}
            >
              📅 Reserve a Table
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section style={{ maxWidth: '1100px', margin: '0 auto', padding: '4rem 1.5rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <h2 style={{ fontSize: 'clamp(1.5rem, 4vw, 2.25rem)', fontWeight: 800, color: '#1c1e21', marginBottom: '0.75rem' }}>
            Why Bake &amp; Grill?
          </h2>
          <p style={{ color: '#636e72', fontSize: '1rem', maxWidth: '480px', margin: '0 auto' }}>
            We believe great food starts with fresh ingredients and genuine care.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem' }}>
          {FEATURES.map((f) => (
            <div
              key={f.title}
              style={{ background: 'white', border: '1px solid #e9ecef', borderRadius: '16px', padding: '1.75rem', transition: 'all 0.2s' }}
              onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.08)'; e.currentTarget.style.borderColor = '#1ba3b9'; e.currentTarget.style.transform = 'translateY(-3px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = '#e9ecef'; e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              <div style={{ fontSize: '2.25rem', marginBottom: '0.875rem' }}>{f.icon}</div>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1c1e21', marginBottom: '0.5rem' }}>{f.title}</h3>
              <p style={{ fontSize: '0.875rem', color: '#636e72', lineHeight: 1.6 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Popular Items */}
      {featuredItems.length > 0 && (
        <section style={{ background: '#f8f9fa', padding: '4rem 1.5rem' }}>
          <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '2rem' }}>
              <div>
                <h2 style={{ fontSize: 'clamp(1.5rem, 4vw, 2rem)', fontWeight: 800, color: '#1c1e21', marginBottom: '0.25rem' }}>
                  Popular Items
                </h2>
                <p style={{ color: '#636e72', fontSize: '0.9rem' }}>Our most loved dishes</p>
              </div>
              <Link
                to="/menu"
                style={{ color: '#1ba3b9', fontWeight: 600, fontSize: '0.9rem', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
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
                    style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', background: 'white', border: '1px solid #e9ecef', borderRadius: '14px', overflow: 'hidden', transition: 'all 0.2s' }}
                    onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.1)'; e.currentTarget.style.transform = 'translateY(-3px)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'translateY(0)'; }}
                  >
                    <div style={{
                      height: '140px',
                      background: imgSrc ? undefined : `linear-gradient(${45 + item.id * 30}deg, rgba(27,163,185,0.25), rgba(118,75,162,0.2))`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      overflow: 'hidden',
                    }}>
                      {imgSrc ? (
                        <img src={imgSrc} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                      ) : (
                        <span style={{ fontSize: '2.5rem', opacity: 0.6 }}>☕</span>
                      )}
                    </div>
                    <div style={{ padding: '0.875rem' }}>
                      <h3 style={{ fontSize: '0.925rem', fontWeight: 600, color: '#1c1e21', marginBottom: '0.25rem' }}>{item.name}</h3>
                      <p style={{ fontSize: '0.875rem', fontWeight: 700, color: '#1ba3b9' }}>
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
      <section style={{ background: '#1ba3b9', padding: '3.5rem 1.5rem', textAlign: 'center' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <h2 style={{ fontSize: 'clamp(1.5rem, 4vw, 2rem)', fontWeight: 800, color: 'white', marginBottom: '0.875rem' }}>
            Ready to Order?
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: '1rem', marginBottom: '2rem', lineHeight: 1.65 }}>
            Browse our full menu and place your order in just a few taps.
          </p>
          <Link
            to="/menu"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: 'white',
              color: '#1ba3b9',
              padding: '0.875rem 2.25rem',
              borderRadius: '999px',
              fontWeight: 700,
              fontSize: '1rem',
              textDecoration: 'none',
              boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
              transition: 'transform 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
          >
            Browse Menu →
          </Link>
        </div>
      </section>
    </div>
  );
}
