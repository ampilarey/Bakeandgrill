import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
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
  uploadContentVideo,
  type ContentApp,
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
} from '../../components/content-editors';
import { usePageTitle } from '../../hooks/usePageTitle';
import { useToast } from '../../components/ui';
import { MediaPicker } from '../../components/MediaPicker';
import { ContentEditorSheet } from '../../components/ContentEditorSheet';
import { DraftPublishStatus } from '../../components/DraftPublishStatus';
import { MobileActionSheet } from '../../components/MobileActionSheet';
import { OpsOwnedSummary } from '../../components/OpsOwnedSummary';
import { BrandKitCards, brandKitWriteScope } from './BrandKitCards';
import { BRAND_KIT_KEYS } from './brandKitConfig';
import { BlockCard, scopesLabelFor } from './BlockCard';
import { HomeLayoutEditor, type HomeLayoutEditorHandle, type LayoutDraftSignal } from './HomeLayoutEditor';
import { SectionRail } from './SectionRail';
import { SectionEditor } from './SectionEditor';
import { PreviewPane } from './PreviewPane';
import { SurfaceBuilderLanding } from './SurfaceBuilderLanding';
import type { ContentTask } from './taskLandingConfig';
import { parseSurfaceId, countBlocksOnSurface, surfaceId, type SurfaceRecord } from './surfaceCatalog';
import { orderSectionNames } from './hubLayoutConfig';
import {
  LEGACY_PAGES_GROUP,
  blocksForContentView,
  contentViewForKey,
  isGroupDirty,
  visibleContentGroups,
  websitePageTaskByGroup,
} from './websitePageTasks';
import { isOpsOwnedContentKey } from './opsOwnedContentKeys';
import { useIsCompactAdmin, useIsMobile, useIsWideDesktop } from '../../hooks/useIsMobile';
import type { MediaAsset } from '../../api/media';

type DraftMap = Record<string, string>;
type DraftsByLocale = Record<ContentLocale, DraftMap>;
type LocaleMetaMap<T> = Record<ContentLocale, T>;

type DraftChange = {
  key: string;
  scope: ContentScope;
  value: string;
  locale: ContentLocale;
};

type HistoryTarget = {
  key: string;
  scope: ContentScope;
  label: string;
} | null;

type PreviewState = {
  website: string | null;
  orderApp: string | null;
};

const ALL_SCOPES: ContentScope[] = ['shared', 'website', 'order_app'];
const EMPTY_DRAFTS_BY_LOCALE: DraftsByLocale = { en: {}, dv: {} };
const TRUE_BY_LOCALE: LocaleMetaMap<boolean> = { en: true, dv: true };
const NULL_BY_LOCALE: LocaleMetaMap<string | null> = { en: null, dv: null };

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

function seoDescriptionKey(titleKey: string): string | null {
  if (titleKey === 'meta_title') return 'meta_description';
  if (titleKey.endsWith('_meta_title')) return titleKey.replace(/_meta_title$/, '_meta_description');
  return null;
}

function isSeoDescriptionKey(key: string): boolean {
  return key === 'meta_description' || key.endsWith('_meta_description');
}

function draftKey(scope: ContentScope, key: string): string {
  return `${scope}::${key}`;
}

function parseDraftKey(composite: string): { scope: ContentScope; key: string } | null {
  const idx = composite.indexOf('::');
  if (idx <= 0) return null;
  const scope = composite.slice(0, idx);
  const key = composite.slice(idx + 2);
  if (!ALL_SCOPES.includes(scope as ContentScope) || key.length === 0) return null;
  return { scope: scope as ContentScope, key };
}

