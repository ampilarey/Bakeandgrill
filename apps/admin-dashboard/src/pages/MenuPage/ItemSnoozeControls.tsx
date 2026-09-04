import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import type { SnoozeUntil } from '../../api';
import { Btn, Input } from '../../components/SharedUI';

export type ItemSnoozeControlsProps = {
  canManage: boolean;
  snoozedUntil?: string | null;
  isAvailable?: boolean;
  reasonNote?: string | null;
  compact?: boolean;
  onSnooze: (
    until: SnoozeUntil,
    opts?: { until_date?: string; unavailable_reason_note?: string | null },
  ) => Promise<unknown> | void;
};

/** Parent Save item flushes snooze only when the user edited these controls. */
export type ItemSnoozeControlsHandle = {
  applyCurrentIfDirty: () => Promise<unknown>;
};

function isCurrentlySnoozed(snoozedUntil?: string | null): boolean {
  if (!snoozedUntil) return false;
  return new Date(snoozedUntil).getTime() > Date.now();
}

/** Duration shown in the select — must reflect saved state when reopening. */
export function inferSnoozeUntil(
  snoozedUntil: string | null | undefined,
  isAvailable: boolean,
): Exclude<SnoozeUntil, null> {
  if (isAvailable === false && !isCurrentlySnoozed(snoozedUntil)) {
    return 'indefinite';
  }
  return 'end_of_day';
}

export const ItemSnoozeControls = forwardRef<ItemSnoozeControlsHandle, ItemSnoozeControlsProps>(
  function ItemSnoozeControls(
    {
      canManage,
      snoozedUntil,
      isAvailable = true,
      reasonNote,
      compact = false,
      onSnooze,
    },
    ref,
  ) {
    const snoozed = isCurrentlySnoozed(snoozedUntil);
    const indefinitelyOff = isAvailable === false && !snoozed;
    const [until, setUntil] = useState<Exclude<SnoozeUntil, null>>(() =>
      inferSnoozeUntil(snoozedUntil, isAvailable),
    );
    const [untilDate, setUntilDate] = useState('');
    const [note, setNote] = useState(reasonNote ?? '');
    const [dirty, setDirty] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [savedFlash, setSavedFlash] = useState(false);

    useEffect(() => {
      setUntil(inferSnoozeUntil(snoozedUntil, isAvailable));
      setDirty(false);
    }, [snoozedUntil, isAvailable]);

    useEffect(() => {
      setNote(reasonNote ?? '');
    }, [reasonNote]);

    const apply = async (next: SnoozeUntil): Promise<unknown> => {
      if (!canManage) return undefined;
      if (busy) throw new Error('Snooze is still saving — try again.');
      setBusy(true);
      setError('');
      setSavedFlash(false);
      try {
        if (next === null) {
          const updated = await onSnooze(null);
          setNote('');
          setDirty(false);
          setSavedFlash(true);
          return updated;
        }
        if (next === 'date' && !untilDate) {
          const msg = 'Pick a date.';
          setError(msg);
          throw new Error(msg);
        }
        const updated = await onSnooze(next, {
          until_date: next === 'date' ? untilDate : undefined,
          unavailable_reason_note: note.trim() || null,
        });
        setUntil(next);
        setDirty(false);
        setSavedFlash(true);
        return updated;
      } catch (e) {
        const msg = (e as Error).message || 'Could not update snooze.';
        setError(msg);
        throw e instanceof Error ? e : new Error(msg);
      } finally {
        setBusy(false);
      }
    };

    useImperativeHandle(ref, () => ({
      applyCurrentIfDirty: async () => {
        if (!dirty) return undefined;
        return apply(until);
      },
    }));

    const statusLabel = snoozed
      ? `Snoozed until ${new Date(snoozedUntil as string).toLocaleString()}`
      : indefinitelyOff
        ? 'Unavailable (indefinite)'
        : 'Available';

    const statusNote = (reasonNote ?? note).trim();

    if (compact) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 140 }} data-testid="item-snooze-compact">
          <span style={{ fontSize: 11, color: snoozed || indefinitelyOff ? 'var(--color-danger-strong)' : 'var(--color-text-muted)' }}>
            {statusLabel}
          </span>
          {canManage && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {(snoozed || indefinitelyOff) ? (
                <Btn
                  small
                  variant="secondary"
                  disabled={busy}
                  onClick={() => { void apply(null).catch(() => undefined); }}
                >
                  {busy ? '…' : 'Restore'}
                </Btn>
              ) : (
                <Btn
                  small
                  variant="secondary"
                  disabled={busy}
                  onClick={() => { void apply('end_of_day').catch(() => undefined); }}
                >
                  {busy ? '…' : 'Sold out today'}
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
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Mark unavailable</div>
        <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--color-text-muted)' }}>
          Temporarily hide from ordering. Change duration/note, then use <strong>Apply snooze</strong> (or Save item).
          Inactive items stay off the menu entirely — use Active for that.
        </p>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, color: snoozed || indefinitelyOff ? 'var(--color-danger-strong)' : 'var(--color-success)' }}>
          {statusLabel}
          {statusNote ? ` · ${statusNote}` : ''}
        </div>
        {canManage && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
              <label style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                Duration
                <select
                  data-testid="item-snooze-until"
                  value={until}
                  onChange={(e) => {
                    setUntil(e.target.value as Exclude<SnoozeUntil, null>);
                    setDirty(true);
                  }}
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
                  <Input
                    type="date"
                    value={untilDate}
                    onChange={(v) => {
                      setUntilDate(v);
                      setDirty(true);
                    }}
                  />
                </label>
              )}
              <label style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                Reason note (optional)
                <Input
                  value={note}
                  onChange={(v) => {
                    setNote(v);
                    setDirty(true);
                  }}
                  placeholder="Back Thursday"
                  maxLength={80}
                />
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <Btn
                small
                disabled={busy}
                onClick={() => {
                  void apply(until).catch(() => { /* error shown inline */ });
                }}
              >
                {busy ? 'Saving…' : 'Apply snooze'}
              </Btn>
              {(snoozed || indefinitelyOff) && (
                <Btn
                  small
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    void apply(null).catch(() => { /* error shown inline */ });
                  }}
                >
                  Restore
                </Btn>
              )}
              {savedFlash && !error && (
                <span data-testid="item-snooze-saved" style={{ fontSize: 12, color: 'var(--color-success)', fontWeight: 600 }}>
                  Snooze saved
                </span>
              )}
            </div>
            {error && <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--color-danger-strong)' }}>{error}</p>}
          </>
        )}
      </div>
    );
  },
);
