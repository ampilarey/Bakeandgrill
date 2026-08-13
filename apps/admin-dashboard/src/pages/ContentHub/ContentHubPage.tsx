import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { cancelContentSchedule } from '../../api/content';
import { PageHeader, PageShell } from '../../components/SharedUI';
import { ScopeMismatchNotices } from '../../components/ScopeMismatchNotices';
import { usePageTitle } from '../../hooks/usePageTitle';
import { useToast } from '../../components/ui';
import { MediaPicker } from '../../components/MediaPicker';
import { HubSurfaceLanding } from './HubSurfaceLanding';
import { HubSectionList, buildHubRailSections } from './HubSectionList';
import { HubSectionContent } from './HubSectionContent';
import { HubEditorSheets } from './HubEditorSheets';
import { HubPreviewHost } from './HubPreviewHost';
import { HubDraftStatus, HubHeaderActions, HubSchedulePublishPanel, HubStickyPublishBar } from './HubPublishBar';
import type { ContentTask } from './taskLandingConfig';
import { defaultHomeSurface } from './canonicalCatalog';
import {
  parseSurfaceId,
  surfaceId,
  type SurfaceFilter,
  type SurfaceRecord,
} from './surfaceCatalog';
import {
  LEGACY_PAGES_GROUP,
  contentViewForKey,
  isHomeSection,
  LEGACY_GROUP_ALIASES,
  websitePageTaskByGroup,
} from './websitePageTasks';
import { useIsCompactAdmin, useIsMobile, useIsWideDesktop } from '../../hooks/useIsMobile';
import type { MediaAsset } from '../../api/media';
import type { ContentBlock, ContentScope } from '../../api/content';
import { parseDraftKey, labelForScope } from './hubDraftUtils';
import { useContentHubController } from './useContentHubController';

/** Desktop layout prefs — Content Hub only. */
const LS_PREVIEW_OPEN = 'bg_hub_preview_open';
const LS_RAIL_COLLAPSED = 'bg_hub_rail_collapsed';
/** Open the docked preview column by default only on wide desktop (≥1200). */
const PREVIEW_DEFAULT_MIN_WIDTH = 1200;

function readStoredBool(key: string): boolean | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === '1' || raw === 'true') return true;
    if (raw === '0' || raw === 'false') return false;
  } catch {
    /* private mode */
  }
  return null;
}

function writeStoredBool(key: string, value: boolean): void {
  try {
    window.localStorage.setItem(key, value ? '1' : '0');
  } catch {
    /* private mode */
  }
}

function defaultPreviewOpen(): boolean {
  const stored = readStoredBool(LS_PREVIEW_OPEN);
  if (stored !== null) return stored;
  return typeof window !== 'undefined' && window.innerWidth >= PREVIEW_DEFAULT_MIN_WIDTH;
}

function defaultRailCollapsed(): boolean {
  return readStoredBool(LS_RAIL_COLLAPSED) === true;
}

