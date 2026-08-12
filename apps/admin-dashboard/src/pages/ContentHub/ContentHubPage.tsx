import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertCircle, Download, Eye, MoreHorizontal, Save, Search, Upload as UploadIcon, X,
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
  copyContentBlock,
  shareContentBlock,
  splitContentBlock,
  updateContent,
  uploadContentImage,
  uploadContentVideo,
  type ContentApp,
  type ContentBlock,
  type ContentDraftAction,
  type ContentLocale,
  type ContentRevision,
  type ContentScheduleRow,
  type ContentScope,
} from '../../api/content';
import {
  discardPageBlockDraft,
  fetchAdminPageBlocks,
  publishPageBlocks,
} from '../../api/pageBlocks';
import { PageHeader, PageShell, Btn } from '../../components/SharedUI';
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
import { BrandKitCards, brandKitWriteScope } from './BrandKitCards';
import { BRAND_KIT_KEYS } from './brandKitConfig';
import { BlockCard, scopesLabelFor } from './BlockCard';
import { HomeLayoutEditor, type HomeLayoutEditorHandle } from './HomeLayoutEditor';
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
import { useIsMobile } from '../../hooks/useIsMobile';
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
/** Open the docked preview by default on typical desktop widths. */
const PREVIEW_DEFAULT_MIN_WIDTH = 1280;

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

function collectChanges(drafts: DraftMap, locale: ContentLocale): DraftChange[] {
  return Object.entries(drafts)
    .map(([composite, value]) => {
      const parsed = parseDraftKey(composite);
      if (!parsed) return null;
      return { key: parsed.key, scope: parsed.scope, value, locale };
    })
    .filter((change): change is DraftChange => Boolean(change));
}

function isDualAppBlock(block: ContentBlock): boolean {
  return block.apps.includes('website') && block.apps.includes('order_app');
}

function isAlwaysSynced(block: ContentBlock): boolean {
  return block.group === 'Branding' || Boolean(block.brand_synced);
}

function linkState(block: ContentBlock): 'same' | 'different' {
  if (block.link_state) return block.link_state;
  return block.state === 'split' ? 'different' : 'same';
}

function canChooseContentMode(block: ContentBlock): boolean {
  return isDualAppBlock(block) && block.shareable && !isAlwaysSynced(block);
}

function uploadAppFor(scope: ContentScope): ContentApp {
  return scope === 'order_app' ? 'order_app' : 'website';
}

function labelForScope(scope: ContentScope): string {
  if (scope === 'order_app') return 'Order app';
  if (scope === 'website') return 'Website';
  return 'Both';
}

function otherAppScope(scope: ContentScope): ContentScope {
  return scope === 'website' ? 'order_app' : 'website';
}

function baseValueForScope(block: ContentBlock, scope: ContentScope): string {
  if (scope === 'shared') {
    return block.shared ?? block.resolved_website ?? block.resolved_order_app ?? block.default ?? '';
  }
  if (scope === 'website') {
    return block.website ?? block.resolved_website ?? block.shared ?? block.default ?? '';
  }
  return block.order_app ?? block.resolved_order_app ?? block.shared ?? block.default ?? '';
}

function valueForScope(block: ContentBlock, scope: ContentScope, drafts: DraftMap): string {
  const key = draftKey(scope, block.key);
  if (drafts[key] !== undefined) return drafts[key];
  return baseValueForScope(block, scope);
}

function editorScopesForBlock(block: ContentBlock): ContentScope[] {
  if (isAlwaysSynced(block)) return ['shared'];
  if (isDualAppBlock(block)) {
    if (block.shareable && linkState(block) === 'same') return ['shared'];
    return ['website', 'order_app'];
  }
  if (block.apps.includes('order_app')) return ['order_app'];
  return ['website'];
}

function preferredScopeTab(scopes: ContentScope[], preferred?: ContentScope): ContentScope {
  if (preferred && scopes.includes(preferred)) return preferred;
  if (scopes.includes('website')) return 'website';
  return scopes[0];
}

function scopeHasDraft(scope: ContentScope, key: string, drafts: DraftMap): boolean {
  return drafts[draftKey(scope, key)] !== undefined;
}

function blockDraftScopes(block: ContentBlock, drafts: DraftMap): ContentScope[] {
  return ALL_SCOPES.filter((scope) => scopeHasDraft(scope, block.key, drafts));
}

function presentValue(value: string | null | undefined): boolean {
  return value !== null && value !== undefined && value !== '';
}

function sharedSourceAvailable(block: ContentBlock, drafts: DraftMap): boolean {
  return presentValue(storedValueForScope(block, 'shared', drafts));
}

