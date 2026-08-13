import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import {
  Download, Eye, MoreHorizontal, Save, Search, Upload as UploadIcon, X,
} from 'lucide-react';
import {
  cancelContentSchedule,
  createContentPreviewToken,
  discardContentDrafts,
  exportContent,
  getContentBlocks,
  getContentDrafts,
  getContentRevisions,
  getContentSchedules,
  importContent,
  restoreContentRevision,
  saveContentDrafts,
  scheduleContent,
  updateContent,
  uploadContentImage,
  type ContentBlock,
  type ContentLocale,
  type ContentRevision,
  type ContentScheduleRow,
  type ContentScope,
  type ContentScopeMismatch,
} from '../../api/content';
import {
  discardPageBlockDraft,
  fetchAdminPageBlocks,
  publishPageBlocks,
} from '../../api/pageBlocks';
import { ApiRequestError } from '@shared/api';
import { PageHeader, PageShell, Btn } from '../../components/SharedUI';
import { ScopeMismatchNotices } from '../../components/ScopeMismatchNotices';
import { usePageTitle } from '../../hooks/usePageTitle';
import { useToast } from '../../components/ui';
import { MediaPicker } from '../../components/MediaPicker';
import { DraftPublishStatus } from '../../components/DraftPublishStatus';
import { MobileActionSheet } from '../../components/MobileActionSheet';
import { type HomeLayoutEditorHandle, type LayoutDraftSignal } from './HomeLayoutEditor';
import { PreviewPane } from './PreviewPane';
import { HubSurfaceLanding } from './HubSurfaceLanding';
import { HubSectionList, buildHubRailSections } from './HubSectionList';
import { HubSectionContent, type UploadContextRef } from './HubSectionContent';
import { HubEditorSheets } from './HubEditorSheets';
import type { ContentTask } from './taskLandingConfig';
import { defaultHomeSurface, surfaceCountLabel } from './canonicalCatalog';
import {
  parseSurfaceId,
  surfaceId,
  type SurfaceFilter,
  type SurfaceRecord,
} from './surfaceCatalog';
import { orderSectionNames } from './hubLayoutConfig';
import {
  LEGACY_PAGES_GROUP,
  contentViewForKey,
  visibleContentGroups,
  websitePageTaskByGroup,
} from './websitePageTasks';
import { isOpsOwnedContentKey } from './opsOwnedContentKeys';
import { useIsCompactAdmin, useIsMobile, useIsWideDesktop } from '../../hooks/useIsMobile';
import type { MediaAsset } from '../../api/media';

import {
  EMPTY_DRAFTS_BY_LOCALE,
  TRUE_BY_LOCALE,
  FALSE_BY_LOCALE,
  type DraftMap,
  type DraftsByLocale,
  type LocaleMetaMap,
  type HistoryTarget,
  type PreviewState,
  draftKey,
  parseDraftKey,
  collectChanges,
  uploadAppFor,
  labelForScope,
  hubAppLabel,
  valueForScope,
  isDeprecatedBlock,
  contentAppFromPath,
} from './hubDraftUtils';

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

/** Surface useful API / network errors for Publish without leaking stack traces. */
function formatContentActionError(err: unknown, fallback: string): string {
  if (err instanceof ApiRequestError) {
    if (err.status === 401 || err.status === 403) {
      return err.message || 'You do not have permission to publish this content.';
    }
    if (err.status === 422) {
      return err.message || 'Validation failed — check the highlighted fields and try again.';
    }
    if (err.status >= 500) {
      return err.message || 'Server error — try again in a moment.';
    }
    return err.message || fallback;
  }
  if (err instanceof TypeError) {
    return 'Network error — check your connection and try again. Drafts are still on this device.';
  }
  if (err instanceof Error && err.message.trim()) {
    return err.message;
  }
  return fallback;
}


