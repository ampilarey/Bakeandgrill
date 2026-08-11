import { PictureImg } from '../../menu/PictureImg';
import {
  absoluteUrl,
  plain,
  safeHtml,
  str,
  type BlockMedia,
  type GenericBlockSettings,
} from './blockTypes';

/**
 * Picture beside words. On a phone the two always stack; `side` only decides
 * which one leads once there is room for a row.
 */
export function ImageTextBlock({
  settings,
  media,
  apiOrigin,
}: {
  settings: GenericBlockSettings;
  media: BlockMedia;
  apiOrigin: string;
}) {
  const image = media?.image ?? null;
  const src = absoluteUrl(image?.url, apiOrigin);
  const heading = plain(str(settings, 'heading'));
  const body = str(settings, 'body');
  const hasBody = plain(body) !== '';
  const caption = plain(str(settings, 'caption'));
  const alt = plain(str(settings, 'alt')) || image?.alt || '';
  const side = str(settings, 'side') === 'right' ? 'right' : 'left';

  if (!src && heading === '' && !hasBody) return null;

  return (
    <section
      data-home-block="image_text"
      data-side={side}
      style={{
        padding: '1rem var(--page-gutter)',
        maxWidth: 'var(--layout-max)',
        margin: '0 auto',
        width: '100%',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '1rem',
          alignItems: 'center',
          flexDirection: side === 'right' ? 'row-reverse' : 'row',
        }}
      >
        {src && (
          <figure style={{ margin: 0, flex: '1 1 240px', minWidth: 'min(100%, 240px)' }}>
            <PictureImg
              src={src}
              webpSrc={absoluteUrl(image?.webp, apiOrigin)}
              alt={alt}
              loading="lazy"
              decoding="async"
              style={{ display: 'block', width: '100%', height: 'auto', borderRadius: 14 }}
            />
            {caption !== '' && (
              <figcaption
                style={{ marginTop: '0.4rem', fontSize: '0.78rem', color: 'var(--color-text-muted)' }}
              >
                {caption}
              </figcaption>
            )}
          </figure>
        )}
        {(heading !== '' || hasBody) && (
          <div style={{ flex: '1 1 260px', minWidth: 'min(100%, 240px)' }}>
            {heading !== '' && (
              <h2
                style={{
                  fontSize: '1.05rem',
                  fontWeight: 800,
                  margin: '0 0 0.4rem',
                  color: 'var(--color-dark)',
                }}
              >
                {heading}
              </h2>
            )}
            {hasBody && (
              <div
                style={{ fontSize: '0.92rem', lineHeight: 1.6, color: 'var(--color-text-muted)' }}
                dangerouslySetInnerHTML={{ __html: safeHtml(body) }}
              />
            )}
          </div>
        )}
      </div>
    </section>
  );
}
