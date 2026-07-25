/** Offers rail at top of menu — specials + auto-promos from GET /api/offers. */
import type { Offer } from '../../api/menu';
import { useSiteSettingsContext } from '../../context/SiteSettingsContext';
import { OfferCard, offerUrgencyLabel } from './OfferCard';

export { offerUrgencyLabel };

type Props = {
  offers: Offer[];
  headline?: string | null;
  subtext?: string | null;
  apiOrigin: string;
};

export function OffersRail({ offers, headline, subtext, apiOrigin }: Props) {
  const { text, settings: s } = useSiteSettingsContext();
  const title = headline || text('offers_headline', 'Offers');
  const subtitle = subtext ?? text('offers_subtext', '');
  const logoSrc = s?.logo || '/logo.png';

  if (offers.length === 0) return null;

  return (
    <section id="offers" aria-label={title} className="offers-rail" style={{ paddingBottom: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--color-dark)', margin: 0 }}>{title}</h2>
          {subtitle ? (
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: '0.15rem 0 0' }}>{subtitle}</p>
          ) : null}
        </div>
      </div>
      <div className="offers-rail__track">
        {offers.map((offer) => (
          <OfferCard
            key={offer.id}
            offer={offer}
            apiOrigin={apiOrigin}
            logoSrc={logoSrc}
            testId="offers-rail-card"
          />
        ))}
      </div>
    </section>
  );
}