export function ContentHubPage() {
  const location = useLocation();
  const hubApp = contentAppFromPath(location.pathname);
  const hubLabel = hubAppLabel(hubApp);
  const hubTitle = `Editing ${hubLabel}`;
  usePageTitle(hubTitle);
  const { success, error } = useToast();
  const isMobile = useIsMobile();
  const isCompactAdmin = useIsCompactAdmin();
  const isWideDesktop = useIsWideDesktop();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlGroup = (searchParams.get('group') || searchParams.get('section') || '').trim();

  const [blocks, setBlocks] = useState<ContentBlock[]>([]);
  const [mismatches, setMismatches] = useState<ContentScopeMismatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeGroup, setActiveGroup] = useState<string | null>(() => urlGroup || null);
  const [mobileEditorOpen, setMobileEditorOpen] = useState(() => Boolean(urlGroup));
  const [q, setQ] = useState('');
  const [locale, setLocale] = useState<ContentLocale>('en');
  const [draftsByLocale, setDraftsByLocale] = useState<DraftsByLocale>(() => ({ ...EMPTY_DRAFTS_BY_LOCALE }));
  const [historyTarget, setHistoryTarget] = useState<HistoryTarget>(null);
  const [revisions, setRevisions] = useState<ContentRevision[]>([]);
  const [schedules, setSchedules] = useState<ContentScheduleRow[]>([]);
  const [scheduleAt, setScheduleAt] = useState('');
  const [previewState, setPreviewState] = useState<PreviewState>({ website: null, orderApp: null });
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewSheetOpen, setPreviewSheetOpen] = useState(false);
  const [desktopPreviewOpen, setDesktopPreviewOpen] = useState(defaultPreviewOpen);
  const [railCollapsed, setRailCollapsed] = useState(defaultRailCollapsed);
  /** Per-block active scope tab for split editors (resets on section change). */
  const [blockScopeTab, setBlockScopeTab] = useState<Record<string, ContentScope>>({});
  const [lastSavedAtByLocale, setLastSavedAtByLocale] = useState<LocaleMetaMap<string | null>>(() => ({ ...FALSE_BY_LOCALE }));
  const [autosaving, setAutosaving] = useState(false);
  const [autosaveFailed, setAutosaveFailed] = useState(false);
  const [autosaveErrorDetail, setAutosaveErrorDetail] = useState<string | null>(null);
  const [publishFailed, setPublishFailed] = useState(false);
  const [serverDraftSyncedByLocale, setServerDraftSyncedByLocale] = useState<LocaleMetaMap<boolean>>(() => ({ ...TRUE_BY_LOCALE }));
  const [mediaOpen, setMediaOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  /** Mobile: which visual block is open in a nested editor sheet. */
  const [mobileBlockEditorKey, setMobileBlockEditorKey] = useState<string | null>(null);
  const [searchOverlayOpen, setSearchOverlayOpen] = useState(false);
  /** Homepage layout draft — merged into global publish status. */
  const [layoutDraft, setLayoutDraft] = useState(false);
  /** Bumps when layout draft versions change so the docked preview remints. */
  const [layoutRevision, setLayoutRevision] = useState(0);
  /** Component count labels per surface for the landing overview. */
  const [surfaceCounts, setSurfaceCounts] = useState<Record<string, string>>({});
  /** Synchronous surface selection — avoids URL lag showing the full type library. */
  const [activeSurface, setActiveSurface] = useState<SurfaceFilter | null>(null);

  const handleLayoutDraftChange = (signal: LayoutDraftSignal) => {
    setLayoutDraft(signal.hasDraft);
    setLayoutRevision(signal.revision);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const moreBtnRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchToggleRef = useRef<HTMLButtonElement>(null);
  const uploadCtx: UploadContextRef = useRef(null);
  const homeLayoutEditorRef = useRef<HomeLayoutEditorHandle | null>(null);
  const draftsByLocaleRef = useRef<DraftsByLocale>({ ...EMPTY_DRAFTS_BY_LOCALE });
  const serverDraftSyncedByLocaleRef = useRef<LocaleMetaMap<boolean>>({ ...TRUE_BY_LOCALE });
  const loadGen = useRef(0);
  const saveGeneration = useRef(0);
  const publishInFlight = useRef(false);
  const autosaveInFlight = useRef(false);

  const drafts = draftsByLocale[locale] ?? {};
  const lastSavedAt = lastSavedAtByLocale[locale] ?? null;
  const serverDraftSynced = serverDraftSyncedByLocale[locale] ?? true;

  const replaceLocaleDrafts = (loc: ContentLocale, nextDrafts: DraftMap) => {
    setDraftsByLocale((prev) => {
      const next = { ...prev, [loc]: nextDrafts };
      draftsByLocaleRef.current = next;
      return next;
    });
  };

  const updateLocaleDrafts = (loc: ContentLocale, updater: (prev: DraftMap) => DraftMap) => {
    setDraftsByLocale((prev) => {
      const nextDrafts = updater(prev[loc] ?? {});
      const next = { ...prev, [loc]: nextDrafts };
      draftsByLocaleRef.current = next;
      return next;
    });
  };

  const setLocaleSynced = (loc: ContentLocale, synced: boolean) => {
    serverDraftSyncedByLocaleRef.current = { ...serverDraftSyncedByLocaleRef.current, [loc]: synced };
    setServerDraftSyncedByLocale((prev) => ({ ...prev, [loc]: synced }));
  };

  const setLocaleLastSavedAt = (loc: ContentLocale, savedAt: string | null) => {
    setLastSavedAtByLocale((prev) => ({ ...prev, [loc]: savedAt }));
  };

  const load = async (loc: ContentLocale = locale) => {
    const gen = ++loadGen.current;
    setLoading(true);
    try {
      const [blockRes, scheduleRes, appDrafts] = await Promise.all([
        getContentBlocks(loc),
        getContentSchedules('pending'),
        getContentDrafts(hubApp, loc).catch((e) => {
          error(e instanceof Error ? e.message : 'Could not load saved drafts for this app');
          return { drafts: {} as Record<string, string>, saved_at: null };
        }),
      ]);
      if (gen !== loadGen.current) return;
      const restored: DraftMap = {};
      for (const [key, value] of Object.entries(appDrafts.drafts || {})) {
        restored[draftKey(hubApp, key)] = value;
      }
      const hadUnsyncedLocal = serverDraftSyncedByLocaleRef.current[loc] === false;
      const nextDrafts = hadUnsyncedLocal
        ? { ...restored, ...(draftsByLocaleRef.current[loc] ?? {}) }
        : restored;
      setBlocks(blockRes.blocks);
      setMismatches(blockRes.mismatches ?? []);
      setSchedules(scheduleRes.schedules);
      replaceLocaleDrafts(loc, nextDrafts);
      setLocaleLastSavedAt(loc, appDrafts.saved_at);
      setLocaleSynced(loc, !hadUnsyncedLocal);
      setAutosaveFailed(false);
      setPublishFailed(false);
    } catch (e) {
      if (gen !== loadGen.current) return;
      error(e instanceof Error ? e.message : 'Failed to load content');
    } finally {
      if (gen === loadGen.current) setLoading(false);
    }
  };

  useEffect(() => {
    void load(locale);
    return () => { loadGen.current += 1; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, hubApp]);

  // Surface component counts for the landing tree.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [w, o] = await Promise.all([
          fetchAdminPageBlocks('website'),
          fetchAdminPageBlocks('order_app'),
        ]);
        if (cancelled) return;
        // Only the current hub app's layout draft counts toward this hub's Publish bar.
        setLayoutDraft(Boolean(hubApp === 'website' ? w.draft : o.draft));
        const counts: Record<string, string> = {};
        for (const app of ['website', 'order_app'] as const) {
          const blocks = app === 'website' ? (w.blocks ?? []) : (o.blocks ?? []);
          for (const device of ['desktop', 'mobile'] as const) {
            for (const slot of ['header', 'home', 'footer', 'bottom_navigation'] as const) {
              if (device === 'desktop' && slot === 'bottom_navigation') continue;
              const filter = { app, device, slot };
              counts[surfaceId(app, device, slot)] = surfaceCountLabel(blocks, filter).label;
            }
          }
        }
        setSurfaceCounts(counts);
      } catch {
        if (!cancelled) setSurfaceCounts({});
      }
    })();
    return () => { cancelled = true; };
    // layoutRevision bumps on every draft mutate so card counts refresh immediately.
  }, [hubApp, layoutDraft, layoutRevision]);

  // Compact Admin (768–1199): keep the section rail collapsed so the editor stays usable.
  useEffect(() => {
    if (isCompactAdmin && !railCollapsed) {
      setRailCollapsed(true);
    }
  }, [isCompactAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync URL group param → activeGroup (landing when cleared).
  // Legacy ?group=Pages must never open the mixed 48-block editor.
  // Legacy ?group=Contact opens the focused Contact & map page.
  useEffect(() => {
    if (urlGroup === LEGACY_PAGES_GROUP) {
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
    if (urlGroup === 'Contact') {
      setSearchParams((prev) => {
        const p = new URLSearchParams(prev);
        p.delete('section');
        p.set('group', 'Contact & map');
        return p;
      }, { replace: true });
      return;
    }
    if (urlGroup) {
      setActiveGroup(urlGroup);
      setMobileEditorOpen(true);
    } else {
      setActiveGroup(null);
      setMobileEditorOpen(false);
    }
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

  // Landing is the default home — do not auto-jump into the first section.
  // Stage A: each destination only lists blocks that app actually uses.
  const contentBlocks = useMemo(
    () => blocks.filter((block) => !isDeprecatedBlock(block) && block.apps.includes(hubApp)),
    [blocks, hubApp],
  );

  const orderedSectionNames = useMemo(() => {
    return orderSectionNames(visibleContentGroups(contentBlocks));
  }, [contentBlocks]);

  // Reject unknown ?group= deep links once sections have loaded — legacy/typo
  // values must not silently open a blank or wrong editor.
  useEffect(() => {
    if (loading || !urlGroup) return;
    if (urlGroup === LEGACY_PAGES_GROUP || urlGroup === 'Contact') return;
    if (orderedSectionNames.length === 0) return;
    if (orderedSectionNames.includes(urlGroup)) return;
    // Defer by a tick — `orderedSectionNames` can briefly lag one render
    // behind `loading` flipping to false (e.g. right after load()). If a
    // follow-up render corrects it, this effect re-runs and the cleanup
    // below cancels the stale clear before it fires.
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

  const dirtyCount = useMemo(
    () => collectChanges(drafts, locale, hubApp).length,
    [drafts, locale, hubApp],
  );
  const hasUnsaved = dirtyCount > 0 && !serverDraftSynced;

  const setDraft = (scope: ContentScope, key: string, value: string) => {
    if (isOpsOwnedContentKey(key)) return;
    const loc = locale;
    saveGeneration.current += 1;
    updateLocaleDrafts(loc, (prev) => ({ ...prev, [draftKey(scope, key)]: value }));
    setLocaleSynced(loc, false);
    setAutosaveFailed(false);
    setAutosaveErrorDetail(null);
    setPublishFailed(false);
  };

  // Preview token for THIS hub app only — never mint/cross-load the other app.
  // include_layout is always on; layoutRevision remints when page-block drafts change.
  useEffect(() => {
    const t = window.setTimeout(() => {
      const overrides: Record<string, string> = {};
      for (const block of contentBlocks) {
        if (!block.apps.includes(hubApp)) continue;
        overrides[block.key] = valueForScope(block, hubApp, drafts);
      }
      // Layout-only drafts still need a token (empty overrides + include_layout).
      if (Object.keys(overrides).length === 0 && !layoutDraft) {
        return;
      }
      setPreviewLoading(true);
      void createContentPreviewToken(hubApp, overrides, locale, true)
        .then((res) => {
          setPreviewState({
            website: hubApp === 'website' ? (res.website_url || null) : null,
            orderApp: hubApp === 'order_app' ? (res.order_app_url || null) : null,
          });
        })
        .catch(() => {
          setPreviewState({ website: null, orderApp: null });
          error(`Could not load ${hubLabel} live preview. Try again.`);
        })
        .finally(() => setPreviewLoading(false));
    }, 600);
    return () => window.clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafts, contentBlocks, locale, layoutDraft, layoutRevision, hubApp]);

  const persistDrafts = async (loc: ContentLocale = locale): Promise<boolean> => {
    const gen = saveGeneration.current;
    const changes = collectChanges(draftsByLocaleRef.current[loc] ?? {}, loc, hubApp);
    if (changes.length === 0) {
      setAutosaveFailed(false);
      setAutosaveErrorDetail(null);
      setLocaleSynced(loc, true);
      return true;
    }
    autosaveInFlight.current = true;
    setAutosaving(true);
    setAutosaveFailed(false);
    setAutosaveErrorDetail(null);
    try {
      const res = await saveContentDrafts(changes, loc);
      if (gen !== saveGeneration.current) return false;
      if (res == null || typeof res !== 'object') {
        throw new Error('Malformed draft save response from server.');
      }
      if (typeof res.saved_at === 'string') {
        setLocaleLastSavedAt(loc, res.saved_at);
      }
      setLocaleSynced(loc, true);
      setAutosaveFailed(false);
      setAutosaveErrorDetail(null);
      return true;
    } catch (e) {
      if (gen === saveGeneration.current) {
        setAutosaveFailed(true);
        setAutosaveErrorDetail(formatContentActionError(e, 'Draft save failed'));
        setLocaleSynced(loc, false);
      }
      return false;
    } finally {
      autosaveInFlight.current = false;
      const stillHasDrafts = collectChanges(draftsByLocaleRef.current[loc] ?? {}, loc, hubApp).length > 0;
      if (gen === saveGeneration.current || !stillHasDrafts) setAutosaving(false);
    }
  };

  // Autosave — failures stay visible until retry succeeds (never silently ignored).
  useEffect(() => {
    if (dirtyCount === 0 || serverDraftSynced) return;
    const t = window.setTimeout(() => {
      void persistDrafts(locale);
    }, 2500);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafts, dirtyCount, serverDraftSynced, locale]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!hasUnsaved && dirtyCount === 0 && !layoutDraft) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasUnsaved, dirtyCount, layoutDraft]);

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

  // ── Handlers ──────────────────────────────────────────────────────────────

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
    // Homepage always resolves to exactly one surface — never the full type library.
    let resolvedSurface = next === 'Homepage' ? (surface ?? null) : null;
    if (next === 'Homepage' && !resolvedSurface) {
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
      if (next === 'Homepage' && homeAppHint) {
        p.set('homeApp', homeAppHint);
      } else if (next === 'Homepage' && parsed) {
        p.set('homeApp', parsed.app);
      } else {
        p.delete('homeApp');
      }
      if (next === 'Homepage' && resolvedSurface) {
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
    handleSectionSelect('Homepage', surface.app, surface.id);
  };

  const handleTaskSelect = (task: ContentTask) => {
    if (task.advancedAction === 'history') {
      // History lives on each field's ⋯ menu — open Branding as a concrete destination.
      handleSectionSelect('Branding');
      success('Open ⋯ on any field to view and restore History.');
      return;
    }
    if (task.advancedAction === 'schedule' || task.advancedAction === 'import_export') {
      setMoreMenuOpen(true);
      return;
    }
    if (!task.group) return;
    handleSectionSelect(task.group, task.homeAppHint, task.surface);
  };

  const homeLayoutApp =
    searchParams.get('homeApp') === 'order_app' ? 'order_app' as const
      : searchParams.get('homeApp') === 'website' ? 'website' as const
        : hubApp;
  const urlSurface = parseSurfaceId(searchParams.get('surface')?.trim() ?? '');
  // Prefer synchronous selection; fall back to URL; Homepage never opens unscoped.
  const surfaceFilter: SurfaceFilter | null = activeSurface
    ?? urlSurface
    ?? (activeGroup === 'Homepage' ? defaultHomeSurface(homeLayoutApp, isMobile ? 'mobile' : 'desktop') : null);

  // Keep activeSurface aligned when deep-linking via URL only.
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

  /**
   * Publish layout drafts for THIS hub app only. Website and Order App never
   * publish each other's page-block drafts from a single Publish click.
   */
  const publishLayoutDraftsViaApi = async () => {
    const app = hubApp;
    const res = await fetchAdminPageBlocks(app);
    if (res.draft) {
      await publishPageBlocks({ app, version: res.version ?? 0 });
    }
    setLayoutDraft(false);
    await homeLayoutEditorRef.current?.reload?.();
  };

  const discardLayoutDraftsViaApi = async () => {
    const app = hubApp;
    const res = await fetchAdminPageBlocks(app);
    if (res.draft) {
      await discardPageBlockDraft({ app });
    }
    setLayoutDraft(false);
    await homeLayoutEditorRef.current?.reload?.();
  };

  // Unified publish — content keys + layout draft for the current hub app only.
  const publish = async () => {
    if (publishInFlight.current || saving) return;
    const changes = collectChanges(drafts, locale, hubApp);
    if (changes.length === 0 && !layoutDraft) return;

    publishInFlight.current = true;
    setSaving(true);
    setPublishFailed(false);
    try {
      // Finish any in-flight / pending autosave so we don't race the draft store.
      if (autosaveInFlight.current || (changes.length > 0 && !serverDraftSynced)) {
        const saved = await persistDrafts(locale);
        if (!saved && changes.length > 0) {
          throw new Error('Draft not saved — fix the save error, then publish again.');
        }
      }

      let nextBlocks = contentBlocks;
      if (changes.length > 0) {
        const res = await updateContent(changes, locale);
        if (!res || !Array.isArray(res.blocks)) {
          throw new Error('Malformed publish response from server — drafts were not cleared.');
        }
        nextBlocks = res.blocks;
      }
      if (layoutDraft) {
        await publishLayoutDraftsViaApi();
      }

      // Clear local drafts only after the server confirmed every step.
      if (changes.length > 0) {
        setBlocks(nextBlocks);
        saveGeneration.current += 1;
        // Drop only this hub app's draft keys so the other app's local map is untouched if present.
        const remaining: DraftMap = {};
        for (const [composite, value] of Object.entries(draftsByLocaleRef.current[locale] ?? {})) {
          const parsed = parseDraftKey(composite);
          if (parsed && parsed.scope !== hubApp) remaining[composite] = value;
        }
        replaceLocaleDrafts(locale, remaining);
        setLocaleSynced(locale, true);
        setLocaleLastSavedAt(locale, new Date().toISOString());
        setAutosaveFailed(false);
      }
      setPublishFailed(false);
      success(hubApp === 'website' ? 'Website published' : 'Order App published');
    } catch (e) {
      setPublishFailed(true);
      error(formatContentActionError(e, 'Publish failed'));
    } finally {
      publishInFlight.current = false;
      setSaving(false);
    }
  };

  const schedulePublish = async () => {
    const changes = collectChanges(drafts, locale, hubApp);
    if (changes.length === 0 || !scheduleAt) {
      error('Set a future time and make some edits first');
      return;
    }
    if (layoutDraft) {
      const proceed = window.confirm(
        'Homepage layout drafts cannot be scheduled. Content keys will be scheduled; layout stays as an unpublished draft until you Publish or Discard it. Continue?',
      );
      if (!proceed) return;
    }
    setSaving(true);
    try {
      await scheduleContent(new Date(scheduleAt).toISOString(), changes, locale);
      // Server clears matching ContentDraft rows; clear local state to match.
      saveGeneration.current += 1;
      replaceLocaleDrafts(locale, {});
      setLocaleSynced(locale, true);
      setScheduleAt('');
      const { schedules: nextSchedules } = await getContentSchedules('pending');
      setSchedules(nextSchedules);
      success(
        layoutDraft
          ? 'Content scheduled. Homepage layout draft was not included — publish it separately.'
          : 'Publish scheduled',
      );
    } catch (e) {
      error(e instanceof Error ? e.message : 'Schedule failed');
    } finally {
      setSaving(false);
    }
  };

  const onUpload = async (block: ContentBlock, scope: ContentScope, file: File) => {
    try {
      const res = await uploadContentImage(block.key, uploadAppFor(scope), file, undefined, locale);
      setDraft(scope, block.key, res.url);
      success('Image uploaded');
    } catch (e) {
      error(e instanceof Error ? e.message : 'Upload failed');
    }
  };

  const makeTriggerUpload = (block: ContentBlock, scope: ContentScope) =>
    (_legacyKey: string, onDone: (url: string) => void) => {
      uploadCtx.current = { blockKey: block.key, scope, onDone };
      fileInputRef.current?.click();
    };

  const handleEmbedFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const ctx = uploadCtx.current;
    e.target.value = '';
    uploadCtx.current = null;
    if (!file || !ctx) return;
    try {
      const res = await uploadContentImage(ctx.blockKey, uploadAppFor(ctx.scope), file, undefined, locale);
      ctx.onDone(res.url);
      success('Image uploaded');
    } catch (err) {
      error(err instanceof Error ? err.message : 'Upload failed');
    }
  };

  const openHistory = async (block: ContentBlock, scope: ContentScope) => {
    setHistoryTarget({ key: block.key, scope, label: labelForScope(scope) });
    try {
      const { revisions: nextRevisions } = await getContentRevisions(block.key, scope, locale);
      setRevisions(nextRevisions);
    } catch (e) {
      error(e instanceof Error ? e.message : 'Failed to load history');
    }
  };

  const restore = async (id: number) => {
    if (!historyTarget) return;
    if (!window.confirm('Restore this revision? Current value is saved to history first.')) return;
    try {
      const { blocks: nextBlocks } = await restoreContentRevision(historyTarget.key, id);
      setBlocks(nextBlocks);
      const { revisions: nextRevisions } = await getContentRevisions(historyTarget.key, historyTarget.scope, locale);
      setRevisions(nextRevisions);
      success('Revision restored');
    } catch (e) {
      error(e instanceof Error ? e.message : 'Restore failed');
    }
  };

  const doExport = async () => {
    try {
      const bundle = await exportContent(locale, hubApp);
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `content-hub-${hubApp}-${locale}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      success(`${hubLabel} export downloaded`);
    } catch (e) {
      error(e instanceof Error ? e.message : 'Export failed');
    }
  };

  const doImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const bundle = JSON.parse(text) as {
        version?: number;
        exported_at?: string;
        locale?: string;
        entries?: Array<{ key: string; scope: ContentScope; locale: string; value: string }>;
      };
      if (!bundle?.entries) throw new Error('Invalid bundle');
      const forThisApp = bundle.entries.filter((entry) => entry.scope === hubApp);
      const skipped = bundle.entries.length - forThisApp.length;
      if (forThisApp.length === 0) {
        throw new Error(`No ${hubLabel} entries in this file. Import only applies to the app you are editing.`);
      }
      if (skipped > 0) {
        const proceed = window.confirm(
          `This file has ${skipped} entr${skipped === 1 ? 'y' : 'ies'} for the other app. `
          + `Only ${forThisApp.length} ${hubLabel} entr${forThisApp.length === 1 ? 'y' : 'ies'} will be imported. Continue?`,
        );
        if (!proceed) return;
      }
      const { blocks: nextBlocks, applied } = await importContent({
        version: bundle.version ?? 1,
        exported_at: bundle.exported_at ?? new Date().toISOString(),
        locale: bundle.locale ?? locale,
        entries: forThisApp,
      });
      setBlocks(nextBlocks);
      success(`Imported ${applied} ${hubLabel} entries`);
    } catch (err) {
      error(err instanceof Error ? err.message : 'Import failed');
    }
  };

  // ── Section dirty map ──────────────────────────────────────────────────────

  const draftKeys = useMemo(() => Object.keys(drafts), [drafts]);

  const railSections = useMemo(
    () => buildHubRailSections(orderedSectionNames, contentBlocks, draftKeys, parseDraftKey),
    [orderedSectionNames, contentBlocks, draftKeys],
  );

  const dirtyGroups = useMemo(
    () => new Set(railSections.filter((s) => s.dirty).map((s) => s.name)),
    [railSections],
  );

  // ── Search (label only) ────────────────────────────────────────────────────

  const searchResults = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    return contentBlocks
      .filter((b) => b.label.toLowerCase().includes(needle))
      .slice(0, 12)
      .map((b) => ({
        block: b,
        sectionName: contentViewForKey(b.key) ?? (
          b.group === LEGACY_PAGES_GROUP || b.group === 'Contact' ? 'Website' : b.group
        ),
      }));
  }, [contentBlocks, q]);

  const handleSearchSelect = (block: ContentBlock) => {
    const view = contentViewForKey(block.key) ?? (
      block.group === LEGACY_PAGES_GROUP || block.group === 'Contact'
        ? null
        : block.group
    );
    if (!view) {
      // Remapped away from navigation — stay on landing rather than opening Pages.
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

  // ── Render helpers ─────────────────────────────────────────────────────────

  const effectiveDirtyCount = dirtyCount + (layoutDraft ? 1 : 0);

  const draftStatusNode = (
    <DraftPublishStatus
      dirtyCount={effectiveDirtyCount}
      app={hubApp}
      autosaving={autosaving}
      saveFailed={autosaveFailed}
      saveErrorDetail={autosaveErrorDetail}
      savePending={hasUnsaved && !autosaveFailed}
      publishing={saving}
      publishFailed={publishFailed}
      lastSavedAt={lastSavedAt}
      compact={isMobile}
      onRetrySave={() => { void persistDrafts(locale); }}
      onRetryPublish={() => { void publish(); }}
    />
  );

  // Unified discard — current hub app only (never the other app's drafts).
  const discardAllContentDrafts = async () => {
    const hasContentDrafts = dirtyCount > 0;
    if (!hasContentDrafts && !layoutDraft) return;
    const confirmMessage = hasContentDrafts && layoutDraft
      ? `Discard unpublished ${hubLabel} content and layout drafts for this language? The other app is not affected.`
      : layoutDraft
        ? `Discard unpublished ${hubLabel} Home layout drafts?`
        : `Discard unpublished ${hubLabel} content drafts for this language? The other app is not affected.`;
    if (!window.confirm(confirmMessage)) return;
    setSaving(true);
    try {
      if (hasContentDrafts) {
        await discardContentDrafts(locale, hubApp);
      }
      saveGeneration.current += 1;
      replaceLocaleDrafts(locale, {});
      setLocaleSynced(locale, true);
      setAutosaveFailed(false);
      setAutosaveErrorDetail(null);
      setPublishFailed(false);
      if (layoutDraft) {
        await discardLayoutDraftsViaApi();
      }
      success(hubApp === 'website' ? 'Website draft discarded' : 'Order App draft discarded');
    } catch (e) {
      error(e instanceof Error ? e.message : 'Could not discard drafts');
    } finally {
      setSaving(false);
    }
  };

  const activeEditorTitle = activeGroup
    ? (websitePageTaskByGroup(activeGroup)?.title ?? activeGroup)
    : 'Section';

  // Shared props for the active section's block-list / brand-kit host — only
  // `sectionName` / `withBack` differ between the mobile sheet and desktop rail.
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

  // ── Header actions ─────────────────────────────────────────────────────────

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

  const pendingOverwriteKeys = useMemo(() => {
    const changes = collectChanges(drafts, locale, hubApp);
    if (changes.length === 0 || schedules.length === 0) return [] as ContentScheduleRow[];
    const changeKeys = new Set(changes.map((c) => `${c.key}::${c.scope}::${c.locale ?? locale}`));
    return schedules.filter((s) => changeKeys.has(`${s.key}::${s.scope}::${s.locale}`));
  }, [drafts, locale, schedules, hubApp]);

  const schedulePublishPanel = (
    <div className="hub-more-schedule" data-testid="hub-schedule-publish">
      <div className="hub-more-schedule-label">Schedule {hubLabel} publish</div>
      {pendingOverwriteKeys.length > 0 ? (
        <p
          data-testid="hub-schedule-overwrite-warning"
          role="alert"
          style={{
            margin: '0 0 8px',
            fontSize: 12,
            lineHeight: 1.4,
            color: 'var(--color-warning-strong)',
            background: 'var(--color-warning-bg)',
            border: '1px solid var(--color-warning)',
            borderRadius: 8,
            padding: '8px 10px',
          }}
        >
          A pending schedule already exists for{' '}
          {pendingOverwriteKeys.map((s) => s.key).filter((k, i, a) => a.indexOf(k) === i).join(', ')}.
          Scheduling again will overwrite that whole value when the later one publishes.
        </p>
      ) : null}
      {layoutDraft ? (
        <p
          data-testid="hub-schedule-layout-note"
          style={{
            margin: '0 0 8px',
            fontSize: 12,
            lineHeight: 1.4,
            color: 'var(--color-text-secondary)',
          }}
        >
          Homepage layout drafts are not scheduled. Publish or discard them separately.
        </p>
      ) : null}
      <input
        type="datetime-local"
        value={scheduleAt}
        onChange={(e) => setScheduleAt(e.target.value)}
        className="hub-more-schedule-input"
        data-testid="hub-schedule-at"
      />
      <button
        type="button"
        onClick={() => { void schedulePublish(); setMoreMenuOpen(false); }}
        disabled={saving || dirtyCount === 0 || !scheduleAt}
        className="hub-more-schedule-btn"
        data-testid="hub-schedule-submit"
      >
        Schedule
      </button>
    </div>
  );

  const moreMenuItems = (
    <>
      {effectiveDirtyCount > 0 ? (
        <button
          type="button"
          role="menuitem"
          className="hub-more-item"
          data-testid="hub-discard-draft"
          onClick={() => {
            setMoreMenuOpen(false);
            void discardAllContentDrafts();
          }}
        >
          Discard {hubLabel} draft
        </button>
      ) : null}
      <button
        type="button"
        role="menuitem"
        className="hub-more-item"
        onClick={() => { void doExport(); setMoreMenuOpen(false); }}
      >
        <Download size={14} /> Export {hubLabel}
      </button>
      <button
        type="button"
        role="menuitem"
        className="hub-more-item"
        onClick={() => { importInputRef.current?.click(); setMoreMenuOpen(false); }}
      >
        <UploadIcon size={14} /> Import {hubLabel}
      </button>
      {schedulePublishPanel}
      <button
        type="button"
        role="menuitem"
        className="hub-more-item"
        onClick={() => { setMediaOpen(true); setMoreMenuOpen(false); }}
      >
        Media library
      </button>
    </>
  );

  const headerActions = (
    <div className="hub-header-actions">
      {isMobile ? (
        <button
          ref={searchToggleRef}
          type="button"
          className="hub-search-toggle"
          data-testid="hub-search-toggle"
          aria-label="Search content"
          aria-expanded={searchOverlayOpen}
          onClick={() => setSearchOverlayOpen(true)}
        >
          <Search size={16} />
        </button>
      ) : (
        searchField
      )}

      <div className="hub-locale-seg" role="group" aria-label="Language">
        {(['en', 'dv'] as const).map((loc) => (
          <button
            key={loc}
            type="button"
            aria-pressed={locale === loc}
            onClick={() => setLocale(loc)}
            className={`hub-locale-btn${locale === loc ? ' hub-locale-btn--active' : ''}`}
          >
            {loc === 'en' ? 'EN' : 'DV'}
          </button>
        ))}
      </div>

      {draftStatusNode}

      {!isMobile ? (
        <button
          type="button"
          data-testid="preview-toggle"
          aria-pressed={isCompactAdmin ? previewSheetOpen : desktopPreviewOpen}
          className={`hub-preview-toggle${(isCompactAdmin ? previewSheetOpen : desktopPreviewOpen) ? ' hub-preview-toggle--on' : ''}`}
          onClick={() => {
            if (isCompactAdmin) {
              setPreviewSheetOpen((o) => !o);
              return;
            }
            setDesktopPreviewOpenPersisted(!desktopPreviewOpen);
          }}
        >
          <Eye size={14} /> Preview
        </button>
      ) : null}

      {effectiveDirtyCount > 0 ? (
        <Btn
          onClick={() => void publish()}
          disabled={saving || effectiveDirtyCount === 0 || autosaveFailed}
          className="content-studio-publish-desktop content-studio-publish-desktop--needed"
          data-testid="publish-live-btn"
          title={autosaveFailed
            ? 'Retry draft save before publishing'
            : layoutDraft && dirtyCount === 0
              ? `Publishes unpublished ${hubApp === 'website' ? 'Website' : 'Order App'} Home layout changes`
              : undefined}
        >
          <Save size={16} />
          {saving ? `Publishing ${hubLabel}…` : publishFailed ? 'Publish failed — Try again' : `Publish ${hubLabel}`}
        </Btn>
      ) : null}

      <div className="hub-more-wrap" ref={moreMenuRef}>
        <button
          ref={moreBtnRef}
          type="button"
          className="hub-more-trigger"
          onClick={() => setMoreMenuOpen((o) => !o)}
          aria-expanded={moreMenuOpen}
          aria-label="More actions"
        >
          <MoreHorizontal size={16} />
          <span className="hub-more-trigger-label">More</span>
        </button>
        {moreMenuOpen && !isMobile ? (
          <div className="hub-more-menu" role="menu">
            {moreMenuItems}
          </div>
        ) : null}
      </div>
      {isMobile ? (
        <MobileActionSheet
          open={moreMenuOpen}
          title="More"
          onClose={() => setMoreMenuOpen(false)}
          testId="hub-more-menu-mobile"
          returnFocusTo={moreBtnRef.current}
          layer={5}
        >
          {moreMenuItems}
        </MobileActionSheet>
      ) : null}
    </div>
  );

  // ── Schedules banner ───────────────────────────────────────────────────────

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

  // ── Skeleton ───────────────────────────────────────────────────────────────

  const skeleton = (
    <div data-testid="content-skeleton" className="hub-skeleton">
      {[0, 1, 2].map((i) => (
        <div key={i} className="hub-skeleton-card" />
      ))}
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────────────

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
          /* ── Mobile layout ──────────────────────────────────────────────── */
          <div className="hub-mobile-shell">
            <div className="hub-mobile-overview">
              <HubSurfaceLanding
                loading={loading}
                skeleton={skeleton}
                appFilter={hubApp}
                surfaceCounts={surfaceCounts}
                dirtyGroups={dirtyGroups}
                onSelectSurface={handleSurfaceSelect}
                onSelectTask={handleTaskSelect}
              />
            </div>

            <PreviewPane
              variant="sheet"
              lockedApp={hubApp}
              websiteUrl={previewState.website}
              orderAppUrl={previewState.orderApp}
              loading={previewLoading}
              open={previewSheetOpen}
              onClose={() => setPreviewSheetOpen(false)}
              draftStatus={draftStatusNode}
              layer={3}
            />
          </div>
        ) : (
          /* ── Desktop layout ─────────────────────────────────────────────── */
          <div
            className={`hub-desktop-shell${railCollapsed ? ' hub-desktop-shell--rail-collapsed' : ''}${desktopPreviewOpen ? '' : ' hub-desktop-shell--preview-off'}`}
            data-testid="hub-desktop-shell"
            data-preview={desktopPreviewOpen ? 'on' : 'off'}
            data-rail={railCollapsed ? 'collapsed' : 'expanded'}
          >
            <HubSectionList
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
                    surfaceCounts={surfaceCounts}
                    dirtyGroups={dirtyGroups}
                    onSelectSurface={handleSurfaceSelect}
                    onSelectTask={handleTaskSelect}
                  />
                )}
            </div>

            {/* Wide desktop (≥1200): optional sticky preview column.
                Compact Admin (768–1199): never reserve 400px — use sheet instead. */}
            {desktopPreviewOpen && isWideDesktop && !isCompactAdmin ? (
              <PreviewPane
                variant="column"
                lockedApp={hubApp}
                websiteUrl={previewState.website}
                orderAppUrl={previewState.orderApp}
                loading={previewLoading}
              />
            ) : null}
          </div>
        )}

        {/* Compact Admin preview sheet (also reused when column is unavailable). */}
        {!isMobile && (isCompactAdmin || !isWideDesktop) ? (
          <PreviewPane
            variant="sheet"
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
            layer={3}
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

        {/* Sticky mobile publish bar */}
        {effectiveDirtyCount > 0 && isMobile ? (
          <div
            className="content-studio-sticky-bar"
            role="region"
            aria-label={autosaveFailed ? 'Draft not saved' : saving ? `Publishing ${hubLabel}` : 'Draft status'}
          >
            <span className="content-studio-sticky-bar-label" data-testid="sticky-draft-status">
              {saving
                ? `Publishing ${hubLabel}…`
                : publishFailed
                  ? 'Publish failed — Try again'
                  : autosaveFailed
                    ? 'Draft not saved — Retry'
                    : hasUnsaved
                      ? 'Saving draft…'
                      : 'Draft saved'}
            </span>
            {autosaveFailed ? (
              <Btn
                onClick={() => void persistDrafts(locale)}
                style={{ flex: '0 0 auto' }}
                data-testid="retry-save-btn-mobile"
                variant="secondary"
              >
                Retry
              </Btn>
            ) : null}
            <Btn
              onClick={() => void publish()}
              disabled={saving || autosaveFailed}
              style={{ flex: 1 }}
              data-testid="publish-live-btn-mobile"
              className="content-studio-publish-sticky"
            >
              <Save size={16} /> {saving ? `Publishing ${hubLabel}…` : `Publish ${hubLabel}`}
            </Btn>
          </div>
        ) : null}

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
