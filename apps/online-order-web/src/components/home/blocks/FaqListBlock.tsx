import { plain, str, type GenericBlockSettings } from './blockTypes';

type FaqItem = { question: string; answer: string };

function itemsFrom(settings: GenericBlockSettings): FaqItem[] {
  const raw = settings.items;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const q = plain(String((row as FaqItem).question ?? ''));
      const a = plain(String((row as FaqItem).answer ?? ''));
      if (!q || !a) return null;
      return { question: q, answer: a };
    })
    .filter((x): x is FaqItem => x !== null);
}

export function FaqListBlock({ settings }: { settings: GenericBlockSettings }) {
  const items = itemsFrom(settings);
  if (items.length === 0) return null;
  const heading = str(settings, 'heading') || 'FAQ';

  return (
    <section
      data-home-block="faq_list"
      style={{
        padding: '1.5rem var(--page-gutter)',
        maxWidth: 'var(--layout-max)',
        margin: '0 auto',
      }}
    >
      <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: '0 0 0.75rem', color: 'var(--color-dark)' }}>
        {heading}
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
        {items.map((item) => (
          <details
            key={item.question}
            style={{
              border: '1px solid var(--color-border)',
              borderRadius: 12,
              padding: '0.75rem 1rem',
              background: 'var(--color-surface)',
            }}
          >
            <summary style={{ fontWeight: 700, cursor: 'pointer' }}>{item.question}</summary>
            <p style={{ margin: '0.5rem 0 0', fontSize: 14, lineHeight: 1.5, color: 'var(--color-text-muted)' }}>
              {item.answer}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}
