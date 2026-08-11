import { plain, safeHtml, str, type GenericBlockSettings } from './blockTypes';

/**
 * Free-form heading + paragraph block. The body arrives already sanitised by
 * the server; DOMPurify runs again here so a rogue stored row can never turn
 * into markup we did not intend.
 */
export function RichTextBlock({ settings }: { settings: GenericBlockSettings }) {
  const heading = plain(str(settings, 'heading'));
  const body = str(settings, 'body');
  const hasBody = plain(body) !== '';

  if (heading === '' && !hasBody) return null;

  return (
    <section
      data-home-block="rich_text"
      style={{
        padding: '1.25rem var(--page-gutter)',
        maxWidth: 'var(--layout-max)',
        margin: '0 auto',
        width: '100%',
      }}
    >
      {heading !== '' && (
        <h2
          style={{
            fontSize: '1.1rem',
            fontWeight: 800,
            margin: '0 0 0.5rem',
            color: 'var(--color-dark)',
          }}
        >
          {heading}
        </h2>
      )}
      {hasBody && (
        <div
          style={{ fontSize: '0.95rem', lineHeight: 1.65, color: 'var(--color-text-muted)' }}
          dangerouslySetInnerHTML={{ __html: safeHtml(body) }}
        />
      )}
    </section>
  );
}
