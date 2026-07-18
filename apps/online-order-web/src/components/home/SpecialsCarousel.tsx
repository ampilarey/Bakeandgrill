import { Link } from 'react-router-dom';
import type { DailySpecial } from '../../api/menu';
import { useLanguage } from '../../context/LanguageContext';

function showPctUnder(badge: string | null | undefined, pct: number | null | undefined): boolean {
  if (!badge || !pct || pct <= 0) return false;
  return !badge.includes(`${pct}%`);
}

type Props = {
  specials: DailySpecial[];
  apiOrigin: string;
};

/**
 * Today's specials horizontal scroll strip.
 * Returns null when specials list is empty.
 */
export function SpecialsCarousel({ specials, apiOrigin }: Props) {
  const { t } = useLanguage();

  if (specials.length === 0) return null;

  return (
    <section
      aria-label={t('home.specials_title')}
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
          <h2
            style={{
              fontSize: '1.25rem',
              fontWeight: 800,
              color: 'var(--color-dark)',
              margin: 0,
            }}
          >
            {t('home.specials_title')}
          </h2>
          <Link
            to="/menu"
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

        <div
          style={{
            display: 'flex',
            gap: '0.875rem',
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
            paddingBottom: 4,
          }}
        >
          {specials.map((sp) => {
            const cardKey = sp.variant_id ? `${sp.id}-${sp.variant_id}` : String(sp.id);
            const imgSrc = sp.item_image
              ? sp.item_image.startsWith('http')
                ? sp.item_image
                : `${apiOrigin}${sp.item_image.startsWith('/') ? '' : '/'}${sp.item_image}`
              : null;
            const price = Number(sp.effective_price ?? 0);
            const wasPrice =
              sp.original_price != null && Number(sp.original_price) > price
                ? Number(sp.original_price)
                : null;
            const badge =
              sp.badge_label ?? (sp.discount_pct ? `${sp.discount_pct}% OFF` : 'Special');
            const showPct = showPctUnder(sp.badge_label, sp.discount_pct);

            return (
              <Link
                key={cardKey}
                to={`/menu?item=${sp.item_id}`}
                style={{
                  flexShrink: 0,
                  width: 160,
                  borderRadius: 'var(--radius-2xl)',
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  overflow: 'hidden',
                  textDecoration: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <div
                  style={{
                    height: 100,
                    background: 'var(--color-surface-alt)',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  {imgSrc ? (
                    <img
                      src={imgSrc}
                      alt={sp.item_name ?? ''}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '100%',
                        fontSize: 28,
                        opacity: 0.3,
                      }}
                    >
                      🍽️
                    </div>
                  )}
                  <div
                    style={{
                      position: 'absolute',
                      top: 6,
                      left: 6,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      gap: 3,
                      zIndex: 2,
                    }}
                  >
                    {badge && (
                      <div
                        style={{
                          background: 'var(--color-primary)',
                          color: '#fff',
                          fontSize: 9,
                          fontWeight: 700,
                          padding: '2px 7px',
                          borderRadius: 99,
                          lineHeight: 1.3,
                        }}
                      >
                        {badge}
                      </div>
                    )}
                    {showPct && (
                      <div
                        style={{
                          background: 'var(--color-primary)',
                          color: '#fff',
                          fontSize: 9,
                          fontWeight: 700,
                          padding: '2px 7px',
                          borderRadius: 99,
                          lineHeight: 1.3,
                        }}
                      >
                        {sp.discount_pct}% OFF
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ padding: '0.6rem 0.7rem', flex: 1 }}>
                  <p
                    style={{
                      margin: '0 0 3px',
                      fontWeight: 700,
                      fontSize: 12,
                      color: 'var(--color-dark)',
                      lineHeight: 1.3,
                    }}
                  >
                    {sp.item_name}
                  </p>
                  {sp.variant_name && (
                    <p
                      style={{
                        margin: '0 0 3px',
                        fontSize: 11,
                        fontWeight: 600,
                        color: 'var(--color-text-muted)',
                      }}
                    >
                      {sp.variant_name}
                    </p>
                  )}
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                    <span
                      style={{ fontWeight: 800, fontSize: 13, color: 'var(--color-primary)' }}
                    >
                      MVR {price.toFixed(2)}
                    </span>
                    {wasPrice && (
                      <span
                        style={{
                          fontSize: 10,
                          color: 'var(--color-text-muted)',
                          textDecoration: 'line-through',
                        }}
                      >
                        MVR {wasPrice.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
