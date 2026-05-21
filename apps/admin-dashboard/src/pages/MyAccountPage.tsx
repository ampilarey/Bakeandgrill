import { useEffect, useState } from 'react';
import { UserCircle } from 'lucide-react';
import { getMe, updateMyPreferences } from '../api';
import { usePageTitle } from '../hooks/usePageTitle';
import { PageHeader } from '../components/SharedUI';
import { Button, Card } from '../components/ui';

const LOCK_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 2, label: '2 minutes' },
  { value: 5, label: '5 minutes (default)' },
  { value: 10, label: '10 minutes' },
  { value: 15, label: '15 minutes' },
  { value: 30, label: '30 minutes' },
  { value: 0, label: 'Never auto-lock' },
];

function storedMinutesToSelect(stored: number | null | undefined): number {
  if (stored === null || stored === undefined) return 5;
  return stored;
}

export function MyAccountPage() {
  usePageTitle('My Account');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [idleLockMinutes, setIdleLockMinutes] = useState(5);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    getMe()
      .then(({ user }) => {
        if (cancelled) return;
        setName(user.name);
        setRole(user.role ?? 'staff');
        setIdleLockMinutes(storedMinutesToSelect(user.pos_idle_lock_minutes));
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message || 'Could not load your account.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      await updateMyPreferences({ pos_idle_lock_minutes: idleLockMinutes });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError((e as Error).message || 'Could not save preferences.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="My Account"
        subtitle="Personal preferences — these apply when you sign in on POS"
      />

      {error && (
        <p style={{
          color: '#dc2626', fontSize: 13, margin: '0 0 16px',
          background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px',
        }}>
          {error}
        </p>
      )}

      <div style={{ maxWidth: 520 }}>
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{
            width: 44, height: 44, borderRadius: '50%', background: 'rgba(212,129,58,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#D4813A',
          }}>
            <UserCircle size={26} />
          </div>
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 16, color: '#1C1408' }}>{name || '…'}</p>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#9C8E7E', textTransform: 'capitalize' }}>
              {role.replace(/_/g, ' ')}
            </p>
          </div>
        </div>

        <label style={{ display: 'block', marginBottom: 8 }}>
          <span style={{ display: 'block', fontWeight: 700, fontSize: 14, color: '#1C1408', marginBottom: 4 }}>
            POS auto-lock after inactivity
          </span>
          <span style={{ display: 'block', fontSize: 12, color: '#9C8E7E', lineHeight: 1.5, marginBottom: 10 }}>
            How long the POS waits with no taps or key presses before locking when you are signed in.
            Each staff member sets their own — shared iPads use whoever is logged in.
          </span>
          <select
            value={idleLockMinutes}
            disabled={loading || saving}
            onChange={(e) => setIdleLockMinutes(Number(e.target.value))}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 8,
              border: '1px solid #E8E0D8', fontSize: 14, background: '#fff',
            }}
          >
            {LOCK_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>

        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Button onClick={() => void handleSave()} disabled={loading || saving}>
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save preferences'}
          </Button>
        </div>
      </Card>
      </div>
    </div>
  );
}

export default MyAccountPage;
