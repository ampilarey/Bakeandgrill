import { useEffect } from 'react';
import { Link } from 'react-router-dom';

export function AboutPage() {
  useEffect(() => { document.title = 'About — Bake & Grill'; }, []);
  return (
    <div style={{ maxWidth: '860px', margin: '0 auto', padding: '3rem 1.5rem' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🍽️</div>
        <h1 style={{ fontSize: 'clamp(1.75rem, 5vw, 2.75rem)', fontWeight: 800, color: '#1c1e21', marginBottom: '1rem' }}>
          About Bake &amp; Grill
        </h1>
        <p style={{ fontSize: '1.1rem', color: '#636e72', lineHeight: 1.7, maxWidth: '560px', margin: '0 auto' }}>
          Your favourite neighbourhood café in Malé — serving fresh bakes, hearty grills, and local flavours since day one.
        </p>
      </div>

      {/* Story */}
      <section style={{ background: '#f8f9fa', borderRadius: '20px', padding: '2.5rem', marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1c1e21', marginBottom: '1rem' }}>Our Story</h2>
        <p style={{ color: '#495057', fontSize: '1rem', lineHeight: 1.8, marginBottom: '1rem' }}>
          Bake & Grill was born out of a passion for honest, well-made food. We wanted to create a place where locals could gather for a proper breakfast, a quick lunch, or a relaxed dinner — without compromise on quality.
        </p>
        <p style={{ color: '#495057', fontSize: '1rem', lineHeight: 1.8 }}>
          Located on Majeedhee Magu in the heart of Malé, we bring together traditional Dhivehi tastes and modern café culture under one roof. Every item on our menu is freshly prepared — from our morning pastries to our evening grill specials.
        </p>
      </section>

      {/* Values grid */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem', marginBottom: '3rem' }}>
        {[
          { initial: 'F', color: '#1ba3b9', title: 'Fresh Ingredients', desc: 'We source locally and prep daily. No shortcuts, no compromises.' },
          { initial: 'C', color: '#D97706', title: 'Community First', desc: 'We are part of Malé — we know our customers and they know us.' },
          { initial: 'Q', color: '#1ba3b9', title: 'Quality Always', desc: 'Whether it\'s a cup of tea or a full grill, everything gets the same care.' },
          { initial: 'B', color: '#D97706', title: 'Built for Today', desc: 'Online ordering, table reservations, loyalty rewards — all in one place.' },
        ].map((v) => (
          <div
            key={v.title}
            style={{ background: 'white', border: '1px solid #e9ecef', borderRadius: '14px', padding: '1.5rem', transition: 'all 0.2s' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#1ba3b9'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.07)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e9ecef'; e.currentTarget.style.boxShadow = 'none'; }}
          >
            <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: `${v.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: v.color, fontWeight: 800, fontSize: '1rem', marginBottom: '0.75rem' }}>
              {v.initial}
            </div>
            <h3 style={{ fontSize: '0.975rem', fontWeight: 700, color: '#1c1e21', marginBottom: '0.4rem' }}>{v.title}</h3>
            <p style={{ fontSize: '0.85rem', color: '#636e72', lineHeight: 1.6 }}>{v.desc}</p>
          </div>
        ))}
      </section>

      {/* Location */}
      <section style={{ background: '#1ba3b9', color: 'white', borderRadius: '20px', padding: '2.5rem', textAlign: 'center', marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1rem' }}>Visit Us</h2>
        <p style={{ opacity: 0.9, marginBottom: '0.5rem' }}>Majeedhee Magu, Malé, Maldives</p>
        <p style={{ opacity: 0.9, marginBottom: '1.5rem' }}>Near the ferry terminal</p>
        <div style={{ display: 'flex', gap: '0.875rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link
            to="/hours"
            style={{ background: 'white', color: '#1ba3b9', padding: '0.6rem 1.5rem', borderRadius: '999px', fontWeight: 600, fontSize: '0.9rem', textDecoration: 'none' }}
          >
            Opening Hours
          </Link>
          <Link
            to="/contact"
            style={{ background: 'rgba(255,255,255,0.2)', color: 'white', padding: '0.6rem 1.5rem', borderRadius: '999px', fontWeight: 600, fontSize: '0.9rem', textDecoration: 'none', border: '1px solid rgba(255,255,255,0.3)' }}
          >
            Contact Us
          </Link>
        </div>
      </section>

      {/* CTA */}
      <div style={{ textAlign: 'center' }}>
        <Link
          to="/menu"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            background: '#1ba3b9',
            color: 'white',
            padding: '0.875rem 2.25rem',
            borderRadius: '999px',
            fontWeight: 700,
            fontSize: '1rem',
            textDecoration: 'none',
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#1591a6'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#1ba3b9'; }}
        >
          Browse Our Menu →
        </Link>
      </div>
    </div>
  );
}
