import type { ReactNode } from 'react';

/**
 * One row of a wide table, as a card for a phone.
 *
 * Layout audit, 2026-09-10 (L-01): Orders, Print Jobs, Customers and Supplier
 * Intelligence render seven to nine columns and nothing else. The global rule
 * in `index.css` makes them scroll sideways so nothing is clipped, but reading
 * one order on a phone means dragging through nine columns — while Inventory,
 * Media Library, Modifiers and Signage all switch to stacked cards at the same
 * width. Same product, two behaviours, depending on which page you opened.
 *
 * Shared rather than written four times: these cards sit next to each other in
 * one product, so the edges, baselines and inner padding have to match, and
 * four hand-rolled copies drift apart the first time one of them is touched.
 *
 * A card is not a table row with the borders removed. It carries what
 * identifies the record — the title line and the one badge that says its state
 * — and then the handful of fields somebody actually needs before tapping
 * through. Columns that only make sense next to their neighbours belong in the
 * row's own detail view, not squeezed in here.
 */
export type RecordField = { label: string; value: ReactNode } | null | false | undefined;

export function RecordCard({
  title,
  subtitle,
  badge,
  accent,
  fields,
  actions,
  testId,
  onClick,
}: {
  title: ReactNode;
  /** The quiet second line: a reference, a date, whatever names the record. */
  subtitle?: ReactNode;
  /** State, as one chip. The thing that should read without being read. */
  badge?: ReactNode;
  /** Left edge colour, for a card whose state is worth seeing across a list. */
  accent?: string;
  fields?: RecordField[];
  actions?: ReactNode;
  testId?: string;
  onClick?: () => void;
}) {
  const shown = (fields ?? []).filter(
    (f): f is { label: string; value: ReactNode } => Boolean(f),
  );

  return (
    <article
      data-testid={testId}
      onClick={onClick}
      style={{
        border: '1px solid var(--color-border)',
        borderLeft: `4px solid ${accent ?? 'var(--color-border)'}`,
        borderRadius: 12,
        padding: '12px 14px',
        background: 'var(--color-surface)',
        display: 'grid',
        gap: 10,
        cursor: onClick ? 'pointer' : undefined,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
        {/* minWidth:0 or a long customer name pushes the badge off the card. */}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--color-text)', wordBreak: 'break-word' }}>
            {title}
          </div>
          {subtitle != null && subtitle !== '' && (
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2, wordBreak: 'break-word' }}>
              {subtitle}
            </div>
          )}
        </div>
        {badge != null && <div style={{ flexShrink: 0 }}>{badge}</div>}
      </div>

      {shown.length > 0 && (
        <div
          style={{
            display: 'grid',
            // Two up on a phone, one up on the narrowest, without a second
            // breakpoint to keep in step with the stylesheet.
            gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
            gap: '8px 12px',
          }}
        >
          {shown.map((f) => (
            <div key={f.label} style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                  textTransform: 'uppercase', color: 'var(--color-text-muted)',
                }}
              >
                {f.label}
              </div>
              <div style={{ fontSize: 13, color: 'var(--color-text)', wordBreak: 'break-word' }}>
                {f.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {actions && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 2 }}>{actions}</div>
      )}
    </article>
  );
}

/** The list the cards sit in, so spacing is the same on every page. */
export function RecordCardList({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <div data-testid={testId} style={{ display: 'grid', gap: 10 }}>
      {children}
    </div>
  );
}
