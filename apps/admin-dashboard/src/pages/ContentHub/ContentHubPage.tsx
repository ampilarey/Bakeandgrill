import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { cancelContentSchedule } from '../../api/content';
import { PageHeader, PageShell } from '../../components/SharedUI';
import { ScopeMismatchNotices } from '../../components/ScopeMismatchNotices';
import { usePageTitle } from '../../hooks/usePageTitle';
import { useToast } from '../../components/ui';
import { MediaPicker } from '../../components/MediaPicker';
import { HomeLayoutEditor } from './HomeLayoutEditor';
import { ContentWorkspace } from './ContentWorkspace';
import { workspaceConfigFor } from './contentWorkspaceConfig';
import { ContentEditorSheet } from '../../components/ContentEditorSheet';
import { HubDraftStatus, HubHeaderActions, HubSchedulePublishPanel, HubStickyPublishBar } from './HubPublishBar';
import { ContentIntegrityPanel } from './ContentIntegrityPanel';
import { defaultHomeSurface } from './canonicalCatalog';
import { parseSurfaceId, surfaceId, type SurfaceFilter } from './surfaceCatalog';
import {
  LEGACY_PAGES_GROUP,
  contentViewForKey,
  isHomeSection,
  LEGACY_GROUP_ALIASES,
} from './websitePageTasks';
import { useIsMobile } from '../../hooks/useIsMobile';
import type { MediaAsset } from '../../api/media';
import type { ContentBlock, ContentScope } from '../../api/content';
import { labelForScope, contentAppFromPath } from './hubDraftUtils';
import { useContentHubController } from './useContentHubController';

