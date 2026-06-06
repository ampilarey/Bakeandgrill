import { Link } from 'react-router-dom';
import { usePageTitle } from '../hooks/usePageTitle';
import { interpolateCopy, useSiteSettingsContext } from '../context/SiteSettingsContext';

export function AboutPage() {
  usePageTitle('About');
  const { settings: s, aboutValues, text } = useSiteSettingsContext();
  const address  = s.business_address  || 'Majeedhee Magu, Malé, Maldives';
  const landmark = s.business_landmark || 'Near the ferry terminal';
  const phone    = s.business_phone    || '+960 912 0011';
  const email    = s.business_email    || 'admin@bakeandgrill.mv';
  const tagline  = s.site_tagline || 'Your favourite neighbourhood café in Malé — serving fresh bakes, hearty grills, and local flavours since day one.';
  const storyRaw = text(
    'about_page_story',
    "Bake & Grill was born out of a passion for honest, well-made food. We wanted to create a place where locals could gather for a proper breakfast, a quick lunch, or a relaxed dinner — without compromise on quality.\n\nLocated in the heart of Malé at {address}, we bring together traditional Dhivehi tastes and modern café culture under one roof. Every item on our menu is freshly prepared — from our morning pastries to our evening grill specials.",
  );
  const storyParagraphs = interpolateCopy(storyRaw, { address }).split(/\n\n+/).filter(Boolean);

  return (
    <div style={{ maxWidth: '860px', margin: '0 auto', padding: '3rem var(--page-gutter)' }}>
      <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🍽️</div>
        <h1 style={{ fontSize: 'clamp(1.75rem, 5vw, 2.75rem)', fontWeight: 800, color: 'var(--color-dark)', marginBottom: '1rem' }}>
          {text('about_page_title', 'About Bake & Grill')}
        </h1>
        <p style={{ fontSize: '1.1rem', color: 'var(--color-text-muted)', lineHeight: 1.7, maxWidth: '560px', margin: '0 auto' }}>
          {tagline}
        </p>
      </div>

      <section style={{ background: 'var(--color-surface-alt)', borderRadius: '20px', padding: '2.5rem', marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-dark)', marginBottom: '1rem' }}>Our Story</h2>
        {storyParagraphs.map((para, i) => (
          <p key={i} style={{ color: 'var(--color-text)', fontSize: '1rem', lineHeight: 1.8, marginBottom: i < storyParagraphs.length - 1 ? '1rem' : 0 }}>
            {para}
          </p>
        ))}
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem', marginBottom: '3rem' }}>
        {aboutValues.map((v, idx) => (
          <div
            key={v.title ?? idx}
            className="cat-card-hover"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '14px', padding: '1.5rem' }}
          >
            <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'var(--color-primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-primary)', fontWeight: 800, fontSize: '1rem', marginBottom: '0.75rem' }}>
              {v.initial ?? (v.title?.[0] ?? '')}
            </div>
            <h3 style={{ fontSize: '0.975rem', fontWeight: 700, color: 'var(--color-dark)', marginBottom: '0.4rem' }}>{v.title}</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', lineHeight: 1.6 }}>{v.description}</p>
          </div>
        ))}
      </section>

      <section style={{ background: 'var(--color-primary)', color: 'white', borderRadius: '20px', padding: '2.5rem', textAlign: 'center', marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1rem' }}>Visit Us</h2>
        <p style={{ opacity: 0.9, marginBottom: '0.5rem' }}>{address}</p>
        <p style={{ opacity: 0.9, marginBottom: '0.5rem', fontSize: '0.875rem' }}>{landmark}</p>
        <p style={{ opacity: 0.85, marginBottom: '1.5rem', fontSize: '0.875rem' }}>
          {phone}{email ? ` · ${email}` : ''}
        </p>
        <div style={{ display: 'flex', gap: '0.875rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link
            to="/hours"
            style={{ background: 'var(--color-surface)', color: 'var(--color-primary)', padding: '0.6rem 1.5rem', borderRadius: '999px', fontWeight: 600, fontSize: '0.9rem', textDecoration: 'none' }}
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

      <div style={{ textAlign: 'center' }}>
        <Link
          to="/menu"
          className="btn-primary-hover"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
            background: 'var(--color-primary)', color: 'white',
            padding: '0.875rem 2.25rem', borderRadius: '999px',
            fontWeight: 700, fontSize: '1rem', textDecoration: 'none',
          }}
        >
          Browse Our Menu →
        </Link>
      </div>
    </div>
  );
}
