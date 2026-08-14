import type { Dispatch, MutableRefObject, ReactNode, SetStateAction } from 'react';
import {
  AboutValuesEditor,
  BusinessHoursEditor,
  CategoriesEditor,
  FooterLinksEditor,
  HeroSlidesEditor,
  isHeroSlideShowing,
  PreorderStepsEditor,
  ProofDetailsEditor,
  RevisionDiff,
  RichTextEditor,
  SeoSnippetPreview,
  TrustItemsEditor,
  VisualBlockPreview,
} from '../../components/content-editors';
import { Btn } from '../../components/SharedUI';
import { OpsOwnedSummary } from '../../components/OpsOwnedSummary';
import {
  uploadContentImage,
  uploadContentVideo,
  type ContentApp,
  type ContentBlock,
  type ContentLocale,
  type ContentRevision,
  type ContentScope,
} from '../../api/content';
import { BlockCard, scopesLabelFor } from './BlockCard';
import { BrandKitCards, brandKitWriteScope } from './BrandKitCards';
import { BRAND_KIT_KEYS } from './brandKitConfig';
import { HomeLayoutEditor, type HomeLayoutEditorHandle, type LayoutDraftSignal } from './HomeLayoutEditor';
import { SectionEditor } from './SectionEditor';
import { blocksForContentView, isHomeSection, websitePageTaskByGroup } from './websitePageTasks';
import { fallbackManagedBy } from './opsOwnedContentKeys';
import type { SurfaceFilter } from './surfaceCatalog';
import {
  editorScopesForBlock,
  isSeoDescriptionKey,
  labelForScope,
  preferredScopeTab,
  scopeHasDraft,
  seoDescriptionKey,
  uploadAppFor,
  valueForScope,
  type DraftMap,
  type HistoryTarget,
} from './hubDraftUtils';

/** Upload target for the shared embedded-file `<input>` on the parent page. */
export type UploadContextRef = MutableRefObject<{
  blockKey: string;
  scope: ContentScope;
  onDone: (url: string) => void;
} | null>;

type SharedEditorDeps = {
  locale: ContentLocale;
  drafts: DraftMap;
  contentBlocks: ContentBlock[];
  setDraft: (scope: ContentScope, key: string, value: string) => void;
  makeTriggerUpload: (block: ContentBlock, scope: ContentScope) => (legacyKey: string, onDone: (url: string) => void) => void;
  onUpload: (block: ContentBlock, scope: ContentScope, file: File) => void | Promise<void>;
  uploadCtx: UploadContextRef;
  setMediaOpen: (open: boolean) => void;
  draftStatusNode: ReactNode;
};

/** Visual (rich) editors keyed off `block.editor`. */
function renderVisualEditor(
  deps: SharedEditorDeps,
  block: ContentBlock,
  scope: ContentScope,
  val: string,
  opts?: { mobileMode?: boolean; scheduleSlot?: ReactNode; wideLayout?: boolean },
): ReactNode {
  const onChange = (next: string) => deps.setDraft(scope, block.key, next);
  const triggerUpload = deps.makeTriggerUpload(block, scope);
  const common = { label: block.label, description: block.description || undefined, value: val, onChange };

  switch (block.editor) {
    case 'hero':
      return (
        <HeroSlidesEditor
          {...common}
          triggerUpload={triggerUpload}
          uploadImage={(cropped, original) => uploadContentImage(block.key, uploadAppFor(scope), cropped, original, deps.locale)}
          uploadVideo={(video, poster, posterUrl) => uploadContentVideo(block.key, uploadAppFor(scope), video, poster, deps.locale, posterUrl)}
          mobileMode={Boolean(opts?.mobileMode)}
          wideLayout={Boolean(opts?.wideLayout)}
          draftStatus={deps.draftStatusNode}
          scheduleSlot={opts?.scheduleSlot}
        />
      );
    case 'categories':
      return <CategoriesEditor {...common} triggerUpload={triggerUpload} />;
    case 'trust':
      return <TrustItemsEditor {...common} />;
    case 'proof':
      return <ProofDetailsEditor {...common} />;
    case 'about_values':
      return <AboutValuesEditor {...common} />;
    case 'preorder_steps':
      return <PreorderStepsEditor {...common} />;
    case 'footer_links':
      return <FooterLinksEditor {...common} />;
    case 'business_hours':
      return <BusinessHoursEditor {...common} />;
    default:
      return null;
  }
}

