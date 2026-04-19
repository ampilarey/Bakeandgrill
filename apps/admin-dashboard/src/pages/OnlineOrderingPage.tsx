import { useState, useEffect } from 'react';
import { Power, RefreshCw, Lock, Unlock, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { usePageTitle } from '../hooks/usePageTitle';
import { PageHeader } from '../components/SharedUI';
import {
  getOnlineOrderingStatus,
  toggleOnlineOrdering,
  setOnlineOrderingOverride,
  type OnlineOrderingGateStatus,
} from '../api';

const S = {
  card: {
    background: '#FDFAF7',
    border: '1px solid #E8E0D8',
    borderRadius: 16,
    padding: '1.5rem',
    marginBottom: '1.25rem',
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: '#6B5D4F',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    marginBottom: '1rem',
  },
  input: {
    width: '100%',
    padding: '9px 12px',
    border: '1.5px solid #E8E0D8',
    borderRadius: 10,
    fontSize: 13,
    fontFamily: 'inherit',
    boxSizing: 'border-box' as const,
  },
  label: {
    display: 'block' as const,
    fontSize: 13,
    fontWeight: 600 as const,
    color: '#6B5D4F',
    marginBottom: 4,
  },
  row: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' as const },
  btnPrimary: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '8px 16px', borderRadius: 10, border: 'none',
    background: '#D4813A', color: '#fff', fontSize: 13, fontWeight: 600,
    cursor: 'pointer',
  } as React.CSSProperties,
  btnSecondary: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '8px 16px', borderRadius: 10,
    border: '1.5px solid #E8E0D8', background: '#fff',
    color: '#4A3728', fontSize: 13, fontWeight: 600,
    cursor: 'pointer',
  } as React.CSSProperties,
  btnDanger: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '8px 16px', borderRadius: 10, border: 'none',
    background: '#DC2626', color: '#fff', fontSize: 13, fontWeight: 600,
    cursor: 'pointer',
  } as React.CSSProperties,
  statusOpen: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: '#D1FAE5', color: '#065F46',
    border: '1px solid #A7F3D0',
    borderRadius: 20, padding: '4px 14px', fontSize: 13, fontWeight: 700,
  } as React.CSSProperties,
  statusClosed: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: '#FEE2E2', color: '#991B1B',
    border: '1px solid #FECACA',
    borderRadius: 20, padding: '4px 14px', fontSize: 13, fontWeight: 700,
  } as React.CSSProperties,
  reasonNote: {
    fontSize: 12, color: '#9C8575', marginTop: 6,
  },
  toggleTrack: (on: boolean): React.CSSProperties => ({
    display: 'inline-block', position: 'relative',
    width: 48, height: 26, borderRadius: 13,
    background: on ? '#D4813A' : '#D1C9BE',
    transition: 'background 0.2s',
    cursor: 'pointer', flexShrink: 0,
  }),
  toggleThumb: (on: boolean): React.CSSProperties => ({
    position: 'absolute', top: 3, left: on ? 26 : 3,
    width: 20, height: 20, borderRadius: '50%',
    background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
    transition: 'left 0.2s',
  }),
};

const REASON_LABELS: Record<string, string> = {
  master_switch_off: 'Master switch is off',
  schedule:          'Outside scheduled hours',
  override_active:   'Force-open override is active',
};

