import { useEffect, useState } from 'react';
import { RefreshCw, Download, Smartphone, Trash2, DatabaseZap } from 'lucide-react';
import { Button, Card } from './ui';
import { useAppUpdate } from '../hooks/appUpdateContext';
import { shortBuildId } from '../adminUpdateSafety';

/*
 * The admin as an app. Owner, 2026-09-14: "enhance the mobile pwa for admin,
 * data base update option, admin app update option etc. Same as pos."
 *
 * Four things the POS has that this did not: what build you are on, a way to
 * check for and install a newer one, a way to pull fresh data without leaving
 * the page, and a way out when the app is stuck. Plus how to put it on the
 * home screen, which is where "mobile pwa" starts.
 */

type InstallPromptEvent = Event & { prompt: () => Promise<void> };

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches);
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function AppUpdatePanel() {
  const u = useAppUpdate();
  const [message, setMessage] = useState('');
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [standalone] = useState(isStandalone);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);

  // Android and desktop Chrome hand over an install prompt; iOS never does.
  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setInstallPrompt(e as InstallPromptEvent); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  const check = async () => {
    setMessage('');
    const found = await u.checkNow({ force: true });
    setMessage(found ? 'A newer admin is on the server — tap Update app.' : 'You are on the latest build.');
  };

  const update = async () => {
    setMessage('');
    const res = await u.requestManualUpdate();
    if (res === 'applying') setMessage('Reloading onto the latest build…');
    else if (res === 'current') setMessage('You are on the latest build — reloading.');
    else setMessage('Could not reload — close the app from the home screen and reopen it.');
  };

  const reloadData = () => {
    u.refreshData();
    setRefreshedAt(new Date().toLocaleTimeString());
    setMessage('Data reloaded from the server.');
  };

  const reset = async () => {
    if (!window.confirm('Clear the cached app and reload? You stay signed in; nothing you have saved is touched.')) return;
    await u.hardReset();
  };

  const row: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, padding: '6px 0', borderBottom: '1px solid var(--color-border-light)' };
  const k: React.CSSProperties = { color: 'var(--color-text-muted)' };
  const v: React.CSSProperties = { color: 'var(--color-text)', fontVariantNumeric: 'tabular-nums', textAlign: 'right' };

  return (
    <Card>
      <div data-testid="app-update-panel">
        <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: 16, color: 'var(--color-text)' }}>Admin app</p>
        <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
          {standalone
            ? 'Installed on this device’s home screen.'
            : 'Running in the browser. Add it to the home screen for a full-screen app that opens in one tap.'}
        </p>

        <div style={row}>
          <span style={k}>This device</span>
          <span style={v} data-testid="app-local-build">v{u.localBuild.version} · {shortBuildId(u.localBuild.build)}</span>
        </div>
        <div style={row}>
          <span style={k}>On the server</span>
          <span style={v} data-testid="app-server-build">
            {u.serverBuild ? `v${u.serverBuild.version} · ${shortBuildId(u.serverBuild.build)}` : '—'}
            {u.updateAvailable && <span style={{ marginLeft: 6, color: 'var(--color-primary)', fontWeight: 700 }}>newer</span>}
          </span>
        </div>
        <div style={{ ...row, borderBottom: 'none' }}>
          <span style={k}>Last checked</span>
          <span style={v}>{u.lastCheckedAt ? new Date(u.lastCheckedAt).toLocaleTimeString() : 'not yet'}</span>
        </div>

        {message && (
          <p role="status" style={{ margin: '10px 0 0', fontSize: 13, color: u.updateAvailable ? 'var(--color-primary)' : 'var(--color-text-secondary)' }}>{message}</p>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginTop: 14 }}>
          <Button variant="secondary" onClick={() => void check()} disabled={u.checking || u.applying}>
            <RefreshCw size={14} /> {u.checking ? 'Checking…' : 'Check for update'}
          </Button>
          <Button onClick={() => void update()} disabled={u.applying}>
            <Download size={14} /> {u.applying ? 'Updating…' : u.updateAvailable ? 'Update app' : 'Update app (reload)'}
          </Button>
          {/* The POS's "Refresh data": everything on this page fetched
              again, no reload, nothing typed elsewhere lost. */}
          <Button variant="secondary" onClick={reloadData} disabled={u.applying} data-testid="app-reload-data">
            <DatabaseZap size={14} /> Reload data{refreshedAt ? ` · ${refreshedAt}` : ''}
          </Button>
          <Button variant="secondary" onClick={() => void reset()} disabled={u.applying} data-testid="app-hard-reset">
            <Trash2 size={14} /> Clear cached app &amp; reload
          </Button>
        </div>

        {!standalone && (
          <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 10, background: 'var(--color-bg)', border: '1px dashed var(--color-border)', fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
            <strong style={{ color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: 6 }}><Smartphone size={14} /> Add to home screen</strong>
            {installPrompt ? (
              <div style={{ marginTop: 6 }}>
                <Button onClick={() => void installPrompt.prompt()}>Install admin app</Button>
              </div>
            ) : isIOS() ? (
              <span>In Safari, tap Share, then <strong>Add to Home Screen</strong>.</span>
            ) : (
              <span>In the browser menu, choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</span>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