function collectChanges(drafts: DraftMap, locale: ContentLocale, app?: ContentApp): DraftChange[] {
  return Object.entries(drafts)
    .map(([composite, value]) => {
      const parsed = parseDraftKey(composite);
      if (!parsed) return null;
      // Content Hub never persists or publishes shared / cross-app drafts for the other app.
      if (app && parsed.scope !== app) return null;
      // Operational / Business Details ownership — never draft or publish competing copies.
      if (isOpsOwnedContentKey(parsed.key)) return null;
      return { key: parsed.key, scope: parsed.scope, value, locale };
    })
    .filter((change): change is DraftChange => Boolean(change));
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

function isDualAppBlock(block: ContentBlock): boolean {
  return block.apps.includes('website') && block.apps.includes('order_app');
}

function uploadAppFor(scope: ContentScope): ContentApp {
  return scope === 'order_app' ? 'order_app' : 'website';
}

function labelForScope(scope: ContentScope): string {
  if (scope === 'order_app') return 'Order App';
  if (scope === 'website') return 'Website';
  return 'Business record';
}

function hubAppLabel(app: ContentApp): string {
  return app === 'order_app' ? 'Order App' : 'Website';
}

function baseValueForScope(block: ContentBlock, scope: ContentScope): string {
  if (scope === 'shared') {
    return block.shared ?? block.default ?? '';
  }
  if (scope === 'website') {
    return block.website ?? block.resolved_website ?? block.default ?? '';
  }
  return block.order_app ?? block.resolved_order_app ?? block.default ?? '';
}

function valueForScope(block: ContentBlock, scope: ContentScope, drafts: DraftMap): string {
  const key = draftKey(scope, block.key);
  if (drafts[key] !== undefined) return drafts[key];
  return baseValueForScope(block, scope);
}

function editorScopesForBlock(block: ContentBlock, app: ContentApp): ContentScope[] {
  if (isDualAppBlock(block) || block.apps.includes(app)) return [app];
  if (block.apps.includes('order_app')) return ['order_app'];
  if (block.apps.includes('website')) return ['website'];
  return [app];
}

function preferredScopeTab(scopes: ContentScope[], preferred?: ContentScope): ContentScope {
  if (preferred && scopes.includes(preferred)) return preferred;
  if (scopes.includes('website')) return 'website';
  return scopes[0];
}

function scopeHasDraft(scope: ContentScope, key: string, drafts: DraftMap): boolean {
  return drafts[draftKey(scope, key)] !== undefined;
}

function isDeprecatedBlock(block: ContentBlock): boolean {
  return Boolean(block.deprecated) || /^hero_slide_[123]$/.test(block.key);
}

function contentAppFromPath(pathname: string): ContentApp {
  if (pathname.includes('/content/order-app')) return 'order_app';
  return 'website';
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
  const [lastSavedAtByLocale, setLastSavedAtByLocale] = useState<LocaleMetaMap<string | null>>(() => ({ ...NULL_BY_LOCALE }));
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
  /** Component counts per surface for the landing overview. */
  const [surfaceCounts, setSurfaceCounts] = useState<Record<string, number>>({});

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
  const uploadCtx = useRef<{
    blockKey: string;
    scope: ContentScope;
    onDone: (url: string) => void;
  } | null>(null);
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
        const counts: Record<string, number> = {};
        for (const app of ['website', 'order_app'] as const) {
          const blocks = app === 'website' ? (w.blocks ?? []) : (o.blocks ?? []);
          for (const device of ['desktop', 'mobile'] as const) {
            for (const slot of ['header', 'home', 'footer', 'bottom_navigation'] as const) {
              if (device === 'desktop' && slot === 'bottom_navigation') continue;
              counts[surfaceId(app, device, slot)] = countBlocksOnSurface(blocks, device, slot);
            }
          }
        }
        setSurfaceCounts(counts);
      } catch {
        if (!cancelled) setSurfaceCounts({});
      }
    })();
    return () => { cancelled = true; };
  }, [hubApp]);

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
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.delete('section');
      p.set('group', next);
      if (next === 'Homepage' && homeAppHint) {
        p.set('homeApp', homeAppHint);
      } else {
        p.delete('homeApp');
      }
      if (next === 'Homepage' && surface) {
        p.set('surface', surface);
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
  const surfaceFilter = parseSurfaceId(searchParams.get('surface')?.trim() ?? '');

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

  const railSections = useMemo(() => {
    return orderedSectionNames.map((name) => {
      const viewBlocks = blocksForContentView(name, contentBlocks);
      return {
        name,
        count: viewBlocks.length,
        dirty: isGroupDirty(name, contentBlocks, Object.keys(drafts), parseDraftKey),
      };
    });
  }, [orderedSectionNames, contentBlocks, drafts]);

  const dirtyGroups = useMemo(
    () => new Set(railSections.filter((s) => s.dirty).map((s) => s.name)),
    [railSections],
  );

  const taskLanding = (
    <SurfaceBuilderLanding
      appFilter={hubApp}
      surfaceCounts={surfaceCounts}
      dirtyGroups={dirtyGroups}
      onSelectSurface={handleSurfaceSelect}
      onSelectTask={handleTaskSelect}
    />
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

  const renderVisualEditor = (
    block: ContentBlock,
    scope: ContentScope,
    val: string,
    opts?: { mobileMode?: boolean; scheduleSlot?: ReactNode },
  ) => {
    const onChange = (next: string) => setDraft(scope, block.key, next);
    const triggerUpload = makeTriggerUpload(block, scope);
    const common = { label: block.label, description: block.description || undefined, value: val, onChange };

    switch (block.editor) {
      case 'hero':
        return (
          <HeroSlidesEditor
            {...common}
            triggerUpload={triggerUpload}
            uploadImage={(cropped, original) => uploadContentImage(block.key, uploadAppFor(scope), cropped, original, locale)}
            uploadVideo={(video, poster, posterUrl) => uploadContentVideo(block.key, uploadAppFor(scope), video, poster, locale, posterUrl)}
            mobileMode={Boolean(opts?.mobileMode)}
            draftStatus={draftStatusNode}
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
  };

  const renderPlainEditor = (block: ContentBlock, scope: ContentScope, val: string) => {
    if (block.rich) {
      return (
        <RichTextEditor
          key={`${scope}-${block.key}-${locale}`}
          label=""
          value={val}
          onChange={(next) => setDraft(scope, block.key, next)}
        />
      );
    }
    if (block.type === 'boolean') {
      return (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
          <input
            type="checkbox"
            checked={val === 'true' || val === '1'}
            onChange={(e) => setDraft(scope, block.key, e.target.checked ? 'true' : 'false')}
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
              if (file) void onUpload(block, scope, file);
            }}
          />
          <Btn
            type="button"
            variant="secondary"
            onClick={() => {
              uploadCtx.current = { blockKey: block.key, scope, onDone: (url) => setDraft(scope, block.key, url) };
              setMediaOpen(true);
            }}
          >
            Library
          </Btn>
          <input
            value={val}
            onChange={(e) => setDraft(scope, block.key, e.target.value)}
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
          onChange={(e) => setDraft(scope, block.key, e.target.value)}
          rows={block.type === 'json' ? 6 : 4}
          dir={locale === 'dv' ? 'rtl' : 'ltr'}
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
        onChange={(e) => setDraft(scope, block.key, e.target.value)}
        dir={locale === 'dv' ? 'rtl' : 'ltr'}
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
  };

  const renderEditorForScope = (block: ContentBlock, scope: ContentScope) => {
    const val = valueForScope(block, scope, drafts);
    const visual = block.editor ? renderVisualEditor(block, scope, val) : null;
    const descKey = seoDescriptionKey(block.key);
    const descBlock = descKey ? contentBlocks.find((candidate) => candidate.key === descKey) : undefined;
    const isSeoTitle = Boolean(descKey);

    if (visual) return visual;

    if (isSeoTitle && descBlock) {
      return (
        <SeoSnippetPreview
          title={val}
          description={valueForScope(descBlock, scope, drafts)}
          onTitleChange={(next) => setDraft(scope, block.key, next)}
          onDescriptionChange={(next) => setDraft(scope, descBlock.key, next)}
          titleLabel={block.label}
          descriptionLabel={descBlock.label}
        />
      );
    }

    return renderPlainEditor(block, scope, val);
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

  const renderScopeTabs = (
    blockKey: string,
    scopes: ContentScope[],
    activeScope: ContentScope,
    panel: ReactNode,
  ) => (
    <div className="hub-scope-tabs" data-testid={`scope-tabs-${blockKey}`}>
      <div className="hub-scope-tablist" role="tablist" aria-label="App scope">
        {scopes.map((scope) => {
          const selected = scope === activeScope;
          const dirty = scopeHasDraft(scope, blockKey, drafts);
          return (
            <button
              key={scope}
              type="button"
              role="tab"
              aria-selected={selected}
              data-testid={`scope-tab-${blockKey}-${scope}`}
              className={`hub-scope-tab${selected ? ' hub-scope-tab--active' : ''}`}
              onClick={() => setBlockScopeTab((prev) => ({ ...prev, [blockKey]: scope }))}
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

  const renderBlock = (block: ContentBlock): ReactNode => {
    if (isSeoDescriptionKey(block.key)) {
      const titleKey = block.key === 'meta_description'
        ? 'meta_title'
        : block.key.replace(/_meta_description$/, '_meta_title');
      if (contentBlocks.some((c) => c.key === titleKey)) return null;
    }

    // Operational / Business Details ownership — never show an editable Save path.
    if (block.managed_by) {
      const display =
        block.managed_by.current_value
        ?? (hubApp === 'order_app' ? block.resolved_order_app : block.resolved_website)
        ?? '';
      return (
        <BlockCard
          key={`${block.key}-${locale}`}
          block={block}
          locale={locale}
          editor={(
            <OpsOwnedSummary
              managedBy={block.managed_by}
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
        block.key,
        scopes,
        activeScope,
        renderEditorForScope(block, activeScope),
      );
    } else {
      editorContent = renderEditorForScope(block, activeScope);
    }

    // Overview → Edit on every device: forms live in the focused sheet, not on cards.
    const useCompact = !isBoolean;
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

  const buildSectionContent = (sectionName: string, withBack: boolean) => {
    const sectionBlocks = blocksForContentView(sectionName, contentBlocks);
    const sectionEnableBlocks = sectionBlocks.filter((b) => b.section_enable);
    const regularBlocks = sectionBlocks.filter((b) => !b.section_enable);
    const isBrandKit = sectionName === 'Branding';
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

    const hoursOpsBanner = sectionName === 'Opening hours' ? (
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

    const announcementDualGateBanner = sectionName === 'Announcements' ? (
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
          onClick={() => handleSectionSelect(
            'Homepage',
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

    // Homepage: page_blocks layout editor. Off Homepage it unmounts — unified
    // Publish/Discard use publishLayoutDraftsViaApi / discardLayoutDraftsViaApi.
    const chrome: ReactNode =
      sectionName === 'Homepage' ? (
        <HomeLayoutEditor
          ref={homeLayoutEditorRef}
          initialApp={homeLayoutApp}
          surfaceFilter={surfaceFilter ?? undefined}
          onLayoutDraftChange={handleLayoutDraftChange}
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
    // The Homepage layout editor replaces per-section enable cards.
    const isHomeLayout = sectionName === 'Homepage';
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
        onBack={withBack ? handleMobileBack : undefined}
        isBrandKit={isBrandKit}
        cardCount={cardCount}
        showHeader={withBack}
      />
    );
  };

  const activeEditorTitle = activeGroup
    ? (websitePageTaskByGroup(activeGroup)?.title ?? activeGroup)
    : 'Section';

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
              {loading ? skeleton : taskLanding}
            </div>

            {/* Section editor — full-screen sheet (not an inline push) */}
            <ContentEditorSheet
              open={!loading && mobileEditorOpen && Boolean(activeGroup)}
              title={activeEditorTitle}
              onClose={handleMobileBack}
              status={draftStatusNode}
              layer={0}
              testId="content-editor-sheet"
              headerActions={(
                <div className="hub-sheet-header-actions">
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
                  <button
                    type="button"
                    data-testid="preview-sheet-btn"
                    className="hub-sheet-preview-btn"
                    onClick={() => setPreviewSheetOpen(true)}
                  >
                    <Eye size={16} /> Preview
                  </button>
                  <button
                    type="button"
                    className="hub-more-trigger"
                    data-testid="hub-sheet-more-btn"
                    onClick={() => setMoreMenuOpen(true)}
                    aria-expanded={moreMenuOpen}
                    aria-label="More actions"
                  >
                    <MoreHorizontal size={16} />
                  </button>
                </div>
              )}
              footer={effectiveDirtyCount > 0 ? (
                <Btn
                  onClick={() => void publish()}
                  disabled={saving}
                  style={{ width: '100%' }}
                  data-testid="publish-live-btn-sheet"
                  className="content-studio-publish-sticky"
                >
                  <Save size={16} /> {saving ? `Publishing ${hubLabel}…` : `Publish ${hubLabel}`}
                </Btn>
              ) : undefined}
            >
              {dirtyCount > 0 ? (
                <div style={{ marginBottom: 12 }} data-testid="content-editor-schedule-slot">
                  {schedulePublishPanel}
                </div>
              ) : null}
              {activeGroup ? buildSectionContent(activeGroup, false) : null}
            </ContentEditorSheet>

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
          </div>
        ) : (
          /* ── Desktop layout ─────────────────────────────────────────────── */
          <div
            className={`hub-desktop-shell${railCollapsed ? ' hub-desktop-shell--rail-collapsed' : ''}${desktopPreviewOpen ? '' : ' hub-desktop-shell--preview-off'}`}
            data-testid="hub-desktop-shell"
            data-preview={desktopPreviewOpen ? 'on' : 'off'}
            data-rail={railCollapsed ? 'collapsed' : 'expanded'}
          >
            <SectionRail
              variant="rail"
              sections={railSections}
              active={activeGroup}
              onSelect={handleSectionSelect}
              collapsed={railCollapsed}
              onToggleCollapsed={() => setRailCollapsedPersisted(!railCollapsed)}
            />

            <div className="hub-editor-area" data-testid="hub-editor-area">
              {loading
                ? skeleton
                : activeGroup
                  ? buildSectionContent(activeGroup, true)
                  : taskLanding}
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

        {/* Focused block editor — Overview → Edit (mobile sheet / desktop drawer) */}
        {(() => {
          const editBlock = mobileBlockEditorKey
            ? contentBlocks.find((b) => b.key === mobileBlockEditorKey)
            : null;
          if (!editBlock) return null;
          const scopes = editorScopesForBlock(editBlock, hubApp);
          const activeScope = preferredScopeTab(scopes, blockScopeTab[editBlock.key]);
          const val = valueForScope(editBlock, activeScope, drafts);
          const isHero = editBlock.editor === 'hero';
          const editorBody = isHero
            ? renderVisualEditor(editBlock, activeScope, val, {
              mobileMode: true,
              scheduleSlot: dirtyCount > 0 ? schedulePublishPanel : undefined,
            })
            : renderEditorForScope(editBlock, activeScope);
          return (
            <ContentEditorSheet
              open
              title={`Edit ${editBlock.label}`}
              onClose={() => setMobileBlockEditorKey(null)}
              status={draftStatusNode}
              layer={1}
              testId={isHero ? 'hero-editor-sheet' : `block-editor-sheet-${editBlock.key}`}
              footer={effectiveDirtyCount > 0 ? (
                <Btn
                  onClick={() => void publish()}
                  disabled={saving || autosaveFailed}
                  style={{ width: '100%' }}
                  data-testid="publish-live-btn-block-sheet"
                >
                  <Save size={16} /> {saving ? `Publishing ${hubLabel}…` : publishFailed ? 'Publish failed — Try again' : `Publish ${hubLabel}`}
                </Btn>
              ) : undefined}
            >
              <>
                {dirtyCount > 0 ? (
                  <div style={{ marginBottom: 12 }} data-testid="block-editor-schedule-slot">
                    {schedulePublishPanel}
                  </div>
                ) : null}
                {scopes.length > 1
                  ? renderScopeTabs(editBlock.key, scopes, activeScope, editorBody)
                  : editorBody}
              </>
            </ContentEditorSheet>
          );
        })()}

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
