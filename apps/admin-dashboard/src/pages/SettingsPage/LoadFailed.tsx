import { Btn } from '../../components/SharedUI';

/**
 * A settings box whose first load failed (audit, 2026-10-16): it used to say
 * "Loading…" for ever, with the error kept and never shown. Says what failed
 * and offers Retry, so nobody has to reload the whole page.
 */
export function LoadFailed({ what, message, onRetry }: { what: string; message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      data-testid="settings-load-failed"
      style={{
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        padding: '12px 14px', borderRadius: 10,
        background: 'var(--color-bg)',
        border: '1px solid color-mix(in srgb, var(--color-danger) 35%, transparent)',
        color: 'var(--color-danger-strong)', fontSize: 14,
      }}
    >
      <span style={{ flex: '1 1 220px' }}>Couldn&apos;t load the {what} settings: {message}</span>
      <Btn small variant="secondary" onClick={onRetry}>Retry</Btn>
    </div>
  );
}
