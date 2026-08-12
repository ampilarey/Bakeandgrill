import { AlertCircle, CheckCircle2 } from 'lucide-react';

export type DraftPublishStatusProps = {
  dirtyCount: number;
  autosaving?: boolean;
  lastSavedAt?: string | null;
  /** Compact single-line for tight mobile chrome. */
  compact?: boolean;
  className?: string;
  testId?: string;
};

/**
 * Truthful publish-state label for Content Hub.
 * - No changes: All published
 * - Draft exists: Draft saved — not live
 */
export function DraftPublishStatus({
  dirtyCount,
  autosaving = false,
  lastSavedAt = null,
  compact = false,
  className = '',
  testId = 'draft-save-status',
}: DraftPublishStatusProps) {
  const unpublished = dirtyCount > 0;
  return (
    <span
      data-testid={testId}
      className={`hub-draft-status${unpublished ? ' hub-draft-status--unpublished' : ' hub-draft-status--live'}${compact ? ' hub-draft-status--compact' : ''}${className ? ` ${className}` : ''}`}
      role="status"
    >
      {unpublished ? (
        <>
          <AlertCircle size={14} aria-hidden className="hub-draft-status-icon" />
          <span className="hub-draft-status-text">
            <span className="hub-draft-status-primary">Draft saved — not live</span>
            {!compact ? (
              <span className="hub-draft-status-secondary">
                {autosaving
                  ? 'Saving… customers still see the old version'
                  : lastSavedAt
                    ? `Autosaved ${new Date(lastSavedAt).toLocaleTimeString()}`
                    : `${dirtyCount} change${dirtyCount === 1 ? '' : 's'} waiting to publish`}
              </span>
            ) : null}
          </span>
        </>
      ) : (
        <>
          <CheckCircle2 size={14} aria-hidden className="hub-draft-status-icon" />
          <span className="hub-draft-status-text">
            <span className="hub-draft-status-primary">All published</span>
          </span>
        </>
      )}
    </span>
  );
}
