import { useState } from 'react';
import { PictureImg } from './PictureImg';
import { resolveMediaUrl } from '../../utils/itemMedia';

type Props = {
  src: string | null | undefined;
  webpSrc?: string | null;
  alt: string;
  height?: number | string;
  /** Size of the brand flame shown when the image is missing or fails to load. */
  fontSize?: number | string;
};

/**
 * Lazy image with the menu's quiet no-photo tile (the brand flame, faded) as
 * its fallback: no broken-image icon, and no plate emoji (UI audit, 2026-10-10).
 */
export function MenuThumb({
  src,
  webpSrc,
  alt,
  height = '100%',
  fontSize = 28,
}: Props) {
  const [failed, setFailed] = useState(false);
  const showImg = Boolean(src) && !failed;

  return (
    <div
      style={{
        height,
        width: '100%',
        background: 'var(--color-surface-alt)',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {showImg ? (
        <PictureImg
          src={src!}
          webpSrc={webpSrc}
          alt={alt}
          loading="lazy"
          onError={() => setFailed(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <img
          src={resolveMediaUrl('/brand/flame-mark.svg') ?? '/brand/flame-mark.svg'}
          alt=""
          aria-hidden
          className="quiet-flame-mark"
          style={{ width: typeof fontSize === 'number' ? fontSize * 1.3 : fontSize }}
        />
      )}
    </div>
  );
}
