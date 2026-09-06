import { useEffect, useId, useRef, useState } from 'react';
import { Btn } from './SharedUI';

/**
 * A dropdown that does not dead-end when the thing you want is not on it.
 *
 * Owner, 2026-09-06: "in all the drop down places if the item is not listed,
 * add option to write so it will be saved in respective field."
 *
 * A plain `<select>` is a closed world. It is right for a status or a role,
 * where the options are the whole truth, and wrong for a unit, a category, a
 * brand or a supplier, where the list is only what has been seen so far. When
 * somebody is entering a delivery of a thing they have never bought before,
 * the form has to let them say so — otherwise the answer is to abandon the
 * form, go and create the category somewhere else, and come back.
 *
 * Two shapes, one control:
 *
 *   - **The typed text is the value** (a unit, a brand). Leave `onCreate` off;
 *     what they type is what gets saved.
 *   - **The value is an id** (a category, a supplier). Pass `onCreate` to make
 *     the row and return its id. A typed name that already matches an option
 *     is matched instead — case- and space-insensitively — so nobody ends up
 *     with "Dairy" and "dairy" as two categories.
 */
export interface PickOrTypeOption {
  value: string;
  label: string;
}

interface PickOrTypeProps {
  options: PickOrTypeOption[];
  value: string;
  onChange: (value: string) => void;
  /**
   * Make the thing that was typed and return the value to select — an id for
   * an id-backed field. Return null to leave the field alone (the caller has
   * shown an error). Without it, the typed text becomes the value.
   */
  onCreate?: (typed: string) => Promise<string | null>;
  /** The "nothing chosen" row. Omit when a choice is required. */
  emptyLabel?: string;
  /** The row that opens the text box, e.g. "＋ Add a new category". */
  addLabel?: string;
  placeholder?: string;
  ariaLabel: string;
  style?: React.CSSProperties;
  disabled?: boolean;
  /** Shown under the control while typing — what happens on save. */
  hint?: string;
  /**
   * What to call the current value when it is not on the list — an id-backed
   * field whose options have not arrived yet would otherwise show the raw id.
   * Free-text fields need nothing here: the value is its own label.
   */
  unknownLabel?: string;
}

const ADD = '__pick_or_type_add__';

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

export function PickOrType({
  options, value, onChange, onCreate,
  emptyLabel, addLabel = '＋ Not listed — type it',
  placeholder, ariaLabel, style, disabled, hint, unknownLabel,
}: PickOrTypeProps) {
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const errorId = useId();

  useEffect(() => {
    if (typing) inputRef.current?.focus();
  }, [typing]);

  /*
   * A value the list has never heard of still has to show. Without this, an
   * item whose unit is "sachet" would open the form on a blank select and
   * silently lose the unit the moment anything else was saved.
   */
  const known = options.some((o) => o.value === value);
  const shown = !known && value !== ''
    ? [...options, { value, label: unknownLabel ?? value }]
    : options;

  async function commit() {
    const typed = draft.trim();
    if (typed === '') {
      setError('Type something first.');
      return;
    }

    // Already on the list under another capitalisation — pick it rather than
    // making a second one that means the same thing.
    const match = options.find((o) => norm(o.label) === norm(typed));
    if (match) {
      onChange(match.value);
      close();
      return;
    }

    if (!onCreate) {
      onChange(typed);
      close();
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const created = await onCreate(typed);
      if (created !== null) {
        onChange(created);
        close();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that.');
    } finally {
      setBusy(false);
    }
  }

  function close() {
    setTyping(false);
    setDraft('');
    setError(null);
  }

  if (typing) {
    return (
      <div style={{ display: 'grid', gap: 6 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            ref={inputRef}
            aria-label={`New ${ariaLabel.toLowerCase()}`}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            placeholder={placeholder}
            value={draft}
            disabled={busy}
            onChange={(e) => { setDraft(e.target.value); setError(null); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); void commit(); }
              if (e.key === 'Escape') { e.preventDefault(); close(); }
            }}
            style={{
              flex: '1 1 140px', minWidth: 0, minHeight: 44,
              padding: '0 12px', fontSize: 14, fontFamily: 'inherit',
              border: '1.5px solid var(--color-border)', borderRadius: 10,
              background: 'var(--color-surface)', color: 'var(--color-text)',
              boxSizing: 'border-box',
            }}
          />
          <Btn small onClick={() => void commit()} disabled={busy}>
            {busy ? 'Saving…' : 'Use this'}
          </Btn>
          <Btn small variant="ghost" onClick={close} disabled={busy}>Back to list</Btn>
        </div>
        {error && (
          <p id={errorId} style={{ fontSize: 12, color: 'var(--color-danger-strong)', margin: 0 }}>
            {error}
          </p>
        )}
        {!error && hint && (
          <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.45 }}>
            {hint}
          </p>
        )}
      </div>
    );
  }

  return (
    <select
      aria-label={ariaLabel}
      value={value}
      disabled={disabled}
      onChange={(e) => {
        if (e.target.value === ADD) { setTyping(true); return; }
        onChange(e.target.value);
      }}
      style={{
        width: '100%', minHeight: 44, padding: '0 12px',
        border: '1.5px solid var(--color-border)', borderRadius: 10,
        fontSize: 14, fontFamily: 'inherit',
        background: 'var(--color-surface)', color: 'var(--color-text)',
        boxSizing: 'border-box',
        ...style,
      }}
    >
      {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
      {shown.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      <option value={ADD}>{addLabel}</option>
    </select>
  );
}
