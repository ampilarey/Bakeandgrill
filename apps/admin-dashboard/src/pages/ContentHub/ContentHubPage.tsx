import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertCircle, CheckCircle2, Download, Eye, MoreHorizontal, Save, Search, Upload as UploadIcon, X,
} from 'lucide-react';
import {
  cancelContentSchedule,
  createContentPreviewToken,
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
import { PageHeader, PageShell, Btn } from '../../components/SharedUI';
import {
  AboutValuesEditor,
  BusinessHoursEditor,
  CategoriesEditor,
  FooterLinksEditor,
  HeroSlidesEditor,
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
import { BrandKitCards, brandKitWriteScope } from './BrandKitCards';
import { BRAND_KIT_KEYS } from './brandKitConfig';
import { BlockCard, scopesLabelFor } from './BlockCard';
import { HomeLayoutEditor } from './HomeLayoutEditor';
import { SectionRail } from './SectionRail';
import { SectionEditor } from './SectionEditor';
import { PreviewPane } from './PreviewPane';
import { orderSectionNames } from './hubLayoutConfig';
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
const PREVIEW_DEFAULT_MIN_WIDTH = 1600;

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
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const uploadCtx = useRef<{
    blockKey: string;
    scope: ContentScope;
    onDone: (url: string) => void;
  } | null>(null);
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

  // Sync URL group param → activeGroup (but not mobileEditorOpen)
  useEffect(() => {
    if (urlGroup) setActiveGroup(urlGroup);
  }, [urlGroup]);

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

  // Once blocks load with no active group, default to first section
  const contentBlocks = useMemo(
    () => blocks.filter((block) => !isDeprecatedBlock(block)),
    [blocks],
  );

  const orderedSectionNames = useMemo(() => {
    const present = Array.from(new Set(contentBlocks.map((b) => b.group)));
    return orderSectionNames(present);
  }, [contentBlocks]);

  useEffect(() => {
    if (!loading && contentBlocks.length > 0 && !activeGroup && !urlGroup) {
      const first = orderedSectionNames[0];
      if (first) setActiveGroup(first);
    }
  }, [loading, contentBlocks, activeGroup, urlGroup, orderedSectionNames]);

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
        ? createContentPreviewToken('website', websiteOverrides, locale)
        : Promise.resolve(null);
      const orderReq = Object.keys(orderOverrides).length > 0
        ? createContentPreviewToken('order_app', orderOverrides, locale)
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

  const selectGroup = (next: string) => {
    setActiveGroup(next);
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.delete('section');
      p.set('group', next);
      return p;
    }, { replace: true });
  };

  const handleSectionSelect = (name: string) => {
    selectGroup(name);
    setMobileEditorOpen(true);
  };

  const handleMobileBack = () => {
    setMobileEditorOpen(false);
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.delete('group');
      p.delete('section');
      return p;
    }, { replace: true });
  };

  const publish = async () => {
    const changes = collectChanges(drafts, locale);
    if (changes.length === 0) return;
    setSaving(true);
    try {
      const { blocks: nextBlocks } = await updateContent(changes, locale);
      setBlocks(nextBlocks);
      saveGeneration.current += 1;
      replaceLocaleDrafts(locale, {});
      setLocaleSynced(locale, true);
      setLocaleLastSavedAt(locale, new Date().toISOString());
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

  const chooseShareSource = (block: ContentBlock): ContentScope | null => {
    const choices: Array<{ scope: ContentScope; label: string }> = [
      { scope: 'website', label: 'Website' },
      { scope: 'order_app', label: 'Order app' },
    ];
    if (sharedSourceAvailable(block, drafts)) {
      choices.push({ scope: 'shared', label: 'Shared' });
    }

    const message = [
      'Make this block the same in both apps. Copy which source?',
      ...choices.map((choice, index) => `${index + 1}. ${choice.label}`),
    ].join('\n');
    const raw = window.prompt(message, choices[0]?.label ?? 'Website');
    if (raw === null) return null;
    const normalized = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
    const numeric = Number.parseInt(normalized, 10);
    if (Number.isFinite(numeric) && choices[numeric - 1]) {
      return choices[numeric - 1].scope;
    }
    const matched = choices.find((choice) => (
      choice.scope === normalized
      || choice.label.toLowerCase().replace(/\s+/g, '_') === normalized
      || (choice.scope === 'website' && normalized === 'web')
      || (choice.scope === 'order_app' && normalized === 'order')
      || (choice.scope === 'shared' && normalized === 'both')
    ));
    if (matched) return matched.scope;
    error('Choose Website, Order app, or Shared as the source.');
    return null;
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
    const source = next === 'same' ? chooseShareSource(block) : null;
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
      const sectionBlockKeys = new Set(contentBlocks.filter((b) => b.group === name).map((b) => b.key));
      const dirty = Object.keys(drafts).some((dk) => {
        const parsed = parseDraftKey(dk);
        return parsed && sectionBlockKeys.has(parsed.key);
      });
      return {
        name,
        count: contentBlocks.filter((b) => b.group === name).length,
        dirty,
      };
    });
  }, [orderedSectionNames, contentBlocks, drafts]);

  // ── Search (label only) ────────────────────────────────────────────────────

  const searchResults = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    return contentBlocks
      .filter((b) => b.label.toLowerCase().includes(needle))
      .slice(0, 12)
      .map((b) => ({ block: b, sectionName: b.group }));
  }, [contentBlocks, q]);

  const handleSearchSelect = (block: ContentBlock) => {
    selectGroup(block.group);
    setMobileEditorOpen(true);
    setQ('');
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
          {isHero ? 'Website & order app' : 'Content'}
        </div>
        {isHero ? (
          <p className="hub-content-mode-hint">
            Same banners everywhere, or different slides on the website vs the order app.
          </p>
        ) : null}
        <div className="hub-content-mode-options" role="radiogroup" aria-label="Content mode">
          {(['same', 'different'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={state === mode}
              aria-label={mode === 'same' ? 'Same in both' : 'Different per app'}
              disabled={busy}
              className={`hub-content-mode-option${state === mode ? ' hub-content-mode-option--active' : ''}`}
              data-testid={`content-mode-${block.key}-${mode}`}
              onClick={() => void changeContentMode(block, mode)}
            >
              <span className="hub-content-mode-dot" aria-hidden />
              {mode === 'same' ? 'Same in both' : 'Different per app'}
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

  const renderVisualEditor = (block: ContentBlock, scope: ContentScope, val: string) => {
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
          or switch to “Same in both” if you meant to use the shared version.
        </div>
      </div>
    ) : null;

    const wrappedEditor = (
      <>
        {emptyArrayBanner}
        {editorContent}
      </>
    );

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
      />
    );
  };

  // ── Build section editor content ───────────────────────────────────────────

  const buildSectionContent = (sectionName: string, withBack: boolean) => {
    const sectionBlocks = contentBlocks.filter((b) => b.group === sectionName);
    const sectionEnableBlocks = sectionBlocks.filter((b) => b.section_enable);
    const regularBlocks = sectionBlocks.filter((b) => !b.section_enable);
    const isBrandKit = sectionName === 'Branding';

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

    // Homepage: the page_blocks layout editor is the only arrangement control.
    // The legacy home_section_order / section_*_enabled keys were retired in
    // Stage F, so there is nothing left to disagree with it.
    const chrome: ReactNode =
      sectionName === 'Homepage' ? (
        <HomeLayoutEditor />
      ) : sectionEnableBlocks.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sectionEnableBlocks.map(renderSectionEnable)}
        </div>
      ) : null;

    const brandKit: ReactNode =
      isBrandKit && brandBlocksByKey.size > 0 ? (
        <BrandKitCards
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
        blocks={leftoverBrandBlocks}
        chrome={chrome}
        brandKit={brandKit}
        renderBlock={renderBlock}
        onBack={withBack ? handleMobileBack : undefined}
        isBrandKit={isBrandKit}
        cardCount={cardCount}
      />
    );
  };

  // ── Header actions ─────────────────────────────────────────────────────────

  const headerActions = (
    <div className="hub-header-actions">
      {/* Search */}
      <div className="hub-search-wrap" ref={searchRef}>
        <div className="hub-search-input-row">
          <Search size={14} className="hub-search-icon" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by label…"
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
                onClick={() => handleSearchSelect(block)}
              >
                <span className="hub-search-result-section">{sectionName}</span>
                <span className="hub-search-result-label">{block.label}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* Locale */}
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

      {/* Publish status — unpublished must not read as “done” */}
      <span
        data-testid="draft-save-status"
        className={`hub-draft-status${dirtyCount > 0 ? ' hub-draft-status--unpublished' : ' hub-draft-status--live'}`}
        role="status"
      >
        {dirtyCount > 0 ? (
          <>
            <AlertCircle size={14} aria-hidden className="hub-draft-status-icon" />
            <span className="hub-draft-status-text">
              <span className="hub-draft-status-primary">
                {dirtyCount} change{dirtyCount === 1 ? '' : 's'} not yet live
              </span>
              <span className="hub-draft-status-secondary">
                {autosaving
                  ? 'Saving… customers still see the old version'
                  : lastSavedAt
                    ? `Autosaved ${new Date(lastSavedAt).toLocaleTimeString()} — not live yet`
                    : 'Not live yet — customers still see the old version'}
              </span>
            </span>
          </>
        ) : (
          <>
            <CheckCircle2 size={14} aria-hidden className="hub-draft-status-icon" />
            <span className="hub-draft-status-text">
              <span className="hub-draft-status-primary">All published</span>
              <span className="hub-draft-status-secondary">Customers see the live version</span>
            </span>
          </>
        )}
      </span>

      {/* Desktop preview dock toggle — mobile keeps the sheet button */}
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

      {/* Publish — next step when there are unpublished changes */}
      <Btn
        onClick={() => void publish()}
        disabled={saving || dirtyCount === 0}
        className={`content-studio-publish-desktop${dirtyCount > 0 ? ' content-studio-publish-desktop--needed' : ''}`}
        data-testid="publish-live-btn"
      >
        <Save size={16} />
        {saving
          ? 'Publishing…'
          : dirtyCount > 0
            ? `Publish to make live (${dirtyCount})`
            : 'Publish'}
      </Btn>

      {/* ⋯ More */}
      <div className="hub-more-wrap" ref={moreMenuRef}>
        <Btn variant="secondary" onClick={() => setMoreMenuOpen((o) => !o)} aria-expanded={moreMenuOpen}>
          <MoreHorizontal size={16} /> ⋯ More
        </Btn>
        {moreMenuOpen ? (
          <div className="hub-more-menu" role="menu">
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
            <div className="hub-more-schedule">
              <div className="hub-more-schedule-label">Schedule publish</div>
              <input
                type="datetime-local"
                value={scheduleAt}
                onChange={(e) => setScheduleAt(e.target.value)}
                className="hub-more-schedule-input"
              />
              <button
                type="button"
                onClick={() => { void schedulePublish(); setMoreMenuOpen(false); }}
                disabled={saving || dirtyCount === 0 || !scheduleAt}
                className="hub-more-schedule-btn"
              >
                Schedule
              </button>
            </div>
            <button
              type="button"
              role="menuitem"
              className="hub-more-item"
              onClick={() => { setMediaOpen(true); setMoreMenuOpen(false); }}
            >
              Media library
            </button>
          </div>
        ) : null}
      </div>
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
          subtitle="Website + order app copy, branding & visuals"
          action={headerActions}
        />

        <input ref={fileInputRef} type="file" accept="image/*,.heic,.heif" style={{ display: 'none' }} onChange={(e) => void handleEmbedFile(e)} />
        <input ref={importInputRef} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={(e) => void doImport(e)} />

        {schedulesBanner}

        {isMobile ? (
          /* ── Mobile layout ──────────────────────────────────────────────── */
          <div className="hub-mobile-shell">
            {/* SectionRail grid: always in DOM; hidden via CSS when editor open */}
            <div className={`hub-mobile-overview${mobileEditorOpen ? ' hub-mobile-hidden' : ''}`}>
              {loading ? skeleton : (
                <SectionRail
                  variant="grid"
                  sections={railSections}
                  active={activeGroup}
                  onSelect={handleSectionSelect}
                />
              )}
            </div>

            {/* SectionEditor */}
            {!loading && mobileEditorOpen && activeGroup
              ? buildSectionContent(activeGroup, true)
              : null}

            {/* Floating preview button */}
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

            {/* Preview sheet */}
            <PreviewPane
              variant="sheet"
              websiteUrl={previewState.website}
              orderAppUrl={previewState.orderApp}
              loading={previewLoading}
              open={previewSheetOpen}
              onClose={() => setPreviewSheetOpen(false)}
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
                  ? buildSectionContent(activeGroup, false)
                  : null}
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

        {/* Sticky mobile publish bar — same “not live yet” wording as header */}
        {dirtyCount > 0 ? (
          <div className="content-studio-sticky-bar" role="region" aria-label="Changes not yet live">
            <span className="content-studio-sticky-bar-label">
              {dirtyCount} change{dirtyCount === 1 ? '' : 's'} not yet live
            </span>
            <Btn
              onClick={() => void publish()}
              disabled={saving}
              style={{ flex: 1 }}
              data-testid="publish-live-btn-mobile"
              className="content-studio-publish-sticky"
            >
              <Save size={16} /> {saving ? 'Publishing…' : `Publish to make live (${dirtyCount})`}
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
