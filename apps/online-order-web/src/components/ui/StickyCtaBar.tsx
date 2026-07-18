import type { ButtonHTMLAttributes, ReactNode } from 'react';

type StickyCtaBarProps = {
  label: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  type?: ButtonHTMLAttributes<HTMLButtonElement>['type'];
  /** Extra content above the button (e.g. terms note). */
  above?: ReactNode;
  className?: string;
};

/**
 * Sticky bottom CTA for sheets / checkout. Uses AA-safe primary label sizing
 * (see docs/online-order-ui-redesign/AMBER_CONTRAST_AUDIT.md).
 */
export function StickyCtaBar({
  label,
  onClick,
  disabled,
  loading,
  type = 'button',
  above,
  className,
}: StickyCtaBarProps) {
  return (
    <div className={`sticky-cta-bar${className ? ` ${className}` : ''}`}>
      {above}
      <button
        type={type}
        className="sticky-cta-bar__btn"
        onClick={onClick}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
      >
        {loading ? '…' : label}
      </button>
    </div>
  );
}
