type Props = {
  /** Optional logo URL — falls back to monogram */
  logoSrc?: string | null;
  /** 1–2 letter mark when no logo (default BG) */
  monogram?: string;
  className?: string;
};

/**
 * Soft brand-tint fill for menu cards with no photo — fills the aspect box
 * (not a floating emoji).
 */
export function BrandedMediaPlaceholder({
  logoSrc,
  monogram = 'BG',
  className,
}: Props) {
  return (
    <div
      className={`menu-media-placeholder${className ? ` ${className}` : ''}`}
      data-testid="branded-placeholder"
      aria-hidden
    >
      {logoSrc ? (
        <img
          className="menu-media-placeholder__logo"
          src={logoSrc}
          alt=""
          width={48}
          height={48}
          decoding="async"
        />
      ) : (
        <span className="menu-media-placeholder__mono">{monogram}</span>
      )}
    </div>
  );
}