export default function OnlineOrderingPage() {
  usePageTitle('Online Ordering');

  const [status, setStatus]       = useState<OnlineOrderingGateStatus | null>(null);
  const [loading, setLoading]     = useState(true);
  const [toggling, setToggling]   = useState(false);
  const [overrideUntil, setOverrideUntil] = useState('');
  const [savingOverride, setSavingOverride] = useState(false);
  const [toast, setToast]         = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  const [error, setError]         = useState('');

  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const load = () => {
    setLoading(true);
    getOnlineOrderingStatus()
      .then((s) => {
        setStatus(s);
        if (s.override_until) {
          // Convert ISO datetime to local datetime-local input value
          const local = new Date(s.override_until).toISOString().slice(0, 16);
          setOverrideUntil(local);
        }
      })
      .catch(() => setError('Failed to load online ordering status.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleToggle = async () => {
    if (!status) return;
    const next = !status.master_switch;
    setToggling(true);
    try {
      await toggleOnlineOrdering(next);
      showToast(`Online ordering ${next ? 'enabled' : 'disabled'}.`);
      load();
    } catch {
      showToast('Failed to update. Try again.', 'err');
    } finally {
      setToggling(false);
    }
  };

  const handleSetOverride = async () => {
    setSavingOverride(true);
    try {
      // Convert datetime-local value to ISO string
      const isoVal = overrideUntil ? new Date(overrideUntil).toISOString() : null;
      await setOnlineOrderingOverride(isoVal);
      showToast(isoVal ? 'Force-open override set.' : 'Override cleared.');
      load();
    } catch {
      showToast('Failed to save override.', 'err');
    } finally {
      setSavingOverride(false);
    }
  };

  const handleClearOverride = async () => {
    setSavingOverride(true);
    try {
      await setOnlineOrderingOverride(null);
      setOverrideUntil('');
      showToast('Override cleared.');
      load();
    } catch {
      showToast('Failed to clear override.', 'err');
    } finally {
      setSavingOverride(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem' }}>
        <PageHeader title="Online Ordering" />
        <p style={{ color: '#9C8575', fontSize: 14 }}>Loading…</p>
      </div>
    );
  }

  if (error || !status) {
    return (
      <div style={{ padding: '2rem' }}>
        <PageHeader title="Online Ordering" />
        <p style={{ color: '#DC2626', fontSize: 14 }}>{error || 'Status unavailable.'}</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: 680 }}>
      <PageHeader title="Online Ordering" subtitle="Control whether the store accepts online orders" />

      {/* Toast */}
      {toast && (
        <div style={{
          marginBottom: '1rem', padding: '10px 16px', borderRadius: 10,
          background: toast.type === 'ok' ? '#D1FAE5' : '#FEE2E2',
          color: toast.type === 'ok' ? '#065F46' : '#991B1B',
          fontSize: 13, fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          {toast.type === 'ok' ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
          {toast.msg}
        </div>
      )}

      {/* Status badge + quick status */}
      <div style={S.card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#3D2B1F', marginBottom: 6 }}>
              Current Status
            </div>
            <span style={status.open ? S.statusOpen : S.statusClosed}>
              {status.open ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
              {status.open ? 'Accepting orders' : 'Not accepting orders'}
            </span>
            {!status.open && status.reason && (
              <p style={S.reasonNote}>
                Reason: {REASON_LABELS[status.reason] ?? status.reason}
              </p>
            )}
            {status.override_until && (
              <p style={{ ...S.reasonNote, color: '#D4813A', fontWeight: 600 }}>
                Force-open override active until {new Date(status.override_until).toLocaleString()}
              </p>
            )}
          </div>
          <button
            style={{ ...S.btnSecondary, fontSize: 12, padding: '6px 12px' }}
            onClick={load}
          >
            <RefreshCw size={13} />
            Refresh
          </button>
        </div>
      </div>

      {/* Master Switch */}
      <div style={S.card}>
        <p style={S.sectionTitle}>Master Switch</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button
            style={S.toggleTrack(status.master_switch)}
            onClick={handleToggle}
            disabled={toggling}
            aria-label="Toggle online ordering"
            role="switch"
            aria-checked={status.master_switch}
          >
            <span style={S.toggleThumb(status.master_switch)} />
          </button>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#3D2B1F' }}>
              {status.master_switch ? 'Online ordering is ON' : 'Online ordering is OFF'}
            </div>
            <div style={{ fontSize: 12, color: '#9C8575', marginTop: 2 }}>
              {status.master_switch
                ? 'Customers can place pickup and delivery orders.'
                : 'All online orders are blocked. POS is unaffected.'}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <button
            style={status.master_switch ? S.btnDanger : S.btnPrimary}
            onClick={handleToggle}
            disabled={toggling}
          >
            <Power size={14} />
            {toggling ? 'Updating…' : status.master_switch ? 'Turn OFF online ordering' : 'Turn ON online ordering'}
          </button>
        </div>
      </div>

      {/* Force-open Override */}
      <div style={S.card}>
        <p style={S.sectionTitle}>Force-open Override</p>
        <p style={{ fontSize: 13, color: '#6B5D4F', marginBottom: 12, lineHeight: 1.5 }}>
          Force online ordering <strong>open</strong> until a specific time, ignoring the schedule.
          Useful for running promotions outside normal hours. Leave blank to deactivate.
        </p>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={S.label}>Override until</label>
            <input
              type="datetime-local"
              style={S.input}
              value={overrideUntil}
              onChange={(e) => setOverrideUntil(e.target.value)}
            />
          </div>
          <button
            style={S.btnPrimary}
            onClick={handleSetOverride}
            disabled={savingOverride}
          >
            <Unlock size={14} />
            {savingOverride ? 'Saving…' : 'Set Override'}
          </button>
          {status.override_until && (
            <button
              style={S.btnSecondary}
              onClick={handleClearOverride}
              disabled={savingOverride}
            >
              <Lock size={14} />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Schedule hint */}
      <div style={{ ...S.card, background: '#F7F2EC', border: '1px dashed #D8C9B8' }}>
        <p style={S.sectionTitle}>Daily Schedule</p>
        <p style={{ fontSize: 13, color: '#6B5D4F', lineHeight: 1.6 }}>
          To set daily open/close times for online ordering, edit the{' '}
          <strong>online_ordering_schedule</strong> key in{' '}
          <a href="/settings" style={{ color: '#D4813A', textDecoration: 'underline' }}>
            Settings → Online Ordering
          </a>.
          The JSON format is:{' '}
          <code style={{ fontSize: 12, background: '#EDE4D4', padding: '1px 5px', borderRadius: 4 }}>
            {'{"mon":{"open":"07:00","close":"22:00"},"tue":…}'}
          </code>
        </p>
      </div>
    </div>
  );
}