export function ContentHubPage() {
  const { success, error } = useToast();
  const hub = useContentHubController({ success, error });
  const {
    hubApp,
    hubLabel,
    mismatches,
    loading,
    saving,
    locale,
    setLocale,
    drafts,
    lastSavedAt,
    hasUnsaved,
    historyTarget,
    setHistoryTarget,
    revisions,
    schedules,
    scheduleAt,
    setScheduleAt,
    previewState,
    previewLoading,
    layoutDraft,
    surfaceCounts,
    handleLayoutDraftChange,
    autosaving,
    autosaveFailed,
    autosaveErrorDetail,
    publishFailed,
    contentBlocks,
    dirtyCount,
    effectiveDirtyCount,
    orderedSectionNames,
    draftKeys,
    setDraft,
    persistDrafts,
    publish,
    schedulePublish,
    discardAllContentDrafts,
    onUpload,
    makeTriggerUpload,
    handleEmbedFile,
    openHistory,
    restore,
    doExport,
    doImport,
    fileInputRef,
    importInputRef,
    uploadCtx,
    homeLayoutEditorRef,
    load,
  } = hub;

  const hubTitle = `Editing ${hubLabel}`;
  usePageTitle(hubTitle);
  const isMobile = useIsMobile();
  const isCompactAdmin = useIsCompactAdmin();
  const isWideDesktop = useIsWideDesktop();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlGroup = (searchParams.get('group') || searchParams.get('section') || '').trim();

  const [activeGroup, setActiveGroup] = useState<string | null>(() => urlGroup || null);
  const [mobileEditorOpen, setMobileEditorOpen] = useState(() => Boolean(urlGroup));
  const [q, setQ] = useState('');
  const [previewSheetOpen, setPreviewSheetOpen] = useState(false);
  const [desktopPreviewOpen, setDesktopPreviewOpen] = useState(defaultPreviewOpen);
  const [railCollapsed, setRailCollapsed] = useState(defaultRailCollapsed);
  /** Per-block active scope tab for split editors (resets on section change). */
  const [blockScopeTab, setBlockScopeTab] = useState<Record<string, ContentScope>>({});
  const [mediaOpen, setMediaOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  /** Mobile: which visual block is open in a nested editor sheet. */
  const [mobileBlockEditorKey, setMobileBlockEditorKey] = useState<string | null>(null);
  const [searchOverlayOpen, setSearchOverlayOpen] = useState(false);
  /** Synchronous surface selection — avoids URL lag showing the full type library. */
  const [activeSurface, setActiveSurface] = useState<SurfaceFilter | null>(null);

  const moreMenuRef = useRef<HTMLDivElement>(null);
  const moreBtnRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchToggleRef = useRef<HTMLButtonElement>(null);

  // Compact Admin (768–1199): keep the section rail collapsed so the editor stays usable.
  useEffect(() => {
    if (isCompactAdmin && !railCollapsed) {
      setRailCollapsed(true);
    }
  }, [isCompactAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync URL group param → activeGroup (landing when cleared).
  // Legacy ?group= aliases redirect to Stage 4 section names.
  useEffect(() => {
    if (!urlGroup) {
      setActiveGroup(null);
      setMobileEditorOpen(false);
      return;
    }
    if (urlGroup === LEGACY_PAGES_GROUP || LEGACY_GROUP_ALIASES[urlGroup] === '') {
      setActiveGroup(null);
      setMobileEditorOpen(false);
      setSearchParams((prev) => {
        const p = new URLSearchParams(prev);
        p.delete('group');
        p.delete('section');
        return p;
      }, { replace: true });
      return;
    }
    const alias = LEGACY_GROUP_ALIASES[urlGroup];
    if (alias && alias !== urlGroup) {
      setSearchParams((prev) => {
        const p = new URLSearchParams(prev);
        p.delete('section');
        p.set('group', alias);
        return p;
      }, { replace: true });
      return;
    }
    setActiveGroup(urlGroup);
    setMobileEditorOpen(true);
  }, [urlGroup, setSearchParams]);

  // Per-block scope tabs reset when the active section changes.
  useEffect(() => {
    setBlockScopeTab({});
  }, [activeGroup]);

  const setDesktopPreviewOpenPersisted = (open: boolean) => {
    setDesktopPreviewOpen(open);
    writeStoredBool(LS_PREVIEW_OPEN, open);
  };

  const setRailCollapsedPersisted = (collapsed: boolean) => {
    setRailCollapsed(collapsed);
    writeStoredBool(LS_RAIL_COLLAPSED, collapsed);
  };

  // Reject unknown ?group= deep links once sections have loaded — legacy/typo
  // values must not silently open a blank or wrong editor.
  useEffect(() => {
    if (loading || !urlGroup) return;
    if (urlGroup === LEGACY_PAGES_GROUP || urlGroup in LEGACY_GROUP_ALIASES) return;
    if (orderedSectionNames.length === 0) return;
    if (orderedSectionNames.includes(urlGroup)) return;
    const t = window.setTimeout(() => {
      error(`Unknown content section "${urlGroup}". Showing the overview instead.`);
      setActiveGroup(null);
      setMobileEditorOpen(false);
      setSearchParams((prev) => {
        const p = new URLSearchParams(prev);
        p.delete('group');
        p.delete('section');
        return p;
      }, { replace: true });
    }, 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, urlGroup, orderedSectionNames]);

  // More menu click-outside (desktop popover only — mobile uses a portaled sheet
  // with its own backdrop, so a document listener would close it before taps run).
  useEffect(() => {
    if (!moreMenuOpen || isMobile) return;
    const onDoc = (e: MouseEvent) => {
      if (!moreMenuRef.current?.contains(e.target as Node)) setMoreMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [moreMenuOpen, isMobile]);

  const clearActiveGroup = () => {
    setMobileBlockEditorKey(null);
    setMobileEditorOpen(false);
    setActiveGroup(null);
    setActiveSurface(null);
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.delete('group');
      p.delete('section');
      p.delete('homeApp');
      p.delete('surface');
      return p;
    }, { replace: true });
  };

  const selectGroup = (next: string, homeAppHint?: 'website' | 'order_app', surface?: string) => {
    if (!next) {
      clearActiveGroup();
      return;
    }
    setActiveGroup(next);
    const home = isHomeSection(next);
    let resolvedSurface = home ? (surface ?? null) : null;
    if (home && !resolvedSurface) {
      const app = homeAppHint ?? hubApp;
      const device = isMobile ? 'mobile' : 'desktop';
      resolvedSurface = surfaceId(app, device, 'home');
    }
    const parsed = resolvedSurface ? parseSurfaceId(resolvedSurface) : null;
    setActiveSurface(parsed);
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.delete('section');
      p.set('group', next);
      if (home && homeAppHint) {
        p.set('homeApp', homeAppHint);
      } else if (home && parsed) {
        p.set('homeApp', parsed.app);
      } else {
        p.delete('homeApp');
      }
      if (home && resolvedSurface) {
        p.set('surface', resolvedSurface);
      } else {
        p.delete('surface');
      }
      return p;
    }, { replace: true });
  };

  const handleSectionSelect = (name: string, homeAppHint?: 'website' | 'order_app', surface?: string) => {
    if (!name) {
      clearActiveGroup();
      return;
    }
    selectGroup(name, homeAppHint, surface);
    setMobileEditorOpen(true);
  };

  const handleSurfaceSelect = (surface: SurfaceRecord) => {
    handleSectionSelect('Home', surface.app, surface.id);
  };

  const focusContentBlock = (blockKey: string) => {
    window.setTimeout(() => {
      setMobileBlockEditorKey(blockKey);
      const el = document.querySelector(`[data-block-key="${blockKey}"]`);
      if (el && typeof (el as HTMLElement).scrollIntoView === 'function') {
        (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 160);
  };

  const handleTaskSelect = (task: ContentTask) => {
    if (task.advancedAction === 'history') {
      handleSectionSelect('Everywhere');
      success('Open ⋯ on any field to view and restore History.');
      return;
    }
    if (task.advancedAction === 'schedule' || task.advancedAction === 'import_export') {
      setMoreMenuOpen(true);
      return;
    }
    if (!task.group) return;
    handleSectionSelect(task.group, task.homeAppHint, task.surface);
    if (task.focusBlockKey) {
      focusContentBlock(task.focusBlockKey);
    }
  };

  const handlePageSelect = (sectionName: string) => {
    handleSectionSelect(sectionName);
  };

  const homeLayoutApp =
    searchParams.get('homeApp') === 'order_app' ? 'order_app' as const
      : searchParams.get('homeApp') === 'website' ? 'website' as const
        : hubApp;
  const urlSurface = parseSurfaceId(searchParams.get('surface')?.trim() ?? '');
  const surfaceFilter: SurfaceFilter | null = activeSurface
    ?? urlSurface
    ?? (isHomeSection(activeGroup) ? defaultHomeSurface(homeLayoutApp, isMobile ? 'mobile' : 'desktop') : null);
  const previewEditorDevice = surfaceFilter?.device ?? null;
  const previewEditorSurfaceId = surfaceFilter
    ? surfaceId(surfaceFilter.app, surfaceFilter.device, surfaceFilter.slot)
    : null;

  useEffect(() => {
    if (!urlSurface) return;
    setActiveSurface((prev) => {
      if (
        prev
        && prev.app === urlSurface.app
        && prev.device === urlSurface.device
        && prev.slot === urlSurface.slot
      ) {
        return prev;
      }
      return urlSurface;
    });
  }, [urlSurface?.app, urlSurface?.device, urlSurface?.slot]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMobileBack = () => {
    clearActiveGroup();
  };

  const railSections = useMemo(
    () => buildHubRailSections(orderedSectionNames, contentBlocks, draftKeys, parseDraftKey, hubApp),
    [orderedSectionNames, contentBlocks, draftKeys, hubApp],
  );

  const dirtyGroups = useMemo(
    () => new Set(railSections.filter((s) => s.dirty).map((s) => s.name)),
    [railSections],
  );

  const pageRows = useMemo(
    () => orderedSectionNames
      .filter((name) => name !== 'Home' && name !== 'Everywhere')
      .map((name) => ({
        name,
        dirty: dirtyGroups.has(name),
        count: contentBlocks.filter((b) => contentViewForKey(b.key, hubApp) === name).length,
      })),
    [orderedSectionNames, dirtyGroups, contentBlocks, hubApp],
  );

  const preferredDevice = isMobile ? 'mobile' as const : 'desktop' as const;

  const searchResults = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    return contentBlocks
      .filter((b) => b.label.toLowerCase().includes(needle))
      .slice(0, 12)
      .map((b) => ({
        block: b,
        sectionName: contentViewForKey(b.key, hubApp) ?? b.group,
      }));
  }, [contentBlocks, q, hubApp]);

  const handleSearchSelect = (block: ContentBlock) => {
    const view = contentViewForKey(block.key, hubApp);
    if (!view) {
      setQ('');
      setSearchOverlayOpen(false);
      return;
    }
    selectGroup(view);
    setMobileEditorOpen(true);
    setQ('');
    setSearchOverlayOpen(false);
    window.setTimeout(() => {
      const el = document.querySelector(`[data-block-key="${block.key}"]`);
      if (el && typeof (el as HTMLElement).scrollIntoView === 'function') {
        (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 120);
  };

  const draftStatusNode = (
    <HubDraftStatus
      effectiveDirtyCount={effectiveDirtyCount}
      hubApp={hubApp}
      autosaving={autosaving}
      autosaveFailed={autosaveFailed}
      autosaveErrorDetail={autosaveErrorDetail}
      hasUnsaved={hasUnsaved}
      saving={saving}
      publishFailed={publishFailed}
      lastSavedAt={lastSavedAt}
      isMobile={isMobile}
      onRetrySave={() => { void persistDrafts(locale); }}
      onRetryPublish={() => { void publish(); }}
    />
  );

  const activeEditorTitle = activeGroup
    ? (websitePageTaskByGroup(activeGroup)?.title ?? activeGroup)
    : 'Section';

  const hubSectionContentProps = {
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
    onLayoutDraftChange: handleLayoutDraftChange,
    onSectionSelectForAnnouncement: handleSectionSelect,
    isMobile,
    onBack: handleMobileBack,
  };

  const searchField = (
    <div className="hub-search-wrap" ref={searchRef}>
      <div className="hub-search-input-row">
        <Search size={14} className="hub-search-icon" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by label…"
          data-testid="hub-search-input"
          className="hub-search-input"
          aria-label="Search content by label"
        />
        {q ? (
          <button
            type="button"
            onClick={() => setQ('')}
            className="hub-search-clear"
            aria-label="Clear search"
          >
            <X size={12} />
          </button>
        ) : null}
      </div>
      {q.trim() && searchResults.length > 0 ? (
        <div className="hub-search-dropdown" role="listbox" aria-label="Search results">
          {searchResults.map(({ block, sectionName }) => (
            <button
              key={block.key}
              type="button"
              role="option"
              aria-selected="false"
              className="hub-search-result"
              onClick={() => {
                handleSearchSelect(block);
                setSearchOverlayOpen(false);
              }}
            >
              <span className="hub-search-result-section">{sectionName}</span>
              <span className="hub-search-result-label">{block.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );

  const schedulePublishPanel = (
    <HubSchedulePublishPanel
      hubLabel={hubLabel}
      drafts={drafts}
      locale={locale}
      hubApp={hubApp}
      schedules={schedules}
      layoutDraft={layoutDraft}
      scheduleAt={scheduleAt}
      setScheduleAt={setScheduleAt}
      saving={saving}
      dirtyCount={dirtyCount}
      onSchedulePublish={() => void schedulePublish()}
      setMoreMenuOpen={setMoreMenuOpen}
    />
  );

  const headerActions = (
    <HubHeaderActions
      isMobile={isMobile}
      searchOverlayOpen={searchOverlayOpen}
      searchToggleRef={searchToggleRef}
      onOpenSearchOverlay={() => setSearchOverlayOpen(true)}
      searchField={searchField}
      locale={locale}
      setLocale={setLocale}
      draftStatusNode={draftStatusNode}
      isCompactAdmin={isCompactAdmin}
      previewSheetOpen={previewSheetOpen}
      setPreviewSheetOpen={setPreviewSheetOpen}
      desktopPreviewOpen={desktopPreviewOpen}
      setDesktopPreviewOpenPersisted={setDesktopPreviewOpenPersisted}
      effectiveDirtyCount={effectiveDirtyCount}
      saving={saving}
      autosaveFailed={autosaveFailed}
      layoutDraft={layoutDraft}
      dirtyCount={dirtyCount}
      hubApp={hubApp}
      hubLabel={hubLabel}
      publishFailed={publishFailed}
      onPublish={() => void publish()}
      moreMenuOpen={moreMenuOpen}
      setMoreMenuOpen={setMoreMenuOpen}
      moreMenuRef={moreMenuRef}
      moreBtnRef={moreBtnRef}
      onDiscardDrafts={() => void discardAllContentDrafts()}
      onExport={() => void doExport()}
      onImportClick={() => importInputRef.current?.click()}
      schedulePublishPanel={schedulePublishPanel}
      onOpenMediaLibrary={() => setMediaOpen(true)}
    />
  );

  const hubSchedules = schedules.filter((s) => s.scope === hubApp);
  const schedulesBanner = hubSchedules.length > 0 ? (
    <div className="hub-schedules-banner" data-testid="hub-schedules-banner">
      <strong>{hubSchedules.length}</strong> pending {hubLabel} schedule{hubSchedules.length === 1 ? '' : 's'}
      <ul style={{ margin: '8px 0 0', paddingLeft: 18, wordBreak: 'break-word' }}>
        {hubSchedules.slice(0, 5).map((schedule) => (
          <li key={schedule.id} style={{ marginBottom: 4 }}>
            {schedule.key} · {labelForScope(schedule.scope)} · {schedule.locale} → {new Date(schedule.publish_at).toLocaleString()}
            {' '}
            <button
              type="button"
              onClick={() => void cancelContentSchedule(schedule.id).then(() => load()).catch((e) => error(e instanceof Error ? e.message : 'Cancel failed'))}
              style={{ background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, minHeight: 44 }}
            >
              Cancel
            </button>
          </li>
        ))}
      </ul>
    </div>
  ) : null;

  const skeleton = (
    <div data-testid="content-skeleton" className="hub-skeleton">
      {[0, 1, 2].map((i) => (
        <div key={i} className="hub-skeleton-card" />
      ))}
    </div>
  );

  return (
    <PageShell>
      <div className={`content-studio-page hub-page${effectiveDirtyCount > 0 ? ' content-studio-page--dirty' : ''}`}>
        <PageHeader
          section="System"
          title={hubTitle}
          subtitle={
            hubApp === 'website'
              ? 'Website-only content — hero, brand, pages, SEO, and layout. Does not change the Order App.'
              : 'Order App-only content — home, branding, navigation, and banners. Does not change the Website.'
          }
          action={headerActions}
        />

        <input ref={fileInputRef} type="file" accept="image/*,.heic,.heif" style={{ display: 'none' }} onChange={(e) => void handleEmbedFile(e)} />
        <input ref={importInputRef} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={(e) => void doImport(e)} />

        {schedulesBanner}

        {!loading ? <ScopeMismatchNotices mismatches={mismatches} /> : null}

        {isMobile ? (
          <div className="hub-mobile-shell">
            <div className="hub-mobile-overview">
              <HubSurfaceLanding
                loading={loading}
                skeleton={skeleton}
                appFilter={hubApp}
                preferredDevice={preferredDevice}
                pageRows={pageRows}
                onSelectPage={handlePageSelect}
                surfaceCounts={surfaceCounts}
                dirtyGroups={dirtyGroups}
                onSelectSurface={handleSurfaceSelect}
                onSelectTask={handleTaskSelect}
              />
            </div>

            <HubPreviewHost
              mode="mobile-sheet"
              lockedApp={hubApp}
              websiteUrl={previewState.website}
              orderAppUrl={previewState.orderApp}
              loading={previewLoading}
              open={previewSheetOpen}
              onClose={() => setPreviewSheetOpen(false)}
              draftStatus={draftStatusNode}
              editorDevice={previewEditorDevice}
              editorSurfaceId={previewEditorSurfaceId}
            />
          </div>
        ) : (
          <div
            className={`hub-desktop-shell${railCollapsed ? ' hub-desktop-shell--rail-collapsed' : ''}${desktopPreviewOpen ? '' : ' hub-desktop-shell--preview-off'}`}
            data-testid="hub-desktop-shell"
            data-preview={desktopPreviewOpen ? 'on' : 'off'}
            data-rail={railCollapsed ? 'collapsed' : 'expanded'}
          >
            <HubSectionList
              app={hubApp}
              orderedSectionNames={orderedSectionNames}
              contentBlocks={contentBlocks}
              draftKeys={draftKeys}
              parseDraftKey={parseDraftKey}
              active={activeGroup}
              onSelect={handleSectionSelect}
              collapsed={railCollapsed}
              onToggleCollapsed={() => setRailCollapsedPersisted(!railCollapsed)}
            />

            <div className="hub-editor-area" data-testid="hub-editor-area">
              {activeGroup && !loading
                ? (
                  <HubSectionContent
                    sectionName={activeGroup}
                    withBack
                    {...hubSectionContentProps}
                  />
                )
                : (
                  <HubSurfaceLanding
                    loading={loading}
                    skeleton={skeleton}
                    appFilter={hubApp}
                    preferredDevice={preferredDevice}
                    desktopLayout
                    pageRows={pageRows}
                    onSelectPage={handlePageSelect}
                    surfaceCounts={surfaceCounts}
                    dirtyGroups={dirtyGroups}
                    onSelectSurface={handleSurfaceSelect}
                    onSelectTask={handleTaskSelect}
                  />
                )}
            </div>

            {desktopPreviewOpen && isWideDesktop && !isCompactAdmin ? (
              <HubPreviewHost
                mode="desktop-column"
                lockedApp={hubApp}
                websiteUrl={previewState.website}
                orderAppUrl={previewState.orderApp}
                loading={previewLoading}
                editorDevice={previewEditorDevice}
                editorSurfaceId={previewEditorSurfaceId}
              />
            ) : null}
          </div>
        )}

        {!isMobile && (isCompactAdmin || !isWideDesktop) ? (
          <HubPreviewHost
            mode="compact-sheet"
            lockedApp={hubApp}
            websiteUrl={previewState.website}
            orderAppUrl={previewState.orderApp}
            loading={previewLoading}
            open={previewSheetOpen || (desktopPreviewOpen && isCompactAdmin)}
            onClose={() => {
              setPreviewSheetOpen(false);
              if (desktopPreviewOpen && isCompactAdmin) {
                setDesktopPreviewOpenPersisted(false);
              }
            }}
            draftStatus={draftStatusNode}
            editorDevice={previewEditorDevice}
            editorSurfaceId={previewEditorSurfaceId}
          />
        ) : null}

        <HubEditorSheets
          isMobile={isMobile}
          loading={loading}
          mobileEditorOpen={mobileEditorOpen}
          activeGroup={activeGroup}
          activeEditorTitle={activeEditorTitle}
          onCloseSection={handleMobileBack}
          draftStatusNode={draftStatusNode}
          locale={locale}
          setLocale={setLocale}
          onOpenPreview={() => setPreviewSheetOpen(true)}
          moreMenuOpen={moreMenuOpen}
          setMoreMenuOpen={setMoreMenuOpen}
          effectiveDirtyCount={effectiveDirtyCount}
          dirtyCount={dirtyCount}
          saving={saving}
          autosaveFailed={autosaveFailed}
          publishFailed={publishFailed}
          hubLabel={hubLabel}
          onPublish={() => { void publish(); }}
          schedulePublishPanel={schedulePublishPanel}
          sectionContentProps={hubSectionContentProps}
          searchOverlayOpen={searchOverlayOpen}
          setSearchOverlayOpen={setSearchOverlayOpen}
          searchToggleRef={searchToggleRef}
          searchField={searchField}
          mobileBlockEditorKey={mobileBlockEditorKey}
          setMobileBlockEditorKey={setMobileBlockEditorKey}
          contentBlocks={contentBlocks}
          hubApp={hubApp}
          drafts={drafts}
          blockScopeTab={blockScopeTab}
          setBlockScopeTab={setBlockScopeTab}
          setDraft={setDraft}
          makeTriggerUpload={makeTriggerUpload}
          onUpload={onUpload}
          uploadCtx={uploadCtx}
          setMediaOpen={setMediaOpen}
        />

        <HubStickyPublishBar
          effectiveDirtyCount={effectiveDirtyCount}
          isMobile={isMobile}
          autosaveFailed={autosaveFailed}
          saving={saving}
          publishFailed={publishFailed}
          hasUnsaved={hasUnsaved}
          hubLabel={hubLabel}
          onRetrySave={() => void persistDrafts(locale)}
          onPublish={() => void publish()}
        />

        <MediaPicker
          open={mediaOpen}
          onClose={() => setMediaOpen(false)}
          mediaType="image"
          title="Pick from Media Library"
          onPick={(asset: MediaAsset) => {
            const ctx = uploadCtx.current;
            if (ctx) {
              ctx.onDone(asset.url);
              uploadCtx.current = null;
              success('Image selected from library');
              return;
            }
            success('Copied media URL — paste into an image field');
            void navigator.clipboard?.writeText(asset.url);
          }}
        />

      </div>
    </PageShell>
  );
}

export default ContentHubPage;
