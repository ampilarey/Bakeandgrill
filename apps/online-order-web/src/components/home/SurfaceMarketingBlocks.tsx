import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { useSiteSettingsContext } from '../../context/SiteSettingsContext';
import { MAIN_WEBSITE_HREF } from '../../utils/mainWebsite';

const sectionStyle: CSSProperties = {
  padding: '1.5rem var(--page-gutter)',
  maxWidth: 'var(--layout-max)',
  margin: '0 auto',
};

/** Social proof stats from CMS — available on Order App when placed. */
export function ProofBlock({ blockKey }: { blockKey: string }) {
  const { settings: s, text, proofDetails } = useSiteSettingsContext();
  const eyebrow = text('home_proof_eyebrow', 'Loved locally');
  const stat = s.proof_stat || text('proof_stat', '');
  const label = s.proof_label || text('proof_label', '');
  if (!stat && proofDetails.length === 0) return null;

  return (
    <section key={blockKey} data-home-block="proof" style={sectionStyle}>
      {eyebrow ? (
        <p style={{ margin: '0 0 0.35rem', fontSize: 12, fontWeight: 700, color: 'var(--color-primary)', letterSpacing: 0.04 }}>
          {eyebrow}
        </p>
      ) : null}
      {stat ? (
        <p style={{ margin: '0 0 0.35rem', fontSize: 'clamp(1.6rem, 4vw, 2.2rem)', fontWeight: 800, color: 'var(--color-dark)' }}>
          {stat}
        </p>
      ) : null}
      {label ? (
        <p style={{ margin: '0 0 0.75rem', fontSize: 14, color: 'var(--color-text-muted)' }}>{label}</p>
      ) : null}
      {proofDetails.length > 0 ? (
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          {proofDetails.map((pd, i) => (
            <div
              key={`${pd.value}-${i}`}
              style={{
                minWidth: 100,
                flex: '1 1 100px',
                border: '1px solid var(--color-border)',
                borderRadius: 12,
                padding: '0.75rem',
                background: 'var(--color-surface)',
              }}
            >
              <strong style={{ display: 'block', fontSize: 16 }}>{pd.value}</strong>
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{pd.label}</span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function CtaBlock({ blockKey }: { blockKey: string }) {
  const { text } = useSiteSettingsContext();
  const headline = text('cta_band_headline', 'Hungry? Order in minutes.');
  const sub = text('cta_band_subtext', 'Delivery, pickup, or dine-in — your call.');

  return (
    <section
      key={blockKey}
      data-home-block="cta"
      style={{
        ...sectionStyle,
        textAlign: 'center',
        background: 'var(--color-surface-alt)',
        borderTop: '1px solid var(--color-border)',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      <h2 style={{ margin: '0 0 0.5rem', fontSize: 'clamp(1.25rem, 3vw, 1.6rem)', fontWeight: 800 }}>{headline}</h2>
      <p style={{ margin: '0 0 1rem', fontSize: 14, color: 'var(--color-text-muted)' }}>{sub}</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        <Link to="/menu" className="btn-primary" style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', padding: '0 1.1rem' }}>
          Browse menu
        </Link>
      </div>
    </section>
  );
}

export function LocationBlock({ blockKey }: { blockKey: string }) {
  const { settings: s, text } = useSiteSettingsContext();
  const title = text('home_location_title', 'Visit us');
  const subtitle = text('home_location_subtitle', '');
  const address = s.business_address || '';
  const phone = s.business_phone || '';
  const maps = s.business_maps_url || MAIN_WEBSITE_HREF;

  return (
    <section key={blockKey} data-home-block="location" style={sectionStyle}>
      <h2 style={{ margin: '0 0 0.35rem', fontSize: '1.15rem', fontWeight: 800 }}>{title}</h2>
      {subtitle ? <p style={{ margin: '0 0 0.75rem', fontSize: 13, color: 'var(--color-text-muted)' }}>{subtitle}</p> : null}
      {address ? <p style={{ margin: '0 0 0.35rem', fontSize: 14 }}>{address}</p> : null}
      {phone ? (
        <p style={{ margin: '0 0 0.75rem', fontSize: 14 }}>
          <a href={`tel:${phone.replace(/\s/g, '')}`} style={{ color: 'var(--color-primary)', fontWeight: 700 }}>
            {phone}
          </a>
        </p>
      ) : null}
      <a href={maps} target="_blank" rel="noopener noreferrer" style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-primary)' }}>
        Get directions →
      </a>
    </section>
  );
}

export function EventsBandBlock({ blockKey }: { blockKey: string }) {
  const { text } = useSiteSettingsContext();
  const headline = text('events_section_headline', 'Events & Catering');
  const blurb = text(
    'events_section_blurb',
    'Plan office breakfasts, celebrations, and catering trays with a structured quote.',
  );
  const browse = text('events_section_browse_cta', 'Browse catering menu');
  const plan = text('events_section_plan_cta', 'Plan your event');

  return (
    <section
      key={blockKey}
      data-home-block="events_band"
      style={{
        ...sectionStyle,
        textAlign: 'center',
        borderTop: '1px solid var(--color-border)',
        background: 'var(--color-surface)',
      }}
    >
      <h2 style={{ margin: '0 0 0.5rem', fontSize: 'clamp(1.25rem, 3vw, 1.6rem)', fontWeight: 800 }}>{headline}</h2>
      <p style={{ margin: '0 0 1rem', fontSize: 14, color: 'var(--color-text-muted)', lineHeight: 1.55 }}>{blurb}</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        <Link to="/catering" style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', padding: '0 1rem', border: '1px solid var(--color-border)', borderRadius: 12, fontWeight: 700 }}>
          {browse}
        </Link>
        <Link to="/events" style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', padding: '0 1rem', borderRadius: 12, fontWeight: 700, background: 'var(--color-primary)', color: '#fff' }}>
          {plan}
        </Link>
      </div>
    </section>
  );
}

export function FeaturedBlock({ blockKey }: { blockKey: string }) {
  const { text } = useSiteSettingsContext();
  const { t } = useLanguage();
  const title = text('home_featured_title_handpicked', text('home_featured_title_bestseller', 'Featured'));
  const subtitle = text('home_featured_subtitle', '');

  return (
    <section key={blockKey} data-home-block="featured" style={sectionStyle}>
      <h2 style={{ margin: '0 0 0.35rem', fontSize: '1.15rem', fontWeight: 800 }}>{title}</h2>
      {subtitle ? <p style={{ margin: '0 0 0.75rem', fontSize: 13, color: 'var(--color-text-muted)' }}>{subtitle}</p> : null}
      <Link to="/menu" style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-primary)' }}>
        {t('nav.menu')} →
      </Link>
    </section>
  );
}
