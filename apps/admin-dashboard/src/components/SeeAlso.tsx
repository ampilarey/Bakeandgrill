import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/**
 * One line pointing to the page that does the neighbouring job (nav audit,
 * 2026-10-16: Credit accounts vs Credit rules, Analytics vs Forecasts, Daily
 * Specials vs Offers), so two pages that sound alike say which is which.
 */
export function SeeAlso({ children, to, label, testId }: { children: ReactNode; to: string; label: string; testId?: string }) {
  return (
    <p data-testid={testId ?? 'see-also'} style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
      {children}{' '}
      <Link to={to} style={{ color: 'var(--color-primary)', fontWeight: 600 }}>{label}</Link>
    </p>
  );
}
