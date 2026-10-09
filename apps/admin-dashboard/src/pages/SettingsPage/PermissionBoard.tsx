import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { arrangeGroups } from './permissionSections';

/*
 * The permissions as tiles: one per group, in the six sections of
 * permissionSections.ts, each saying how many of its permissions are on.
 * A tile opens into a panel across the full width with the switches, so the
 * page is a map of 29 tiles (about two phone screens) rather than 190 rows
 * (fourteen thousand pixels, measured 2026-10-09). A search or filter opens
 * every group with a match and hides the rest.
 */

export type OverrideMode = 'inherit' | 'allow' | 'deny';

export interface BoardRow {
  slug: string;
  name: string;
  group: string;
  on: boolean;
  /** An unsaved change on this row. */
  pending?: boolean;
  /** A role's permission changed from the standard set, or a person's own Allow / Deny. */
  marked?: boolean;
  /** One person: what their role gives, and how this row is set for them. */
  roleOn?: boolean;
  mode?: OverrideMode;
}

export function groupTestId(group: string): string {
  return group.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const defaultCount = (on: number, total: number) => `${on} of ${total} on`;

export function PermissionBoard({
  rows,
  shown,
  open,
  onToggle,
  renderControl,
  groupTools,
  countText = defaultCount,
  tileNote,
  meter = true,
  wideRows = false,
}: {
  rows: readonly BoardRow[];
  /** Slugs a search or filter keeps; null shows everything. While set, every group with a match is open. */
  shown: ReadonlySet<string> | null;
  open: ReadonlySet<string>;
  onToggle: (group: string) => void;
  /** The switch or choice at the end of a row; none for a read-only list. */
  renderControl?: (row: BoardRow) => ReactNode;
  /** Buttons in an open group's head, e.g. All on / All off. */
  groupTools?: (group: string, rows: readonly BoardRow[]) => ReactNode;
  countText?: (on: number, total: number) => string;
  /** A short line on a closed tile, e.g. "2 unsaved". */
  tileNote?: (rows: readonly BoardRow[]) => { text: string; tone: 'rust' | 'brown' } | null;
  /** The bar under the count; off where the total is unknown. */
  meter?: boolean;
  /** Rows that hold a three-way choice need more width before they pair up. */
  wideRows?: boolean;
}) {
  const byGroup = new Map<string, BoardRow[]>();
  for (const row of rows) {
    const list = byGroup.get(row.group) ?? [];
    list.push(row);
    byGroup.set(row.group, list);
  }
  const filtering = shown !== null;

  return (
    <div className="perm-board">
      {arrangeGroups(byGroup.keys()).map((section) => {
        const sectionRows = section.groups.flatMap((g) => byGroup.get(g) ?? []);
        const visibleGroups = section.groups.filter(
          (g) => !filtering || (byGroup.get(g) ?? []).some((r) => shown.has(r.slug)),
        );
        if (visibleGroups.length === 0) return null;
        const Icon = section.icon;
        const sectionOn = sectionRows.filter((r) => r.on).length;
        return (
          <section key={section.id} className="perm-section" data-testid={`perm-section-${section.id}`}>
            <h3 className="perm-section-head">
              <Icon size={15} aria-hidden />
              <span className="perm-section-name">{section.label}</span>
              <span className="perm-section-count">{countText(sectionOn, sectionRows.length)}</span>
            </h3>
            <div className="perm-tiles">
              {visibleGroups.map((group) => {
                const groupRows = byGroup.get(group) ?? [];
                const on = groupRows.filter((r) => r.on).length;
                const pct = groupRows.length > 0 ? Math.round((on / groupRows.length) * 100) : 0;
                const id = groupTestId(group);
                const isOpen = filtering || open.has(group);
                const count = countText(on, groupRows.length);

                if (!isOpen) {
                  const note = tileNote?.(groupRows) ?? null;
                  return (
                    <button
                      key={group}
                      type="button"
                      className="perm-tile"
                      aria-expanded={false}
                      onClick={() => onToggle(group)}
                      data-testid={`perm-tile-${id}`}
                    >
                      <span className="perm-tile-name">{group}</span>
                      <span className="perm-tile-count">{count}</span>
                      {meter && (
                        <span className="perm-meter" aria-hidden>
                          <span style={{ width: `${pct}%` }} />
                        </span>
                      )}
                      {note && <span className={`perm-tile-note perm-tile-note--${note.tone}`}>{note.text}</span>}
                    </button>
                  );
                }

                const listed = filtering ? groupRows.filter((r) => shown.has(r.slug)) : groupRows;
                const head = (
                  <>
                    <span className="perm-tile-name">{group}</span>
                    <span className="perm-tile-count">{count}</span>
                  </>
                );
                return (
                  <div key={group} className="perm-panel" data-testid={`perm-panel-${id}`}>
                    <div className="perm-panel-head">
                      {filtering ? (
                        <div className="perm-panel-title">{head}</div>
                      ) : (
                        <button
                          type="button"
                          className="perm-panel-title perm-panel-toggle"
                          aria-expanded
                          onClick={() => onToggle(group)}
                        >
                          {head}
                          <ChevronDown size={16} aria-hidden className="perm-chevron" />
                        </button>
                      )}
                      {groupTools && <div className="perm-panel-tools">{groupTools(group, groupRows)}</div>}
                    </div>
                    <ul className={`perm-rows${wideRows ? ' perm-rows--wide' : ''}`}>
                      {listed.map((row) => (
                        <li
                          key={row.slug}
                          className="perm-row"
                          data-pending={row.pending ? '' : undefined}
                          data-testid={`perm-row-${row.slug}`}
                        >
                          <span className="perm-row-name" title={row.slug}>{row.name}</span>
                          {renderControl?.(row)}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
