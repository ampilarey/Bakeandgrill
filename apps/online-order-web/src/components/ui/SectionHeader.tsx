import type { ReactNode } from 'react';

interface SectionHeaderProps {
  eyebrow?: string;
  heading: ReactNode;
  align?: 'left' | 'center';
}

export function SectionHeader({ eyebrow, heading, align = 'center' }: SectionHeaderProps) {
  return (
    <div style={{ textAlign: align, marginBottom: '1.75rem' }}>
      {eyebrow && (
        <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-primary)', marginBottom: '0.4rem' }}>
          {eyebrow}
        </p>
      )}
      <h2 style={{ fontSize: 'clamp(1.4rem, 4vw, 2rem)', fontWeight: 800, color: 'var(--color-dark)', letterSpacing: '-0.03em', margin: 0 }}>
        {heading}
      </h2>
    </div>
  );
}
