import type { ReactNode } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { Button } from './Button';

type ErrorStateProps = {
  /** Prefer passing t('error.generic_title') at call sites. */
  title?: string;
  body?: string;
  /** Prefer passing t('common.try_again') at call sites. */
  retryLabel?: string;
  onRetry?: () => void;
  children?: ReactNode;
};

export function ErrorState({
  title,
  body,
  retryLabel,
  onRetry,
  children,
}: ErrorStateProps) {
  const { t } = useLanguage();
  const resolvedTitle = title ?? t('error.generic_title');
  const resolvedRetry = retryLabel ?? t('common.try_again');

  return (
    <div className="error-state" role="alert">
      <h2 className="error-state__title">{resolvedTitle}</h2>
      {body && <p className="error-state__body">{body}</p>}
      {children}
      {onRetry && (
        <Button type="button" variant="primary" onClick={onRetry}>
          {resolvedRetry}
        </Button>
      )}
    </div>
  );
}
