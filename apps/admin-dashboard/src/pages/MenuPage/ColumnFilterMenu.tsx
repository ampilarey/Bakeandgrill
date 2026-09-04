import { useMemo, useState } from 'react';
import { Btn } from '../../components/SharedUI';

/**
 * A spreadsheet's autofilter, on one column.
 *
 * Owner, 2026-09-01: "when i click price and select all the items for 3
 * rufiyaa". So: the distinct values in that column, each with a count, ticked
 * to keep. Counts come from the rows the other filters already left, so the
 * list never offers a value that would empty the table the moment it is
 * picked.
 */
export function ColumnFilterMenu({
  label,
  values,
  selected,
  onChange,
  onClose,
}: {
  label: string;
  values: Array<{ value: string; count: number }>;
  selected: string[];
  onChange: (next: string[]) => void;
  onClose: () => void;
}) {
  const [needle, setNeedle] = useState('');

  const shown = useMemo(() => {
    const q = needle.trim().toLowerCase();

    return q === '' ? values : values.filter((v) => v.value.toLowerCase().includes(q));
  }, [values, needle]);

  // Nothing ticked means "no filter", so an empty selection reads as all-on.
  const isOn = (value: string) => selected.length === 0 || selected.includes(value);

  const toggle = (value: string) => {
    const base = selected.length === 0 ? values.map((v) => v.value) : selected;
    const next = base.includes(value) ? base.filter((v) => v !== value) : [...base, value];
    // Every value ticked is the same as no filter; store it as none so the
    // badge and the "clear" state stay honest.
    onChange(next.length === values.length ? [] : next);
  };

  return (
    <div
      data-testid="column-filter-menu"
      style={{
        position: 'absolute', top: '100%', left: 0, zIndex: 30, marginTop: 4,
        minWidth: 210, maxWidth: 280, padding: 10, borderRadius: 10,
        background: 'var(--color-surface)', border: '1px solid var(--color-border)',
        boxShadow: '0 8px 24px rgba(15,23,42,0.18)',
        textTransform: 'none', letterSpacing: 0, fontWeight: 400,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text)', marginBottom: 6 }}>
        Filter {label}
      </div>
      <input
        value={needle}
        onChange={(e) => setNeedle(e.target.value)}
        placeholder="Find a value…"
        aria-label={`Find a value in ${label}`}
        style={{
          width: '100%', padding: '6px 8px', fontSize: 12, borderRadius: 7,
          border: '1px solid var(--color-border)', marginBottom: 8,
          background: 'var(--color-surface)', color: 'var(--color-text)', fontFamily: 'inherit',
        }}
      />
      <div style={{ maxHeight: 220, overflowY: 'auto', marginBottom: 8 }}>
        {shown.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', padding: '4px 0' }}>
            No matching values.
          </div>
        ) : shown.map((v) => (
          <label
            key={v.value}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, fontSize: 12,
              padding: '3px 0', cursor: 'pointer', color: 'var(--color-text)',
            }}
          >
            <input
              type="checkbox"
              checked={isOn(v.value)}
              onChange={() => toggle(v.value)}
              aria-label={`${label} ${v.value}`}
            />
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {v.value}
            </span>
            <span style={{ color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
              {v.count}
            </span>
          </label>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Btn small variant="secondary" onClick={() => onChange(shown.map((v) => v.value))}>
          Only these
        </Btn>
        <Btn small variant="secondary" onClick={() => onChange([])}>Clear</Btn>
        <Btn small onClick={onClose}>Done</Btn>
      </div>
    </div>
  );
}
