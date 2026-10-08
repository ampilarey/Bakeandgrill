import type { ReactNode } from 'react';

type Variant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'brand';

// The theme's tokens, so the pills follow the brand and the dark theme; "info"
// was Tailwind blue, which is not a brand colour.
const styles: Record<Variant, string> = {
  success: 'bg-[var(--color-success-bg)] text-[var(--color-success-strong)] border-[var(--color-success-bg)]',
  warning: 'bg-[var(--color-warning-bg)] text-[var(--color-warning-strong)] border-[var(--color-tone-gold-border)]',
  danger:  'bg-[var(--color-danger-bg)] text-[var(--color-danger-strong)] border-[var(--color-danger-bg)]',
  info:    'bg-[var(--color-tone-brown-bg)] text-[var(--color-tone-brown-text)] border-[var(--color-tone-brown-border)]',
  neutral: 'bg-[var(--color-bg)] text-[var(--color-text-secondary)] border-[var(--color-border)]',
  brand:   'bg-[var(--color-tone-rust-bg)] text-[var(--color-tone-rust-text)] border-[var(--color-tone-rust-border)]',
};

interface Props {
  variant?: Variant;
  children: ReactNode;
  className?: string;
}

export function Badge({ variant = 'neutral', children, className = '' }: Props) {
  return (
    <span className={[
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border',
      styles[variant],
      className,
    ].join(' ')}>
      {children}
    </span>
  );
}