/** Stored/draft value for a scope only — does not fall through to shared. */
function storedValueForScope(
  block: ContentBlock,
  scope: ContentScope,
  drafts: DraftMap,
): string | null {
  const key = draftKey(scope, block.key);
  if (drafts[key] !== undefined) return drafts[key];
  if (scope === 'website') return block.website;
  if (scope === 'order_app') return block.order_app;
  return block.shared;
}

function isEmptyJsonArrayValue(value: string | null | undefined): boolean {
  if (value === null || value === undefined) return false;
  const trimmed = value.trim();
  if (trimmed === '') return false;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return Array.isArray(parsed) && parsed.length === 0;
  } catch {
    return false;
  }
}

function isNonEmptyJsonArrayValue(value: string | null | undefined): boolean {
  if (value === null || value === undefined) return false;
  try {
    const parsed = JSON.parse(value.trim()) as unknown;
    return Array.isArray(parsed) && parsed.length > 0;
  } catch {
    return false;
  }
}

/**
 * App-scoped empty JSON arrays are deliberate "show nothing" overrides (see
 * ContentResolver). Warn when that hides a non-empty shared value.
 */
function emptyArrayMasksShared(
  block: ContentBlock,
  scope: ContentScope,
  drafts: DraftMap,
): boolean {
  if (block.type !== 'json') return false;
  if (scope !== 'website' && scope !== 'order_app') return false;
  const scoped = storedValueForScope(block, scope, drafts);
  if (!isEmptyJsonArrayValue(scoped)) return false;
  const shared = storedValueForScope(block, 'shared', drafts)
    ?? block.shared
    ?? null;
  return isNonEmptyJsonArrayValue(shared);
}

function isDeprecatedBlock(block: ContentBlock): boolean {
  return Boolean(block.deprecated) || /^hero_slide_[123]$/.test(block.key);
}

function latestIso(values: Array<string | null | undefined>): string | null {
  const sorted = values
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  return sorted[0] ?? null;
}

