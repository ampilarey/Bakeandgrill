/** Shared circular ZUS offer card — used by OffersRail and SpecialsCarousel. */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { Offer } from '../../api/menu';
import { formatCardPrice } from '../../utils/money';
import type { MediaSlide } from '../../utils/itemMedia';
import { MenuImageSlider } from '../menu/MenuImageSlider';

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

function offerSlides(offer: Offer, apiOrigin: string, defaultImageUrl?: string | null): MediaSlide[] {
  const imgSrc = resolveImage(offer.image_url, apiOrigin)
    || resolveImage(defaultImageUrl, apiOrigin);
  if (!imgSrc) return [];
  return [{ type: 'image', url: imgSrc, alt: offer.title }];
}

/** Drop duplicate offer ids (home + menu can share the same feed). */
export function uniqueOffersById(offers: Offer[]): Offer[] {
  const seen = new Set<string>();
  return offers.filter((o) => {
    if (seen.has(o.id)) return false;
    seen.add(o.id);
    return true;
  });
}

type Props = {
  offer: Offer;
  apiOrigin: string;
  logoSrc: string;
  /** Site default item photo when the offer has no image_url. */
  defaultImageUrl?: string | null;
  /** data-testid prefix for media frame / price row (default: offer-card) */
  testId?: string;
  /** Dine-in view — no link into the ordering flow. */
  viewOnly?: boolean;
};

export function OfferCard({
  offer,
  apiOrigin,
  logoSrc,
  defaultImageUrl = null,
  testId = 'offer-card',
  viewOnly = false,
}: Props) {
  const slides = useMemo(
    () => offerSlides(offer, apiOrigin, defaultImageUrl),
    [offer, apiOrigin, defaultImageUrl],
  );
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

  const className = `offers-rail-card menu-card-article menu-card-article--zus${onSale ? ' menu-card-on-sale' : ''}`;
  const body = (
    <>
      <div className="menu-card-media-circle">
        <div
          className="menu-card-media-circle__frame"
          data-testid={`${testId}-media-frame`}
          style={{ aspectRatio: '1 / 1' }}
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
          <div className="menu-card-price-row" data-testid={`${testId}-price-row`}>
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
    </>
  );

  if (viewOnly) {
    return (
      <article className={className} data-testid={testId}>
        {body}
      </article>
    );
  }

  return (
    <Link to={to} className={className} data-testid={testId}>
      {body}
    </Link>
  );
}
