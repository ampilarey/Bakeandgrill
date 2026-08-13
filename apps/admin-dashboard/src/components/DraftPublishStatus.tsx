import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';

export type DraftPublishApp = 'website' | 'order_app';

export type DraftPublishStatusProps = {
  dirtyCount: number;
  /** Current Content Hub destination — drives publish/published wording. */
  app?: DraftPublishApp;
  autosaving?: boolean;
  /** Local edits exist that failed to reach the server. */
  saveFailed?: boolean;
  /** Optional API/network detail shown under Draft not saved. */
  saveErrorDetail?: string | null;
  /** Edits exist and autosave has not confirmed yet (not a hard failure). */
  savePending?: boolean;
  publishing?: boolean;
  publishFailed?: boolean;
  lastSavedAt?: string | null;
  /** Compact single-line for tight mobile chrome. */
  compact?: boolean;
  className?: string;
  testId?: string;
  onRetrySave?: () => void;
  onRetryPublish?: () => void;
};

function appNoun(app?: DraftPublishApp): string {
  return app === 'order_app' ? 'Order App' : 'Website';
}

/**
 * Truthful publish-state label for Content Hub.
 * Required states: Saving draft… / Draft saved / Draft not saved — Retry /
 * Publishing Website|Order App… / Website|Order App published /
 * Publish failed — Try again.
 */
export function DraftPublishStatus({
  dirtyCount,
  app = 'website',
  autosaving = false,
  saveFailed = false,
  saveErrorDetail = null,
  savePending = false,
  publishing = false,
  publishFailed = false,
  lastSavedAt = null,
  compact = false,
  className = '',
  testId = 'draft-save-status',
  onRetrySave,
  onRetryPublish,
}: DraftPublishStatusProps) {
  const noun = appNoun(app);
  const unpublished = dirtyCount > 0;
  const failed = saveFailed && unpublished && !autosaving;
  const showPublishFailed = publishFailed && !publishing;

  let primary = `${noun} published`;
  let secondary: string | null = null;
  let tone: 'live' | 'unpublished' | 'error' | 'busy' = 'live';
  let showRetrySave = false;
  let showRetryPublish = false;

  if (publishing) {
    primary = `Publishing ${noun}…`;
    secondary = compact ? null : 'Please wait — do not close this page';
    tone = 'busy';
  } else if (showPublishFailed) {
    primary = 'Publish failed — Try again';
    secondary = compact ? null : `${noun} drafts are still here. Nothing went live.`;
    tone = 'error';
    showRetryPublish = Boolean(onRetryPublish);
  } else if (autosaving || (savePending && unpublished)) {
    primary = 'Saving draft…';
    secondary = compact ? null : `Customers still see the published ${noun}`;
    tone = 'busy';
  } else if (failed) {
    primary = 'Draft not saved — Retry';
    secondary = compact
      ? null
      : [
        saveErrorDetail?.trim() || null,
        'Changes are only on this device until saved. They will be lost if you leave without retrying.',
      ].filter(Boolean).join(' ');
    tone = 'error';
    showRetrySave = Boolean(onRetrySave);
  } else if (unpublished) {
    primary = 'Draft saved';
    secondary = compact
      ? null
      : lastSavedAt
        ? `Saved ${new Date(lastSavedAt).toLocaleTimeString()} — not live on ${noun} until you publish`
        : `${dirtyCount} change${dirtyCount === 1 ? '' : 's'} waiting to publish to ${noun}`;
    tone = 'unpublished';
  }

  return (
    <span
      data-testid={testId}
      className={`hub-draft-status hub-draft-status--${tone}${compact ? ' hub-draft-status--compact' : ''}${className ? ` ${className}` : ''}`}
      role="status"
      aria-live="polite"
    >
      {tone === 'busy' ? (
        <Loader2 size={14} aria-hidden className="hub-draft-status-icon hub-draft-status-icon--spin" />
      ) : tone === 'error' ? (
        <AlertCircle size={14} aria-hidden className="hub-draft-status-icon" />
      ) : unpublished ? (
        <AlertCircle size={14} aria-hidden className="hub-draft-status-icon" />
      ) : (
        <CheckCircle2 size={14} aria-hidden className="hub-draft-status-icon" />
      )}
      <span className="hub-draft-status-text">
        <span className="hub-draft-status-primary">{primary}</span>
        {secondary ? (
          <span className="hub-draft-status-secondary">{secondary}</span>
        ) : null}
      </span>
      {showRetrySave ? (
        <button
          type="button"
          className="hub-draft-status-retry"
          data-testid="draft-retry-save"
          onClick={onRetrySave}
        >
          <RefreshCw size={14} aria-hidden /> Retry save
        </button>
      ) : null}
      {showRetryPublish ? (
        <button
          type="button"
          className="hub-draft-status-retry"
          data-testid="draft-retry-publish"
          onClick={onRetryPublish}
        >
          <RefreshCw size={14} aria-hidden /> Try again
        </button>
      ) : null}
    </span>
  );
}
