import { PictureImg } from '../../menu/PictureImg';
import { absoluteUrl, plain, str, type BlockMedia, type GenericBlockSettings } from './blockTypes';

/** One picture with an optional caption. Deleted media renders nothing. */
export function ImageBlock({
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
  if (!src) return null;

  const caption = plain(str(settings, 'caption'));
  const alt = plain(str(settings, 'alt')) || image?.alt || '';

  return (
    <section
      data-home-block="image"
      style={{
        padding: '0.75rem var(--page-gutter)',
        maxWidth: 'var(--layout-max)',
        margin: '0 auto',
        width: '100%',
      }}
    >
      <figure style={{ margin: 0 }}>
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
            style={{
              marginTop: '0.5rem',
              fontSize: '0.8rem',
              color: 'var(--color-text-muted)',
              textAlign: 'center',
            }}
          >
            {caption}
          </figcaption>
        )}
      </figure>
    </section>
  );
}
