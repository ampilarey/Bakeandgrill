import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { ChevronRight, MoreHorizontal } from 'lucide-react';
import {
  createPageBlock,
  createPageBlockPreviewToken,
  deletePageBlock,
  discardPageBlockDraft,
  fetchAdminPageBlocks,
  publishPageBlocks,
  reorderPageBlocks,
  updatePageBlock,
  type PageBlockApp,
  type PageBlockRow,
  type PageBlockType,
} from '../../api/pageBlocks';
import { ContentEditorSheet } from '../../components/ContentEditorSheet';
import { GenericBlockSettingsForm, isGenericBlockType, type BlockSettings } from './GenericBlockSettingsForm';
import {
  ORDER_HOME_FIXED_MODULES,
  WEBSITE_HOME_FIXED_MODULES,
  blockRenderedOnApp,
  blockSurfaceFor,
  heroPromoConflict,
} from './surfaceRegistry';

type Props = {
  /** Optional: bump to force reload after publish. */
  reloadKey?: number;
  /** Prefer Website or Order App tab (from Content task landing). */
  initialApp?: PageBlockApp;
  /** Notify parent when layout draft state changes (unified publish status). */
  onLayoutDraftChange?: (hasDraft: boolean) => void;
};

const APP_TABS: Array<{ id: PageBlockApp; label: string }> = [
  { id: 'website', label: 'Website' },
  { id: 'order_app', label: 'Order App' },
];

const BLOCK_THUMB: Partial<Record<string, string>> = {
  hero: '🖼',
  specials: '★',
  categories: '▦',
  featured_items: '◎',
  social_proof: '❝',
  cta: '→',
  location: '⌖',
  rich_text: '¶',
  image: '▣',
  image_text: '▣¶',
  button_band: '▢',
  video: '▶',
  divider: '—',
  faq: '?',
};

/**
 * Guided home-page layout — Overview → Edit.
 * Overview cards stay simple; reorder/hide/remove live in Reorder mode or the editor.
 */
