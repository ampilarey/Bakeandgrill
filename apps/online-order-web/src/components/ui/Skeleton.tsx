import type { CSSProperties } from 'react';

type SkeletonProps = {
  width?: string | number;
  height?: string | number;
  /** Border radius; defaults to theme lg. */
  radius?: string;
  className?: string;
  style?: CSSProperties;
  /** Accessible label for pending content. */
  label?: string;
};

/** Block skeleton using the shared shimmer (`.skeleton-block` / existing `.skeleton`). */
export function Skeleton({
  width = '100%',
  height = '1rem',
  radius,
  className,
  style,
  label = 'Loading',
}: SkeletonProps) {
  return (
    <span
      className={`skeleton-block${className ? ` ${className}` : ''}`}
      style={{
        width,
        height,
        borderRadius: radius,
        ...style,
      }}
      role="status"
      aria-label={label}
    />
  );
}
