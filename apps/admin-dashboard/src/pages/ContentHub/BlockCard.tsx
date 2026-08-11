import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MoreHorizontal, Pencil } from 'lucide-react';
import type { ContentBlock, ContentLocale, ContentScope } from '../../api/content';
import { helperForBlock } from './blockHelpers';
import { MobileActionSheet } from '../../components/MobileActionSheet';
import { useIsMobile } from '../../hooks/useIsMobile';

type Props = {
  block: ContentBlock;
  locale: ContentLocale;
  helper?: string;
  /** Same / Different control (content-meaningful — stays on the face). */
  modeControl: ReactNode;
  /** Editor body (scopes / visual editors). */
  editor: ReactNode;
  /** Boolean: render switch on the same row as the label. */
  booleanControl?: ReactNode;
  onOpenHistory: () => void;
  historyOpen: boolean;
  historyPanel: ReactNode;
  /** Split dual-app blocks only — copy the other app into the active tab scope. */
  showCopyFromOtherApp?: boolean;
  /** Active tab scope (website | order_app) — determines which copy action is shown. */
  activeScope?: ContentScope;
  onCopyFromOtherScope?: () => void;
  technicalScopesLabel: string;
  rawValuePreview: string;
  /**
   * Mobile compact overview: hide the full editor, show Edit affordance.
   * Simple boolean switches stay inline (callers omit compact).
   */
  compact?: boolean;
  onEdit?: () => void;
  /** Thumbnail / Showing summary under the helper when compact. */
  compactSummary?: ReactNode;
};

/**
 * Simplified block card: label → helper → editor.
 * History, raw value, and key/type/locale live in the ⋯ menu.
 */
export function BlockCard({
  block,
  locale,
  helper,
  modeControl,
  editor,
  booleanControl,
  onOpenHistory,
  historyOpen,
  historyPanel,
  showCopyFromOtherApp = false,
  activeScope,
  onCopyFromOtherScope,
  technicalScopesLabel,
  rawValuePreview,
  compact = false,
  onEdit,
  compactSummary,
}: Props) {
  const isMobile = useIsMobile();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const moreBtnRef = useRef<HTMLButtonElement>(null);
  const sentence = helper ?? helperForBlock(block);
  const isBoolean = block.type === 'boolean' && Boolean(booleanControl);

  useEffect(() => {
    if (!menuOpen || isMobile) return;
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen, isMobile]);

  const menuItems = (
    <>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          setMenuOpen(false);
          onOpenHistory();
        }}
      >
        History
      </button>
      {showCopyFromOtherApp && activeScope === 'order_app' ? (
        <button
          type="button"
          role="menuitem"
          data-testid={`copy-from-website-${block.key}`}
          onClick={() => {
            setMenuOpen(false);
            onCopyFromOtherScope?.();
          }}
        >
          Copy from Website
        </button>
      ) : null}
      {showCopyFromOtherApp && activeScope === 'website' ? (
        <button
          type="button"
          role="menuitem"
          data-testid={`copy-from-order-${block.key}`}
          onClick={() => {
            setMenuOpen(false);
            onCopyFromOtherScope?.();
          }}
        >
          Copy from Order app
        </button>
      ) : null}
      <div className="hub-block-more-tech" data-testid={`block-tech-${block.key}`}>
        <div>
          <strong>Key</strong> {block.key}
        </div>
        <div>
          <strong>Type</strong> {block.type}
          {block.editor ? ` · ${block.editor}` : ''}
        </div>
        <div>
          <strong>Locale</strong> {locale}
        </div>
        <div>
          <strong>Scope</strong> {technicalScopesLabel}
        </div>
        <div className="hub-block-more-raw">
          <strong>Value</strong> {rawValuePreview || '—'}
        </div>
      </div>
    </>
  );

  return (
    <div
      className={`content-studio-block hub-block-card${compact ? ' hub-block-card--compact' : ''}`}
      data-testid={`block-card-${block.key}`}
      data-block-key={block.key}
      data-compact={compact ? 'true' : 'false'}
    >
      <div className="hub-block-card-top">
        <div className="hub-block-card-titles">
          {isBoolean ? (
            <div className="hub-block-card-boolean-row">
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="hub-block-card-label">{block.label}</div>
                <div className="hub-block-card-helper">{sentence}</div>
              </div>
              {booleanControl}
            </div>
          ) : (
            <>
              <div className="hub-block-card-label">{block.label}</div>
              <div className="hub-block-card-helper">{sentence}</div>
              {compact && compactSummary ? (
                <div className="hub-block-card-summary" data-testid={`block-summary-${block.key}`}>
                  {compactSummary}
                </div>
              ) : null}
            </>
          )}
        </div>
        <div className="hub-block-card-actions">
          {modeControl}
          {compact && onEdit && !isBoolean ? (
            <button
              type="button"
              className="hub-block-edit-btn"
              data-testid={`edit-${block.key}`}
              onClick={onEdit}
            >
              <Pencil size={14} /> Edit
            </button>
          ) : null}
          <div className="hub-block-more" ref={menuRef}>
            <button
              ref={moreBtnRef}
              type="button"
              data-testid={`block-more-${block.key}`}
              aria-label="More actions"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="hub-block-more-btn"
              onClick={() => setMenuOpen((o) => !o)}
            >
              <MoreHorizontal size={16} />
            </button>
            {menuOpen && !isMobile ? (
              <div className="hub-block-more-menu" role="menu" data-testid={`block-menu-${block.key}`}>
                {menuItems}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {isMobile ? (
        <MobileActionSheet
          open={menuOpen}
          title={block.label}
          onClose={() => setMenuOpen(false)}
          testId={`block-menu-${block.key}`}
          returnFocusTo={moreBtnRef.current}
        >
          {menuItems}
        </MobileActionSheet>
      ) : null}

      {historyOpen ? historyPanel : null}
      {!isBoolean && !compact ? <div className="hub-block-card-editor">{editor}</div> : null}
    </div>
  );
}

export function scopesLabelFor(scopes: ContentScope[]): string {
  if (scopes.includes('shared') && scopes.length === 1) return 'Both apps (shared)';
  if (scopes.includes('website') && scopes.includes('order_app')) return 'Website + Order app';
  if (scopes.includes('order_app')) return 'Order app';
  return 'Website';
}
