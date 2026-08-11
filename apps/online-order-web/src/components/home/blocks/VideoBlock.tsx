import { absoluteUrl, plain, str, type BlockMedia, type GenericBlockSettings } from './blockTypes';

/**
 * Silent looping video — same muted/autoplay/playsInline treatment as the hero
 * so iOS plays it inline instead of taking over the screen.
 */
export function VideoBlock({
  settings,
  media,
  apiOrigin,
}: {
  settings: GenericBlockSettings;
  media: BlockMedia;
  apiOrigin: string;
}) {
  const video = media?.video ?? null;
  const src = absoluteUrl(video?.url, apiOrigin);
  if (!src) return null;

  const poster = absoluteUrl(video?.poster_url, apiOrigin);
  const caption = plain(str(settings, 'caption'));

  return (
    <section
      data-home-block="video"
      style={{
        padding: '0.75rem var(--page-gutter)',
        maxWidth: 'var(--layout-max)',
        margin: '0 auto',
        width: '100%',
      }}
    >
      <figure style={{ margin: 0 }}>
        <video
          src={src}
          poster={poster ?? undefined}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-label={video?.alt || caption || 'Video'}
          style={{
            display: 'block',
            width: '100%',
            height: 'auto',
            borderRadius: 14,
            background: '#000',
          }}
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
