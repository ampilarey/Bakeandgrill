import type { CSSProperties, ImgHTMLAttributes } from 'react';

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'srcSet' | 'sizes'> & {
  src: string;
  /** Optional WebP candidate — omitted from <picture> when null/empty. */
  webpSrc?: string | null;
  /** JPEG srcset (e.g. "thumb 400w, crop 1200w"). */
  srcSet?: string | null;
  /** WebP srcset — only emitted when non-empty. */
  webpSrcSet?: string | null;
  sizes?: string | null;
  style?: CSSProperties;
};

/**
 * JPEG (or any raster) with optional WebP <source> and srcset/sizes.
 * Missing WebP or srcset candidates never break the image.
 */
export function PictureImg({
  src,
  webpSrc,
  srcSet,
  webpSrcSet,
  sizes,
  alt = '',
  style,
  ...rest
}: Props) {
  const webp = webpSrc && webpSrc.trim() !== '' ? webpSrc : null;
  const jpegSet = srcSet && srcSet.trim() !== '' ? srcSet : undefined;
  const webpSet = webpSrcSet && webpSrcSet.trim() !== '' ? webpSrcSet : undefined;
  const sizesAttr = sizes && sizes.trim() !== '' ? sizes : undefined;

  if (!webp && !webpSet) {
    return (
      <img
        src={src}
        srcSet={jpegSet}
        sizes={jpegSet ? sizesAttr : undefined}
        alt={alt}
        style={style}
        {...rest}
      />
    );
  }

  return (
    <picture style={style ? { display: 'contents' } : undefined}>
      {webpSet ? (
        <source type="image/webp" srcSet={webpSet} sizes={sizesAttr} />
      ) : webp ? (
        <source type="image/webp" srcSet={webp} />
      ) : null}
      <img
        src={src}
        srcSet={jpegSet}
        sizes={jpegSet ? sizesAttr : undefined}
        alt={alt}
        style={style}
        {...rest}
      />
    </picture>
  );
}
