import type { ReactNode } from 'react';
import { useLanguage } from '../../context/LanguageContext';

type PageHeaderProps = {
  title: string;
  onBack?: () => void;
  /** Optional right-side slot (actions). */
  right?: ReactNode;
  /** Pass t('common.back') at call sites when overriding. */
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
  backAriaLabel,
}: PageHeaderProps) {
  const { t } = useLanguage();
  const label = backAriaLabel ?? t('common.back');

  return (
    <header className="page-header">
      {onBack && (
        <button type="button" className="page-header__back" onClick={onBack} aria-label={label}>
          ←
        </button>
      )}
      <h1 className="page-header__title">{title}</h1>
      {right}
    </header>
  );
}
