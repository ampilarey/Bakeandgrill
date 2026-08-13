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
  /** Editor body (scopes / visual editors). */
  editor: ReactNode;
  /** Boolean: render switch on the same row as the label. */
  booleanControl?: ReactNode;
  onOpenHistory: () => void;
  historyOpen: boolean;
  historyPanel: ReactNode;
  technicalScopesLabel: string;
  rawValuePreview: string;
  /**
   * Overview → Edit: hide the full editor, show Edit affordance.
   * Simple boolean switches stay inline (callers omit compact).
   */
  compact?: boolean;
  onEdit?: () => void;
  /** Thumbnail / one-line summary under the helper when compact. */
  compactSummary?: ReactNode;
  /** Showing / Hidden (or Set / Not set) status for overview cards. */
  visibilityLabel?: string;
};

/**
 * Simplified block card: label → helper → editor.
 * History, raw value, and key/type/locale live in the ⋯ menu.
 */
export function BlockCard({
  block,
  locale,
  helper,
  editor,
  booleanControl,
  onOpenHistory,
  historyOpen,
  historyPanel,
  technicalScopesLabel,
  rawValuePreview,
  compact = false,
  onEdit,
  compactSummary,
  visibilityLabel,
}: Props) {
  const isMobile = useIsMobile();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const moreBtnRef = useRef<HTMLButtonElement>(null);
  const sentence = helper ?? helperForBlock(block);
  const isBoolean = block.type === 'boolean' && Boolean(booleanControl);
  const openEditor = () => {
    if (compact && onEdit && !isBoolean) onEdit();
  };

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
      onClick={(e) => {
        if (!compact || isBoolean || !onEdit) return;
        const target = e.target as HTMLElement;
        if (target.closest('button, a, input, textarea, select, [role="menu"], [role="menuitem"]')) return;
        openEditor();
      }}
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
              {compact && (compactSummary || visibilityLabel) ? (
                <div className="hub-block-card-summary" data-testid={`block-summary-${block.key}`}>
                  {compactSummary}
                  {visibilityLabel ? (
                    <span
                      className={`hub-block-visibility hub-block-visibility--${visibilityLabel.toLowerCase().includes('hidden') || visibilityLabel.toLowerCase().includes('not') ? 'hidden' : 'showing'}`}
                      data-testid={`block-visibility-${block.key}`}
                    >
                      {visibilityLabel}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </div>
        <div className="hub-block-card-actions">
          {compact && onEdit && !isBoolean ? (
            <button
              type="button"
              className="hub-block-edit-btn"
              data-testid={`edit-${block.key}`}
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
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
  if (scopes.includes('shared') && scopes.length === 1) return 'Business record';
  if (scopes.includes('website') && scopes.includes('order_app')) return 'Website + Order app';
  if (scopes.includes('order_app')) return 'Order app';
  return 'Website';
}
