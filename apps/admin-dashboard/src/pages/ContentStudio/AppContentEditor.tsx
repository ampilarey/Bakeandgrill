import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, History, LayoutTemplate, Save, Search, Upload as UploadIcon } from 'lucide-react';
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
import { CopyBlockFromOtherApp, CopySectionFromOtherApp } from './CopyFromOtherApp';
import { LivePreviewFrame } from './LivePreviewFrame';
import { MediaPicker } from '../../components/MediaPicker';
import type { MediaAsset } from '../../api/media';

function seoDescriptionKey(titleKey: string): string | null {
  if (titleKey === 'meta_title') return 'meta_description';
  if (titleKey.endsWith('_meta_title')) return titleKey.replace(/_meta_title$/, '_meta_description');
  return null;
}

function isSeoDescriptionKey(key: string): boolean {
  return key === 'meta_description' || key.endsWith('_meta_description');
}

type DraftMap = Record<string, string>;

function appTitle(app: ContentApp): string {
  return app === 'website' ? 'Website Content' : 'Order App Content';
}

function appSubtitle(app: ContentApp): string {
  return app === 'website'
    ? 'Marketing copy for the public website · EN / DV · schedule · history'
    : 'Marketing copy for the order app · EN / DV · schedule · history';
}

/** Display = app row ?? resolved fallback (seed/shared). Draft wins when present. */
export function valueForApp(block: ContentBlock, app: ContentApp, drafts: DraftMap): string {
  if (drafts[block.key] !== undefined) return drafts[block.key];
  if (app === 'website') {
    return block.website ?? block.resolved_website ?? block.default ?? '';
  }
  return block.order_app ?? block.resolved_order_app ?? block.default ?? '';
}

function collectChanges(drafts: DraftMap, app: ContentApp, locale: ContentLocale) {
  return Object.entries(drafts).map(([key, value]) => ({
    key,
    scope: app as ContentScope,
    value,
    locale,
  }));
}

export type AppContentEditorProps = {
  app: ContentApp;
};

