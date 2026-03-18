import type { ReactNode, CSSProperties } from 'react';

interface CardProps {
  children: ReactNode;
  title?: string;
  style?: CSSProperties;
  className?: string;
}

export function Card({ children, title, style, className }: CardProps) {
  return (
    <div
      className={className}
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-2xl)',
        padding: '1.5rem',
        ...style,
      }}
    >
      {title && (
        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-dark)', marginBottom: '1rem' }}>
          {title}
        </h3>
      )}
      {children}
    </div>
  );
}
