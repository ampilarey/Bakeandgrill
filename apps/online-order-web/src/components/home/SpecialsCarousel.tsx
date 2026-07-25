/**
 * Home "Offers & Specials" horizontal strip — same circular OfferCard as the menu rail.
 * Fed by the unified /api/offers feed (not a second specials-only list).
 */
import { Link } from 'react-router-dom';
import type { Offer } from '../../api/menu';
import { useLanguage } from '../../context/LanguageContext';
import { useSiteSettingsContext } from '../../context/SiteSettingsContext';
import { OfferCard, uniqueOffersById } from './OfferCard';

type Props = {
  offers: Offer[];
  apiOrigin: string;
};

export function SpecialsCarousel({ offers, apiOrigin }: Props) {
  const { t } = useLanguage();
  const { text, settings: s } = useSiteSettingsContext();
  const title = text('offers_headline', text('home_specials_title', 'Offers & Specials'));
  const eyebrow = text('home_specials_eyebrow', text('offers_subtext', ''));
  const logoSrc = s?.logo || '/logo.png';
  const unique = uniqueOffersById(offers);

  if (unique.length === 0) return null;

  return (
    <section
      aria-label={title}
      data-testid="home-offers-carousel"
      className="offers-rail"
      style={{
        borderTop: '1px solid var(--color-border)',
        padding: '1.25rem var(--page-gutter)',
      }}
    >
      <div style={{ maxWidth: 'var(--layout-max)', margin: '0 auto' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem',
            marginBottom: '1rem',
          }}
        >
          <div>
            {eyebrow ? (
              <p
                style={{
                  margin: '0 0 0.2rem',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'var(--color-primary)',
                }}
              >
                {eyebrow}
              </p>
            ) : null}
            <h2
              style={{
                fontSize: '1.25rem',
                fontWeight: 800,
                color: 'var(--color-dark)',
                margin: 0,
              }}
            >
              {title}
            </h2>
          </div>
          <Link
            to="/menu#offers"
            style={{
              fontSize: '0.875rem',
              fontWeight: 700,
              color: 'var(--color-primary)',
              textDecoration: 'none',
            }}
          >
            {t('home.see_all')}
          </Link>
        </div>

        <div className="offers-rail__track" data-testid="home-offers-track">
          {unique.map((offer) => (
            <OfferCard
              key={offer.id}
              offer={offer}
              apiOrigin={apiOrigin}
              logoSrc={logoSrc}
              testId="specials-carousel-card"
            />
          ))}
        </div>
      </div>
    </section>
  );
}
