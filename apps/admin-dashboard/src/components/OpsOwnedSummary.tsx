import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';

export type ManagedByMeta = {
  owner_label: string;
  owner_path: string;
  note: string;
  current_value?: string | null;
};

type Props = {
  managedBy: ManagedByMeta;
  label?: string;
  testId?: string;
};

/**
 * Read-only card pointing owners to the authoritative Admin page.
 * No Save control — the value is not editable here.
 */
export function OpsOwnedSummary({ managedBy, label, testId = 'ops-owned-summary' }: Props) {
  const href = managedBy.owner_path.replace(/^\/admin/, '') || '/';
  const display = (managedBy.current_value ?? '').trim();

  return (
    <div data-testid={testId} style={cardStyle}>
      {label ? (
        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-text)', marginBottom: 6 }}>
          {label}
        </div>
      ) : null}
      {display ? (
        <p data-testid={`${testId}-value`} style={valueStyle}>
          {display}
        </p>
      ) : (
        <p style={{ ...valueStyle, color: 'var(--color-text-muted)' }}>Not set yet</p>
      )}
      <p style={noteStyle}>{managedBy.note}</p>
      <p style={managedStyle}>
        Managed in{' '}
        <Link to={href} data-testid={`${testId}-link`}>
          {managedBy.owner_label}
        </Link>
      </p>
    </div>
  );
}

const cardStyle: CSSProperties = {
  padding: 14,
  borderRadius: 10,
  border: '1px solid var(--color-border)',
  background: 'var(--color-border-light)',
  display: 'grid',
  gap: 6,
  minWidth: 0,
  boxSizing: 'border-box',
};

const valueStyle: CSSProperties = {
  margin: 0,
  fontSize: 16,
  fontWeight: 700,
  color: 'var(--color-text)',
  wordBreak: 'break-word',
};

const noteStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  lineHeight: 1.45,
  color: 'var(--color-text-muted)',
};

const managedStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--color-text-secondary)',
};
