import type { ReactNode } from 'react';
import { Button } from './Button';

type EmptyStateProps = {
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  children?: ReactNode;
};

export function EmptyState({ title, body, actionLabel, onAction, children }: EmptyStateProps) {
  return (
    <div className="empty-state" role="status">
      <h2 className="empty-state__title">{title}</h2>
      {body && <p className="empty-state__body">{body}</p>}
      {children}
      {actionLabel && onAction && (
        <Button type="button" variant="primary" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
