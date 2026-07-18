import type { TrustItemRow } from '../../context/SiteSettingsContext';

type Props = {
  items: TrustItemRow[];
};

/** Compact horizontal trust strip from CMS `trust_items`. */
export function TrustStrip({ items }: Props) {
  const rows = items.filter((i) => (i.heading ?? '').trim() !== '');
  if (rows.length === 0) return null;

  return (
    <section
      aria-label="Why order with us"
      style={{
        padding: '0.25rem var(--page-gutter) 0.5rem',
        maxWidth: 'var(--layout-max)',
        margin: '0 auto',
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: '0.625rem',
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
          paddingBottom: 2,
        }}
      >
        {rows.map((item, i) => (
          <div
            key={`${item.heading}-${i}`}
            style={{
              flex: '0 0 auto',
              minWidth: 140,
              maxWidth: 200,
              padding: '0.65rem 0.85rem',
              borderRadius: 12,
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
            }}
          >
            <p style={{ margin: 0, fontSize: '1rem', lineHeight: 1.2 }}>
              {item.icon ? `${item.icon} ` : ''}
              <span style={{ fontWeight: 800, fontSize: '0.8125rem', color: 'var(--color-dark)' }}>
                {item.heading}
              </span>
            </p>
            {item.subtext && (
              <p
                style={{
                  margin: '0.25rem 0 0',
                  fontSize: '0.75rem',
                  color: 'var(--color-text-muted)',
                  lineHeight: 1.35,
                }}
              >
                {item.subtext}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
