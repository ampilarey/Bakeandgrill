import type { ContentApp, ContentBlock } from '../../api/content';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { sectionMeta } from './hubLayoutConfig';
import { blockDisplayName, summarizeBlockValue } from './summarizeBlockValue';
import type { DraftMap } from './hubDraftUtils';
import { fallbackManagedBy } from './opsOwnedContentKeys';

export type PageListRow =
  | { kind: 'heading'; id: string; label: string }
  | {
    kind: 'block';
    id: string;
    block: ContentBlock;
    name: string;
    summary: string;
    visibility: string;
    opsOwned: boolean;
    ownerLabel?: string;
    ownerPath?: string;
  };

/** Bucket blocks into subgroup headings (Order buttons, Specials, …) then flat rows. */
export function buildWebsiteDesktopPageRows(
  sectionName: string,
  blocks: ContentBlock[],
  hubApp: ContentApp,
  drafts: DraftMap,
): PageListRow[] {
  const meta = sectionMeta(sectionName);
  const subGroups = meta.subGroups;
  const rows: PageListRow[] = [];

  const pushBlock = (block: ContentBlock) => {
    const summary = summarizeBlockValue(block, hubApp, drafts);
    const resolved =
      (hubApp === 'order_app' ? block.resolved_order_app : block.resolved_website) ?? '';
    const managedBy = block.managed_by ?? fallbackManagedBy(block.key, resolved);
    rows.push({
      kind: 'block',
      id: block.key,
      block,
      name: blockDisplayName(block),
      summary: summary.line,
      visibility: summary.visibility,
      opsOwned: Boolean(managedBy),
      ownerLabel: managedBy?.owner_label,
      ownerPath: managedBy?.owner_path,
    });
  };

  // Hero first when present — matches page render order / owner habit.
  const hero = blocks.find((b) => b.editor === 'hero' || b.key === 'hero_slides');
  const rest = hero ? blocks.filter((b) => b.key !== hero.key) : blocks;
  if (hero) {
    rows.push({ kind: 'heading', id: 'hero', label: 'Hero' });
    pushBlock(hero);
  }

  if (!subGroups?.length) {
    if (rest.length && hero) {
      rows.push({ kind: 'heading', id: 'rest', label: 'On this page' });
    }
    rest.forEach(pushBlock);
    return rows;
  }

  const used = new Set<string>(hero ? [hero.key] : []);
  for (const sg of subGroups) {
    const matched = rest.filter((b) => !used.has(b.key) && sg.match(b.key, b.label));
    if (matched.length === 0) continue;
    matched.forEach((b) => used.add(b.key));
    rows.push({ kind: 'heading', id: sg.id, label: sg.label });
    matched.forEach(pushBlock);
  }
  const leftover = rest.filter((b) => !used.has(b.key));
  if (leftover.length > 0) {
    rows.push({ kind: 'heading', id: 'other', label: rows.some((r) => r.kind === 'heading') ? 'Other' : '' });
    leftover.forEach(pushBlock);
  }
  return rows;
}

type Props = {
  sectionName: string;
  blocks: ContentBlock[];
  hubApp: ContentApp;
  drafts: DraftMap;
  selectedKey: string | null;
  onSelect: (key: string) => void;
  /** Stage D — filter device-specific keys out of the middle list. */
  deviceFilter?: 'desktop' | 'mobile';
};

/** Stage D — device-named / mobile-only keys are filtered from the page list. */
export function blockMatchesDevice(block: ContentBlock, device: 'desktop' | 'mobile'): boolean {
  const k = block.key.toLowerCase();
  const label = (block.label || '').toLowerCase();
  if (device === 'desktop') {
    if (k.includes('mobile') || k.includes('bottom_nav') || label.includes('mobile only')) return false;
  } else if (k.includes('desktop') && !k.includes('mobile')) {
    return false;
  }
  return true;
}

/**
 * Website desktop Stage B — middle column: page components in owner order
 * with load-bearing “what it currently says” summaries.
 */
export function WebsiteDesktopPageList({
  sectionName,
  blocks,
  hubApp,
  drafts,
  selectedKey,
  onSelect,
  deviceFilter = 'desktop',
}: Props) {
  const filtered = blocks.filter((b) => blockMatchesDevice(b, deviceFilter));
  const rows = buildWebsiteDesktopPageRows(sectionName, filtered, hubApp, drafts);

  return (
    <aside
      className="hub-website-page-list"
      data-testid="website-desktop-page-list"
      data-section={sectionName}
      data-device={deviceFilter}
    >
      <header className="hub-website-page-list-header">
        <h2 className="hub-website-page-list-title">{sectionName}</h2>
        <p className="hub-website-page-list-sub">In customer order</p>
      </header>
      <div className="hub-website-page-list-body">
        {rows.map((row) => {
          if (row.kind === 'heading') {
            if (!row.label) return null;
            return (
              <div
                key={`h-${row.id}`}
                className="hub-website-page-list-heading"
                data-testid={`page-list-heading-${row.id}`}
              >
                {row.label}
              </div>
            );
          }
          const pressed = selectedKey === row.id;
          return (
            <button
              key={row.id}
              type="button"
              className={`hub-website-page-list-row${pressed ? ' hub-website-page-list-row--active' : ''}`}
              data-testid={`page-list-row-${row.id}`}
              aria-pressed={pressed}
              onClick={() => onSelect(row.id)}
            >
              <span className="hub-website-page-list-row-main">
                <span className="hub-website-page-list-row-name">{row.name}</span>
                <span
                  className="hub-website-page-list-row-summary"
                  data-testid={`page-list-summary-${row.id}`}
                >
                  {row.summary}
                </span>
                <span className="hub-website-page-list-row-meta">
                  <span
                    className={`hub-website-page-list-vis hub-website-page-list-vis--${row.visibility === 'Showing' ? 'on' : 'off'}`}
                    data-testid={`page-list-vis-${row.id}`}
                  >
                    {row.visibility}
                  </span>
                  {row.opsOwned && row.ownerPath ? (
                    <Link
                      className="hub-website-page-list-ops"
                      to={row.ownerPath.replace(/^\/admin/, '') || '/'}
                      data-testid={`page-list-ops-${row.id}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {row.ownerLabel || 'Managed elsewhere'}
                    </Link>
                  ) : null}
                </span>
              </span>
              <ChevronRight size={16} className="hub-website-page-list-chevron" aria-hidden />
            </button>
          );
        })}
        {rows.filter((r) => r.kind === 'block').length === 0 ? (
          <p className="hub-website-page-list-empty" data-testid="page-list-empty">
            No components in this section yet.
          </p>
        ) : null}
      </div>
    </aside>
  );
}
