import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowDown, ArrowUp, Download, Eye, History, MoreHorizontal,
  Save, Search, Upload as UploadIcon, X,
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
  shareContentBlock,
  splitContentBlock,
  updateContent,
  uploadContentImage,
  uploadContentVideo,
  type ContentApp,
  type ContentBlock,
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
import { SectionRail } from './SectionRail';
import { SectionEditor } from './SectionEditor';
import { PreviewPane } from './PreviewPane';
import { orderSectionNames } from './hubLayoutConfig';
import { useIsMobile } from '../../hooks/useIsMobile';
import type { MediaAsset } from '../../api/media';

type DraftMap = Record<string, string>;

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

const HOME_SECTION_DEFAULT = ['specials', 'featured', 'categories', 'proof', 'cta', 'location'] as const;

const HOME_SECTION_LABELS: Record<(typeof HOME_SECTION_DEFAULT)[number], string> = {
  specials: 'Specials/Offers',
  featured: 'Featured',
  categories: 'Categories',
  proof: 'Social proof',
  cta: 'CTA band',
  location: 'Location',
};

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

function resolveHomeSectionOrder(raw: string | null | undefined): string[] {
  let decoded: unknown = [];
  try {
    decoded = raw ? JSON.parse(raw) : [];
  } catch {
    decoded = [];
  }

  const allowed = new Set<string>(HOME_SECTION_DEFAULT);
  const seen = new Set<string>();
  const out: string[] = [];
  if (Array.isArray(decoded)) {
    for (const id of decoded) {
      if (typeof id !== 'string' || !allowed.has(id) || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
  }
  for (const id of HOME_SECTION_DEFAULT) {
    if (!seen.has(id)) out.push(id);
  }
  return out;
}

function moveHomeSection(order: string[], from: number, direction: -1 | 1): string[] {
  const to = from + direction;
  if (to < 0 || to >= order.length) return order;
  const next = [...order];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
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
  const [drafts, setDrafts] = useState<DraftMap>({});
  const [locale, setLocale] = useState<ContentLocale>('en');
  const [historyTarget, setHistoryTarget] = useState<HistoryTarget>(null);
  const [revisions, setRevisions] = useState<ContentRevision[]>([]);
  const [schedules, setSchedules] = useState<ContentScheduleRow[]>([]);
  const [scheduleAt, setScheduleAt] = useState('');
  const [previewState, setPreviewState] = useState<PreviewState>({ website: null, orderApp: null });
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewSheetOpen, setPreviewSheetOpen] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [autosaving, setAutosaving] = useState(false);
  const [serverDraftSynced, setServerDraftSynced] = useState(true);
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
  const draftsRef = useRef<DraftMap>({});
  const loadGen = useRef(0);

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
      setBlocks(blockRes.blocks);
      setSchedules(scheduleRes.schedules);
      setDrafts(restored);
      draftsRef.current = restored;
      setLastSavedAt(latestIso([sharedDrafts.saved_at, websiteDrafts.saved_at, orderDrafts.saved_at]));
      setServerDraftSynced(true);
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
    setDrafts((prev) => {
      const next = { ...prev, [draftKey(scope, key)]: value };
      draftsRef.current = next;
      return next;
    });
    setServerDraftSynced(false);
  };

  // Preview token
  useEffect(() => {
    const t = window.setTimeout(() => {
      const overrides: Record<string, string> = {};
      for (const block of contentBlocks) {
        if (!block.apps.includes('website')) continue;
        const scopes = editorScopesForBlock(block);
        const previewScope = scopes.includes('website') ? 'website' : scopes[0];
        overrides[block.key] = valueForScope(block, previewScope, drafts);
      }
      if (Object.keys(overrides).length === 0) return;
      setPreviewLoading(true);
      void createContentPreviewToken('website', overrides, locale)
        .then((res) => setPreviewState({ website: res.website_url || null, orderApp: res.order_app_url || null }))
        .catch(() => setPreviewState({ website: null, orderApp: null }))
        .finally(() => setPreviewLoading(false));
    }, 600);
    return () => window.clearTimeout(t);
  }, [drafts, contentBlocks, locale]);

  // Autosave
  useEffect(() => {
    if (dirtyCount === 0 || serverDraftSynced) return;
    const t = window.setTimeout(() => {
      const changes = collectChanges(draftsRef.current, locale);
      if (changes.length === 0) return;
      setAutosaving(true);
      void saveContentDrafts(changes, locale)
        .then((res) => {
          setLastSavedAt(res.saved_at);
          setServerDraftSynced(true);
        })
        .catch(() => { /* keep local changes */ })
        .finally(() => setAutosaving(false));
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
      setDrafts({});
      draftsRef.current = {};
      setServerDraftSynced(true);
      setLastSavedAt(new Date().toISOString());
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
      setDrafts({});
      draftsRef.current = {};
      setServerDraftSynced(true);
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

  const changeContentMode = async (block: ContentBlock, next: 'same' | 'different') => {
    if (linkState(block) === next || linkingKey) return;
    setLinkingKey(block.key);
    try {
      const { blocks: nextBlocks } = next === 'same'
        ? await shareContentBlock(block.key, locale)
        : await splitContentBlock(block.key, locale);
      setBlocks(nextBlocks);
      success('Content mode updated');
    } catch {
      error('Could not update content mode');
    } finally {
      setLinkingKey(null);
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
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 230 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#6B5D4F' }}>
          Content: ◉ Same in both · ○ Different per app
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(['same', 'different'] as const).map((mode) => (
            <label
              key={mode}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                minHeight: 32,
                padding: '0 9px',
                borderRadius: 9,
                border: state === mode ? '1.5px solid #D4813A' : '1px solid #E8E0D8',
                background: state === mode ? '#FFF7ED' : '#fff',
                cursor: busy ? 'wait' : 'pointer',
                fontSize: 12,
                fontWeight: state === mode ? 700 : 500,
                color: '#1C1408',
              }}
            >
              <input
                type="radio"
                name={`content-mode-${block.key}`}
                checked={state === mode}
                disabled={busy}
                onChange={() => void changeContentMode(block, mode)}
              />
              {mode === 'same' ? 'Same in both' : 'Different per app'}
            </label>
          ))}
        </div>
      </div>
    );
  };

  const renderHistoryPanel = (block: ContentBlock, scope: ContentScope, currentValue: string) => {
    if (!historyTarget || historyTarget.key !== block.key || historyTarget.scope !== scope) return null;
    return (
      <div style={{ marginBottom: 12, padding: 12, borderRadius: 10, background: '#F8F6F3', border: '1px solid #E8E0D8' }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
          History · {historyTarget.label} · {locale}
        </div>
        {revisions.length === 0 ? <p style={{ margin: 0, fontSize: 12, color: '#9C8E7E' }}>No revisions yet.</p> : null}
        {revisions.map((revision) => (
          <div key={revision.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 10, fontSize: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: '#9C8E7E', marginBottom: 4 }}>{new Date(revision.created_at).toLocaleString()}</div>
              <RevisionDiff before={revision.value || ''} after={currentValue} />
            </div>
            <button
              type="button"
              onClick={() => void restore(revision.id)}
              style={{ height: 32, padding: '0 10px', borderRadius: 8, border: '1px solid #E8E0D8', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600 }}
            >
              Restore
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setHistoryTarget(null)}
          style={{ background: 'none', border: 'none', color: '#9C8E7E', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}
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
            style={{ flex: 1, minWidth: 180, height: 40, borderRadius: 10, border: '1px solid #E8E0D8', padding: '0 10px', fontFamily: 'inherit' }}
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
            border: '1px solid #E8E0D8',
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
          border: '1px solid #E8E0D8',
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
    return (
      <div
        key={block.key}
        style={{
          display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center',
          padding: '10px 12px', borderRadius: 10, border: '1px solid #E8E0D8', background: '#fff',
        }}
      >
        <div style={{ flex: '1 1 180px', minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#1C1408' }}>Show this section</div>
          <div style={{ fontSize: 11, color: '#9C8E7E', marginTop: 2, wordBreak: 'break-word' }}>
            {block.label} · {block.key}
          </div>
        </div>
        {renderContentModeControl(block)}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: scopes.length > 1 ? 'repeat(2, minmax(120px, 1fr))' : 'minmax(160px, 1fr)',
            gap: 8,
            flex: scopes.length > 1 ? '1 1 320px' : '0 1 180px',
          }}
        >
          {scopes.map((scope) => {
            const val = valueForScope(block, scope, drafts);
            return (
              <label
                key={`${scope}-${block.key}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, minHeight: 36, padding: '0 10px',
                  borderRadius: 9, border: '1px solid #E8E0D8', background: '#F8F6F3', fontSize: 12, fontWeight: 600,
                }}
              >
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
      </div>
    );
  };

  const renderSectionOrderScope = (block: ContentBlock, scope: ContentScope) => {
    const order = resolveHomeSectionOrder(valueForScope(block, scope, drafts));
    const persist = (next: string[]) => setDraft(scope, block.key, JSON.stringify(next));

    return (
      <div
        key={`${scope}-${block.key}`}
        style={{ border: '1px solid #F0EBE4', borderRadius: 12, padding: 12, background: '#FFFDFC', minWidth: 0 }}
      >
        <div style={{ fontSize: 12, fontWeight: 800, color: '#1C1408', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>
          {labelForScope(scope)}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {order.map((id, idx) => (
            <div
              key={id}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, minHeight: 42, padding: '0 10px',
                borderRadius: 10, border: '1px solid #E8E0D8', background: '#fff',
              }}
            >
              <span style={{ width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 999, background: '#F8F6F3', color: '#6B5D4F', fontSize: 11, fontWeight: 800 }}>
                {idx + 1}
              </span>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: '#1C1408' }}>
                {HOME_SECTION_LABELS[id as keyof typeof HOME_SECTION_LABELS] ?? id}
              </span>
              <button
                type="button"
                aria-label={`Move ${id} up`}
                disabled={idx === 0}
                onClick={() => persist(moveHomeSection(order, idx, -1))}
                style={{ width: 32, height: 32, borderRadius: 9, border: '1px solid #E8E0D8', background: '#fff', cursor: idx === 0 ? 'not-allowed' : 'pointer', opacity: idx === 0 ? 0.45 : 1 }}
              >
                <ArrowUp size={14} />
              </button>
              <button
                type="button"
                aria-label={`Move ${id} down`}
                disabled={idx === order.length - 1}
                onClick={() => persist(moveHomeSection(order, idx, 1))}
                style={{ width: 32, height: 32, borderRadius: 9, border: '1px solid #E8E0D8', background: '#fff', cursor: idx === order.length - 1 ? 'not-allowed' : 'pointer', opacity: idx === order.length - 1 ? 0.45 : 1 }}
              >
                <ArrowDown size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderSectionOrder = (block: ContentBlock) => {
    const scopes = editorScopesForBlock(block);
    return (
      <div key={block.key} style={{ padding: 12, borderRadius: 12, border: '1px solid #E8E0D8', background: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#1C1408' }}>Home section order</div>
            <div style={{ fontSize: 12, color: '#9C8E7E', marginTop: 2 }}>
              Arrange movable homepage sections. Hero and trust strip stay pinned above this order.
            </div>
          </div>
          {renderContentModeControl(block)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: scopes.length > 1 ? 'repeat(2, minmax(0,1fr))' : '1fr', gap: 12 }}>
          {scopes.map((scope) => renderSectionOrderScope(block, scope))}
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

    const scopes = editorScopesForBlock(block);
    const isMultiColumn = scopes.length > 1;
    const primaryScope = scopes[0];
    const primaryValue = valueForScope(block, primaryScope, drafts);
    const historyTargetMatchPrimary =
      historyTarget?.key === block.key && historyTarget?.scope === primaryScope;

    const modeControl = renderContentModeControl(block);
    const isBoolean = block.type === 'boolean';

    let editorContent: ReactNode = null;
    let booleanControl: ReactNode = undefined;

    if (isBoolean && !isMultiColumn) {
      booleanControl = (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, minHeight: 32, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={primaryValue === 'true' || primaryValue === '1'}
            onChange={(e) => setDraft(primaryScope, block.key, e.target.checked ? 'true' : 'false')}
          />
          Enabled
        </label>
      );
    } else if (isMultiColumn) {
      editorContent = (
        <div
          className="content-preview-grid"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12 }}
        >
          {scopes.map((scope) => {
            const val = valueForScope(block, scope, drafts);
            const histTarget = historyTarget?.key === block.key && historyTarget?.scope === scope;
            return (
              <div
                key={scope}
                style={{ border: '1px solid #F0EBE4', borderRadius: 12, padding: 12, minWidth: 0, background: '#FFFDFC' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#1C1408', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {labelForScope(scope)}
                  </div>
                  <button
                    type="button"
                    onClick={() => void openHistory(block, scope)}
                    style={{ height: 32, padding: '0 9px', borderRadius: 9, border: '1px solid #E8E0D8', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}
                  >
                    <History size={12} style={{ verticalAlign: -1 }} /> History
                  </button>
                </div>
                {histTarget ? renderHistoryPanel(block, scope, val) : null}
                {renderEditorForScope(block, scope)}
              </div>
            );
          })}
        </div>
      );
    } else {
      editorContent = renderEditorForScope(block, primaryScope);
    }

    return (
      <BlockCard
        key={`${block.key}-${locale}`}
        block={block}
        locale={locale}
        modeControl={modeControl}
        editor={editorContent}
        booleanControl={booleanControl}
        onOpenHistory={() => void openHistory(block, primaryScope)}
        historyOpen={!isMultiColumn && Boolean(historyTargetMatchPrimary)}
        historyPanel={renderHistoryPanel(block, primaryScope, primaryValue)}
        technicalScopesLabel={scopesLabelFor(scopes)}
        rawValuePreview={primaryValue.slice(0, 80)}
      />
    );
  };

  // ── Build section editor content ───────────────────────────────────────────

  const buildSectionContent = (sectionName: string, withBack: boolean) => {
    const sectionBlocks = contentBlocks.filter((b) => b.group === sectionName);
    const sectionOrderBlock = sectionBlocks.find((b) => b.section_order || b.key === 'home_section_order');
    const sectionEnableBlocks = sectionBlocks.filter((b) => b.section_enable);
    const regularBlocks = sectionBlocks.filter(
      (b) => !b.section_enable && b.key !== sectionOrderBlock?.key,
    );
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

    const chrome: ReactNode =
      sectionOrderBlock || sectionEnableBlocks.length > 0 ? (
        <>
          {sectionOrderBlock ? renderSectionOrder(sectionOrderBlock) : null}
          {sectionEnableBlocks.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sectionEnableBlocks.map(renderSectionEnable)}
            </div>
          ) : null}
        </>
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

    return (
      <SectionEditor
        sectionName={sectionName}
        blocks={leftoverBrandBlocks}
        chrome={chrome}
        brandKit={brandKit}
        renderBlock={renderBlock}
        onBack={withBack ? handleMobileBack : undefined}
        isBrandKit={isBrandKit}
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

      {/* Draft status */}
      <span data-testid="draft-save-status" className="hub-draft-status">
        {autosaving
          ? 'Saving draft…'
          : lastSavedAt
            ? `Draft saved ${new Date(lastSavedAt).toLocaleTimeString()}`
            : dirtyCount > 0
              ? 'Unsaved draft'
              : 'All published'}
      </span>

      {/* Publish */}
      <Btn onClick={() => void publish()} disabled={saving || dirtyCount === 0} className="content-studio-publish-desktop">
        <Save size={16} /> {saving ? 'Publishing…' : `Publish${dirtyCount ? ` (${dirtyCount})` : ''}`}
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
              style={{ background: 'none', border: 'none', color: '#D4813A', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, minHeight: 32 }}
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
          <div className="hub-desktop-shell">
            <SectionRail
              variant="rail"
              sections={railSections}
              active={activeGroup}
              onSelect={handleSectionSelect}
            />

            <div className="hub-editor-area">
              {loading
                ? skeleton
                : activeGroup
                  ? buildSectionContent(activeGroup, false)
                  : null}
            </div>

            <PreviewPane
              variant="column"
              websiteUrl={previewState.website}
              orderAppUrl={previewState.orderApp}
              loading={previewLoading}
            />
          </div>
        )}

        {/* Sticky mobile publish bar */}
        {dirtyCount > 0 ? (
          <div className="content-studio-sticky-bar" role="region" aria-label="Unsaved changes">
            <span className="content-studio-sticky-bar-label">{dirtyCount} unsaved change{dirtyCount === 1 ? '' : 's'}</span>
            <Btn onClick={() => void publish()} disabled={saving} style={{ flex: 1 }}>
              <Save size={16} /> {saving ? 'Publishing…' : `Publish (${dirtyCount})`}
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
