import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
  children: ReactNode;
}

const variantStyles: Record<Variant, React.CSSProperties> = {
  primary: {
    background: 'var(--color-primary)',
    color: 'white',
    border: 'none',
  },
  secondary: {
    background: 'var(--color-primary-light)',
    color: 'var(--color-primary)',
    border: '1.5px solid rgba(217,119,6,0.2)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--color-text)',
    border: '1.5px solid var(--color-border)',
  },
};

const variantHover: Record<Variant, string> = {
  primary: 'btn-primary-hover',
  secondary: 'nav-pill-hover',
  ghost: 'btn-ghost-hover',
};

export function Button({
  variant = 'primary',
  loading = false,
  disabled,
  children,
  style,
  className,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <button
      disabled={isDisabled}
      className={`${variantHover[variant]}${className ? ` ${className}` : ''}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        padding: '0.7rem 1.5rem',
        borderRadius: 'var(--radius-lg)',
        fontFamily: 'inherit',
        fontSize: '0.9375rem',
        fontWeight: 600,
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        opacity: isDisabled ? 0.55 : 1,
        ...variantStyles[variant],
        ...style,
      }}
      aria-busy={loading}
      {...props}
    >
      {loading && (
        <span
          style={{
            width: '14px', height: '14px',
            border: '2px solid currentColor',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 0.7s linear infinite',
            display: 'inline-block',
            flexShrink: 0,
          }}
          aria-hidden="true"
        />
      )}
      {children}
    </button>
  );
}
