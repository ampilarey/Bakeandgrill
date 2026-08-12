import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { ContentBlock } from '../../api/content';
import { sectionMeta } from './hubLayoutConfig';

type Props = {
  sectionName: string;
  /** Optional owner-facing title (defaults to sectionName). */
  title?: string;
  blocks: ContentBlock[];
  /** Rendered above regular blocks (section order + enable toggles). */
  chrome?: ReactNode;
  /** Brand Kit grid (Branding section). */
  brandKit?: ReactNode;
  renderBlock: (block: ContentBlock) => ReactNode;
  /** Mobile section editor: back to grid. */
  onBack?: () => void;
  isBrandKit?: boolean;
  /** Cards actually shown (chrome + brand kit + regular), for the header count. */
  cardCount?: number;
  /** When false, omit the in-panel header (mobile sheet already shows title/Back). */
  showHeader?: boolean;
};

type Bucket = { id: string; label: string; blocks: ContentBlock[] };

function bucketBlocks(sectionName: string, blocks: ContentBlock[]): Bucket[] {
  const meta = sectionMeta(sectionName);
  const subGroups = meta.subGroups;
  if (!subGroups?.length) {
    return [{ id: 'all', label: '', blocks }];
  }

  const used = new Set<string>();
  const buckets: Bucket[] = [];
  for (const sg of subGroups) {
    const matched = blocks.filter((b) => !used.has(b.key) && sg.match(b.key, b.label));
    if (matched.length === 0) continue;
    matched.forEach((b) => used.add(b.key));
    buckets.push({ id: sg.id, label: sg.label, blocks: matched });
  }
  const rest = blocks.filter((b) => !used.has(b.key));
  if (rest.length > 0) {
    buckets.push({ id: 'other', label: buckets.length ? 'Other' : '', blocks: rest });
  }
  return buckets.length ? buckets : [{ id: 'all', label: '', blocks }];
}

/**
 * Renders only the ACTIVE section. Large sections get sub-headings from hubLayoutConfig.
 */
export function SectionEditor({
  sectionName,
  title,
  blocks,
  chrome,
  brandKit,
  renderBlock,
  onBack,
  isBrandKit,
  cardCount,
  showHeader = true,
}: Props) {
  const buckets = bucketBlocks(sectionName, blocks);
  const shownCount = cardCount ?? blocks.length;
  const heading = title ?? sectionName;

  return (
    <section data-testid="section-editor" data-section={sectionName} className="hub-section-editor">
      {showHeader ? (
        <header className="hub-section-editor-header">
          {onBack ? (
            <button
              type="button"
              data-testid="section-editor-back"
              className="hub-section-editor-back"
              onClick={onBack}
              aria-label="Back to all tasks"
            >
              <ArrowLeft size={18} />
              <span className="hub-section-editor-back-label">All tasks</span>
            </button>
          ) : null}
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2 className="hub-section-editor-title">{heading}</h2>
            <div className="hub-section-editor-sub" data-testid="section-editor-count">
              {isBrandKit ? 'Brand Kit' : `${shownCount} block${shownCount === 1 ? '' : 's'}`}
            </div>
          </div>
        </header>
      ) : (
        <div className="hub-section-editor-sub" data-testid="section-editor-count" style={{ marginBottom: 10 }}>
          {isBrandKit ? 'Brand Kit' : `${shownCount} block${shownCount === 1 ? '' : 's'}`}
        </div>
      )}

      {chrome ? <div className="hub-section-editor-chrome">{chrome}</div> : null}
      {brandKit ? <div className="hub-section-editor-brandkit">{brandKit}</div> : null}

      <div className="hub-section-editor-blocks">
        {buckets.map((bucket) => (
          <div key={bucket.id} className="hub-section-subgroup">
            {bucket.label ? (
              <h3 className="hub-section-subgroup-title">{bucket.label}</h3>
            ) : null}
            <div className="hub-section-subgroup-list">
              {bucket.blocks.map((block) => renderBlock(block))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
