import { Link } from 'react-router-dom';
import { useSiteSettings } from '../context/SiteSettingsContext';
import { usePageTitle } from '../hooks/usePageTitle';

export function ContactPage() {
  const s = useSiteSettings();

  const phone     = s.business_phone   || '+960 912 0011';
  const phoneTel  = 'tel:' + phone.replace(/[^+\d]/g, '');
  const email     = s.business_email   || 'hello@bakeandgrill.mv';
  const address   = s.business_address || 'Kalaafaanu Hingun, Malé, Maldives';
  const waLink    = s.business_whatsapp|| 'https://wa.me/9609120011';

  usePageTitle('Contact');

  const CONTACT_ITEMS = [
    { label: 'Phone',    abbr: 'PH', value: phone,   action: { href: phoneTel,         text: 'Call us' } },
    { label: 'Email',    abbr: 'EM', value: email,   action: { href: `mailto:${email}`, text: 'Send email' } },
    { label: 'WhatsApp', abbr: 'WA', value: phone,   action: { href: waLink,            text: 'Message us', external: true } },
    { label: 'Address',  abbr: 'AD', value: address, action: null },
  ];

  return (
    <div style={{ maxWidth: 'min(760px, 100%)', margin: '0 auto', padding: '3rem var(--page-gutter)' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <h1 style={{ fontSize: 'clamp(1.75rem, 5vw, 2.5rem)', fontWeight: 800, color: 'var(--color-dark)', marginBottom: '0.875rem' }}>
          Contact Us
        </h1>
        <p style={{ fontSize: '1.05rem', color: 'var(--color-text-muted)', lineHeight: 1.65 }}>
          Have a question or feedback? We'd love to hear from you.
        </p>
      </div>

      {/* Contact cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem', marginBottom: '2.5rem' }}>
        {CONTACT_ITEMS.map((item) => (
          <div
            key={item.label}
            className="cat-card-hover"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '16px', padding: '1.75rem' }}
          >
            <div style={{
              width: '44px', height: '44px', borderRadius: '50%',
              background: 'var(--color-primary-light)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--color-primary)', fontWeight: 800, fontSize: '0.75rem',
              letterSpacing: '0.05em', marginBottom: '0.875rem',
            }}>
              {item.abbr}
            </div>
            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)', fontWeight: 700, marginBottom: '0.375rem' }}>
              {item.label}
            </div>
            <p style={{ fontSize: '0.975rem', color: 'var(--color-dark)', fontWeight: 500, marginBottom: item.action ? '0.875rem' : 0, lineHeight: 1.4 }}>
              {item.value}
            </p>
            {item.action && (
              <a
                href={item.action.href}
                target={item.action.external ? '_blank' : undefined}
                rel={item.action.external ? 'noopener noreferrer' : undefined}
                className="btn-primary-hover"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
                  background: 'var(--color-primary)', color: 'white',
                  padding: '0.45rem 1rem', borderRadius: '999px',
                  fontSize: '0.825rem', fontWeight: 600, textDecoration: 'none',
                }}
              >
                {item.action.text} →
              </a>
            )}
          </div>
        ))}
      </div>

      {/* Opening hours promo */}
      <div style={{ background: 'var(--color-surface-alt)', border: '1px solid var(--color-border)', borderRadius: '16px', padding: '1.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--color-dark)', marginBottom: '0.375rem' }}>
            Want to visit in person?
          </h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
            Check our current opening hours before you head over.
          </p>
        </div>
        <Link
          to="/hours"
          className="btn-primary-hover"
          style={{
            background: 'var(--color-primary)', color: 'white',
            padding: '0.6rem 1.5rem', borderRadius: '999px',
            fontWeight: 600, fontSize: '0.875rem', textDecoration: 'none', flexShrink: 0,
          }}
        >
          See Hours →
        </Link>
      </div>
    </div>
  );
}
