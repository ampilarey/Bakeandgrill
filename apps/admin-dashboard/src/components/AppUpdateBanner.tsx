import { useAppUpdate } from '../hooks/appUpdateContext';
import { shortBuildId } from '../adminUpdateSafety';

/**
 * A strip under the header when a newer admin is on the server. Never
 * reloads on its own: whoever is mid-way through a form decides when.
 */
export function AppUpdateBanner() {
  const u = useAppUpdate();
  if (!u.bannerVisible) return null;

  const newer = u.serverBuild && u.serverBuild.build !== u.localBuild.build;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="admin-update-banner"
      style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        padding: '8px 14px', background: 'var(--color-primary-bg, rgba(212,129,58,0.12))',
        borderBottom: '1px solid var(--color-primary)', fontSize: 13,
      }}
    >
      <div style={{ flex: '1 1 200px', minWidth: 0 }}>
        <strong style={{ color: 'var(--color-text)' }}>A newer admin is ready.</strong>{' '}
        <span style={{ color: 'var(--color-text-secondary)' }}>
          Update now, or finish what you are doing first.
          {newer && <> New build {shortBuildId(u.serverBuild!.build)} (yours {shortBuildId(u.localBuild.build)}).</>}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <button
          type="button"
          onClick={u.dismissBanner}
          disabled={u.applying}
          style={{
            padding: '6px 12px', borderRadius: 8, border: '1px solid var(--color-border)', minHeight: 36,
            background: 'var(--color-surface)', color: 'var(--color-text)', fontWeight: 600, fontSize: 12, cursor: 'pointer',
          }}
        >
          Later
        </button>
        <button
          type="button"
          onClick={() => { if (!u.applying) void u.applyUpdate(); }}
          disabled={u.applying}
          style={{
            padding: '6px 12px', borderRadius: 8, border: 'none', minHeight: 36,
            background: 'var(--color-primary)', color: 'var(--color-surface)', fontWeight: 700, fontSize: 12, cursor: u.applying ? 'wait' : 'pointer',
          }}
        >
          {u.applying ? 'Updating…' : 'Update now'}
        </button>
      </div>
    </div>
  );
}
