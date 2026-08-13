import { useState, type CSSProperties } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

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
  /**
   * Compact collapsible banner (Content Hub desktop).
   * Business Details keeps the full expanded list.
   */
  collapsible?: boolean;
  /** Initial open state when `collapsible` (default collapsed). */
  defaultOpen?: boolean;
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
export function ScopeMismatchNotices({
  mismatches,
  onlyKey,
  collapsible = false,
  defaultOpen = false,
}: Props) {
  const rows = onlyKey
    ? mismatches.filter((m) => m.key === onlyKey)
    : mismatches;
  const [open, setOpen] = useState(defaultOpen);

  if (rows.length === 0) return null;

  if (onlyKey) {
    return (
      <div
        data-testid={`scope-mismatch-${onlyKey}`}
        style={{ marginTop: 6 }}
        role="status"
      >
        {rows.map((row) => (
          <div
            key={row.key}
            data-testid={`scope-mismatch-item-${row.key}`}
            style={itemStyle}
          >
            <div>{row.message}</div>
          </div>
        ))}
      </div>
    );
  }

  if (collapsible) {
    const count = rows.length;
    return (
      <div
        className="hub-mismatch-summary"
        data-testid="scope-mismatch-list"
        data-collapsed={open ? 'false' : 'true'}
      >
        <button
          type="button"
          className="hub-mismatch-summary-toggle"
          data-testid="scope-mismatch-toggle"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="hub-mismatch-summary-chevron" aria-hidden>
            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </span>
          <span className="hub-mismatch-summary-title">
            {count} value{count === 1 ? '' : 's'} differ from Business Details
          </span>
          <span className="hub-mismatch-summary-hint">
            {open ? 'Hide details' : 'Review'}
          </span>
        </button>
        {open ? (
          <div className="hub-mismatch-summary-body" role="status">
            {rows.map((row) => (
              <div
                key={row.key}
                data-testid={`scope-mismatch-item-${row.key}`}
                className="hub-mismatch-summary-item"
              >
                <div className="hub-mismatch-summary-label">{row.label}</div>
                <div>{row.message}</div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      data-testid="scope-mismatch-list"
      style={wrapStyle}
      role="status"
    >
      {rows.map((row) => (
        <div
          key={row.key}
          data-testid={`scope-mismatch-item-${row.key}`}
          style={itemStyle}
        >
          <div style={{ fontWeight: 600, marginBottom: 2 }}>{row.label}</div>
          <div>{row.message}</div>
        </div>
      ))}
    </div>
  );
}