/** Plain (text / boolean / image / textarea / json) editors. */
function renderPlainEditor(deps: SharedEditorDeps, block: ContentBlock, scope: ContentScope, val: string): ReactNode {
  if (block.rich) {
    return (
      <RichTextEditor
        key={`${scope}-${block.key}-${deps.locale}`}
        label=""
        value={val}
        onChange={(next) => deps.setDraft(scope, block.key, next)}
      />
    );
  }
  if (block.type === 'boolean') {
    return (
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
        <input
          type="checkbox"
          checked={val === 'true' || val === '1'}
          onChange={(e) => deps.setDraft(scope, block.key, e.target.checked ? 'true' : 'false')}
        />
        Enabled
      </label>
    );
  }
  if (block.type === 'image') {
    return (
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        {val ? (
          <img
            src={val}
            alt={block.label}
            style={{
              width: 72,
              height: 72,
              objectFit: 'cover',
              borderRadius: block.key === 'default_item_image' ? '50%' : 10,
            }}
          />
        ) : null}
        <input
          type="file"
          accept="image/*,.heic,.heif"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void deps.onUpload(block, scope, file);
          }}
        />
        <Btn
          type="button"
          variant="secondary"
          onClick={() => {
            deps.uploadCtx.current = { blockKey: block.key, scope, onDone: (url) => deps.setDraft(scope, block.key, url) };
            deps.setMediaOpen(true);
          }}
        >
          Library
        </Btn>
        <input
          value={val}
          onChange={(e) => deps.setDraft(scope, block.key, e.target.value)}
          placeholder="/storage/…"
          style={{ flex: 1, minWidth: 180, height: 40, borderRadius: 10, border: '1px solid var(--color-border)', padding: '0 10px', fontFamily: 'inherit' }}
        />
      </div>
    );
  }
  if (block.type === 'textarea' || block.type === 'json') {
    return (
      <textarea
        value={val}
        onChange={(e) => deps.setDraft(scope, block.key, e.target.value)}
        rows={block.type === 'json' ? 6 : 4}
        dir={deps.locale === 'dv' ? 'rtl' : 'ltr'}
        style={{
          width: '100%',
          borderRadius: 10,
          border: '1px solid var(--color-border)',
          padding: 10,
          fontFamily: block.type === 'json' ? 'ui-monospace, monospace' : 'inherit',
          fontSize: 13,
        }}
      />
    );
  }
  return (
    <input
      value={val}
      onChange={(e) => deps.setDraft(scope, block.key, e.target.value)}
      dir={deps.locale === 'dv' ? 'rtl' : 'ltr'}
      style={{
        width: '100%',
        height: 44,
        borderRadius: 10,
        border: '1px solid var(--color-border)',
        padding: '0 12px',
        fontFamily: 'inherit',
        fontSize: 14,
      }}
    />
  );
}

/** Resolves a block's editor for one scope — visual, SEO title+description pair, or plain. */
function renderEditorForScope(
  deps: SharedEditorDeps,
  block: ContentBlock,
  scope: ContentScope,
  opts?: { wideLayout?: boolean },
): ReactNode {
  const val = valueForScope(block, scope, deps.drafts);
  const visual = block.editor ? renderVisualEditor(deps, block, scope, val, { wideLayout: opts?.wideLayout }) : null;
  const descKey = seoDescriptionKey(block.key);
  const descBlock = descKey ? deps.contentBlocks.find((candidate) => candidate.key === descKey) : undefined;
  const isSeoTitle = Boolean(descKey);

  if (visual) return visual;

  if (isSeoTitle && descBlock) {
    return (
      <SeoSnippetPreview
        title={val}
        description={valueForScope(descBlock, scope, deps.drafts)}
        onTitleChange={(next) => deps.setDraft(scope, block.key, next)}
        onDescriptionChange={(next) => deps.setDraft(scope, descBlock.key, next)}
        titleLabel={block.label}
        descriptionLabel={descBlock.label}
      />
    );
  }

  return renderPlainEditor(deps, block, scope, val);
}

type ScopeTabsDeps = {
  drafts: DraftMap;
  setBlockScopeTab: Dispatch<SetStateAction<Record<string, ContentScope>>>;
};

