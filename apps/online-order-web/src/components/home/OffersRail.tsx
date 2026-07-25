/** Offers rail at top of menu — specials + auto-promos from GET /api/offers. */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { Offer } from '../../api/menu';
import { useSiteSettingsContext } from '../../context/SiteSettingsContext';
import { formatCardPrice } from '../../utils/money';
import type { MediaSlide } from '../../utils/itemMedia';
import { MenuImageSlider } from '../menu/MenuImageSlider';

type Props = {
  offers: Offer[];
  headline?: string | null;
  subtext?: string | null;
  apiOrigin: string;
};

function resolveImage(url: string | null | undefined, apiOrigin: string): string | null {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `${apiOrigin}${url.startsWith('/') ? '' : '/'}${url}`;
}

/** Urgency label from ends_at — only when ending within 24h. */
export function offerUrgencyLabel(endsAt: string | null | undefined, nowMs = Date.now()): string | null {
  if (!endsAt) return null;
  const end = new Date(endsAt).getTime();
  if (Number.isNaN(end)) return null;
  const ms = end - nowMs;
  if (ms <= 0) return 'Ending soon';
  const hours = ms / (1000 * 60 * 60);
  if (hours > 24) return null;
  if (hours >= 1) return `Ends in ${Math.ceil(hours)}h`;
  const mins = Math.max(1, Math.ceil(ms / (1000 * 60)));
  return `Ends in ${mins}m`;
}

function offerSlides(offer: Offer, apiOrigin: string): MediaSlide[] {
  const imgSrc = resolveImage(offer.image_url, apiOrigin);
  if (!imgSrc) return [];
  return [{ type: 'image', url: imgSrc, alt: offer.title }];
}

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
          <OfferRailCard
            key={offer.id}
            offer={offer}
            apiOrigin={apiOrigin}
            logoSrc={logoSrc}
          />
        ))}
      </div>
    </section>
  );
}

function OfferRailCard({
  offer,
  apiOrigin,
  logoSrc,
}: {
  offer: Offer;
  apiOrigin: string;
  logoSrc: string;
}) {
  const slides = useMemo(() => offerSlides(offer, apiOrigin), [offer, apiOrigin]);
  const price = offer.effective_price != null ? Number(offer.effective_price) : null;
  const wasPrice =
    price != null && offer.original_price != null && Number(offer.original_price) > price
      ? Number(offer.original_price)
      : null;
  const to = offer.link.startsWith('/') ? offer.link : `/${offer.link}`;
  const urgency = offerUrgencyLabel(offer.ends_at);
  const onSale = wasPrice != null;
  const badgeLabel = offer.badge
    || (offer.kind === 'special' ? 'Special Offer' : null);

  return (
    <Link
      to={to}
      className={`offers-rail-card menu-card-article menu-card-article--zus${onSale ? ' menu-card-on-sale' : ''}`}
      data-testid="offers-rail-card"
    >
      <div className="menu-card-media-circle">
        <div
          className="menu-card-media-circle__frame"
          data-testid="offers-rail-media-frame"
        >
          <MenuImageSlider
            slides={slides}
            alt={offer.title}
            posterOnly
            aspectRatio="1 / 1"
            logoSrc={logoSrc}
            showDots={false}
            className="menu-card-media-circle__slider"
          />
        </div>
        {badgeLabel ? (
          <div className="menu-card-image-badges menu-card-image-badges--circle">
            <span className="badge badge-sale">{badgeLabel}</span>
          </div>
        ) : null}
      </div>

      <div className="menu-card-body menu-card-body--zus">
        <h3 className="menu-card-name">{offer.title}</h3>
        {offer.subtitle ? (
          <p className="menu-card-desc">{offer.subtitle}</p>
        ) : null}
        {urgency ? (
          <p className="offers-rail-card__urgency">{urgency}</p>
        ) : null}
        {price != null ? (
          <div className="menu-card-price-row" data-testid="offers-rail-price-row">
            <span className={onSale ? 'menu-card-price-sale' : 'menu-card-price'}>
              {formatCardPrice(price)}
            </span>
            {wasPrice != null ? (
              <span className="menu-card-price-was">{formatCardPrice(wasPrice)}</span>
            ) : null}
          </div>
        ) : offer.kind === 'promo' && offer.badge ? (
          <p className="offers-rail-card__promo-badge">{offer.badge}</p>
        ) : null}
      </div>
    </Link>
  );
}
