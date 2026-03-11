import { useEffect } from 'react';
import { Link } from 'react-router-dom';

const CONTACT_ITEMS = [
  {
    label: 'Phone',
    abbr: 'PH',
    color: '#1ba3b9',
    value: '+960 9120011',
    action: { href: 'tel:+9609120011', text: 'Call us' },
  },
  {
    label: 'Email',
    abbr: 'EM',
    color: '#D97706',
    value: 'hello@bakeandgrill.mv',
    action: { href: 'mailto:hello@bakeandgrill.mv', text: 'Send email' },
  },
  {
    label: 'WhatsApp',
    abbr: 'WA',
    color: '#25D366',
    value: '+960 9120011',
    action: { href: 'https://wa.me/9609120011', text: 'Message us', external: true },
  },
  {
    label: 'Address',
    abbr: 'AD',
    color: '#636e72',
    value: 'Majeedhee Magu, Malé, Maldives',
    action: null,
  },
];

export function ContactPage() {
  useEffect(() => { document.title = 'Contact — Bake & Grill'; }, []);

  return (
    <div style={{ maxWidth: '760px', margin: '0 auto', padding: '3rem 1.5rem' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <h1 style={{ fontSize: 'clamp(1.75rem, 5vw, 2.5rem)', fontWeight: 800, color: '#1c1e21', marginBottom: '0.875rem' }}>
          Contact Us
        </h1>
        <p style={{ fontSize: '1.05rem', color: '#636e72', lineHeight: 1.65 }}>
          Have a question or feedback? We'd love to hear from you.
        </p>
      </div>

      {/* Contact cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem', marginBottom: '2.5rem' }}>
        {CONTACT_ITEMS.map((item) => (
          <div
            key={item.label}
            style={{ background: 'white', border: '1px solid #e9ecef', borderRadius: '16px', padding: '1.75rem', transition: 'all 0.2s' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#1ba3b9'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.07)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e9ecef'; e.currentTarget.style.boxShadow = 'none'; }}
          >
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              background: `${item.color}18`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: item.color,
              fontWeight: 800,
              fontSize: '0.75rem',
              letterSpacing: '0.05em',
              marginBottom: '0.875rem',
            }}>
              {item.abbr}
            </div>
            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#adb5bd', fontWeight: 700, marginBottom: '0.375rem' }}>
              {item.label}
            </div>
            <p style={{ fontSize: '0.975rem', color: '#1c1e21', fontWeight: 500, marginBottom: item.action ? '0.875rem' : 0, lineHeight: 1.4 }}>
              {item.value}
            </p>
            {item.action && (
              <a
                href={item.action.href}
                target={item.action.external ? '_blank' : undefined}
                rel={item.action.external ? 'noopener noreferrer' : undefined}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                  background: '#1ba3b9',
                  color: 'white',
                  padding: '0.45rem 1rem',
                  borderRadius: '999px',
                  fontSize: '0.825rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#1591a6'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#1ba3b9'; }}
              >
                {item.action.text} →
              </a>
            )}
          </div>
        ))}
      </div>

      {/* Opening hours promo */}
      <div style={{ background: '#f8f9fa', border: '1px solid #e9ecef', borderRadius: '16px', padding: '1.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#1c1e21', marginBottom: '0.375rem' }}>
            Want to visit in person?
          </h3>
          <p style={{ fontSize: '0.875rem', color: '#636e72' }}>
            Check our current opening hours before you head over.
          </p>
        </div>
        <Link
          to="/hours"
          style={{
            background: '#1ba3b9',
            color: 'white',
            padding: '0.6rem 1.5rem',
            borderRadius: '999px',
            fontWeight: 600,
            fontSize: '0.875rem',
            textDecoration: 'none',
            flexShrink: 0,
          }}
        >
          See Hours →
        </Link>
      </div>
    </div>
  );
}