export function ContentHubPage() {
  const { success, error } = useToast();
  const isMobile = useIsMobile();
  const location = useLocation();
  const hubAppFromPath = contentAppFromPath(location.pathname);
  /**
   * Both Content & Branding screens are the page-tab workspace, on every screen
   * size — the Website since 2026-08-15, the Order App since the owner said
   * "Let's start order app" the same week. The old surface landing, section
   * rail, editor sheets and docked preview were deleted with the last screen
   * that used them ("Del useless parts", 2026-08-16).
   */
  /** A laptop has no landing screen: an empty ?group= means Home. */
  const isDesktop = !isMobile;
  const workspaceConfig = workspaceConfigFor(hubAppFromPath);

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
    layoutDraft,
    layoutRevision,
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
  const [searchParams, setSearchParams] = useSearchParams();
  const urlGroup = (searchParams.get('group') || searchParams.get('section') || '').trim();

  const [activeGroup, setActiveGroup] = useState<string | null>(() => urlGroup || null);
  const [q, setQ] = useState('');
  /** Per-block active scope tab for split editors (resets on section change). */
  const [blockScopeTab, setBlockScopeTab] = useState<Record<string, ContentScope>>({});
  const [mediaOpen, setMediaOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [searchOverlayOpen, setSearchOverlayOpen] = useState(false);
  /** Synchronous surface selection — avoids URL lag showing the full type library. */
  const [activeSurface, setActiveSurface] = useState<SurfaceFilter | null>(null);
  /** Deep link from search: which field to scroll to and open. */
  const [focusedBlockKey, setFocusedBlockKey] = useState<string | null>(null);
  /** Survives the activeGroup effect that clears focus when navigating via search. */
  const pendingFocusKeyRef = useRef<string | null>(null);
  /** The one-time landing on Home has already happened (or been claimed). */
  const autoSelectedRef = useRef(false);
  /** Desktop | Mobile — which device's Home layout to arrange (default Desktop). */
  const [websiteDeviceFilter, setWebsiteDeviceFilter] = useState<'desktop' | 'mobile'>('desktop');

  const moreMenuRef = useRef<HTMLDivElement>(null);
  const moreBtnRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchToggleRef = useRef<HTMLButtonElement>(null);

  // Sync URL ?group= → activeGroup. Legacy aliases redirect to real page
  // names; on a laptop an empty or legacy group means Home, and on a phone it
  // means the list of pages.
  useEffect(() => {
    if (!urlGroup) {
      if (isDesktop) {
            return;
      }
      setActiveGroup(null);
        return;
    }
    if (urlGroup === LEGACY_PAGES_GROUP || LEGACY_GROUP_ALIASES[urlGroup] === '') {
      if (isDesktop) {
        setSearchParams((prev) => {
          const p = new URLSearchParams(prev);
          p.delete('section');
          p.set('group', 'Home');
          return p;
        }, { replace: true });
        return;
      }
      setActiveGroup(null);
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
  }, [urlGroup, setSearchParams, isDesktop]);

  // Per-block scope tabs reset when the active section changes.
  useEffect(() => {
    setBlockScopeTab({});
    const pending = pendingFocusKeyRef.current;
    pendingFocusKeyRef.current = null;
    setFocusedBlockKey(pending);
  }, [activeGroup]);

  // Reject unknown ?group= deep links once sections have loaded — legacy/typo
  // values must not silently open a blank or wrong editor.
  useEffect(() => {
    if (loading || !urlGroup) return;
    if (urlGroup === LEGACY_PAGES_GROUP || urlGroup in LEGACY_GROUP_ALIASES) return;
    if (orderedSectionNames.length === 0) return;
    if (orderedSectionNames.includes(urlGroup)) return;
    const t = window.setTimeout(() => {
      error(`Unknown content section "${urlGroup}". Showing ${isDesktop ? 'Home' : 'the overview'} instead.`);
      if (isDesktop) {
        setSearchParams((prev) => {
          const p = new URLSearchParams(prev);
          p.delete('section');
          p.set('group', 'Home');
          return p;
        }, { replace: true });
        return;
      }
      setActiveGroup(null);
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
    // An explicit choice — a tab click, a deep link, a search hit — claims the
    // one-time landing. The landing effect reads state captured at render, so
    // without this a tab clicked in the frame before it flushes would be
    // overwritten by "open Home" a moment later.
    autoSelectedRef.current = true;
    setActiveGroup(next);
    // Switching pages clears any focused field; callers that want one focused
    // (search) set focusedBlockKey again right after calling selectGroup.
    setFocusedBlockKey(null);
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
      if (isDesktop) {
        selectGroup(orderedSectionNames.includes('Home') ? 'Home' : (orderedSectionNames[0] ?? 'Home'));
        return;
      }
      clearActiveGroup();
      return;
    }
    selectGroup(name, homeAppHint, surface);
  };

  // A laptop has no landing screen, so arriving with no ?group= opens Home.
  // Falls back to the first page that exists if Home has nothing in it.
  useEffect(() => {
    if (!isDesktop) return;
    // Landing happens once. Without this the effect could still be queued from
    // an earlier commit when the owner clicks a page tab, and would then
    // bounce them back to Home a frame later.
    if (autoSelectedRef.current) return;
    if (loading) return;
    if (urlGroup || activeGroup) {
      autoSelectedRef.current = true;
      return;
    }
    if (orderedSectionNames.length === 0) return;
    autoSelectedRef.current = true;
    const target = orderedSectionNames.includes('Home') ? 'Home' : orderedSectionNames[0];
    selectGroup(target);
    // The Home tab opens with the Hero section already expanded — that is
    // handled by the workspace's defaultOpenSectionId, so nothing to focus here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDesktop, loading, urlGroup, activeGroup, orderedSectionNames]);

  const homeLayoutApp =
    searchParams.get('homeApp') === 'order_app' ? 'order_app' as const
      : searchParams.get('homeApp') === 'website' ? 'website' as const
        : hubApp;
  const urlSurface = parseSurfaceId(searchParams.get('surface')?.trim() ?? '');
  const surfaceFilter: SurfaceFilter | null = activeSurface
    ?? urlSurface
    ?? (isHomeSection(activeGroup) ? defaultHomeSurface(homeLayoutApp, isMobile ? 'mobile' : 'desktop') : null);

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
    pendingFocusKeyRef.current = block.key;
    setFocusedBlockKey(block.key);
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

  // Which device's Home layout the "Section order & visibility" editor
  // arranges: the Desktop|Mobile filter on a laptop, always mobile on a phone.
  // Derived, not written to the URL — an effect that rewrote search params
  // raced with tab clicks and could drag the owner back to the page they had
  // just left.
  const homeSurfaceFilter = parseSurfaceId(
    surfaceId(hubApp, isMobile ? 'mobile' : websiteDeviceFilter, 'home'),
  );

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
      onOpenHistory={() => {
        handleSectionSelect('Everywhere');
        success('Open ⋯ on any field to view and restore History.');
      }}
      liveSiteUrl={`${window.location.origin}/${hubApp === 'order_app' ? 'order' : ''}`}
      deviceFilter={isDesktop ? websiteDeviceFilter : undefined}
      onDeviceFilterChange={isDesktop ? setWebsiteDeviceFilter : undefined}
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

        {!loading ? (
          <ScopeMismatchNotices mismatches={mismatches} collapsible defaultOpen={false} />
        ) : null}

        <ContentIntegrityPanel appFilter={hubApp} onlyWhenIssues />

        <ContentWorkspace
          config={workspaceConfig}
          loading={loading}
          skeleton={skeleton}
          sectionNames={orderedSectionNames}
          activeGroup={activeGroup}
          onSelectGroup={(name: string) => handleSectionSelect(name)}
          contentBlocks={contentBlocks}
          drafts={drafts}
          draftKeys={draftKeys}
          locale={locale}
          hubApp={hubApp}
          setDraft={setDraft}
          blockScopeTab={blockScopeTab}
          setBlockScopeTab={setBlockScopeTab}
          makeTriggerUpload={makeTriggerUpload}
          onUpload={onUpload}
          uploadCtx={uploadCtx}
          setMediaOpen={setMediaOpen}
          draftStatusNode={draftStatusNode}
          historyTarget={historyTarget}
          setHistoryTarget={setHistoryTarget}
          revisions={revisions}
          restore={restore}
          openHistory={openHistory}
          focusKey={focusedBlockKey}
          onFocusHandled={() => setFocusedBlockKey(null)}
          defaultOpenSectionId={isMobile ? null : workspaceConfig.defaultOpenSectionId}
          layoutRevision={layoutRevision}
          onLayoutChanged={() => { void homeLayoutEditorRef.current?.reload?.(); }}
          isMobile={isMobile}
          onBack={handleMobileBack}
          layoutEditor={(
            <HomeLayoutEditor
              ref={homeLayoutEditorRef}
              initialApp={hubApp}
              surfaceFilter={homeSurfaceFilter ?? surfaceFilter ?? undefined}
              onLayoutDraftChange={handleLayoutDraftChange}
              hidePublishControls
            />
          )}
        />

        {/* The only sheet left on a phone: search. Sections open in the page. */}
        {isMobile ? (
          <ContentEditorSheet
            open={searchOverlayOpen}
            title="Search"
            onClose={() => setSearchOverlayOpen(false)}
            layer={4}
            testId="hub-search-overlay"
            returnFocusTo={searchToggleRef.current}
          >
            {searchField}
          </ContentEditorSheet>
        ) : null}

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
