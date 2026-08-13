import type { CSSProperties } from 'react';

export type ScopeMismatch = {
  key: string;
  label: string;
  message: string;
  shared?: string;
  website?: string;
  order_app?: string;
};

type Props = {
  mismatches: ScopeMismatch[];
  /** When set, only show the notice for this one key (inline under a field). */
  onlyKey?: string;
};

const wrapStyle: CSSProperties = {
  display: 'grid',
  gap: 8,
  marginBottom: 16,
  maxWidth: 720,
};

const itemStyle: CSSProperties = {
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid var(--color-warning)',
  background: 'color-mix(in srgb, var(--color-warning) 12%, var(--color-bg))',
  color: 'var(--color-text)',
  fontSize: 13,
  lineHeight: 1.45,
};

/**
 * Read-only drift notice across business record / website / order app.
 * No sync button — owners fix each place deliberately.
 */
export function ScopeMismatchNotices({ mismatches, onlyKey }: Props) {
  const rows = onlyKey
    ? mismatches.filter((m) => m.key === onlyKey)
    : mismatches;

  if (rows.length === 0) return null;

  return (
    <div
      data-testid={onlyKey ? `scope-mismatch-${onlyKey}` : 'scope-mismatch-list'}
      style={onlyKey ? { marginTop: 6 } : wrapStyle}
      role="status"
    >
      {rows.map((row) => (
        <div
          key={row.key}
          data-testid={`scope-mismatch-item-${row.key}`}
          style={itemStyle}
        >
          {!onlyKey ? (
            <div style={{ fontWeight: 600, marginBottom: 2 }}>{row.label}</div>
          ) : null}
          <div>{row.message}</div>
        </div>
      ))}
    </div>
  );
}
