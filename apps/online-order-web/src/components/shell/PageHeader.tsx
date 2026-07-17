import type { ReactNode } from 'react';

type PageHeaderProps = {
  title: string;
  onBack?: () => void;
  /** Optional right-side slot (actions). */
  right?: ReactNode;
  backAriaLabel?: string;
};

/**
 * Sticky in-tab page header (title + optional back / right slot).
 * Standalone routes may use BrandedHeader instead.
 */
export function PageHeader({
  title,
  onBack,
  right,
  backAriaLabel = 'Back',
}: PageHeaderProps) {
  return (
    <header className="page-header">
      {onBack && (
        <button type="button" className="page-header__back" onClick={onBack} aria-label={backAriaLabel}>
          ←
        </button>
      )}
      <h1 className="page-header__title">{title}</h1>
      {right}
    </header>
  );
}
