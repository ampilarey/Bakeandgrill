import { Suspense, useEffect, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PageHeader, PageShell } from './SharedUI';
import { HubContext } from './hubContext';
import { usePageTitle } from '../hooks/usePageTitle';
import { useCurrentUserPermissions } from '../hooks/usePermissions';

/*
 * A hub: one sidebar entry, one page, tabs along the top, each tab an
 * existing page rendered without its own title. Owner, 2026-09-08:
 * "related tabs together and under same settings".
 *
 * The URL carries the tab (/finance/expenses), so a bookmark or a link from
 * elsewhere lands on the right tab. A tab shows only to someone holding one
 * of its permissions — the same permission the page carried when it had its
 * own sidebar entry — and a bare hub path, or a tab the user cannot see,
 * lands on the first tab they can. This is the shape the Purchasing page
 * settled on (audit 2026-09-05); this generalises it.
 */

export interface HubTab {
  id: string;
  label: string;
  /** Any one of these opens the tab. Empty means anyone who can open the hub. */
  permissions: readonly string[];
  desc?: string;
  render: () => ReactNode;
}

/** Every permission that opens the hub at all: any one shows at least one tab. */
export function hubPermissions(tabs: readonly HubTab[]): string[] {
  return Array.from(new Set(tabs.flatMap((t) => t.permissions)));
}

/** The segment after the base: /finance/expenses/3 → "expenses". */
export function hubPathTab(base: string, pathname: string): string | null {
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = pathname.match(new RegExp(`^${escaped}/([^/?#]+)`));
  return m?.[1] ?? null;
}

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: '8px 18px', border: 'none', borderRadius: 8, cursor: 'pointer',
  fontWeight: 600, fontSize: 14, fontFamily: 'inherit', whiteSpace: 'nowrap',
  background: active ? 'var(--color-primary)' : 'transparent',
  color: active ? 'var(--color-on-primary, #fff)' : 'var(--color-text-secondary)',
});

export function HubPage({ base, section, title, subtitle, tabs, aliases = {} }: {
  /** Path the tabs hang off, e.g. "/finance". */
  base: string;
  section: string;
  title: string;
  /** Shown when the active tab has no description of its own. */
  subtitle?: string;
  tabs: readonly HubTab[];
  /** Old segment → tab id, for paths that used to mean something else. */
  aliases?: Record<string, string>;
}) {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const { can, loading } = useCurrentUserPermissions();

  const visible = tabs.filter((t) => t.permissions.length === 0 || t.permissions.some((p) => can(p)));
  const segment = hubPathTab(base, pathname);
  const alias = segment !== null ? aliases[segment] : undefined;
  const wanted = alias ?? segment;
  const current = visible.find((t) => t.id === wanted) ?? null;

  usePageTitle(current ? `${title} · ${current.label}` : title);

  useEffect(() => {
    if (loading) return;
    if (alias) {
      navigate(`${base}/${alias}${search}`, { replace: true });
      return;
    }
    if (current === null && visible.length > 0) {
      navigate(`${base}/${visible[0].id}${search}`, { replace: true });
    }
  }, [loading, alias, current, visible, base, search, navigate]);

  if (loading || current === null) return null;

  return (
    <PageShell>
      <PageHeader section={section} title={title} subtitle={current.desc ?? subtitle} />

      {visible.length > 1 && (
        <div
          role="tablist"
          aria-label={title}
          className="tab-scroll-row"
          style={{
            display: 'flex', gap: 4, marginBottom: 20, background: 'var(--color-bg)',
            borderRadius: 10, padding: 4, width: 'fit-content', maxWidth: '100%', overflowX: 'auto',
          }}
        >
          {visible.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={current.id === t.id}
              onClick={() => navigate(`${base}/${t.id}`)}
              style={tabStyle(current.id === t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      <HubContext.Provider value={true}>
        <Suspense fallback={<p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>}>
          {current.render()}
        </Suspense>
      </HubContext.Provider>
    </PageShell>
  );
}
