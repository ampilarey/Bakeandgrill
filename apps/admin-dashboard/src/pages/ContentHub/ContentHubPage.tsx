import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, Download, History, LayoutTemplate, Save, Search, Upload as UploadIcon } from 'lucide-react';
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
import { LivePreviewFrame } from '../ContentStudio/LivePreviewFrame';
import { MediaPicker } from '../../components/MediaPicker';
import { BrandKitCards, brandKitWriteScope } from './BrandKitCards';
import { BRAND_KIT_KEYS } from './brandKitConfig';
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

const HUB_GROUP_ORDER = [
  'Branding',
  'Hero',
  'Homepage',
  'Menu',
  'Footer',
  'Legal',
  'SEO',
  'Order App',
  'Status banners',
  'Pre-Order',
  'Contact',
  'Pages',
  'About',
  'General',
  'Announcements',
];

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
      return {
        key: parsed.key,
        scope: parsed.scope,
        value,
        locale,
      };
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

function matchesQuery(block: ContentBlock, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return (
    block.key.toLowerCase().includes(needle) ||
    block.label.toLowerCase().includes(needle) ||
    block.group.toLowerCase().includes(needle)
  );
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
  const [searchParams, setSearchParams] = useSearchParams();
  const urlGroup = (searchParams.get('group') || searchParams.get('section') || '').trim();
  const [blocks, setBlocks] = useState<ContentBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [group, setGroup] = useState<string>(() => urlGroup || 'All');
  const [q, setQ] = useState('');
  const [drafts, setDrafts] = useState<DraftMap>({});
  const [locale, setLocale] = useState<ContentLocale>('en');
  const [historyTarget, setHistoryTarget] = useState<HistoryTarget>(null);
  const [revisions, setRevisions] = useState<ContentRevision[]>([]);
  const [schedules, setSchedules] = useState<ContentScheduleRow[]>([]);
  const [scheduleAt, setScheduleAt] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [autosaving, setAutosaving] = useState(false);
  const [serverDraftSynced, setServerDraftSynced] = useState(true);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [linkingKey, setLinkingKey] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when locale changes
  }, [locale]);

  useEffect(() => {
    const next = urlGroup || 'All';
    setGroup((prev) => (prev === next ? prev : next));
  }, [urlGroup]);

  const selectGroup = (next: string) => {
    setGroup(next);
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.delete('section');
      if (next === 'All') p.delete('group');
      else p.set('group', next);
      return p;
    }, { replace: true });
  };

  const contentBlocks = useMemo(
    () => blocks.filter((block) => !isDeprecatedBlock(block)),
    [blocks],
  );

  const groups = useMemo(() => {
    const present = new Set(contentBlocks.map((block) => block.group));
    const ordered = HUB_GROUP_ORDER.filter((name) => present.has(name));
    const extras = Array.from(present).filter((name) => !HUB_GROUP_ORDER.includes(name)).sort();
    return ['All', ...ordered, ...extras];
  }, [contentBlocks]);

  const visibleSectionNames = useMemo(() => {
    const qq = q.trim();
    const names = group === 'All' ? groups.filter((g) => g !== 'All') : [group];
    return names.filter((name) => contentBlocks.some((block) => block.group === name && matchesQuery(block, qq)));
  }, [contentBlocks, group, groups, q]);

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
        .then((res) => setPreviewUrl(res.website_url))
        .catch(() => setPreviewUrl(null))
        .finally(() => setPreviewLoading(false));
    }, 600);
    return () => window.clearTimeout(t);
  }, [drafts, contentBlocks, locale]);

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
        .catch(() => { /* keep local changes available for publish */ })
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
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          alignItems: 'center',
          padding: '10px 12px',
          borderRadius: 10,
          border: '1px solid #E8E0D8',
          background: '#fff',
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
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  minHeight: 36,
                  padding: '0 10px',
                  borderRadius: 9,
                  border: '1px solid #E8E0D8',
                  background: '#F8F6F3',
                  fontSize: 12,
                  fontWeight: 600,
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
        style={{
          border: '1px solid #F0EBE4',
          borderRadius: 12,
          padding: 12,
          background: '#FFFDFC',
          minWidth: 0,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 800, color: '#1C1408', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>
          {labelForScope(scope)}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {order.map((id, idx) => (
            <div
              key={id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                minHeight: 42,
                padding: '0 10px',
                borderRadius: 10,
                border: '1px solid #E8E0D8',
                background: '#fff',
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
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 9,
                  border: '1px solid #E8E0D8',
                  background: '#fff',
                  cursor: idx === 0 ? 'not-allowed' : 'pointer',
                  opacity: idx === 0 ? 0.45 : 1,
                }}
              >
                <ArrowUp size={14} />
              </button>
              <button
                type="button"
                aria-label={`Move ${id} down`}
                disabled={idx === order.length - 1}
                onClick={() => persist(moveHomeSection(order, idx, 1))}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 9,
                  border: '1px solid #E8E0D8',
                  background: '#fff',
                  cursor: idx === order.length - 1 ? 'not-allowed' : 'pointer',
                  opacity: idx === order.length - 1 ? 0.45 : 1,
                }}
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
      <div
        key={block.key}
        style={{
          padding: 12,
          borderRadius: 12,
          border: '1px solid #E8E0D8',
          background: '#fff',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#1C1408' }}>Home section order</div>
            <div style={{ fontSize: 12, color: '#9C8E7E', marginTop: 2 }}>
              Arrange movable homepage sections. Hero and trust strip stay pinned above this order.
            </div>
          </div>
          {renderContentModeControl(block)}
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: scopes.length > 1 ? 'repeat(2, minmax(0, 1fr))' : '1fr',
            gap: 12,
          }}
        >
          {scopes.map((scope) => renderSectionOrderScope(block, scope))}
        </div>
      </div>
    );
  };

  const renderBlock = (block: ContentBlock) => {
    if (isSeoDescriptionKey(block.key)) {
      const titleKey = block.key === 'meta_description'
        ? 'meta_title'
        : block.key.replace(/_meta_description$/, '_meta_title');
      if (contentBlocks.some((candidate) => candidate.key === titleKey)) return null;
    }

    const scopes = editorScopesForBlock(block);
    const isMultiColumn = scopes.length > 1;
    const primaryScope = scopes[0];
    const primaryValue = valueForScope(block, primaryScope, drafts);

    return (
      <div
        key={`${block.key}-${locale}`}
        className="content-studio-block"
        style={{
          background: '#fff',
          border: '1px solid #E8E0D8',
          borderRadius: 14,
          padding: 16,
        }}
      >
        <div className="content-studio-block-head" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
          <div style={{ minWidth: 0, flex: '1 1 180px' }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#1C1408' }}>{block.label}</div>
            {block.description ? (
              <div style={{ fontSize: 13, color: '#6B5D4F', marginTop: 4, lineHeight: 1.4 }}>
                {block.description}
              </div>
            ) : null}
            <div className="content-studio-block-meta" style={{ fontSize: 12, color: '#9C8E7E', marginTop: 2, wordBreak: 'break-word' }}>
              {block.key} · {block.type}{block.editor ? ` · ${block.editor}` : ''} · {locale} · {isMultiColumn ? 'Website + Order app' : labelForScope(primaryScope)}
            </div>
          </div>
          <div className="content-studio-block-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            {renderContentModeControl(block)}
            {!isMultiColumn ? (
              <button
                type="button"
                onClick={() => void openHistory(block, primaryScope)}
                style={{
                  height: 36,
                  padding: '0 10px',
                  borderRadius: 10,
                  border: '1px solid #E8E0D8',
                  background: '#fff',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 12,
                }}
              >
                <History size={12} style={{ verticalAlign: -1 }} /> History
              </button>
            ) : null}
          </div>
        </div>

        {!isMultiColumn ? renderHistoryPanel(block, primaryScope, primaryValue) : null}

        <div
          className="content-preview-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: isMultiColumn ? 'repeat(2, minmax(0, 1fr))' : '1fr',
            gap: 12,
          }}
        >
          {scopes.map((scope) => {
            const val = valueForScope(block, scope, drafts);
            return (
              <div
                key={`${scope}-${block.key}`}
                style={{
                  border: isMultiColumn ? '1px solid #F0EBE4' : 'none',
                  borderRadius: isMultiColumn ? 12 : 0,
                  padding: isMultiColumn ? 12 : 0,
                  minWidth: 0,
                  background: isMultiColumn ? '#FFFDFC' : 'transparent',
                }}
              >
                {isMultiColumn ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#1C1408', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {labelForScope(scope)}
                    </div>
                    <button
                      type="button"
                      onClick={() => void openHistory(block, scope)}
                      style={{
                        height: 32,
                        padding: '0 9px',
                        borderRadius: 9,
                        border: '1px solid #E8E0D8',
                        background: '#fff',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        fontSize: 12,
                      }}
                    >
                      <History size={12} style={{ verticalAlign: -1 }} /> History
                    </button>
                  </div>
                ) : null}
                {renderHistoryPanel(block, scope, val)}
                {renderEditorForScope(block, scope)}
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 10, fontSize: 12, color: '#9C8E7E' }}>
          Editing {isMultiColumn ? 'Website + Order app' : labelForScope(primaryScope)}
          {' · '}
          Current website value “{(block.resolved_website ?? '—').toString().slice(0, 80)}”
        </div>
      </div>
    );
  };

  return (
    <PageShell>
      <div className={`content-studio-page${dirtyCount > 0 ? ' content-studio-page--dirty' : ''}`}>
        <PageHeader
          section="System"
          title="Content & Branding"
          subtitle="Website + order app copy, branding & visuals"
          action={
            <div className="content-studio-header-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <Btn onClick={() => void doExport()} variant="secondary">
                <Download size={16} /> Export
              </Btn>
              <Btn onClick={() => importInputRef.current?.click()} variant="secondary">
                <UploadIcon size={16} /> Import
              </Btn>
              <Btn onClick={() => setMediaOpen(true)} variant="secondary">
                <LayoutTemplate size={16} /> Media
              </Btn>
              <span data-testid="draft-save-status" style={{ fontSize: 12, color: '#9C8E7E', minWidth: 120 }}>
                {autosaving
                  ? 'Saving draft…'
                  : lastSavedAt
                    ? `Draft saved ${new Date(lastSavedAt).toLocaleTimeString()}`
                    : dirtyCount > 0
                      ? 'Unsaved draft'
                      : 'All published'}
              </span>
              <Btn onClick={() => void publish()} disabled={saving || dirtyCount === 0} className="content-studio-publish-desktop">
                <Save size={16} /> {saving ? 'Publishing…' : `Publish${dirtyCount ? ` (${dirtyCount})` : ''}`}
              </Btn>
            </div>
          }
        />

        <input ref={fileInputRef} type="file" accept="image/*,.heic,.heif" style={{ display: 'none' }} onChange={(e) => void handleEmbedFile(e)} />
        <input ref={importInputRef} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={(e) => void doImport(e)} />

        <div className="content-studio-toolbar" style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="content-studio-locale tab-scroll-row" style={{ display: 'flex', gap: 8 }}>
            {(['en', 'dv'] as const).map((loc) => (
              <button
                key={loc}
                type="button"
                onClick={() => setLocale(loc)}
                style={{
                  height: 36,
                  padding: '0 14px',
                  borderRadius: 10,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontWeight: locale === loc ? 700 : 500,
                  fontSize: 13,
                  border: locale === loc ? '1.5px solid #D4813A' : '1px solid #E8E0D8',
                  background: locale === loc ? '#FFF7ED' : '#fff',
                  color: '#1C1408',
                }}
              >
                {loc === 'en' ? 'English' : 'Dhivehi (ދިވެހި)'}
              </button>
            ))}
          </div>
          <div className="content-studio-toolbar-schedule" style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto', flexWrap: 'wrap' }}>
            <input
              type="datetime-local"
              value={scheduleAt}
              onChange={(e) => setScheduleAt(e.target.value)}
              style={{ height: 36, borderRadius: 10, border: '1px solid #E8E0D8', padding: '0 10px', fontFamily: 'inherit', fontSize: 13, flex: 1, minWidth: 0 }}
            />
            <button
              type="button"
              onClick={() => void schedulePublish()}
              disabled={saving || dirtyCount === 0 || !scheduleAt}
              style={{
                height: 36,
                padding: '0 12px',
                borderRadius: 10,
                border: '1px solid #E8E0D8',
                background: '#F8F6F3',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 12,
                fontWeight: 600,
                opacity: dirtyCount === 0 || !scheduleAt ? 0.5 : 1,
                whiteSpace: 'nowrap',
              }}
            >
              Schedule publish
            </button>
          </div>
        </div>

        {schedules.length > 0 ? (
          <div style={{
            marginBottom: 14,
            padding: 12,
            borderRadius: 12,
            background: '#FFF7ED',
            border: '1px solid #F5D0A9',
            fontSize: 13,
            color: '#1C1408',
          }}>
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
        ) : null}

        <div className="content-studio-shell" style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          <aside className="content-studio-aside" style={{
            width: 220,
            flexShrink: 0,
            background: '#fff',
            border: '1px solid #E8E0D8',
            borderRadius: 14,
            padding: 12,
            position: 'sticky',
            top: 12,
          }}>
            <div className="content-studio-aside-title" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, color: '#1C1408', fontWeight: 700 }}>
              <LayoutTemplate size={16} /> Sections
            </div>
            <div className="content-studio-search" style={{ position: 'relative', marginBottom: 10 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: '#9C8E7E' }} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search blocks…"
                style={{
                  width: '100%',
                  height: 36,
                  paddingLeft: 30,
                  borderRadius: 10,
                  border: '1px solid #E8E0D8',
                  fontSize: 13,
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div className="content-studio-groups">
              {groups.map((name) => (
                <button
                  key={name}
                  type="button"
                  aria-pressed={group === name}
                  onClick={() => selectGroup(name)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 10px',
                    border: 'none',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontSize: 13,
                    fontWeight: group === name ? 700 : 500,
                    background: group === name ? '#F5E6D3' : 'transparent',
                    color: group === name ? '#1C1408' : '#6B5D4F',
                  }}
                >
                  {name}
                </button>
              ))}
            </div>
          </aside>

          <div className="content-studio-blocks" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {loading ? (
              <div data-testid="content-skeleton" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} style={{ height: 96, borderRadius: 14, background: 'linear-gradient(90deg,#F0EBE4 25%,#F8F6F3 50%,#F0EBE4 75%)', backgroundSize: '200% 100%', animation: 'none' }} />
                ))}
              </div>
            ) : null}
            {!loading && visibleSectionNames.length === 0 ? <p style={{ color: '#9C8E7E' }}>No blocks match.</p> : null}

            {!loading && visibleSectionNames.map((sectionName) => {
              const sectionBlocks = contentBlocks.filter((block) => block.group === sectionName && matchesQuery(block, q));
              const sectionOrderBlock = sectionBlocks.find((block) => block.section_order || block.key === 'home_section_order');
              const sectionEnableBlocks = sectionBlocks.filter((block) => block.section_enable);
              const regularBlocks = sectionBlocks.filter((block) => !block.section_enable && block.key !== sectionOrderBlock?.key);
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
              return (
                <section key={sectionName} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div
                    style={{
                      background: '#F8F6F3',
                      border: '1px solid #E8E0D8',
                      borderRadius: 14,
                      padding: 14,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <div>
                        <h2 style={{ margin: 0, fontSize: 18, color: '#1C1408' }}>{sectionName}</h2>
                        <div style={{ fontSize: 12, color: '#9C8E7E', marginTop: 2 }}>
                          {isBrandKit
                            ? 'Brand Kit'
                            : `${regularBlocks.length} block${regularBlocks.length === 1 ? '' : 's'}`}
                        </div>
                      </div>
                    </div>
                    {sectionOrderBlock ? renderSectionOrder(sectionOrderBlock) : null}
                    {sectionEnableBlocks.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {sectionEnableBlocks.map(renderSectionEnable)}
                      </div>
                    ) : null}
                  </div>
                  {isBrandKit ? (
                    <BrandKitCards
                      blocksByKey={brandBlocksByKey}
                      siteName={siteName}
                      valueOf={(block) => valueForScope(block, brandKitWriteScope(block), drafts)}
                      onSetValue={(block, value) => setDraft(brandKitWriteScope(block), block.key, value)}
                      onUploadFile={(block, file) => onUpload(block, brandKitWriteScope(block), file)}
                      onOpenLibrary={(block) => {
                        const scope = brandKitWriteScope(block);
                        uploadCtx.current = {
                          blockKey: block.key,
                          scope,
                          onDone: (url) => setDraft(scope, block.key, url),
                        };
                        setMediaOpen(true);
                      }}
                      onOpenHistory={(block) => void openHistory(block, brandKitWriteScope(block))}
                      historyPanel={(block) =>
                        renderHistoryPanel(block, brandKitWriteScope(block), valueForScope(block, brandKitWriteScope(block), drafts))
                      }
                    />
                  ) : null}
                  {(isBrandKit ? leftoverBrandBlocks : regularBlocks).map(renderBlock)}
                </section>
              );
            })}

            <LivePreviewFrame url={previewUrl} loading={previewLoading} />
          </div>
        </div>

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

        {dirtyCount > 0 ? (
          <div className="content-studio-sticky-bar" role="region" aria-label="Unsaved changes">
            <span className="content-studio-sticky-bar-label">{dirtyCount} unsaved change{dirtyCount === 1 ? '' : 's'}</span>
            <Btn onClick={() => void publish()} disabled={saving} style={{ flex: 1 }}>
              <Save size={16} /> {saving ? 'Publishing…' : `Publish (${dirtyCount})`}
            </Btn>
          </div>
        ) : null}
      </div>
    </PageShell>
  );
}

export default ContentHubPage;