function renderScopeTabs(
  deps: ScopeTabsDeps,
  blockKey: string,
  scopes: ContentScope[],
  activeScope: ContentScope,
  panel: ReactNode,
): ReactNode {
  return (
    <div className="hub-scope-tabs" data-testid={`scope-tabs-${blockKey}`}>
      <div className="hub-scope-tablist" role="tablist" aria-label="App scope">
        {scopes.map((scope) => {
          const selected = scope === activeScope;
          const dirty = scopeHasDraft(scope, blockKey, deps.drafts);
          return (
            <button
              key={scope}
              type="button"
              role="tab"
              aria-selected={selected}
              data-testid={`scope-tab-${blockKey}-${scope}`}
              className={`hub-scope-tab${selected ? ' hub-scope-tab--active' : ''}`}
              onClick={() => deps.setBlockScopeTab((prev) => ({ ...prev, [blockKey]: scope }))}
            >
              {labelForScope(scope)}
              {dirty && !selected ? (
                <span
                  className="hub-scope-tab-dot"
                  data-testid={`scope-tab-dirty-${blockKey}-${scope}`}
                  title="Unpublished edits"
                  aria-hidden="true"
                />
              ) : null}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        data-testid={`scope-panel-${blockKey}-${activeScope}`}
        className="hub-scope-tabpanel"
      >
        {panel}
      </div>
    </div>
  );
}

export type HubSectionContentProps = {
  sectionName: string;
  withBack: boolean;
  onBack: () => void;
  contentBlocks: ContentBlock[];
  drafts: DraftMap;
  locale: ContentLocale;
  hubApp: ContentApp;
  hubLabel: string;
  blockScopeTab: Record<string, ContentScope>;
  setBlockScopeTab: Dispatch<SetStateAction<Record<string, ContentScope>>>;
  setDraft: (scope: ContentScope, key: string, value: string) => void;
  historyTarget: HistoryTarget;
  setHistoryTarget: (target: HistoryTarget) => void;
  revisions: ContentRevision[];
  restore: (id: number) => void | Promise<void>;
  openHistory: (block: ContentBlock, scope: ContentScope) => void | Promise<void>;
  draftStatusNode: ReactNode;
  makeTriggerUpload: (block: ContentBlock, scope: ContentScope) => (legacyKey: string, onDone: (url: string) => void) => void;
  onUpload: (block: ContentBlock, scope: ContentScope, file: File) => void | Promise<void>;
  uploadCtx: UploadContextRef;
  setMediaOpen: (open: boolean) => void;
  setMobileBlockEditorKey: (key: string | null) => void;
  homeLayoutEditorRef: MutableRefObject<HomeLayoutEditorHandle | null>;
  homeLayoutApp: ContentApp;
  surfaceFilter: SurfaceFilter | null;
  onLayoutDraftChange: (signal: LayoutDraftSignal) => void;
  onSectionSelectForAnnouncement: (name: string, homeAppHint?: 'website' | 'order_app', surface?: string) => void;
  isMobile: boolean;
  /** Website desktop Stage B — focused block in the right editor pane. */
  focusedBlockKey?: string | null;
  /** Website desktop Stage B — rail | list | editor workspace. */
  desktopSplit?: boolean;
};

/**
 * Section editor content — block list, brand kit, and Homepage layout host.
 * Pure render/behavior extraction from ContentHubPage; no state moved.
 */
export function HubSectionContent({
  sectionName,
  withBack,
  onBack,
  contentBlocks,
  drafts,
  locale,
  hubApp,
  hubLabel,
  blockScopeTab,
  setBlockScopeTab,
  setDraft,
  historyTarget,
  setHistoryTarget,
  revisions,
  restore,
  openHistory,
  draftStatusNode,
  makeTriggerUpload,
  onUpload,
  uploadCtx,
  setMediaOpen,
  setMobileBlockEditorKey,
  homeLayoutEditorRef,
  homeLayoutApp,
  surfaceFilter,
  onLayoutDraftChange,
  onSectionSelectForAnnouncement,
  isMobile,
  focusedBlockKey = null,
  desktopSplit = false,
}: HubSectionContentProps) {
  const editorDeps: SharedEditorDeps = {
    locale,
    drafts,
    contentBlocks,
    setDraft,
    makeTriggerUpload,
    onUpload,
    uploadCtx,
    setMediaOpen,
    draftStatusNode,
  };
  const scopeTabsDeps: ScopeTabsDeps = { drafts, setBlockScopeTab };

  const renderHistoryPanel = (block: ContentBlock, scope: ContentScope, currentValue: string) => {
    if (!historyTarget || historyTarget.key !== block.key || historyTarget.scope !== scope) return null;
    return (
      <div style={{ marginBottom: 12, padding: 12, borderRadius: 10, background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }} data-testid="revision-history-heading">
          History · {historyTarget.label} · {locale}
        </div>
        {revisions.length === 0 ? <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-muted)' }}>No revisions yet.</p> : null}
        {revisions.map((revision) => (
          <div key={revision.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 10, fontSize: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: 'var(--color-text-muted)', marginBottom: 4 }}>
                {labelForScope(revision.scope || historyTarget.scope)} · {new Date(revision.created_at).toLocaleString()}
              </div>
              <RevisionDiff before={revision.value || ''} after={currentValue} />
            </div>
            <button
              type="button"
              onClick={() => void restore(revision.id)}
              style={{ height: 32, padding: '0 10px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-surface)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600 }}
            >
              Restore
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setHistoryTarget(null)}
          style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}
        >
          Close
        </button>
      </div>
    );
  };

  const renderSectionEnable = (block: ContentBlock) => {
    const scopes = editorScopesForBlock(block, hubApp);
    const split = scopes.length > 1;
    return (
      <div
        key={block.key}
        className="hub-section-enable"
        data-testid={`section-enable-${block.key}`}
        data-block-key={block.key}
      >
        <div className="hub-section-enable-face">
          <div className="hub-section-enable-label">{block.label}</div>
        </div>
        <div
          className={`hub-section-enable-switches${split ? ' hub-section-enable-switches--split' : ''}`}
        >
          {scopes.map((scope) => {
            const val = valueForScope(block, scope, drafts);
            const switchLabel = labelForScope(scope);
            return (
              <label
                key={`${scope}-${block.key}`}
                className="hub-section-enable-switch"
                data-testid={`section-enable-switch-${block.key}-${scope}`}
              >
                <input
                  type="checkbox"
                  checked={val === 'true' || val === '1'}
                  onChange={(e) => setDraft(scope, block.key, e.target.checked ? 'true' : 'false')}
                />
                {switchLabel}
              </label>
            );
          })}
        </div>
      </div>
    );
  };

  const renderBlock = (block: ContentBlock): ReactNode => {
    if (isSeoDescriptionKey(block.key)) {
      const titleKey = block.key === 'meta_description'
        ? 'meta_title'
        : block.key.replace(/_meta_description$/, '_meta_title');
      if (contentBlocks.some((c) => c.key === titleKey)) return null;
    }

    // Operational / Business Details ownership — never show an editable Save path.
    const resolvedDisplay =
      (hubApp === 'order_app' ? block.resolved_order_app : block.resolved_website) ?? '';
    const managedBy = block.managed_by
      ?? fallbackManagedBy(block.key, resolvedDisplay);
    if (managedBy) {
      const display = managedBy.current_value ?? resolvedDisplay ?? '';
      return (
        <BlockCard
          key={`${block.key}-${locale}`}
          block={block}
          locale={locale}
          editor={(
            <OpsOwnedSummary
              managedBy={managedBy}
              testId={`ops-owned-${block.key}`}
            />
          )}
          onOpenHistory={() => undefined}
          historyOpen={false}
          historyPanel={null}
          technicalScopesLabel="Managed elsewhere"
          rawValuePreview={String(display).slice(0, 80)}
          compact={false}
          compactSummary={(
            <span className="hub-block-value-summary" data-testid={`ops-owned-summary-value-${block.key}`}>
              {String(display).trim() || 'Not set yet'}
            </span>
          )}
          visibilityLabel="Managed elsewhere"
        />
      );
    }

    const scopes = editorScopesForBlock(block, hubApp);
    const isSplitEditors = scopes.length > 1;
    const activeScope = preferredScopeTab(scopes, blockScopeTab[block.key]);
    const activeValue = valueForScope(block, activeScope, drafts);
    const historyOpen =
      historyTarget?.key === block.key && historyTarget?.scope === activeScope;

    const isBoolean = block.type === 'boolean';

    // Website desktop Stage B: the middle list stays; the right pane shows the full editor.
    const focusedHere = Boolean(desktopSplit && focusedBlockKey === block.key);
    const wideHero = focusedHere && block.editor === 'hero';

    let editorContent: ReactNode = null;
    let booleanControl: ReactNode = undefined;

    if (isBoolean && !isSplitEditors) {
      booleanControl = (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, minHeight: 32, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={activeValue === 'true' || activeValue === '1'}
            onChange={(e) => setDraft(activeScope, block.key, e.target.checked ? 'true' : 'false')}
          />
          Enabled
        </label>
      );
    } else if (isBoolean && isSplitEditors) {
      // Compact dual switches — never tab a boolean.
      editorContent = (
        <div className="hub-boolean-scopes" data-testid={`boolean-scopes-${block.key}`}>
          {scopes.map((scope) => {
            const val = valueForScope(block, scope, drafts);
            return (
              <label key={scope} className="hub-boolean-scope">
                <input
                  type="checkbox"
                  checked={val === 'true' || val === '1'}
                  onChange={(e) => setDraft(scope, block.key, e.target.checked ? 'true' : 'false')}
                />
                {labelForScope(scope)}
              </label>
            );
          })}
        </div>
      );
    } else if (isSplitEditors) {
      editorContent = renderScopeTabs(
        scopeTabsDeps,
        block.key,
        scopes,
        activeScope,
        renderEditorForScope(editorDeps, block, activeScope, { wideLayout: wideHero }),
      );
    } else {
      editorContent = renderEditorForScope(editorDeps, block, activeScope, { wideLayout: wideHero });
    }

    const useCompact = !isBoolean && !focusedHere;
    let compactSummary: ReactNode = null;
    let visibilityLabel: string | undefined;
    if (useCompact && block.editor === 'hero') {
      let slides: Array<{ image?: string; title?: string; showing?: boolean }> = [];
      try {
        const parsed = JSON.parse(activeValue || '[]');
        slides = Array.isArray(parsed) ? parsed : [];
      } catch { /* empty */ }
      const showingCount = slides.filter((s) => isHeroSlideShowing(s)).length;
      const hiddenCount = slides.length - showingCount;
      const thumb = slides.find((s) => s.image)?.image;
      compactSummary = (
        <div className="hub-block-hero-summary">
          {thumb ? <img src={thumb} alt="" className="hub-block-hero-summary-thumb" /> : null}
          <span>
            {slides.length} slide{slides.length === 1 ? '' : 's'}
            {hiddenCount > 0 ? ` · ${hiddenCount} hidden` : ''}
            {showingCount === 0 && slides.length > 0 ? ' · none showing' : ''}
          </span>
        </div>
      );
      visibilityLabel = showingCount > 0 ? 'Showing' : 'Hidden';
    } else if (useCompact) {
      const trimmed = activeValue.trim();
      let oneLine = trimmed.replace(/\s+/g, ' ');
      if (oneLine.startsWith('[') || oneLine.startsWith('{')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            oneLine = `${parsed.length} item${parsed.length === 1 ? '' : 's'}`;
            visibilityLabel = parsed.length > 0 ? 'Showing' : 'Hidden';
          } else if (parsed && typeof parsed === 'object') {
            oneLine = 'Configured';
            visibilityLabel = 'Showing';
          }
        } catch {
          oneLine = oneLine.slice(0, 72);
        }
      } else if (oneLine.length > 72) {
        oneLine = `${oneLine.slice(0, 69)}…`;
      }
      compactSummary = (
        <span className="hub-block-value-summary">
          {oneLine || 'Not set yet'}
        </span>
      );
      if (!visibilityLabel) {
        visibilityLabel = trimmed ? 'Showing' : 'Hidden';
      }
    }

    return (
      <BlockCard
        key={`${block.key}-${locale}`}
        block={block}
        locale={locale}
        editor={editorContent}
        booleanControl={booleanControl}
        onOpenHistory={() => void openHistory(block, activeScope)}
        historyOpen={historyOpen}
        historyPanel={renderHistoryPanel(block, activeScope, activeValue)}
        technicalScopesLabel={scopesLabelFor(scopes)}
        rawValuePreview={activeValue.slice(0, 80)}
        compact={useCompact}
        onEdit={useCompact ? () => setMobileBlockEditorKey(block.key) : undefined}
        compactSummary={compactSummary}
        visibilityLabel={visibilityLabel}
      />
    );
  };

  // ── Build section editor content ───────────────────────────────────────────

  const sectionBlocks = blocksForContentView(sectionName, contentBlocks, hubApp);
  const sectionEnableBlocks = sectionBlocks.filter((b) => b.section_enable);
  const regularBlocks = sectionBlocks.filter((b) => !b.section_enable);
  const isBrandKit = sectionName === 'Everywhere' || sectionName === 'Branding';
  const pageTask = websitePageTaskByGroup(sectionName);
  const editorTitle = pageTask?.title ?? sectionName;

  const brandBlocksByKey = new Map(
    regularBlocks.filter((b) => BRAND_KIT_KEYS.includes(b.key)).map((b) => [b.key, b] as const),
  );
  const leftoverBrandBlocks = isBrandKit
    ? regularBlocks.filter((b) => !BRAND_KIT_KEYS.includes(b.key))
    : regularBlocks;

  const siteNameBlock = contentBlocks.find((b) => b.key === 'site_name');
  const siteName = siteNameBlock
    ? (valueForScope(siteNameBlock, hubApp, drafts) || siteNameBlock.resolved_website || 'Bake & Grill')
    : 'Bake & Grill';
  const brandScope = (block: ContentBlock) => brandKitWriteScope(block, hubApp);

  const hoursOpsBanner = sectionName === 'Hours page' ? (
    <div className="hub-hours-ops-banner" data-testid="hours-ops-banner">
      <strong>Page wording vs real opening times</strong>
      <p>
        Fields below only change the Hours page copy (titles, notes, CTAs).
        They do not open or close the café or online ordering. Manage the real
        schedule in Online Ordering.
      </p>
      <a
        href="/admin/online-ordering"
        data-testid="hours-manage-ops-link"
        style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-primary)' }}
      >
        Manage operating hours →
      </a>
    </div>
  ) : null;

  const announcementDualGateBanner = (
    sectionName === 'Everywhere' || sectionName === 'Announcements'
  ) ? (
    <div
      className="hub-hours-ops-banner"
      data-testid="announcement-dual-gate-banner"
      role="note"
    >
      <strong>Two switches control the {hubLabel} banner</strong>
      <p>
        The Announcement content toggle below must be on for {hubLabel}, and the
        Announcement component must be placed/enabled on this app’s Header or Home
        surface (Surface Builder). Both are required or nothing shows on {hubLabel}.
      </p>
      <button
        type="button"
        data-testid="announcement-open-surface-link"
        onClick={() => onSectionSelectForAnnouncement(
          'Home',
          hubApp,
          isMobile ? `${hubApp}.mobile.header` : `${hubApp}.desktop.header`,
        )}
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: 'var(--color-primary)',
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        Open {hubLabel} header placement →
      </button>
    </div>
  ) : null;

  // Home: page_blocks layout editor. Off Home it unmounts — unified
  // Publish/Discard use publishLayoutDraftsViaApi / discardLayoutDraftsViaApi.
  const chrome: ReactNode =
    isHomeSection(sectionName) ? (
      <HomeLayoutEditor
        ref={homeLayoutEditorRef}
        initialApp={homeLayoutApp}
        surfaceFilter={surfaceFilter ?? undefined}
        onLayoutDraftChange={onLayoutDraftChange}
      />
    ) : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {hoursOpsBanner}
        {announcementDualGateBanner}
        {sectionEnableBlocks.map(renderSectionEnable)}
      </div>
    );

  const brandKit: ReactNode =
    isBrandKit && brandBlocksByKey.size > 0 ? (
      <BrandKitCards
        draftStatus={draftStatusNode}
        blocksByKey={brandBlocksByKey}
        siteName={siteName}
        scopeLabel={labelForScope(hubApp)}
        valueOf={(block) => valueForScope(block, brandScope(block), drafts)}
        onSetValue={(block, value) => setDraft(brandScope(block), block.key, value)}
        onUploadFile={(block, file) => onUpload(block, brandScope(block), file)}
        onOpenLibrary={(block) => {
          const scope = brandScope(block);
          uploadCtx.current = { blockKey: block.key, scope, onDone: (url) => setDraft(scope, block.key, url) };
          setMediaOpen(true);
        }}
        onOpenHistory={(block) => void openHistory(block, brandScope(block))}
        historyPanel={(block) =>
          renderHistoryPanel(block, brandScope(block), valueForScope(block, brandScope(block), drafts))
        }
      />
    ) : null;

  const visibleRegularCount = leftoverBrandBlocks.filter((b) => {
    if (!isSeoDescriptionKey(b.key)) return true;
    const titleKey = b.key === 'meta_description'
      ? 'meta_title'
      : b.key.replace(/_meta_description$/, '_meta_title');
    return !contentBlocks.some((c) => c.key === titleKey);
  }).length;
  const brandCardCount = isBrandKit ? brandBlocksByKey.size : 0;
  // The Home layout editor replaces per-section enable cards.
  const isHomeLayout = isHomeSection(sectionName);
  const cardCount = brandCardCount
    + visibleRegularCount
    + (isHomeLayout ? 0 : sectionEnableBlocks.length);

  return (
    <SectionEditor
      sectionName={sectionName}
      title={editorTitle}
      blocks={leftoverBrandBlocks}
      chrome={chrome}
      brandKit={brandKit}
      renderBlock={renderBlock}
      onBack={withBack ? onBack : undefined}
      isBrandKit={isBrandKit}
      cardCount={cardCount}
      showHeader={withBack && !desktopSplit}
    />
  );
}

export type HubFocusedBlockBodyProps = {
  block: ContentBlock;
  hubApp: ContentApp;
  drafts: DraftMap;
  locale: ContentLocale;
  contentBlocks: ContentBlock[];
  blockScopeTab: Record<string, ContentScope>;
  setBlockScopeTab: Dispatch<SetStateAction<Record<string, ContentScope>>>;
  setDraft: (scope: ContentScope, key: string, value: string) => void;
  makeTriggerUpload: (block: ContentBlock, scope: ContentScope) => (legacyKey: string, onDone: (url: string) => void) => void;
  onUpload: (block: ContentBlock, scope: ContentScope, file: File) => void | Promise<void>;
  uploadCtx: UploadContextRef;
  setMediaOpen: (open: boolean) => void;
  draftStatusNode: ReactNode;
  dirtyCount: number;
  schedulePublishPanel: ReactNode;
};

/**
 * Body rendered INSIDE the focused block editor `ContentEditorSheet`
 * (Overview → Edit). The sheet chrome itself stays in ContentHubPage.
 */
export function HubFocusedBlockBody({
  block,
  hubApp,
  drafts,
  locale,
  contentBlocks,
  blockScopeTab,
  setBlockScopeTab,
  setDraft,
  makeTriggerUpload,
  onUpload,
  uploadCtx,
  setMediaOpen,
  draftStatusNode,
  dirtyCount,
  schedulePublishPanel,
}: HubFocusedBlockBodyProps) {
  const editorDeps: SharedEditorDeps = {
    locale,
    drafts,
    contentBlocks,
    setDraft,
    makeTriggerUpload,
    onUpload,
    uploadCtx,
    setMediaOpen,
    draftStatusNode,
  };
  const scopeTabsDeps: ScopeTabsDeps = { drafts, setBlockScopeTab };

  const scopes = editorScopesForBlock(block, hubApp);
  const activeScope = preferredScopeTab(scopes, blockScopeTab[block.key]);
  const val = valueForScope(block, activeScope, drafts);
  const isHero = block.editor === 'hero';
  const editorBody = isHero
    ? renderVisualEditor(editorDeps, block, activeScope, val, {
      mobileMode: true,
      scheduleSlot: dirtyCount > 0 ? schedulePublishPanel : undefined,
    })
    : renderEditorForScope(editorDeps, block, activeScope);

  const appLabel = scopesLabelFor([activeScope]);
  // §6.4 — show the thing, not its key. Hero first; other visual editors + plain text follow.
  // Skip SEO pairs — SeoSnippetPreview already renders the customer-facing snippet.
  const previewEditor = block.editor
    || (block.type === 'text' || block.type === 'textarea' || block.rich ? 'text' : '');
  const showVisualPreview = Boolean(previewEditor)
    && block.type !== 'boolean'
    && block.type !== 'image'
    && !seoDescriptionKey(block.key)
    && !isSeoDescriptionKey(block.key);

  return (
    <>
      {dirtyCount > 0 ? (
        <div style={{ marginBottom: 12 }} data-testid="block-editor-schedule-slot">
          {schedulePublishPanel}
        </div>
      ) : null}
      {showVisualPreview ? (
        <VisualBlockPreview
          editor={previewEditor}
          value={val}
          appLabel={appLabel}
          fallbackLabel={previewEditor === 'text' ? block.label : undefined}
        />
      ) : null}
      {scopes.length > 1
        ? renderScopeTabs(scopeTabsDeps, block.key, scopes, activeScope, editorBody)
        : editorBody}
    </>
  );
}
