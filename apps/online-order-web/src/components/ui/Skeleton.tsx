import type { CSSProperties } from 'react';
import { useLanguage } from '../../context/LanguageContext';

type SkeletonProps = {
  width?: string | number;
  height?: string | number;
  /** Border radius; defaults to theme lg. */
  radius?: string;
  className?: string;
  style?: CSSProperties;
  /** Prefer passing t('common.loading') at call sites. */
  label?: string;
};

/** Block skeleton using the shared shimmer (`.skeleton-block` / existing `.skeleton`). */
export function Skeleton({
  width = '100%',
  height = '1rem',
  radius,
  className,
  style,
  label,
}: SkeletonProps) {
  const { t } = useLanguage();
  const resolvedLabel = label ?? t('common.loading');

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
      aria-label={resolvedLabel}
    />
  );
}
