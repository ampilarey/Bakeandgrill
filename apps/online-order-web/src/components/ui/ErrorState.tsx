import type { ReactNode } from 'react';
import { Button } from './Button';

type ErrorStateProps = {
  title?: string;
  body?: string;
  retryLabel?: string;
  onRetry?: () => void;
  children?: ReactNode;
};

export function ErrorState({
  title = 'Something went wrong',
  body,
  retryLabel = 'Try again',
  onRetry,
  children,
}: ErrorStateProps) {
  return (
    <div className="error-state" role="alert">
      <h2 className="error-state__title">{title}</h2>
      {body && <p className="error-state__body">{body}</p>}
      {children}
      {onRetry && (
        <Button type="button" variant="primary" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
