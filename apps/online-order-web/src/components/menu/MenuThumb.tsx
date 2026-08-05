import { useState } from 'react';
import { PictureImg } from './PictureImg';

type Props = {
  src: string | null | undefined;
  webpSrc?: string | null;
  alt: string;
  /** Emoji shown when image is missing or fails to load */
  placeholder?: string;
  height?: number | string;
  fontSize?: number | string;
};

/** Lazy image with surface-alt + emoji fallback (no broken-image icon). */
export function MenuThumb({
  src,
  webpSrc,
  alt,
  placeholder = '🍽️',
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
        <span style={{ fontSize, opacity: 0.3 }} aria-hidden>
          {placeholder}
        </span>
      )}
    </div>
  );
}