export function HomeLayoutEditor({
  reloadKey = 0,
  initialApp = 'website',
  onLayoutDraftChange,
}: Props) {
  const [app, setApp] = useState<PageBlockApp>(initialApp);
  const [blocks, setBlocks] = useState<PageBlockRow[]>([]);
  const [types, setTypes] = useState<PageBlockType[]>([]);
  const [unknown, setUnknown] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [addType, setAddType] = useState('');
  const [previewMsg, setPreviewMsg] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [reorderMode, setReorderMode] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [draftVersion, setDraftVersion] = useState(0);
  const [hasDraft, setHasDraft] = useState(false);

  useEffect(() => {
    setApp(initialApp);
  }, [initialApp]);

  useEffect(() => {
    onLayoutDraftChange?.(hasDraft);
  }, [hasDraft, onLayoutDraftChange]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setEditingId(null);
    try {
      const res = await fetchAdminPageBlocks(app);
      setBlocks(res.blocks ?? []);
      setTypes(res.available_types ?? []);
      setUnknown(res.unknown_types ?? []);
      setDraftVersion(res.version ?? 0);
      setHasDraft(Boolean(res.draft));
    } catch (e) {
      setError((e as Error).message || 'Could not load home layout.');
    } finally {
      setLoading(false);
    }
  }, [app]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const persistOrder = async (next: PageBlockRow[]) => {
    setBusy(true);
    setError('');
    try {
      await reorderPageBlocks({
        app,
        version: draftVersion,
        blocks: next.map((b, i) => ({
          id: b.id,
          position: i,
          is_enabled: b.is_enabled,
        })),
      }).then((res) => {
        setDraftVersion(res.version);
        setHasDraft(true);
      });
      setBlocks(next.map((b, i) => ({ ...b, position: i })));
    } catch (e) {
      setError((e as Error).message || 'Could not save order.');
      await load();
    } finally {
      setBusy(false);
    }
  };

  const moveLayout = (layoutIndex: number, dir: -1 | 1) => {
    const visible = blocks.filter((b) => {
      if (app === 'website' && b.block_type === 'brand_footer') return false;
      return blockRenderedOnApp(b.block_type, app);
    });
    const j = layoutIndex + dir;
    if (j < 0 || j >= visible.length) return;
    const nextVisible = [...visible];
    const tmp = nextVisible[layoutIndex];
    nextVisible[layoutIndex] = nextVisible[j];
    nextVisible[j] = tmp;
    const ignored = blocks.filter((b) => !nextVisible.some((x) => x.id === b.id));
    void persistOrder([...nextVisible, ...ignored]);
  };

  const toggleEnabled = async (block: PageBlockRow) => {
    if (!block.removable && block.is_enabled) {
      setError(block.non_removable_reason || `“${block.label}” cannot be turned off.`);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await updatePageBlock(block.id, {
        app,
        page: 'home',
        version: draftVersion,
        is_enabled: !block.is_enabled,
      });
      setBlocks((prev) => prev.map((b) => (b.id === block.id ? { ...b, ...res.block } : b)));
      setDraftVersion(res.version);
      setHasDraft(true);
    } catch (e) {
      setError((e as Error).message || 'Could not update block.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (block: PageBlockRow) => {
    if (!block.removable) {
      setError(block.non_removable_reason || `“${block.label}” cannot be removed.`);
      return;
    }
    if (!window.confirm(`Remove “${block.label}” from this home page?`)) return;
    setBusy(true);
    setError('');
    try {
      const res = await deletePageBlock({ id: block.id, app, version: draftVersion });
      setBlocks(res.blocks ?? []);
      setDraftVersion(res.version);
      setHasDraft(true);
    } catch (e) {
      setError((e as Error).message || 'Could not remove block.');
    } finally {
      setBusy(false);
    }
  };

  const setMode = async (block: PageBlockRow, mode: 'shared' | 'own') => {
    let shareSource: 'website' | 'order_app' | 'shared' | undefined;
    if (mode === 'shared' && block.content_mode === 'own') {
      if (!window.confirm(
        `Use the shared version of “${block.label}” again?\n\n`
        + 'Website and Order App will show the same content. Next you choose which copy becomes that shared version.',
      )) {
        return;
      }
      const choiceRaw = window.prompt(
        'Which copy should become the shared version?\n\n'
        + 'Type website, order, or keep (keep = leave the old shared content as-is)',
        app === 'order_app' ? 'order' : 'website',
      );
      const choice = (choiceRaw || '').trim().toLowerCase();
      if (choice === 'website') shareSource = 'website';
      else if (choice === 'order' || choice === 'order_app') shareSource = 'order_app';
      else if (choice === 'keep' || choice === 'shared') shareSource = 'shared';
      else return;
    }
    if (mode === 'own' && block.content_mode === 'shared') {
      if (!window.confirm(
        `Customise “${block.label}” for this app only?\n\n`
        + 'A copy of the shared content is created as your starting point. The other app keeps the shared version until you customise it too.',
      )) {
        return;
      }
    }
    setBusy(true);
    setError('');
    try {
      const res = await updatePageBlock(block.id, {
        app,
        page: 'home',
        version: draftVersion,
        content_mode: mode,
        ...(shareSource ? { share_source: shareSource } : {}),
      });
      setBlocks((prev) => prev.map((b) => (b.id === block.id ? { ...b, ...res.block } : b)));
      setDraftVersion(res.version);
      setHasDraft(true);
      if (mode === 'own' && block.content_mode === 'shared') {
        setPreviewMsg(`Copied shared content into “${block.label}” as a starting point.`);
      }
    } catch (e) {
      setError((e as Error).message || 'Could not change content mode.');
    } finally {
      setBusy(false);
    }
  };

  const saveSettings = async (block: PageBlockRow, settings: BlockSettings) => {
    setBusy(true);
    setError('');
    try {
      const res = await updatePageBlock(block.id, {
        app,
        page: 'home',
        version: draftVersion,
        settings,
      });
      setBlocks((prev) => prev.map((b) => (b.id === block.id ? { ...b, ...res.block } : b)));
      setDraftVersion(res.version);
      setHasDraft(true);
    } catch (e) {
      setError((e as Error).message || 'Could not save this section’s content.');
      throw e;
    } finally {
      setBusy(false);
    }
  };

  const addBlock = async () => {
    if (!addType) return;
    setBusy(true);
    setError('');
    try {
      const def = types.find((t) => t.type === addType);
      const created = await createPageBlock({
        app,
        version: draftVersion,
        block_type: addType,
        content_mode: def?.supports_shared_content ? 'shared' : 'own',
      });
      setDraftVersion(created.version);
      setHasDraft(true);
      setAddType('');
      await load();
      // A fresh generic block is empty — open its form so the owner can type
      // something into it right away.
      if (isGenericBlockType(addType)) setEditingId(created.block.id);
    } catch (e) {
      setError((e as Error).message || 'Could not add block.');
    } finally {
      setBusy(false);
    }
  };

  const preview = async () => {
    setBusy(true);
    setPreviewMsg('');
    setError('');
    try {
      const { token, website_url, order_app_url } = await createPageBlockPreviewToken({
        app,
        version: draftVersion,
      });
      const path = app === 'website'
        ? (website_url ?? `/admin/preview/website/home?token=${encodeURIComponent(token)}`)
        : (order_app_url ?? `/order/?previewToken=${encodeURIComponent(token)}`);
      window.open(path, '_blank', 'noopener,noreferrer');
      setPreviewMsg('Draft preview opened in a new tab. It expires in 15 minutes and does not change the live page.');
    } catch (e) {
      setError((e as Error).message || 'Could not create preview.');
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    setBusy(true);
    setError('');
    setPreviewMsg('');
    try {
      const res = await publishPageBlocks({ app, version: draftVersion });
      setBlocks(res.blocks ?? []);
      setDraftVersion(res.version ?? 0);
      setHasDraft(Boolean(res.draft));
      setPreviewMsg('Published. The live home page now uses these layout changes.');
    } catch (e) {
      setError((e as Error).message || 'Could not publish layout.');
    } finally {
      setBusy(false);
    }
  };

  const discard = async () => {
    if (!window.confirm('Discard this unpublished layout draft?')) return;
    setBusy(true);
    setError('');
    setPreviewMsg('');
    try {
      const res = await discardPageBlockDraft({ app });
      setBlocks(res.blocks ?? []);
      setDraftVersion(res.version ?? 0);
      setHasDraft(Boolean(res.draft));
      setPreviewMsg('Draft discarded. You are viewing the live layout again.');
    } catch (e) {
      setError((e as Error).message || 'Could not discard draft.');
    } finally {
      setBusy(false);
    }
  };

  const editing = editingId != null ? blocks.find((b) => b.id === editingId) ?? null : null;
  const layoutBlocks = blocks.filter((b) => {
    // Website brand_footer is ignored by the Website home renderer.
    if (app === 'website' && b.block_type === 'brand_footer') return false;
    return blockRenderedOnApp(b.block_type, app);
  });
  const ignoredBlocks = blocks.filter((b) => !layoutBlocks.some((x) => x.id === b.id));
  const conflict = heroPromoConflict(layoutBlocks.filter((b) => b.is_enabled).map((b) => b.block_type));
  const fixedModules = app === 'website'
    ? WEBSITE_HOME_FIXED_MODULES
    : ORDER_HOME_FIXED_MODULES.filter((m) => m.kind !== 'reorderable_block');
  const addable = types.filter((t) => {
    if (!t.apps.includes(app)) return false;
    const present = layoutBlocks.some((b) => b.block_type === t.type);
    if (t.type === 'promo_carousel' && layoutBlocks.some((b) => b.block_type === 'hero')) return false;
    if (t.type === 'hero' && layoutBlocks.some((b) => b.block_type === 'promo_carousel')) return false;
    if (t.type === 'brand_footer' && app === 'website') return false;
    if (!t.allows_multiple && present) return false;
    return blockRenderedOnApp(t.type, app);
  });

  return (
    <div
      data-testid="home-layout-editor"
      data-reorder={reorderMode ? 'true' : 'false'}
      data-app={app}
      style={{
        border: '1px solid var(--color-border)',
        borderRadius: 12,
        padding: 14,
        background: 'var(--color-surface)',
        marginBottom: 12,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--color-text)' }}>
            {app === 'website' ? 'Website Home' : 'Order App Home'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2, maxWidth: 520 }}>
            Reorderable sections below. Fixed and injected modules are listed separately — they cannot pretend to move.
          </div>
          <div
            data-testid="home-layout-draft-status"
            style={{
              marginTop: 8,
              fontSize: 12,
              fontWeight: 700,
              color: hasDraft ? 'var(--color-warning-strong)' : 'var(--color-success)',
            }}
          >
            {hasDraft ? 'Draft saved — not live' : 'All published'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>
          <button
            type="button"
            data-testid="home-layout-reorder-toggle"
            aria-pressed={reorderMode}
            onClick={() => setReorderMode((v) => !v)}
            style={{
              ...btnSecondary,
              background: reorderMode ? 'var(--color-primary)' : 'var(--color-surface)',
              color: reorderMode ? 'var(--color-bg)' : 'var(--color-text)',
              borderColor: reorderMode ? 'var(--color-primary)' : 'var(--color-border)',
            }}
          >
            {reorderMode ? 'Done reordering' : 'Reorder sections'}
          </button>
          {hasDraft ? (
            <>
              <button
                type="button"
                data-testid="home-layout-preview-btn"
                onClick={() => void preview()}
                disabled={busy || loading}
                style={btnSecondary}
              >
                Preview
              </button>
              <button
                type="button"
                data-testid="home-layout-publish-btn"
                onClick={() => void publish()}
                disabled={busy || loading}
                style={btnPrimary}
              >
                Publish changes
              </button>
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  data-testid="home-layout-more-btn"
                  aria-label="More layout actions"
                  aria-expanded={moreOpen}
                  onClick={() => setMoreOpen((o) => !o)}
                  style={{ ...btnSecondary, minWidth: 40, padding: '8px' }}
                >
                  <MoreHorizontal size={16} />
                </button>
                {moreOpen ? (
                  <div
                    role="menu"
                    data-testid="home-layout-more-menu"
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: '100%',
                      marginTop: 4,
                      minWidth: 160,
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 10,
                      padding: 6,
                      zIndex: 20,
                      boxShadow: '0 8px 24px rgba(28,20,8,0.12)',
                    }}
                  >
                    <button
                      type="button"
                      role="menuitem"
                      data-testid="home-layout-discard-btn"
                      disabled={busy || loading}
                      onClick={() => {
                        setMoreOpen(false);
                        void discard();
                      }}
                      style={{
                        ...btnSecondary,
                        width: '100%',
                        border: 'none',
                        textAlign: 'left',
                        color: 'var(--color-danger)',
                      }}
                    >
                      Discard draft
                    </button>
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {APP_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            data-testid={`home-layout-tab-${tab.id}`}
            onClick={() => setApp(tab.id)}
            style={{
              ...btnSecondary,
              background: app === tab.id ? 'var(--color-primary)' : 'transparent',
              color: app === tab.id ? 'var(--color-bg)' : 'var(--color-text-secondary)',
              borderColor: app === tab.id ? 'var(--color-primary)' : 'var(--color-border)',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Loading layout…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="hub-fixed-module-list" data-testid="home-layout-fixed-modules">
            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--color-text-secondary)' }}>
              Fixed & injected (not free-form layout)
            </div>
            {fixedModules.map((mod) => (
              <div
                key={mod.id}
                className="hub-fixed-module-card"
                data-testid={`home-fixed-${mod.id}`}
                data-kind={mod.kind}
              >
                <div className="hub-fixed-module-title">{mod.name}</div>
                <div className="hub-task-card-meta" style={{ marginTop: 6 }}>
                  <span className="hub-placement-chip hub-placement-chip--status">{mod.statusHint ?? 'Fixed'}</span>
                  {mod.placements.map((p) => (
                    <span key={p} className="hub-placement-chip">{p}</span>
                  ))}
                </div>
                {mod.note ? <div className="hub-fixed-module-note">{mod.note}</div> : null}
                {mod.managedBy ? (
                  <a
                    href={mod.managedBy.href}
                    style={{ display: 'inline-block', marginTop: 8, fontSize: 12, fontWeight: 700, color: 'var(--color-primary)' }}
                  >
                    {mod.managedBy.label} →
                  </a>
                ) : null}
              </div>
            ))}
          </div>

          {conflict ? (
            <div className="hub-hero-promo-warning" data-testid="home-layout-hero-promo-warning" role="status">
              Hero and Promo carousel both use the same slides (hero_slides). Disable one so customers do not see two identical carousels.
            </div>
          ) : null}

          {ignoredBlocks.length > 0 ? (
            <div className="hub-fixed-module-card" data-testid="home-layout-ignored-blocks">
              <div className="hub-fixed-module-title">Not shown on this surface</div>
              <div className="hub-fixed-module-note">
                {ignoredBlocks.map((b) => b.label).join(', ')}
                {app === 'website'
                  ? ' — Website ignores these layout rows (footer is site-wide; prayer is header-owned).'
                  : ' — Order App does not render these Website-only blocks.'}
              </div>
            </div>
          ) : null}

          <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--color-text-secondary)', marginTop: 4 }}>
            Reorderable sections
          </div>

          {layoutBlocks.length === 0 && !error && (
            <div
              role="alert"
              data-testid="home-layout-empty-warning"
              style={{
                border: '2px solid var(--color-danger)',
                background: 'var(--color-danger-bg)',
                borderRadius: 10,
                padding: '10px 12px',
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--color-danger-strong)',
              }}
            >
              This home page has no sections — customers will only see required chrome. Add sections below.
            </div>
          )}
          {layoutBlocks.map((block, index) => {
            const surface = blockSurfaceFor(block.block_type, app);
            const thumb = BLOCK_THUMB[block.block_type] ?? '▪';
            const summary = surface.note || block.description || surface.summary;
            const canReorder = surface.actions.includes('reorder');
            return (
              <div
                key={block.id}
                data-testid={`home-layout-block-${block.block_type}`}
                data-block-id={block.id}
                data-surface-kind={surface.kind}
                className="home-layout-section-card"
                style={{
                  display: 'grid',
                  gridTemplateColumns: reorderMode && canReorder ? 'auto 1fr auto' : 'auto 1fr auto',
                  gap: 10,
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid var(--color-border)',
                  background: block.is_enabled ? 'var(--color-bg)' : 'var(--color-border-light)',
                  opacity: block.is_enabled ? 1 : 0.75,
                  minWidth: 0,
                }}
              >
                <div
                  aria-hidden
                  data-testid={`home-layout-thumb-${block.id}`}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 8,
                    background: 'var(--color-border-light)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 16,
                    color: 'var(--color-text-secondary)',
                    flexShrink: 0,
                  }}
                >
                  {thumb}
                </div>
                <button
                  type="button"
                  data-testid={`home-layout-edit-${block.id}`}
                  onClick={() => {
                    if (reorderMode) return;
                    setEditingId(block.id);
                  }}
                  disabled={reorderMode}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: 4,
                    minWidth: 0,
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                    textAlign: 'left',
                    cursor: reorderMode ? 'default' : 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--color-text)', overflowWrap: 'anywhere' }}>
                    {block.label}
                  </span>
                  <span className="hub-task-card-meta">
                    <span
                      data-testid={`home-layout-visibility-${block.id}`}
                      className="hub-placement-chip hub-placement-chip--status"
                      style={badgeStyle(block.is_enabled)}
                    >
                      {block.is_enabled ? 'Showing' : 'Hidden'}
                    </span>
                    {surface.placements.slice(0, 3).map((p) => (
                      <span key={p} className="hub-placement-chip">{p}</span>
                    ))}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)', overflowWrap: 'anywhere' }}>
                    {summary}
                  </span>
                </button>
                {reorderMode && canReorder ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'stretch' }}>
                    <button
                      type="button"
                      aria-label={`Move ${block.label} up`}
                      data-testid={`home-layout-move-up-${block.id}`}
                      disabled={busy || index === 0}
                      onClick={() => moveLayout(index, -1)}
                      style={btnTiny}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${block.label} down`}
                      data-testid={`home-layout-move-down-${block.id}`}
                      disabled={busy || index === layoutBlocks.length - 1}
                      onClick={() => moveLayout(index, 1)}
                      style={btnTiny}
                    >
                      ↓
                    </button>
                  </div>
                ) : (
                  <ChevronRight size={18} aria-hidden style={{ alignSelf: 'center', color: 'var(--color-text-muted)' }} />
                )}
              </div>
            );
          })}

          {!reorderMode ? (
            <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
              <select
                value={addType}
                onChange={(e) => setAddType(e.target.value)}
                style={{
                  minHeight: 40,
                  borderRadius: 8,
                  border: '1px solid var(--color-border)',
                  padding: '0 10px',
                  fontSize: 13,
                  flex: 1,
                  minWidth: 180,
                }}
              >
                <option value="">Add a section…</option>
                {addable.map((t) => (
                  <option key={t.type} value={t.type}>{t.label}</option>
                ))}
              </select>
              <button type="button" disabled={busy || !addType} onClick={() => void addBlock()} style={btnPrimary}>
                Add
              </button>
            </div>
          ) : null}
        </div>
      )}

      {unknown.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--color-warning-strong)' }}>
          Unknown section types on this page (hidden on the live site): {unknown.join(', ')}
        </div>
      )}
      {error && (
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--color-danger)', fontWeight: 600 }}>{error}</div>
      )}
      {previewMsg && (
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--color-success)' }}>{previewMsg}</div>
      )}

      <ContentEditorSheet
        open={Boolean(editing)}
        title={editing ? `Edit ${editing.label}` : 'Edit section'}
        onClose={() => setEditingId(null)}
        status={(
          <span data-testid="home-layout-editor-draft-status" style={{ fontSize: 12, fontWeight: 700 }}>
            {hasDraft ? 'Draft saved — not live' : 'All published'}
          </span>
        )}
        layer={1}
        testId="home-layout-section-editor"
        footer={hasDraft ? (
          <button
            type="button"
            data-testid="home-layout-editor-publish"
            onClick={() => void publish()}
            disabled={busy}
            style={{ ...btnPrimary, width: '100%', minHeight: 44 }}
          >
            Publish changes
          </button>
        ) : undefined}
      >
        {editing ? (
          <div data-testid={`home-layout-editor-panel-${editing.id}`} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 600 }}>
              <input
                type="checkbox"
                data-testid={`home-layout-visibility-switch-${editing.id}`}
                checked={editing.is_enabled}
                disabled={busy || (!editing.removable && editing.is_enabled)}
                onChange={() => void toggleEnabled(editing)}
              />
              Showing on this home page
            </label>
            {editing.supports_shared_content ? (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span
                  data-testid={`home-layout-sharing-${editing.id}`}
                  style={badgeStyle(editing.content_mode === 'shared')}
                >
                  {editing.content_mode === 'shared'
                    ? 'Shared with Website and Order App'
                    : app === 'website'
                      ? 'Customised for Website'
                      : 'Customised for Order App'}
                </span>
                <button
                  type="button"
                  disabled={busy || editing.content_mode === 'shared'}
                  onClick={() => void setMode(editing, 'shared')}
                  style={chipBtn}
                >
                  Use shared version again
                </button>
                <button
                  type="button"
                  disabled={busy || editing.content_mode === 'own'}
                  onClick={() => void setMode(editing, 'own')}
                  style={chipBtn}
                >
                  {app === 'website' ? 'Customise for Website' : 'Customise for Order App'}
                </button>
              </div>
            ) : null}
            {editing.block_type === 'hero' ? (
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: 0 }}>
                Banner photos and text are edited from Global → Hero banners. Here you control
                whether this section shows and where it sits in the page order.
              </p>
            ) : null}
            {!editing.removable && editing.non_removable_reason ? (
              <p style={{ fontSize: 12, color: 'var(--color-warning-strong)', fontWeight: 600, margin: 0 }}>
                Required — {editing.non_removable_reason}
              </p>
            ) : null}
            {isGenericBlockType(editing.block_type) ? (
              <GenericBlockSettingsForm
                block={editing}
                busy={busy}
                onSave={(settings) => saveSettings(editing, settings)}
              />
            ) : null}
            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 12, marginTop: 4 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 8 }}>
                Advanced
              </div>
              <button
                type="button"
                data-testid={`home-layout-remove-${editing.id}`}
                disabled={busy || !editing.removable}
                title={!editing.removable ? (editing.non_removable_reason ?? undefined) : 'Remove section'}
                onClick={() => {
                  void remove(editing).then(() => setEditingId(null));
                }}
                style={{
                  ...btnSecondary,
                  color: editing.removable ? 'var(--color-danger)' : 'var(--color-text-muted)',
                  width: '100%',
                }}
              >
                Remove section
              </button>
            </div>
          </div>
        ) : null}
      </ContentEditorSheet>
    </div>
  );
}

const btnSecondary: CSSProperties = {
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const btnPrimary: CSSProperties = {
  ...btnSecondary,
  background: 'var(--color-primary)',
  borderColor: 'var(--color-primary)',
  color: 'var(--color-bg)',
};

const btnTiny: CSSProperties = {
  padding: '4px 8px',
  borderRadius: 6,
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
  fontSize: 11,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const chipBtn: CSSProperties = {
  padding: '4px 8px',
  borderRadius: 999,
  border: '1px solid var(--color-border)',
  fontSize: 11,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

function badgeStyle(active: boolean): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
    border: `1px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
    background: active ? 'rgba(212, 129, 58, 0.12)' : 'var(--color-surface)',
    color: active ? 'var(--color-primary)' : 'var(--color-text-muted)',
    maxWidth: '100%',
    overflowWrap: 'anywhere',
  };
}
