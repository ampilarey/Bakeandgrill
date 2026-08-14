import { useEffect, useState } from 'react';
import { getContentIntegrity, type ContentIntegrityReport } from '../../api/content';

type Props = {
  /** When set, only show surface counts for this app. */
  appFilter?: 'website' | 'order_app';
  /**
   * Stage A Website desktop: render nothing when there are no issues to report.
   * Landing / Order App keep the always-visible panel.
   */
  onlyWhenIssues?: boolean;
};

type SingletonDupeIssue = {
  surface: string;
  block_type: string;
  block_ids: number[];
  message: string;
};

function parseSingletonDupes(report: ContentIntegrityReport | null, appFilter?: Props['appFilter']): SingletonDupeIssue[] {
  if (!report) return [];
  return (report.issues ?? [])
    .filter((issue) => issue.code === 'singleton_duplicate_surface')
    .map((issue) => {
      const meta = issue.meta ?? {};
      const surface = String(meta.surface ?? '');
      const block_type = String(meta.block_type ?? '');
      const rawIds = Array.isArray(meta.block_ids) ? meta.block_ids : [];
      const block_ids = rawIds.map((id) => Number(id)).filter((id) => Number.isFinite(id));
      return { surface, block_type, block_ids, message: issue.message };
    })
    .filter((row) => {
      if (!appFilter) return true;
      return row.surface.startsWith(`${appFilter}.`);
    });
}

/**
 * Admin-only integrity summary for Content & Branding.
 * Surfaces duplicates, legacy ops rows, and needs-review items — does not mutate data.
 * Singleton duplicates get a persistent warning banner; resolution (hide others) lives
 * on the surface editor so the owner chooses which instance to keep.
 */
export function ContentIntegrityPanel({ appFilter, onlyWhenIssues = false }: Props) {
  const [report, setReport] = useState<ContentIntegrityReport | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getContentIntegrity()
      .then((r) => {
        if (!cancelled) setReport(r);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load integrity report');
      });
    return () => { cancelled = true; };
  }, []);

  const review = (report?.needs_review ?? []).filter((row) => {
    if (!appFilter) return true;
    const scoped = row.identifier.includes('website') || row.identifier.includes('order_app');
    if (!scoped) return true;
    return row.identifier.includes(appFilter);
  });
  const issues = (report?.issues ?? []).filter((issue) => {
    if (!appFilter) return true;
    const surface = String(issue.meta?.surface ?? '');
    if (surface) return surface.startsWith(`${appFilter}.`);
    return true;
  });
  const singletonDupes = parseSingletonDupes(report, appFilter);
  const hasSomethingToReport = singletonDupes.length > 0 || issues.length > 0 || review.length > 0 || Boolean(error);

  if (onlyWhenIssues && report && !hasSomethingToReport) {
    return null;
  }
  if (onlyWhenIssues && !report && !error) {
    return null;
  }

  return (
    <section className="hub-integrity-panel" data-testid="content-integrity-panel">
      {singletonDupes.length > 0 ? (
        <div
          role="alert"
          data-testid="content-integrity-singleton-banner"
          className="hub-integrity-singleton-banner"
          style={{
            marginBottom: 10,
            padding: 12,
            borderRadius: 10,
            border: '1px solid var(--color-warning)',
            background: 'var(--color-border-light)',
            fontSize: 13,
            color: 'var(--color-text)',
          }}
        >
          <strong>Duplicate components need review.</strong>
          {' '}
          Nothing was deleted. Open the affected surface and choose which instance to keep — others are hidden.
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            {singletonDupes.map((d) => (
              <li
                key={`${d.surface}-${d.block_type}`}
                data-testid={`content-integrity-dupe-${d.surface}-${d.block_type}`}
              >
                <strong>{d.surface}</strong>
                {' · '}
                {d.block_type}
                {' · IDs '}
                {d.block_ids.join(', ')}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <button
        type="button"
        className="hub-integrity-toggle"
        data-testid="content-integrity-toggle"
        onClick={() => setOpen((v) => !v)}
      >
        Content integrity
        {report ? (
          <span data-testid="content-integrity-summary">
            {report.summary.issue_count}
            {' '}
            issue
            {report.summary.issue_count === 1 ? '' : 's'}
            {' · '}
            {report.summary.needs_review_count}
            {' '}
            needs review
          </span>
        ) : (
          <span>Loading…</span>
        )}
      </button>
      {open ? (
        <div className="hub-integrity-body" data-testid="content-integrity-body">
          {error ? <p role="alert">{error}</p> : null}
          {!error && review.length === 0 && issues.length === 0 ? (
            <p>No integrity issues for this catalog snapshot.</p>
          ) : null}
          {issues.slice(0, 12).map((issue) => (
            <div key={`${issue.code}-${issue.message}`} className="hub-integrity-row" data-severity={issue.severity}>
              <strong>{issue.code}</strong>
              <span>{issue.message}</span>
              {issue.code === 'singleton_duplicate_surface' && Array.isArray(issue.meta?.block_ids) ? (
                <span data-testid="content-integrity-issue-block-ids">
                  component_ids:
                  {' '}
                  {(issue.meta?.block_ids as number[]).join(', ')}
                </span>
              ) : null}
            </div>
          ))}
          {review.slice(0, 12).map((row) => (
            <div key={`${row.kind}-${row.identifier}`} className="hub-integrity-row" data-testid={`needs-review-${row.identifier}`}>
              <strong>Needs review · {row.identifier}</strong>
              <span>{row.detail}</span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
