import type { CSSProperties, ImgHTMLAttributes } from 'react';

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src: string;
  /** Optional WebP candidate — omitted from <picture> when null/empty. */
  webpSrc?: string | null;
  style?: CSSProperties;
};

/**
 * JPEG (or any raster) with an optional WebP <source>. Missing WebP never breaks the image.
 */
export function PictureImg({ src, webpSrc, alt = '', style, ...rest }: Props) {
  const webp = webpSrc && webpSrc.trim() !== '' ? webpSrc : null;

  if (!webp) {
    return <img src={src} alt={alt} style={style} {...rest} />;
  }

  return (
    <picture style={style ? { display: 'contents' } : undefined}>
      <source type="image/webp" srcSet={webp} />
      <img src={src} alt={alt} style={style} {...rest} />
    </picture>
  );
}
