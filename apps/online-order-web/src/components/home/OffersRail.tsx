/** Offers rail at top of menu — specials + auto-promos from GET /api/offers. */
import { Link } from 'react-router-dom';
import type { Offer } from '../../api/menu';
import { useSiteSettingsContext } from '../../context/SiteSettingsContext';
import { MenuThumb } from '../menu/MenuThumb';

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

export function OffersRail({ offers, headline, subtext, apiOrigin }: Props) {
  const { text } = useSiteSettingsContext();
  const title = headline || text('offers_headline', 'Offers');
  const subtitle = subtext ?? text('offers_subtext', '');

  if (offers.length === 0) return null;

  return (
    <section id="offers" aria-label={title} style={{ paddingBottom: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--color-dark)', margin: 0 }}>{title}</h2>
          {subtitle ? (
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: '0.15rem 0 0' }}>{subtitle}</p>
          ) : null}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '0.875rem', overflowX: 'auto', paddingBottom: '0.35rem' }}>
        {offers.map((offer) => {
          const imgSrc = resolveImage(offer.image_url, apiOrigin);
          const price = offer.effective_price != null ? Number(offer.effective_price) : null;
          const wasPrice =
            price != null && offer.original_price != null && Number(offer.original_price) > price
              ? Number(offer.original_price)
              : null;
          const to = offer.link.startsWith('/') ? offer.link : `/${offer.link}`;
          const urgency = offerUrgencyLabel(offer.ends_at);

          return (
            <Link
              key={offer.id}
              to={to}
              style={{
                flexShrink: 0,
                width: 168,
                borderRadius: 'var(--radius-2xl)',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                overflow: 'hidden',
                textDecoration: 'none',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div style={{ height: 100, position: 'relative', overflow: 'hidden' }}>
                <MenuThumb src={imgSrc} alt={offer.title} height={100} />
                {offer.badge && (
                  <div style={{ position: 'absolute', top: 6, left: 6, zIndex: 2 }}>
                    <div style={{ background: 'var(--color-primary)', color: '#fff', fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 99, lineHeight: 1.3 }}>
                      {offer.badge}
                    </div>
                  </div>
                )}
              </div>
              <div style={{ padding: '0.65rem 0.75rem', flex: 1 }}>
                <p style={{ margin: '0 0 3px', fontWeight: 700, fontSize: 12, color: 'var(--color-dark)', lineHeight: 1.3 }}>{offer.title}</p>
                {offer.subtitle && (
                  <p style={{ margin: '0 0 3px', fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', lineHeight: 1.3 }}>{offer.subtitle}</p>
                )}
                {urgency && (
                  <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 700, color: '#B45309' }}>{urgency}</p>
                )}
                {price != null && (
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                    <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--color-primary)' }}>MVR {price.toFixed(2)}</span>
                    {wasPrice != null && (
                      <span style={{ fontSize: 10, color: 'var(--color-text-muted)', textDecoration: 'line-through' }}>MVR {wasPrice.toFixed(2)}</span>
                    )}
                  </div>
                )}
                {price == null && offer.kind === 'promo' && (
                  <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: 'var(--color-primary)' }}>{offer.badge}</p>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
