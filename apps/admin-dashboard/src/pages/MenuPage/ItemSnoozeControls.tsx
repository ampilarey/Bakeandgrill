import { useState } from 'react';
import type { SnoozeUntil } from '../../api';
import { Btn, Input } from '../../components/Layout';

export type ItemSnoozeControlsProps = {
  canManage: boolean;
  snoozedUntil?: string | null;
  isAvailable?: boolean;
  reasonNote?: string | null;
  compact?: boolean;
  onSnooze: (
    until: SnoozeUntil,
    opts?: { until_date?: string; unavailable_reason_note?: string | null },
  ) => Promise<void> | void;
};

function isCurrentlySnoozed(snoozedUntil?: string | null): boolean {
  if (!snoozedUntil) return false;
  return new Date(snoozedUntil).getTime() > Date.now();
}

export function ItemSnoozeControls({
  canManage,
  snoozedUntil,
  isAvailable = true,
  reasonNote,
  compact = false,
  onSnooze,
}: ItemSnoozeControlsProps) {
  const snoozed = isCurrentlySnoozed(snoozedUntil);
  const indefinitelyOff = isAvailable === false && !snoozed;
  const [until, setUntil] = useState<Exclude<SnoozeUntil, null>>('end_of_day');
  const [untilDate, setUntilDate] = useState('');
  const [note, setNote] = useState(reasonNote ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const apply = async (next: SnoozeUntil) => {
    if (!canManage || busy) return;
    setBusy(true);
    setError('');
    try {
      if (next === null) {
        await onSnooze(null);
        setNote('');
      } else {
        if (next === 'date' && !untilDate) {
          setError('Pick a date.');
          return;
        }
        await onSnooze(next, {
          until_date: next === 'date' ? untilDate : undefined,
          unavailable_reason_note: note.trim() || null,
        });
      }
    } catch (e) {
      setError((e as Error).message || 'Could not update snooze.');
    } finally {
      setBusy(false);
    }
  };

  const statusLabel = snoozed
    ? `Snoozed until ${new Date(snoozedUntil as string).toLocaleString()}`
    : indefinitelyOff
      ? 'Unavailable (indefinite)'
      : 'Available';

  if (compact) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 140 }} data-testid="item-snooze-compact">
        <span style={{ fontSize: 11, color: snoozed || indefinitelyOff ? 'var(--color-danger-strong)' : 'var(--color-text-muted)' }}>
          {statusLabel}
        </span>
        {canManage && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {(snoozed || indefinitelyOff) ? (
              <Btn small variant="secondary" disabled={busy} onClick={() => void apply(null)}>
                {busy ? '…' : 'Restore'}
              </Btn>
            ) : (
              <Btn small variant="secondary" disabled={busy} onClick={() => void apply('end_of_day')}>
                {busy ? '…' : '86 today'}
              </Btn>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      data-testid="item-snooze-controls"
      style={{
        marginTop: 16,
        padding: 14,
        borderRadius: 10,
        border: '1px solid var(--color-border)',
        background: snoozed || indefinitelyOff ? 'var(--color-danger-bg)' : 'var(--color-surface-alt)',
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Snooze / 86</div>
      <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--color-text-muted)' }}>
        Temporarily hide from ordering. Inactive items stay off the menu entirely — use Active for that.
      </p>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, color: snoozed || indefinitelyOff ? 'var(--color-danger-strong)' : 'var(--color-success)' }}>
        {statusLabel}
        {reasonNote ? ` · ${reasonNote}` : ''}
      </div>
      {canManage && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
            <label style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
              Duration
              <select
                value={until}
                onChange={(e) => setUntil(e.target.value as Exclude<SnoozeUntil, null>)}
                style={{ minHeight: 44, borderRadius: 8, border: '1px solid var(--color-border)', padding: '0 10px' }}
              >
                <option value="2_hours">2 hours</option>
                <option value="end_of_day">End of day</option>
                <option value="tomorrow">Tomorrow</option>
                <option value="date">Specific date</option>
                <option value="indefinite">Indefinite</option>
              </select>
            </label>
            {until === 'date' && (
              <label style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                Until date
                <Input type="date" value={untilDate} onChange={setUntilDate} />
              </label>
            )}
            <label style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
              Reason note (optional)
              <Input
                value={note}
                onChange={setNote}
                placeholder="Back Thursday"
                maxLength={80}
              />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <Btn small disabled={busy} onClick={() => void apply(until)}>
              {busy ? 'Saving…' : 'Apply snooze'}
            </Btn>
            {(snoozed || indefinitelyOff) && (
              <Btn small variant="secondary" disabled={busy} onClick={() => void apply(null)}>
                Restore
              </Btn>
            )}
          </div>
          {error && <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--color-danger-strong)' }}>{error}</p>}
        </>
      )}
    </div>
  );
}
