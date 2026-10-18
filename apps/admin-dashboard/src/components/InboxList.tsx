import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { InboxRow } from '../api';

/** The rows of "Needs attention", most urgent first; each opens its page (feature 14). */
const EDGE: Record<InboxRow['level'], string> = {
  danger: 'var(--color-danger)',
  warn: 'var(--color-warning)',
  info: 'var(--color-primary)',
};

export function InboxList({ rows, limit }: { rows: InboxRow[]; limit?: number }) {
  const shown = limit ? rows.slice(0, limit) : rows;
  if (shown.length === 0) {
    return <p data-testid="inbox-empty" style={{ margin: 0, fontSize: 14, color: 'var(--color-text-secondary)' }}>Nothing waiting. Good job.</p>;
  }
  return (
    <div style={{ display: 'grid', gap: 8 }} data-testid="inbox-rows">
      {shown.map((r) => (
        <Link key={r.key} to={r.link} style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, textDecoration: 'none',
          background: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderInlineStart: `4px solid ${EDGE[r.level]}`,
        }}>
          <strong style={{ minWidth: 32, fontSize: 18, textAlign: 'center' }}>{r.count}</strong>
          <span style={{ flex: 1, fontSize: 14 }}>{r.label}</span>
          <ChevronRight size={16} aria-hidden style={{ color: 'var(--color-text-muted)' }} />
        </Link>
      ))}
    </div>
  );
}