export function ContentHubPage() {
  usePageTitle('Content & Branding');
  const { success, error } = useToast();
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlGroup = (searchParams.get('group') || searchParams.get('section') || '').trim();

  const [blocks, setBlocks] = useState<ContentBlock[]>([]);
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
  const [serverDraftSyncedByLocale, setServerDraftSyncedByLocale] = useState<LocaleMetaMap<boolean>>(() => ({ ...TRUE_BY_LOCALE }));
  const [mediaOpen, setMediaOpen] = useState(false);
  const [linkingKey, setLinkingKey] = useState<string | null>(null);
  /** Inline "make it the same" source-picker modal (replaces window.prompt). */
  const [shareSourceModal, setShareSourceModal] = useState<{
    block: ContentBlock;
    choices: Array<{ scope: ContentScope; label: string }>;
    selected: ContentScope;
  } | null>(null);
  const shareSourceResolveRef = useRef<((scope: ContentScope | null) => void) | null>(null);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  /** Mobile: which visual block is open in a nested editor sheet. */
  const [mobileBlockEditorKey, setMobileBlockEditorKey] = useState<string | null>(null);
  const [searchOverlayOpen, setSearchOverlayOpen] = useState(false);
  /** Homepage layout draft — merged into global publish status. */
  const [layoutDraft, setLayoutDraft] = useState(false);
  /** Component counts per surface for the landing overview. */
  const [surfaceCounts, setSurfaceCounts] = useState<Record<string, number>>({});

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
      const [blockRes, scheduleRes, sharedDrafts, websiteDrafts, orderDrafts] = await Promise.all([
        getContentBlocks(loc),
        getContentSchedules('pending'),
        getContentDrafts('shared', loc).catch(() => ({ drafts: {} as Record<string, string>, saved_at: null })),
        getContentDrafts('website', loc).catch(() => ({ drafts: {} as Record<string, string>, saved_at: null })),
        getContentDrafts('order_app', loc).catch(() => ({ drafts: {} as Record<string, string>, saved_at: null })),
      ]);
      if (gen !== loadGen.current) return;
      const restored: DraftMap = {};
      for (const [key, value] of Object.entries(sharedDrafts.drafts || {})) {
        restored[draftKey('shared', key)] = value;
      }
      for (const [key, value] of Object.entries(websiteDrafts.drafts || {})) {
        restored[draftKey('website', key)] = value;
      }
      for (const [key, value] of Object.entries(orderDrafts.drafts || {})) {
        restored[draftKey('order_app', key)] = value;
      }
      const hadUnsyncedLocal = serverDraftSyncedByLocaleRef.current[loc] === false;
      const nextDrafts = hadUnsyncedLocal
        ? { ...restored, ...(draftsByLocaleRef.current[loc] ?? {}) }
        : restored;
      setBlocks(blockRes.blocks);
      setSchedules(scheduleRes.schedules);
      replaceLocaleDrafts(loc, nextDrafts);
      setLocaleLastSavedAt(loc, latestIso([sharedDrafts.saved_at, websiteDrafts.saved_at, orderDrafts.saved_at]));
      setLocaleSynced(loc, !hadUnsyncedLocal);
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
  }, [locale]);

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
        setLayoutDraft(Boolean(w.draft) || Boolean(o.draft));
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
  }, []);

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
  const contentBlocks = useMemo(
    () => blocks.filter((block) => !isDeprecatedBlock(block)),
    [blocks],
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

  const dirtyCount = useMemo(() => Object.keys(drafts).length, [drafts]);
  const hasUnsaved = dirtyCount > 0 && !serverDraftSynced;

  const setDraft = (scope: ContentScope, key: string, value: string) => {
    const loc = locale;
    saveGeneration.current += 1;
    updateLocaleDrafts(loc, (prev) => ({ ...prev, [draftKey(scope, key)]: value }));
    setLocaleSynced(loc, false);
  };

  // Preview tokens — one per app so website/order drafts overlay correctly.
  useEffect(() => {
    const t = window.setTimeout(() => {
      const websiteOverrides: Record<string, string> = {};
      const orderOverrides: Record<string, string> = {};
      for (const block of contentBlocks) {
        const scopes = editorScopesForBlock(block);
        if (block.apps.includes('website')) {
          const previewScope = scopes.includes('website')
            ? 'website'
            : (scopes.includes('shared') ? 'shared' : scopes[0]);
          websiteOverrides[block.key] = valueForScope(block, previewScope, drafts);
        }
        if (block.apps.includes('order_app')) {
          const previewScope = scopes.includes('order_app')
            ? 'order_app'
            : (scopes.includes('shared') ? 'shared' : scopes[0]);
          orderOverrides[block.key] = valueForScope(block, previewScope, drafts);
        }
      }
      if (Object.keys(websiteOverrides).length === 0 && Object.keys(orderOverrides).length === 0) {
        return;
      }
      setPreviewLoading(true);
      const websiteReq = Object.keys(websiteOverrides).length > 0
        ? createContentPreviewToken('website', websiteOverrides, locale, true)
        : Promise.resolve(null);
      const orderReq = Object.keys(orderOverrides).length > 0
        ? createContentPreviewToken('order_app', orderOverrides, locale, true)
        : Promise.resolve(null);
      void Promise.all([websiteReq, orderReq])
        .then(([websiteRes, orderRes]) => {
          setPreviewState({
            website: websiteRes?.website_url || null,
            orderApp: orderRes?.order_app_url || null,
          });
        })
        .catch(() => {
          setPreviewState({ website: null, orderApp: null });
          error('Could not load live preview. Try again.');
        })
        .finally(() => setPreviewLoading(false));
    }, 600);
    return () => window.clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafts, contentBlocks, locale]);

  // Autosave
  useEffect(() => {
    if (dirtyCount === 0 || serverDraftSynced) return;
    const t = window.setTimeout(() => {
      const loc = locale;
      const gen = saveGeneration.current;
      const changes = collectChanges(draftsByLocaleRef.current[loc] ?? {}, loc);
      if (changes.length === 0) return;
      setAutosaving(true);
      void saveContentDrafts(changes, loc)
        .then((res) => {
          if (gen !== saveGeneration.current) return;
          setLocaleLastSavedAt(loc, res.saved_at);
          setLocaleSynced(loc, true);
        })
        .catch(() => { /* keep local changes */ })
        .finally(() => {
          const stillHasDrafts = collectChanges(draftsByLocaleRef.current[loc] ?? {}, loc).length > 0;
          if (gen === saveGeneration.current || !stillHasDrafts) setAutosaving(false);
        });
    }, 2500);
    return () => window.clearTimeout(t);
  }, [drafts, dirtyCount, serverDraftSynced, locale]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!hasUnsaved && dirtyCount === 0) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasUnsaved, dirtyCount]);

  // More menu click-outside
  useEffect(() => {
    if (!moreMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!moreMenuRef.current?.contains(e.target as Node)) setMoreMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [moreMenuOpen]);

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

  const homeLayoutApp = searchParams.get('homeApp') === 'order_app' ? 'order_app' as const : 'website' as const;
  const surfaceFilter = parseSurfaceId(searchParams.get('surface')?.trim() ?? '');

  const handleMobileBack = () => {
    clearActiveGroup();
  };

  /** Publish layout drafts even when HomeLayoutEditor is unmounted (other sections). */
  const publishLayoutDraftsViaApi = async () => {
    if (homeLayoutEditorRef.current) {
      await homeLayoutEditorRef.current.publishAll();
      return;
    }
    for (const app of ['website', 'order_app'] as const) {
      const res = await fetchAdminPageBlocks(app);
      if (!res.draft) continue;
      await publishPageBlocks({ app, version: res.version ?? 0 });
    }
    setLayoutDraft(false);
  };

  const discardLayoutDraftsViaApi = async () => {
    if (homeLayoutEditorRef.current) {
      await homeLayoutEditorRef.current.discardAll();
      return;
    }
    for (const app of ['website', 'order_app'] as const) {
      const res = await fetchAdminPageBlocks(app);
      if (!res.draft) continue;
      await discardPageBlockDraft({ app });
    }
    setLayoutDraft(false);
  };

  // Unified publish — content keys and the Homepage layout draft are two
  // separate backends, but staff think of "Publish" as one button.
  const publish = async () => {
    const changes = collectChanges(drafts, locale);
    if (changes.length === 0 && !layoutDraft) return;
    setSaving(true);
    try {
      if (changes.length > 0) {
        const { blocks: nextBlocks } = await updateContent(changes, locale);
        setBlocks(nextBlocks);
        saveGeneration.current += 1;
        replaceLocaleDrafts(locale, {});
        setLocaleSynced(locale, true);
        setLocaleLastSavedAt(locale, new Date().toISOString());
      }
      if (layoutDraft) {
        await publishLayoutDraftsViaApi();
      }
      success('Content published');
    } catch (e) {
      error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const schedulePublish = async () => {
    const changes = collectChanges(drafts, locale);
    if (changes.length === 0 || !scheduleAt) {
      error('Set a future time and make some edits first');
      return;
    }
    setSaving(true);
    try {
      await scheduleContent(new Date(scheduleAt).toISOString(), changes, locale);
      saveGeneration.current += 1;
      replaceLocaleDrafts(locale, {});
      setLocaleSynced(locale, true);
      setScheduleAt('');
      const { schedules: nextSchedules } = await getContentSchedules('pending');
      setSchedules(nextSchedules);
      success('Publish scheduled');
    } catch (e) {
      error(e instanceof Error ? e.message : 'Schedule failed');
    } finally {
      setSaving(false);
    }
  };

  const discardDraftActionForModeChange = (block: ContentBlock): ContentDraftAction | undefined | null => {
    const scopes = blockDraftScopes(block, drafts);
    if (scopes.length === 0) return undefined;
    const names = scopes.map(labelForScope).join(', ');
    return window.confirm(
      `${block.label} has unpublished ${locale.toUpperCase()} drafts for ${names}. Discard those drafts and change the mode?`,
    )
      ? 'discard'
      : null;
  };

  const chooseShareSource = (block: ContentBlock): Promise<ContentScope | null> => {
    const choices: Array<{ scope: ContentScope; label: string }> = [
      { scope: 'website', label: 'Website' },
      { scope: 'order_app', label: 'Order app' },
    ];
    if (sharedSourceAvailable(block, drafts)) {
      choices.push({ scope: 'shared', label: 'Shared' });
    }
    return new Promise((resolve) => {
      shareSourceResolveRef.current = resolve;
      setShareSourceModal({ block, choices, selected: choices[0]?.scope ?? 'website' });
    });
  };

  const resolveShareSourceModal = (scope: ContentScope | null) => {
    const resolve = shareSourceResolveRef.current;
    shareSourceResolveRef.current = null;
    setShareSourceModal(null);
    resolve?.(scope);
  };

  const discardBlockDrafts = (block: ContentBlock) => {
    saveGeneration.current += 1;
    updateLocaleDrafts(locale, (prev) => {
      const next = { ...prev };
      for (const scope of ALL_SCOPES) {
        delete next[draftKey(scope, block.key)];
      }
      return next;
    });
    setLocaleSynced(locale, true);
  };

  const changeContentMode = async (block: ContentBlock, next: 'same' | 'different') => {
    if (linkState(block) === next || linkingKey) return;
    const draftAction = discardDraftActionForModeChange(block);
    if (draftAction === null) return;
    const source = next === 'same' ? await chooseShareSource(block) : null;
    if (next === 'same' && !source) return;
    setLinkingKey(block.key);
    try {
      const { blocks: nextBlocks } = next === 'same'
        ? await shareContentBlock(block.key, locale, { source: source as ContentScope, ...(draftAction ? { draft_action: draftAction } : {}) })
        : (draftAction ? await splitContentBlock(block.key, locale, { draft_action: draftAction }) : await splitContentBlock(block.key, locale));
      if (!Array.isArray(nextBlocks) || nextBlocks.length === 0) {
        error('Could not update content mode — empty response');
        return;
      }
      setBlocks(nextBlocks);
      const updated = nextBlocks.find((b) => b.key === block.key);
      const nextState = updated ? linkState(updated) : null;
      if (nextState !== next) {
        error(
          next === 'different'
            ? 'Could not switch to different per app. Try again, or contact support if it keeps failing.'
            : 'Could not switch to same in both. Try again.',
        );
        return;
      }
      if (draftAction === 'discard') {
        discardBlockDrafts(block);
      }
      success(next === 'different'
        ? 'Website and order app can now differ — use the tabs below'
        : 'Same content on website and order app');
    } catch (e) {
      error(e instanceof Error ? e.message : 'Could not update content mode');
    } finally {
      setLinkingKey(null);
    }
  };

  const copyFromOtherApp = async (block: ContentBlock, from: ContentScope, to: ContentScope) => {
    const fromLabel = labelForScope(from);
    const toLabel = labelForScope(to);
    if (!window.confirm(`Replace the ${toLabel} value with the ${fromLabel} value?`)) {
      return;
    }
    try {
      const { blocks: nextBlocks } = await copyContentBlock(block.key, from, to, locale);
      setBlocks(nextBlocks);
      updateLocaleDrafts(locale, (prev) => {
        const next = { ...prev };
        delete next[draftKey(to, block.key)];
        return next;
      });
      success(`Copied from ${fromLabel}`);
    } catch (e) {
      error(e instanceof Error ? e.message : 'Copy failed');
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
      const bundle = await exportContent(locale);
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `content-hub-${locale}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      success('Export downloaded');
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
      const bundle = JSON.parse(text);
      if (!bundle?.entries) throw new Error('Invalid bundle');
      const { blocks: nextBlocks, applied } = await importContent(bundle);
      setBlocks(nextBlocks);
      success(`Imported ${applied} entries`);
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

  const renderContentModeControl = (block: ContentBlock) => {
    if (!canChooseContentMode(block)) return null;
    const state = linkState(block);
    const busy = linkingKey === block.key;
    const isHero = block.key === 'hero_slides';
    return (
      <div
        className={`hub-content-mode${isHero ? ' hub-content-mode--hero' : ''}`}
        data-testid={`content-mode-${block.key}`}
      >
        <div className="hub-content-mode-label">
          {isHero ? 'Where these banners appear' : 'Sharing'}
        </div>
        {isHero ? (
          <p className="hub-content-mode-hint">
            Share one set of banners, or customise separately for the website and order app.
            Customising creates a copy you can edit.
          </p>
        ) : (
          <p className="hub-content-mode-hint">
            Shared content stays in sync. Customising creates a copy for one app.
          </p>
        )}
        <div className="hub-content-mode-options" role="radiogroup" aria-label="Content sharing">
          {(['same', 'different'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={state === mode}
              aria-label={
                mode === 'same'
                  ? 'Shared with Website and Order App'
                  : 'Customise for Website and Order App'
              }
              disabled={busy}
              className={`hub-content-mode-option${state === mode ? ' hub-content-mode-option--active' : ''}`}
              data-testid={`content-mode-${block.key}-${mode}`}
              onClick={() => void changeContentMode(block, mode)}
            >
              <span className="hub-content-mode-dot" aria-hidden />
              {mode === 'same'
                ? 'Shared with Website and Order App'
                : 'Customise for each app'}
            </button>
          ))}
        </div>
      </div>
    );
  };

  const renderHistoryPanel = (block: ContentBlock, scope: ContentScope, currentValue: string) => {
    if (!historyTarget || historyTarget.key !== block.key || historyTarget.scope !== scope) return null;
    return (
      <div style={{ marginBottom: 12, padding: 12, borderRadius: 10, background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
          History · {historyTarget.label} · {locale}
        </div>
        {revisions.length === 0 ? <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-muted)' }}>No revisions yet.</p> : null}
        {revisions.map((revision) => (
          <div key={revision.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 10, fontSize: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: 'var(--color-text-muted)', marginBottom: 4 }}>{new Date(revision.created_at).toLocaleString()}</div>
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
      autosaving={autosaving}
      lastSavedAt={lastSavedAt}
      compact={isMobile}
    />
  );

  // Unified discard — mirrors publish() by clearing both the content drafts
  // (server + local) and the Homepage layout draft (via the editor's ref).
  const discardAllContentDrafts = async () => {
    const hasContentDrafts = dirtyCount > 0;
    if (!hasContentDrafts && !layoutDraft) return;
    const confirmMessage = hasContentDrafts && layoutDraft
      ? 'Discard unpublished content and layout drafts for this language?'
      : layoutDraft
        ? 'Discard unpublished Home layout drafts?'
        : 'Discard unpublished content drafts for this language?';
    if (!window.confirm(confirmMessage)) return;
    setSaving(true);
    try {
      if (hasContentDrafts) {
        await discardContentDrafts(locale);
      }
      saveGeneration.current += 1;
      replaceLocaleDrafts(locale, {});
      setLocaleSynced(locale, true);
      if (layoutDraft) {
        await discardLayoutDraftsViaApi();
      }
      success('Draft discarded');
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
    const scopes = editorScopesForBlock(block);
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
        {renderContentModeControl(block)}
        <div
          className={`hub-section-enable-switches${split ? ' hub-section-enable-switches--split' : ''}`}
        >
          {scopes.map((scope) => {
            const val = valueForScope(block, scope, drafts);
            const switchLabel = scope === 'shared'
              ? 'Show this section'
              : labelForScope(scope);
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

    const scopes = editorScopesForBlock(block);
    const isSplitEditors = scopes.length > 1;
    const activeScope = preferredScopeTab(scopes, blockScopeTab[block.key]);
    const activeValue = valueForScope(block, activeScope, drafts);
    const historyOpen =
      historyTarget?.key === block.key && historyTarget?.scope === activeScope;

    const modeControl = renderContentModeControl(block);
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

    const showCopyFromOtherApp = canChooseContentMode(block) && linkState(block) === 'different';
    const copyFromScope = otherAppScope(activeScope);

    const emptyOverrideScopes = (['website', 'order_app'] as const).filter((scope) =>
      emptyArrayMasksShared(block, scope, drafts),
    );
    const emptyArrayBanner = emptyOverrideScopes.length > 0 ? (
      <div
        className="hub-empty-array-warning"
        data-testid={`empty-array-override-${block.key}`}
        role="status"
      >
        <AlertCircle size={16} aria-hidden />
        <div>
          <strong>This app is set to show nothing</strong>
          {' — '}
          {emptyOverrideScopes.map((s) => labelForScope(s)).join(' & ')}
          {' '}
          has an empty list, so customers on
          {emptyOverrideScopes.length === 1 ? ' that app' : ' those apps'}
          {' '}
          will not see the shared content. That is intentional. Clear the empty list
          or switch to “Use shared version again” if you meant to use the shared version.
        </div>
      </div>
    ) : null;

    const wrappedEditor = (
      <>
        {emptyArrayBanner}
        {editorContent}
      </>
    );

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
        modeControl={modeControl}
        editor={wrappedEditor}
        booleanControl={booleanControl}
        onOpenHistory={() => void openHistory(block, activeScope)}
        historyOpen={historyOpen}
        historyPanel={renderHistoryPanel(block, activeScope, activeValue)}
        showCopyFromOtherApp={showCopyFromOtherApp}
        activeScope={activeScope}
        onCopyFromOtherScope={() => void copyFromOtherApp(block, copyFromScope, activeScope)}
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
      ? (valueForScope(siteNameBlock, 'shared', drafts) || siteNameBlock.resolved_website || 'Bake & Grill')
      : 'Bake & Grill';

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
        <strong>Two switches control the banner</strong>
        <p>
          The Announcement content toggle below must be on, and the Announcement
          component must be placed/enabled on the Website or Order App surface
          (Surface Builder → Header or Home). Both are required or nothing shows.
        </p>
        <button
          type="button"
          data-testid="announcement-open-surface-link"
          onClick={() => handleSectionSelect('Homepage', 'website', 'website.desktop.header')}
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
          Open Website header placement →
        </button>
      </div>
    ) : null;

    // Homepage: the page_blocks layout editor is the only arrangement control.
    // The legacy home_section_order / section_*_enabled keys were retired in
    // Stage F, so there is nothing left to disagree with it.
    // Keep HomeLayoutEditor mounted (hidden off Homepage) so unified Publish
    // can drive layout drafts from any section via the ref.
    // Homepage: the page_blocks layout editor is the only arrangement control.
    // When staff leave Homepage, the editor unmounts — unified Publish/Discard
    // fall back to page-blocks APIs (publishLayoutDraftsViaApi).
    const chrome: ReactNode =
      sectionName === 'Homepage' ? (
        <>
          <div
            role="note"
            data-testid="hub-shared-content-vs-placement-banner"
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'flex-start',
              padding: '10px 12px',
              marginBottom: 12,
              borderRadius: 10,
              border: '1px solid var(--color-border)',
              background: 'var(--color-bg)',
              fontSize: 12,
              color: 'var(--color-text-secondary)',
            }}
          >
            <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1, color: 'var(--color-text-muted)' }} aria-hidden />
            <span>
              Sharing a component&apos;s content (&ldquo;Same content in both&rdquo;) does not make it visible on
              the other app. Both switches need to be on: the content sharing switch above, and the
              component&apos;s own visibility/placement on that app&apos;s surface.
            </span>
          </div>
          <HomeLayoutEditor
            ref={homeLayoutEditorRef}
            initialApp={homeLayoutApp}
            surfaceFilter={surfaceFilter ?? undefined}
            onLayoutDraftChange={setLayoutDraft}
          />
        </>
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
          valueOf={(block) => valueForScope(block, brandKitWriteScope(block), drafts)}
          onSetValue={(block, value) => setDraft(brandKitWriteScope(block), block.key, value)}
          onUploadFile={(block, file) => onUpload(block, brandKitWriteScope(block), file)}
          onOpenLibrary={(block) => {
            const scope = brandKitWriteScope(block);
            uploadCtx.current = { blockKey: block.key, scope, onDone: (url) => setDraft(scope, block.key, url) };
            setMediaOpen(true);
          }}
          onOpenHistory={(block) => void openHistory(block, brandKitWriteScope(block))}
          historyPanel={(block) =>
            renderHistoryPanel(block, brandKitWriteScope(block), valueForScope(block, brandKitWriteScope(block), drafts))
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
    const changes = collectChanges(drafts, locale);
    if (changes.length === 0 || schedules.length === 0) return [] as ContentScheduleRow[];
    const changeKeys = new Set(changes.map((c) => `${c.key}::${c.scope}::${c.locale ?? locale}`));
    return schedules.filter((s) => changeKeys.has(`${s.key}::${s.scope}::${s.locale}`));
  }, [drafts, locale, schedules]);

  const schedulePublishPanel = (
    <div className="hub-more-schedule" data-testid="hub-schedule-publish">
      <div className="hub-more-schedule-label">Schedule publish</div>
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
          Discard draft
        </button>
      ) : null}
      <button
        type="button"
        role="menuitem"
        className="hub-more-item"
        onClick={() => { void doExport(); setMoreMenuOpen(false); }}
      >
        <Download size={14} /> Export
      </button>
      <button
        type="button"
        role="menuitem"
        className="hub-more-item"
        onClick={() => { importInputRef.current?.click(); setMoreMenuOpen(false); }}
      >
        <UploadIcon size={14} /> Import
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
          aria-pressed={desktopPreviewOpen}
          className={`hub-preview-toggle${desktopPreviewOpen ? ' hub-preview-toggle--on' : ''}`}
          onClick={() => setDesktopPreviewOpenPersisted(!desktopPreviewOpen)}
        >
          <Eye size={14} /> Preview
        </button>
      ) : null}

      {effectiveDirtyCount > 0 ? (
        <Btn
          onClick={() => void publish()}
          disabled={saving || effectiveDirtyCount === 0}
          className="content-studio-publish-desktop content-studio-publish-desktop--needed"
          data-testid="publish-live-btn"
          title={layoutDraft && dirtyCount === 0
            ? 'Publishes unpublished Home page layout changes'
            : undefined}
        >
          <Save size={16} />
          {saving ? 'Publishing…' : 'Publish changes'}
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
        >
          {moreMenuItems}
        </MobileActionSheet>
      ) : null}
    </div>
  );

  // ── Schedules banner ───────────────────────────────────────────────────────

  const schedulesBanner = schedules.length > 0 ? (
    <div className="hub-schedules-banner">
      <strong>{schedules.length}</strong> pending schedule{schedules.length === 1 ? '' : 's'}
      <ul style={{ margin: '8px 0 0', paddingLeft: 18, wordBreak: 'break-word' }}>
        {schedules.slice(0, 5).map((schedule) => (
          <li key={schedule.id} style={{ marginBottom: 4 }}>
            {schedule.key} · {labelForScope(schedule.scope)} · {schedule.locale} → {new Date(schedule.publish_at).toLocaleString()}
            {' '}
            <button
              type="button"
              onClick={() => void cancelContentSchedule(schedule.id).then(() => load()).catch((e) => error(e instanceof Error ? e.message : 'Cancel failed'))}
              style={{ background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, minHeight: 32 }}
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
      <div className={`content-studio-page hub-page${dirtyCount > 0 ? ' content-studio-page--dirty' : ''}`}>
        <PageHeader
          section="System"
          title="Content & Branding"
          subtitle="Edit what customers see — hero, brand, pages, and order app"
          action={headerActions}
        />

        <input ref={fileInputRef} type="file" accept="image/*,.heic,.heif" style={{ display: 'none' }} onChange={(e) => void handleEmbedFile(e)} />
        <input ref={importInputRef} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={(e) => void doImport(e)} />

        {schedulesBanner}

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
              footer={dirtyCount > 0 ? (
                <Btn
                  onClick={() => void publish()}
                  disabled={saving}
                  style={{ width: '100%' }}
                  data-testid="publish-live-btn-sheet"
                  className="content-studio-publish-sticky"
                >
                  <Save size={16} /> {saving ? 'Publishing…' : 'Publish changes'}
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

            {mobileEditorOpen ? (
              <button
                type="button"
                data-testid="preview-sheet-btn"
                className="hub-preview-float-btn"
                onClick={() => setPreviewSheetOpen(true)}
              >
                <Eye size={16} /> Preview
              </button>
            ) : null}

            <PreviewPane
              variant="sheet"
              websiteUrl={previewState.website}
              orderAppUrl={previewState.orderApp}
              loading={previewLoading}
              open={previewSheetOpen}
              onClose={() => setPreviewSheetOpen(false)}
              draftStatus={draftStatusNode}
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

            {desktopPreviewOpen ? (
              <PreviewPane
                variant="column"
                websiteUrl={previewState.website}
                orderAppUrl={previewState.orderApp}
                loading={previewLoading}
              />
            ) : null}
          </div>
        )}

        {/* Focused block editor — Overview → Edit (mobile sheet / desktop drawer) */}
        {(() => {
          const editBlock = mobileBlockEditorKey
            ? contentBlocks.find((b) => b.key === mobileBlockEditorKey)
            : null;
          if (!editBlock) return null;
          const scopes = editorScopesForBlock(editBlock);
          const activeScope = preferredScopeTab(scopes, blockScopeTab[editBlock.key]);
          const val = valueForScope(editBlock, activeScope, drafts);
          const isHero = editBlock.editor === 'hero';
          const emptyOverrideScopes = (['website', 'order_app'] as const).filter((scope) =>
            emptyArrayMasksShared(editBlock, scope, drafts),
          );
          const emptyArrayBanner = emptyOverrideScopes.length > 0 ? (
            <div
              className="hub-empty-array-warning"
              data-testid={`empty-array-override-${editBlock.key}`}
              role="status"
            >
              <AlertCircle size={16} aria-hidden />
              <div>
                <strong>This app is set to show nothing</strong>
                {' — '}
                {emptyOverrideScopes.map((s) => labelForScope(s)).join(' & ')}
                {' '}
                has an empty list, so customers on
                {emptyOverrideScopes.length === 1 ? ' that app' : ' those apps'}
                {' '}
                will not see the shared content. That is intentional. Clear the empty list
                or switch to “Use shared version again” if you meant to use the shared version.
              </div>
            </div>
          ) : null;
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
              footer={dirtyCount > 0 ? (
                <Btn
                  onClick={() => void publish()}
                  disabled={saving}
                  style={{ width: '100%' }}
                  data-testid="publish-live-btn-block-sheet"
                >
                  <Save size={16} /> {saving ? 'Publishing…' : 'Publish changes'}
                </Btn>
              ) : undefined}
            >
              <>
                {dirtyCount > 0 ? (
                  <div style={{ marginBottom: 12 }} data-testid="block-editor-schedule-slot">
                    {schedulePublishPanel}
                  </div>
                ) : null}
                {emptyArrayBanner}
                {renderContentModeControl(editBlock)}
                {scopes.length > 1
                  ? renderScopeTabs(editBlock.key, scopes, activeScope, editorBody)
                  : editorBody}
              </>
            </ContentEditorSheet>
          );
        })()}

        {/* Sticky mobile publish bar */}
        {effectiveDirtyCount > 0 && isMobile ? (
          <div className="content-studio-sticky-bar" role="region" aria-label="Draft saved — not live">
            <span className="content-studio-sticky-bar-label">
              Draft saved — not live
            </span>
            <Btn
              onClick={() => void publish()}
              disabled={saving}
              style={{ flex: 1 }}
              data-testid="publish-live-btn-mobile"
              className="content-studio-publish-sticky"
            >
              <Save size={16} /> {saving ? 'Publishing…' : 'Publish changes'}
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

        {shareSourceModal ? (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Make this the same in both apps"
            data-testid="share-source-modal"
            style={{
              position: 'fixed', inset: 0, zIndex: 1000,
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
            }}
          >
            <div
              onClick={() => resolveShareSourceModal(null)}
              aria-hidden="true"
              style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }}
            />
            <div
              style={{
                position: 'relative', width: '100%', maxWidth: 360, borderRadius: 14,
                background: 'var(--color-surface)', boxShadow: '0 8px 24px rgba(28,20,8,0.15)',
                padding: 20, display: 'flex', flexDirection: 'column', gap: 14,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--color-text)' }}>
                Make this the same in both apps
              </div>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)' }}>
                {shareSourceModal.block.label} will use the same content in both apps. Which version should we keep?
              </p>
              <div role="radiogroup" aria-label="Copy which source?" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {shareSourceModal.choices.map((choice) => (
                  <label
                    key={choice.scope}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}
                  >
                    <input
                      type="radio"
                      name="share-source"
                      value={choice.scope}
                      checked={shareSourceModal.selected === choice.scope}
                      onChange={() => setShareSourceModal((prev) => (prev ? { ...prev, selected: choice.scope } : prev))}
                      data-testid={`share-source-option-${choice.scope}`}
                    />
                    {choice.label}
                  </label>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => resolveShareSourceModal(null)}
                  data-testid="share-source-cancel"
                  style={{ height: 40, padding: '0 14px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-surface)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => resolveShareSourceModal(shareSourceModal.selected)}
                  data-testid="share-source-confirm"
                  style={{ height: 40, padding: '0 14px', borderRadius: 8, border: 'none', background: 'var(--color-primary)', color: 'var(--color-bg)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700 }}
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </PageShell>
  );
}

export default ContentHubPage;
