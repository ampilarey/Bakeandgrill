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
 *
 * Tabs may declare a `group`. Kitchen has eleven of them, which on a 360px
 * phone was one long sideways scroll with nothing to say more existed off
 * the right-hand edge. Grouped, the strip becomes two short rows — the
 * groups, then the tabs of the group you are in — the same two-level shape
 * the SMS page already uses.
 */

export interface HubTab {
  id: string;
  label: string;
  /** Any one of these opens the tab. Empty means anyone who can open the hub. */
  permissions: readonly string[];
  desc?: string;
  /** Optional first-level grouping. Tabs of one group must sit together. */
  group?: string;
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

/** Group names in tab order, skipping tabs with no group. */
export function hubGroups(tabs: readonly HubTab[]): string[] {
  const seen: string[] = [];
  for (const t of tabs) {
    if (t.group && !seen.includes(t.group)) seen.push(t.group);
  }
  return seen;
}

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: '8px 18px', border: 'none', borderRadius: 8, cursor: 'pointer',
  fontWeight: 600, fontSize: 14, fontFamily: 'inherit', whiteSpace: 'nowrap',
  background: active ? 'var(--color-primary)' : 'transparent',
  color: active ? 'var(--color-on-primary, #fff)' : 'var(--color-text-secondary)',
});

const groupStyle = (active: boolean): React.CSSProperties => ({
  padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer',
  fontFamily: 'inherit', fontSize: 13, whiteSpace: 'nowrap',
  fontWeight: active ? 700 : 500,
  color: active ? 'var(--color-primary)' : 'var(--color-text-muted)',
  borderBottom: active ? '2px solid var(--color-primary)' : '2px solid transparent',
  marginBottom: -2,
});

function TabStrip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="tab-scroll-row hub-tabs"
      style={{
        display: 'flex', gap: 4, background: 'var(--color-bg)',
        borderRadius: 10, padding: 4, width: 'fit-content', maxWidth: '100%', overflowX: 'auto',
      }}
    >
      {children}
    </div>
  );
}

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

  const groups = hubGroups(visible);
  const grouped = groups.length > 1;
  const siblings = grouped ? visible.filter((t) => t.group === current.group) : visible;

  return (
    <PageShell className="hub-page">
      <PageHeader section={section} title={title} subtitle={current.desc ?? subtitle} />

      {grouped && (
        <div className="tab-scroll-row hub-groups" style={{ display: 'flex', borderBottom: '2px solid var(--color-border)', overflowX: 'auto' }}>
          {groups.map((g) => {
            const first = visible.find((t) => t.group === g)!;
            return (
              <button
                key={g}
                type="button"
                aria-current={current.group === g ? 'true' : undefined}
                onClick={() => navigate(`${base}/${first.id}`)}
                style={groupStyle(current.group === g)}
              >
                {g}
              </button>
            );
          })}
        </div>
      )}

      {siblings.length > 1 && (
        <div style={{ marginTop: grouped ? 12 : 0, marginBottom: 20 }}>
          <TabStrip label={title}>
            {siblings.map((t) => (
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
          </TabStrip>
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