export function AppContentEditor({ app }: AppContentEditorProps) {
  usePageTitle(appTitle(app));
  const { success, error } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const groupFromUrl = (searchParams.get('group') || '').trim();
  const [blocks, setBlocks] = useState<ContentBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [group, setGroup] = useState<string>(() => groupFromUrl || 'All');
  const [q, setQ] = useState('');
  const [drafts, setDrafts] = useState<DraftMap>({});
  const [locale, setLocale] = useState<ContentLocale>('en');
  const [historyKey, setHistoryKey] = useState<string | null>(null);
  const [revisions, setRevisions] = useState<ContentRevision[]>([]);
  const [schedules, setSchedules] = useState<ContentScheduleRow[]>([]);
  const [scheduleAt, setScheduleAt] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [autosaving, setAutosaving] = useState(false);
  const [serverDraftSynced, setServerDraftSynced] = useState(true);
  const [mediaOpen, setMediaOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const uploadCtx = useRef<{
    blockKey: string;
    onDone: (url: string) => void;
  } | null>(null);
  const draftsRef = useRef<DraftMap>({});

  const loadGen = useRef(0);

  const load = async (loc: ContentLocale = locale) => {
    const gen = ++loadGen.current;
    setLoading(true);
    try {
      const [{ blocks: b }, { schedules: s }, draftRes] = await Promise.all([
        getContentBlocks(loc),
        getContentSchedules('pending'),
        getContentDrafts(app, loc).catch(() => ({ drafts: {} as Record<string, string>, saved_at: null })),
      ]);
      if (gen !== loadGen.current) return;
      setBlocks(b);
      setSchedules(s);
      const restored = draftRes.drafts || {};
      setDrafts(restored);
      draftsRef.current = restored;
      setLastSavedAt(draftRes.saved_at);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when locale or app editor changes
  }, [locale, app]);

  // Deep-link: /content/website?group=Branding (and keep URL in sync when chips change).
  useEffect(() => {
    const next = groupFromUrl || 'All';
    setGroup((prev) => (prev === next ? prev : next));
  }, [groupFromUrl]);

  const selectGroup = (next: string) => {
    setGroup(next);
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      if (next === 'All') p.delete('group');
      else p.set('group', next);
      return p;
    }, { replace: true });
  };

  const appBlocks = useMemo(
    () => blocks.filter((b) => {
      if (!b.apps.includes(app)) return false;
      // Hide deprecated legacy hero_slide_1/2/3 — managed via hero_slides.
      if (/^hero_slide_[123]$/.test(b.key)) return false;
      return true;
    }),
    [blocks, app],
  );

  // Debounced real-page preview with draft overlay (staff token).
  useEffect(() => {
    const t = window.setTimeout(() => {
      const overrides: Record<string, string> = {};
      for (const b of appBlocks) {
        overrides[b.key] = valueForApp(b, app, drafts);
      }
      if (Object.keys(overrides).length === 0) return;
      setPreviewLoading(true);
      void createContentPreviewToken(app, overrides, locale)
        .then((res) => {
          setPreviewUrl(app === 'website' ? res.website_url : res.order_app_url);
        })
        .catch(() => setPreviewUrl(null))
        .finally(() => setPreviewLoading(false));
    }, 600);
    return () => window.clearTimeout(t);
  }, [drafts, appBlocks, app, locale]);

  const groups = useMemo(() => {
    const g = new Set(appBlocks.map((b) => b.group));
    return ['All', ...Array.from(g).sort()];
  }, [appBlocks]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return appBlocks.filter((b) => {
      if (group !== 'All' && b.group !== group) return false;
      if (!qq) return true;
      return b.key.toLowerCase().includes(qq) || b.label.toLowerCase().includes(qq);
    });
  }, [appBlocks, group, q]);

  const sectionCopyKeys = useMemo(() => {
    if (group === 'All') return [];
    return appBlocks
      .filter((b) => b.group === group && b.apps.includes(app === 'website' ? 'order_app' : 'website'))
      .map((b) => b.key);
  }, [appBlocks, group, app]);

  const dirtyCount = useMemo(() => Object.keys(drafts).length, [drafts]);
  const hasUnsaved = dirtyCount > 0 && !serverDraftSynced;

  const setDraft = (key: string, value: string) => {
    setDrafts((prev) => {
      const next = { ...prev, [key]: value };
      draftsRef.current = next;
      return next;
    });
    setServerDraftSynced(false);
  };

  // Autosave drafts every few seconds (server draft store — not live).
  useEffect(() => {
    if (dirtyCount === 0 || serverDraftSynced) return;
    const t = window.setTimeout(() => {
      const changes = collectChanges(draftsRef.current, app, locale);
      if (changes.length === 0) return;
      setAutosaving(true);
      void saveContentDrafts(changes, locale)
        .then((res) => {
          setLastSavedAt(res.saved_at);
          setServerDraftSynced(true);
        })
        .catch(() => { /* keep unsynced; user can still publish */ })
        .finally(() => setAutosaving(false));
    }, 2500);
    return () => window.clearTimeout(t);
  }, [drafts, dirtyCount, serverDraftSynced, app, locale]);

  // Unsaved-changes guard (navigate / close tab).
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!hasUnsaved && dirtyCount === 0) return;
      if (dirtyCount === 0) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasUnsaved, dirtyCount]);

  const publish = async () => {
    const changes = collectChanges(drafts, app, locale);
    if (changes.length === 0) return;
    setSaving(true);
    try {
      const { blocks: b } = await updateContent(changes, locale);
      setBlocks(b);
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
    const changes = collectChanges(drafts, app, locale);
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
      const { schedules: s } = await getContentSchedules('pending');
      setSchedules(s);
      success('Publish scheduled');
    } catch (e) {
      error(e instanceof Error ? e.message : 'Schedule failed');
    } finally {
      setSaving(false);
    }
  };

  const onUpload = async (block: ContentBlock, file: File) => {
    try {
      const res = await uploadContentImage(block.key, app, file, undefined, locale);
      setDraft(block.key, res.url);
      success('Image uploaded');
    } catch (e) {
      error(e instanceof Error ? e.message : 'Upload failed');
    }
  };

  const makeTriggerUpload = (block: ContentBlock) =>
    (_legacyKey: string, onDone: (url: string) => void) => {
      uploadCtx.current = { blockKey: block.key, onDone };
      fileInputRef.current?.click();
    };

  const handleEmbedFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const ctx = uploadCtx.current;
    e.target.value = '';
    uploadCtx.current = null;
    if (!file || !ctx) return;
    try {
      const res = await uploadContentImage(ctx.blockKey, app, file, undefined, locale);
      ctx.onDone(res.url);
      success('Image uploaded');
    } catch (err) {
      error(err instanceof Error ? err.message : 'Upload failed');
    }
  };

  const openHistory = async (block: ContentBlock) => {
    setHistoryKey(block.key);
    try {
      const { revisions: r } = await getContentRevisions(block.key, app, locale);
      setRevisions(r);
    } catch (e) {
      error(e instanceof Error ? e.message : 'Failed to load history');
    }
  };

  const restore = async (id: number) => {
    if (!historyKey) return;
    if (!window.confirm('Restore this revision? Current value is saved to history first.')) return;
    try {
      const { blocks: b } = await restoreContentRevision(historyKey, id);
      setBlocks(b);
      const { revisions: r } = await getContentRevisions(historyKey, app, locale);
      setRevisions(r);
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
      a.download = `content-export-${app}-${locale}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      success('Export downloaded');
    } catch (e) {
      error(e instanceof Error ? e.message : 'Export failed');
    }
  };

  const doImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const bundle = JSON.parse(text);
      if (!bundle?.entries) throw new Error('Invalid bundle');
      const { blocks: b, applied } = await importContent(bundle);
      setBlocks(b);
      success(`Imported ${applied} entries`);
    } catch (err) {
      error(err instanceof Error ? err.message : 'Import failed');
    }
  };

  const onCopyDone = (b: ContentBlock[]) => {
    setBlocks(b);
    setDrafts({});
    draftsRef.current = {};
    setServerDraftSynced(true);
    success('Copied from the other app');
  };

  const renderVisualEditor = (block: ContentBlock, val: string) => {
    const onChange = (next: string) => setDraft(block.key, next);
    const triggerUpload = makeTriggerUpload(block);
    const common = { label: block.label, value: val, onChange };

    switch (block.editor) {
      case 'hero':
        return (
          <HeroSlidesEditor
            {...common}
            triggerUpload={triggerUpload}
            uploadImage={(cropped, original) => uploadContentImage(block.key, app, cropped, original, locale)}
            uploadVideo={(video, poster, posterUrl) => uploadContentVideo(block.key, app, video, poster, locale, posterUrl)}
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
      default:
        return null;
    }
  };

  const previewLabel = app === 'website' ? 'Website' : 'Order app';
  const canCopyFromOther = (block: ContentBlock) =>
    block.apps.includes(app === 'website' ? 'order_app' : 'website');

  return (
    <PageShell>
    <div className={`content-studio-page${dirtyCount > 0 ? ' content-studio-page--dirty' : ''}`}>
      <PageHeader section="System"
        title={appTitle(app)}
        subtitle={appSubtitle(app)}
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
                height: 36, padding: '0 14px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
                fontWeight: locale === loc ? 700 : 500, fontSize: 13,
                border: locale === loc ? '1.5px solid #D4813A' : '1px solid #E8E0D8',
                background: locale === loc ? '#FFF7ED' : '#fff', color: '#1C1408',
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
              height: 36, padding: '0 12px', borderRadius: 10, border: '1px solid #E8E0D8',
              background: '#F8F6F3', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
              opacity: dirtyCount === 0 || !scheduleAt ? 0.5 : 1, whiteSpace: 'nowrap',
            }}
          >
            Schedule publish
          </button>
        </div>
      </div>

      {schedules.length > 0 ? (
        <div style={{
          marginBottom: 14, padding: 12, borderRadius: 12, background: '#FFF7ED', border: '1px solid #F5D0A9',
          fontSize: 13, color: '#1C1408',
        }}>
          <strong>{schedules.length}</strong> pending schedule{schedules.length === 1 ? '' : 's'}
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, wordBreak: 'break-word' }}>
            {schedules.slice(0, 5).map((s) => (
              <li key={s.id} style={{ marginBottom: 4 }}>
                {s.key} · {s.scope} · {s.locale} → {new Date(s.publish_at).toLocaleString()}
                {' '}
                <button
                  type="button"
                  onClick={() => void cancelContentSchedule(s.id).then(() => load()).catch((e) => error(e instanceof Error ? e.message : 'Cancel failed'))}
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
          width: 220, flexShrink: 0, background: '#fff', border: '1px solid #E8E0D8',
          borderRadius: 14, padding: 12, position: 'sticky', top: 12,
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
                width: '100%', height: 36, paddingLeft: 30, borderRadius: 10,
                border: '1px solid #E8E0D8', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box',
              }}
            />
          </div>
          <div className="content-studio-groups">
            {groups.map((g) => (
              <button
                key={g}
                type="button"
                aria-pressed={group === g}
                onClick={() => selectGroup(g)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px',
                  border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: 13, fontWeight: group === g ? 700 : 500,
                  background: group === g ? '#F5E6D3' : 'transparent',
                  color: group === g ? '#1C1408' : '#6B5D4F',
                }}
              >
                {g}
              </button>
            ))}
          </div>
          {group !== 'All' ? (
            <CopySectionFromOtherApp
              app={app}
              keys={sectionCopyKeys}
              locale={locale}
              onDone={onCopyDone}
              onError={(msg) => error(msg)}
            />
          ) : null}
        </aside>

        <div className="content-studio-blocks" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {loading ? (
            <div data-testid="content-skeleton" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{ height: 96, borderRadius: 14, background: 'linear-gradient(90deg,#F0EBE4 25%,#F8F6F3 50%,#F0EBE4 75%)', backgroundSize: '200% 100%', animation: 'none' }} />
              ))}
            </div>
          ) : null}
          {!loading && filtered.length === 0 ? <p style={{ color: '#9C8E7E' }}>No blocks match.</p> : null}

          {!loading && filtered.map((block) => {
            // SEO description fields render with their title pair.
            if (isSeoDescriptionKey(block.key)) {
              const titleKey = block.key === 'meta_description'
                ? 'meta_title'
                : block.key.replace(/_meta_description$/, '_meta_title');
              if (appBlocks.some((b) => b.key === titleKey)) return null;
            }

            const val = valueForApp(block, app, drafts);
            const visual = block.editor ? renderVisualEditor(block, val) : null;
            const descKey = seoDescriptionKey(block.key);
            const descBlock = descKey ? appBlocks.find((b) => b.key === descKey) : undefined;
            const isSeoTitle = Boolean(descKey);

            return (
              <div key={`${block.key}-${locale}`} className="content-studio-block" data-content-app={app} style={{
                background: '#fff', border: '1px solid #E8E0D8', borderRadius: 14, padding: 16,
              }}>
                <div className="content-studio-block-head" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
                  <div style={{ minWidth: 0, flex: '1 1 160px' }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#1C1408' }}>{block.label}</div>
                    {block.description ? (
                      <div style={{ fontSize: 13, color: '#6B5D4F', marginTop: 4, lineHeight: 1.4 }}>
                        {block.description}
                      </div>
                    ) : null}
                    <div className="content-studio-block-meta" style={{ fontSize: 12, color: '#9C8E7E', marginTop: 2, wordBreak: 'break-word' }}>
                      {block.key} · {block.type}{block.editor ? ` · ${block.editor}` : ''} · {locale} · {previewLabel}
                    </div>
                  </div>
                  <div className="content-studio-block-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => void openHistory(block)}
                      style={{
                        height: 36, padding: '0 10px', borderRadius: 10, border: '1px solid #E8E0D8',
                        background: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12,
                      }}
                    >
                      <History size={12} style={{ verticalAlign: -1 }} /> History
                    </button>
                    {canCopyFromOther(block) ? (
                      <CopyBlockFromOtherApp
                        app={app}
                        blockKey={block.key}
                        locale={locale}
                        onDone={onCopyDone}
                        onError={(msg) => error(msg)}
                      />
                    ) : null}
                  </div>
                </div>

                {historyKey === block.key ? (
                  <div style={{ marginBottom: 12, padding: 12, borderRadius: 10, background: '#F8F6F3', border: '1px solid #E8E0D8' }}>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>History · {app} · {locale}</div>
                    {revisions.length === 0 ? <p style={{ margin: 0, fontSize: 12, color: '#9C8E7E' }}>No revisions yet.</p> : null}
                    {revisions.map((r) => (
                      <div key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 10, fontSize: 12 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ color: '#9C8E7E', marginBottom: 4 }}>{new Date(r.created_at).toLocaleString()}</div>
                          <RevisionDiff before={r.value || ''} after={val} />
                        </div>
                        <button type="button" onClick={() => void restore(r.id)}
                          style={{ height: 32, padding: '0 10px', borderRadius: 8, border: '1px solid #E8E0D8', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600 }}>
                          Restore
                        </button>
                      </div>
                    ))}
                    <button type="button" onClick={() => setHistoryKey(null)}
                      style={{ background: 'none', border: 'none', color: '#9C8E7E', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
                      Close
                    </button>
                  </div>
                ) : null}

                {visual ? (
                  visual
                ) : isSeoTitle && descBlock ? (
                  <SeoSnippetPreview
                    title={val}
                    description={valueForApp(descBlock, app, drafts)}
                    onTitleChange={(v) => setDraft(block.key, v)}
                    onDescriptionChange={(v) => setDraft(descBlock.key, v)}
                    titleLabel={block.label}
                    descriptionLabel={descBlock.label}
                  />
                ) : block.rich ? (
                  <RichTextEditor
                    key={`${block.key}-${locale}`}
                    label=""
                    value={val}
                    onChange={(v) => setDraft(block.key, v)}
                  />
                ) : block.type === 'boolean' ? (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                    <input
                      type="checkbox"
                      checked={val === 'true' || val === '1'}
                      onChange={(e) => setDraft(block.key, e.target.checked ? 'true' : 'false')}
                    />
                    Enabled
                  </label>
                ) : block.type === 'image' ? (
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
                        const f = e.target.files?.[0];
                        if (f) void onUpload(block, f);
                      }}
                    />
                    <Btn type="button" variant="secondary" onClick={() => {
                      uploadCtx.current = { blockKey: block.key, onDone: (url) => setDraft(block.key, url) };
                      setMediaOpen(true);
                    }}>
                      Library
                    </Btn>
                    <input
                      value={val}
                      onChange={(e) => setDraft(block.key, e.target.value)}
                      placeholder="/storage/…"
                      style={{ flex: 1, minWidth: 180, height: 40, borderRadius: 10, border: '1px solid #E8E0D8', padding: '0 10px', fontFamily: 'inherit' }}
                    />
                  </div>
                ) : block.type === 'textarea' || block.type === 'json' ? (
                  <textarea
                    value={val}
                    onChange={(e) => setDraft(block.key, e.target.value)}
                    rows={block.type === 'json' ? 6 : 4}
                    dir={locale === 'dv' ? 'rtl' : 'ltr'}
                    style={{
                      width: '100%', borderRadius: 10, border: '1px solid #E8E0D8', padding: 10,
                      fontFamily: block.type === 'json' ? 'ui-monospace, monospace' : 'inherit', fontSize: 13,
                    }}
                  />
                ) : (
                  <input
                    value={val}
                    onChange={(e) => setDraft(block.key, e.target.value)}
                    dir={locale === 'dv' ? 'rtl' : 'ltr'}
                    style={{
                      width: '100%', height: 44, borderRadius: 10, border: '1px solid #E8E0D8',
                      padding: '0 12px', fontFamily: 'inherit', fontSize: 14,
                    }}
                  />
                )}

                <div style={{ marginTop: 10, fontSize: 12, color: '#9C8E7E' }}>
                  Editing {previewLabel}
                  {' · '}
                  resolved “{((app === 'website' ? block.resolved_website : block.resolved_order_app) ?? '—').toString().slice(0, 80)}”
                </div>
              </div>
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
