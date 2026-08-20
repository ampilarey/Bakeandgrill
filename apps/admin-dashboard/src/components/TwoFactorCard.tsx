import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { ShieldCheck, ShieldOff } from 'lucide-react';
import {
  confirmTwoFactor, disableTwoFactor, getTwoFactorStatus,
  regenerateRecoveryCodes, setupTwoFactor,
  type TwoFactorStatus,
} from '../api';
import { Button, Card } from './ui';

/**
 * Enrolling this account's second factor, from My Account.
 *
 * The whole design is bent around one thing: the recovery codes are shown
 * exactly once, and if the person clicks past them they are one lost phone
 * away from being locked out of the admin panel with no help desk to call. So
 * the codes get their own step, a copy button, a download, and a checkbox that
 * has to be ticked before the step will close.
 */

const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

const HINT: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--color-text-muted)',
  lineHeight: 1.55,
  margin: '4px 0 0',
};

const FIELD: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid var(--color-border)',
  fontSize: 14,
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
};

type Stage = 'idle' | 'enrolling' | 'codes';

export function TwoFactorCard() {
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Enrolment
  const [uri, setUri] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');

  // Recovery codes, shown once
  const [codes, setCodes] = useState<string[]>([]);
  const [acknowledged, setAcknowledged] = useState(false);

  // Password confirmation for the destructive actions
  const [password, setPassword] = useState('');
  const [passwordFor, setPasswordFor] = useState<'disable' | 'regenerate' | null>(null);

  const refresh = () => getTwoFactorStatus().then(setStatus).catch(() => { /* card just stays quiet */ });

  useEffect(() => { void refresh(); }, []);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleSetup = () => run(async () => {
    const res = await setupTwoFactor();
    setUri(res.uri);
    setSecret(res.secret);
    setCode('');
    setStage('enrolling');
  });

  const handleConfirm = () => run(async () => {
    const res = await confirmTwoFactor(code.trim());
    setCodes(res.recovery_codes);
    setAcknowledged(false);
    setStage('codes');
    setCode('');
    await refresh();
  });

  const handleDisable = () => run(async () => {
    await disableTwoFactor(password);
    setPassword('');
    setPasswordFor(null);
    setStage('idle');
    setNotice('Two-factor is off for this account.');
    await refresh();
  });

  const handleRegenerate = () => run(async () => {
    const res = await regenerateRecoveryCodes(password);
    setPassword('');
    setPasswordFor(null);
    setCodes(res.recovery_codes);
    setAcknowledged(false);
    setStage('codes');
    await refresh();
  });

  const copyCodes = () => {
    void navigator.clipboard?.writeText(codes.join('\n'))
      .then(() => setNotice('Recovery codes copied.'))
      .catch(() => setNotice('Could not copy — select and copy them by hand.'));
  };

  const downloadCodes = () => {
    // A text file lands in Downloads and survives the tab closing, which is
    // more than can be said for a screenshot nobody takes.
    const body = [
      'Bake & Grill — admin recovery codes',
      'Each code works once. Keep them somewhere other than your phone.',
      '',
      ...codes,
    ].join('\n');

    const url = URL.createObjectURL(new Blob([body], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bakeandgrill-recovery-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const heading = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
      <div style={{
        width: 44, height: 44, borderRadius: '50%',
        background: status?.enabled ? 'var(--color-success-bg)' : 'rgba(212,129,58,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: status?.enabled ? 'var(--color-success-strong)' : 'var(--color-primary)',
      }}>
        {status?.enabled ? <ShieldCheck size={24} /> : <ShieldOff size={24} />}
      </div>
      <div>
        <p style={{ margin: 0, fontWeight: 700, fontSize: 16, color: 'var(--color-text)' }}>
          Two-factor authentication
        </p>
        <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>
          {status === null ? 'Checking…'
            : status.enabled ? 'On — a code from your phone is needed to sign in'
            : 'Off — your password alone opens the admin panel'}
        </p>
      </div>
    </div>
  );

  return (
    <Card>
      {heading}

      {error && (
        <p style={{
          color: 'var(--color-danger-strong)', fontSize: 13, margin: '0 0 12px',
          background: 'var(--color-danger-bg)', borderRadius: 8, padding: '8px 12px',
        }}>
          {error}
        </p>
      )}

      {notice && !error && (
        <p style={{
          color: 'var(--color-success-strong)', fontSize: 13, margin: '0 0 12px',
          background: 'var(--color-success-bg)', borderRadius: 8, padding: '8px 12px',
        }}>
          {notice}
        </p>
      )}

      {/* ── Step: show the recovery codes, once ─────────────────────────── */}
      {stage === 'codes' && (
        <div>
          <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: 14, color: 'var(--color-text)' }}>
            Save these recovery codes now
          </p>
          <p style={HINT}>
            They are the only way back into this account if you lose your phone, and
            this is the only time they will be shown. Each one works once. Keep them
            somewhere that is <strong>not</strong> your phone.
          </p>

          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: 8, margin: '14px 0',
            background: 'var(--color-bg)', border: '1px solid var(--color-border)',
            borderRadius: 10, padding: 14,
          }}>
            {codes.map((c) => (
              <code key={c} style={{ fontFamily: MONO, fontSize: 14, color: 'var(--color-text)', letterSpacing: '0.04em' }}>
                {c}
              </code>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            <Button variant="secondary" onClick={copyCodes}>Copy</Button>
            <Button variant="secondary" onClick={downloadCodes}>Download</Button>
          </div>

          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: 'var(--color-text)' }}>
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              style={{ marginTop: 2 }}
            />
            <span>I have saved these codes somewhere safe.</span>
          </label>

          <div style={{ marginTop: 14 }}>
            <Button
              disabled={!acknowledged}
              onClick={() => { setStage('idle'); setCodes([]); setNotice('Two-factor is on for this account.'); }}
            >
              Done
            </Button>
          </div>
        </div>
      )}

      {/* ── Step: scan and confirm ──────────────────────────────────────── */}
      {stage === 'enrolling' && (
        <div>
          <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: 14, color: 'var(--color-text)' }}>
            Scan this with your authenticator app
          </p>
          <p style={HINT}>
            Google Authenticator, Authy, 1Password — any of them. Then type the
            6-digit code it shows to finish.
          </p>

          <div style={{
            display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center',
            margin: '16px 0',
          }}>
            {/* White plate regardless of theme — a QR code on a dark
                background will not scan. */}
            <div style={{ background: '#ffffff', padding: 12, borderRadius: 10, lineHeight: 0 }}>
              <QRCodeSVG value={uri} size={148} />
            </div>

            <div style={{ minWidth: 200, flex: 1 }}>
              <p style={{ ...HINT, margin: 0 }}>Can't scan it? Type this key in by hand:</p>
              <code style={{
                display: 'block', marginTop: 6, fontFamily: MONO, fontSize: 14,
                color: 'var(--color-text)', wordBreak: 'break-all', letterSpacing: '0.04em',
              }}>
                {secret}
              </code>
            </div>
          </div>

          <label style={{ display: 'block', maxWidth: 220 }}>
            <span style={{ display: 'block', fontWeight: 700, fontSize: 13, color: 'var(--color-text)', marginBottom: 6 }}>
              6-digit code
            </span>
            <input
              type="text"
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              autoComplete="one-time-code"
              style={{ ...FIELD, letterSpacing: '0.3em', textAlign: 'center', fontSize: 18 }}
            />
          </label>

          <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
            <Button disabled={busy || code.length < 6} onClick={handleConfirm}>
              {busy ? 'Checking…' : 'Turn on'}
            </Button>
            <Button variant="secondary" onClick={() => { setStage('idle'); setError(''); }}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* ── Resting state ───────────────────────────────────────────────── */}
      {stage === 'idle' && status !== null && (
        <div>
          {!status.enabled ? (
            <>
              <p style={{ ...HINT, margin: '0 0 14px' }}>
                With this on, signing in to the admin panel needs your password
                <em> and</em> a code from your phone — so a stolen password on its own
                gets nowhere. The POS is not affected; tills keep using their PIN.
              </p>
              <Button disabled={busy} onClick={handleSetup}>
                {busy ? 'Starting…' : status.pending ? 'Resume setup' : 'Set up'}
              </Button>
            </>
          ) : (
            <>
              <p style={{ ...HINT, margin: '0 0 14px' }}>
                {status.recovery_codes_remaining > 0
                  ? `${status.recovery_codes_remaining} recovery code${status.recovery_codes_remaining === 1 ? '' : 's'} left.`
                  : 'No recovery codes left — generate a new set before you lose your phone.'}
                {status.recovery_codes_remaining > 0 && status.recovery_codes_remaining <= 2
                  && ' Running low — generate a new set.'}
              </p>

              {passwordFor === null ? (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Button variant="secondary" onClick={() => { setPasswordFor('regenerate'); setError(''); }}>
                    New recovery codes
                  </Button>
                  {!status.required_for_admin && (
                    <Button variant="secondary" onClick={() => { setPasswordFor('disable'); setError(''); }}>
                      Turn off
                    </Button>
                  )}
                </div>
              ) : (
                <div style={{ maxWidth: 320 }}>
                  <label style={{ display: 'block' }}>
                    <span style={{ display: 'block', fontWeight: 700, fontSize: 13, color: 'var(--color-text)', marginBottom: 6 }}>
                      Confirm your password
                    </span>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      style={FIELD}
                    />
                  </label>
                  <p style={HINT}>
                    {passwordFor === 'disable'
                      ? 'Asked for because an unattended signed-in laptop is exactly what the second factor is here to survive.'
                      : 'Your current recovery codes stop working as soon as the new ones are issued.'}
                  </p>
                  <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                    <Button
                      variant={passwordFor === 'disable' ? 'danger' : 'primary'}
                      disabled={busy || !password}
                      onClick={passwordFor === 'disable' ? handleDisable : handleRegenerate}
                    >
                      {busy ? 'Working…' : passwordFor === 'disable' ? 'Turn off' : 'Generate'}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => { setPasswordFor(null); setPassword(''); setError(''); }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Card>
  );
}

export default TwoFactorCard;
