import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useSiteSettings } from '../context/SiteSettingsContext';

export function ContactPage() {
  const s = useSiteSettings();

  const siteName  = s.site_name        || 'Bake & Grill';
  const phone     = s.business_phone   || '+960 912 0011';
  const phoneTel  = 'tel:' + phone.replace(/[^+\d]/g, '');
  const email     = s.business_email   || 'hello@bakeandgrill.mv';
  const address   = s.business_address || 'Kalaafaanu Hingun, Malé, Maldives';
  const waLink    = s.business_whatsapp|| 'https://wa.me/9609120011';

  useEffect(() => { document.title = `Contact — ${siteName}`; }, [siteName]);

  const CONTACT_ITEMS = [
    {
      label: 'Phone',
      abbr: 'PH',
      color: '#D4813A',
      value: phone,
      action: { href: phoneTel, text: 'Call us' },
    },
    {
      label: 'Email',
      abbr: 'EM',
      color: '#D4813A',
      value: email,
      action: { href: `mailto:${email}`, text: 'Send email' },
    },
    {
      label: 'WhatsApp',
      abbr: 'WA',
      color: '#25D366',
      value: phone,
      action: { href: waLink, text: 'Message us', external: true },
    },
    {
      label: 'Address',
      abbr: 'AD',
      color: '#8B7355',
      value: address,
      action: null,
    },
  ];

  return (
    <div style={{ maxWidth: '760px', margin: '0 auto', padding: '3rem 1.5rem' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <h1 style={{ fontSize: 'clamp(1.75rem, 5vw, 2.5rem)', fontWeight: 800, color: '#1C1408', marginBottom: '0.875rem' }}>
          Contact Us
        </h1>
        <p style={{ fontSize: '1.05rem', color: '#8B7355', lineHeight: 1.65 }}>
          Have a question or feedback? We'd love to hear from you.
        </p>
      </div>

      {/* Contact cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem', marginBottom: '2.5rem' }}>
        {CONTACT_ITEMS.map((item) => (
          <div
            key={item.label}
            style={{ background: 'white', border: '1px solid #EDE4D4', borderRadius: '16px', padding: '1.75rem', transition: 'all 0.2s' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#D4813A'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.07)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#EDE4D4'; e.currentTarget.style.boxShadow = 'none'; }}
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
            <p style={{ fontSize: '0.975rem', color: '#1C1408', fontWeight: 500, marginBottom: item.action ? '0.875rem' : 0, lineHeight: 1.4 }}>
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
                  background: '#D4813A',
                  color: 'white',
                  padding: '0.45rem 1rem',
                  borderRadius: '999px',
                  fontSize: '0.825rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#B86820'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#D4813A'; }}
              >
                {item.action.text} →
              </a>
            )}
          </div>
        ))}
      </div>

      {/* Opening hours promo */}
      <div style={{ background: '#FFFDF9', border: '1px solid #EDE4D4', borderRadius: '16px', padding: '1.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#1C1408', marginBottom: '0.375rem' }}>
            Want to visit in person?
          </h3>
          <p style={{ fontSize: '0.875rem', color: '#8B7355' }}>
            Check our current opening hours before you head over.
          </p>
        </div>
        <Link
          to="/hours"
          style={{
            background: '#D4813A',
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
