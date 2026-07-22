import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Download, History, LayoutTemplate, Save, Search, Upload as UploadIcon } from 'lucide-react';
import {
  cancelContentSchedule,
  copyContentBlock,
  exportContent,
  getContentBlocks,
  getContentRevisions,
  getContentSchedules,
  importContent,
  restoreContentRevision,
  scheduleContent,
  shareContentBlock,
  splitContentBlock,
  updateContent,
  uploadContentImage,
  type ContentBlock,
  type ContentLocale,
  type ContentRevision,
  type ContentScheduleRow,
  type ContentScope,
} from '../../api/content';
import { PageHeader, Btn } from '../../components/SharedUI';
import {
  AboutValuesEditor,
  CategoriesEditor,
  FooterLinksEditor,
  HeroSlideEditor,
  PreorderStepsEditor,
  ProofDetailsEditor,
  TrustItemsEditor,
} from '../../components/content-editors';
import { VisualBlockPreview } from '../../components/content-editors/VisualBlockPreview';
import { usePageTitle } from '../../hooks/usePageTitle';
import { useToast } from '../../components/ui';

type DraftMap = Record<string, Partial<Record<ContentScope, string>>>;

const VISUAL_PREVIEW_EDITORS = new Set([
  'hero', 'trust', 'categories', 'proof', 'about_values', 'preorder_steps', 'footer_links', 'business_hours',
]);

function scopeForEdit(block: ContentBlock, tab: ContentScope): ContentScope {
  if (!block.shareable) {
    return (block.apps[0] as ContentScope) || 'shared';
  }
  return block.state === 'split' ? tab : 'shared';
}

function valueFor(block: ContentBlock, scope: ContentScope, drafts: DraftMap): string {
  const d = drafts[block.key]?.[scope];
  if (d !== undefined) return d;
  if (scope === 'shared') return block.shared ?? block.default ?? '';
  if (scope === 'website') return block.website ?? block.shared ?? block.default ?? '';
  return block.order_app ?? block.shared ?? block.default ?? '';
}

function previewAppLabel(block: ContentBlock, editScope: ContentScope, appTab: 'website' | 'order_app'): string {
  if (block.state === 'split' && block.shareable) {
    return appTab === 'website' ? 'Website' : 'Order app';
  }
  if (editScope === 'order_app') return 'Order app';
  if (editScope === 'website') return 'Website';
  return 'Shared';
}

function collectChanges(drafts: DraftMap, locale: ContentLocale) {
  const changes: Array<{ key: string; scope: ContentScope; value: string; locale: ContentLocale }> = [];
  for (const [key, scopes] of Object.entries(drafts)) {
    for (const [scope, value] of Object.entries(scopes)) {
      changes.push({ key, scope: scope as ContentScope, value, locale });
    }
  }
  return changes;
}

export default function ContentStudioPage() {
  usePageTitle('Content Studio');
  const { success, error } = useToast();
  const [blocks, setBlocks] = useState<ContentBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [group, setGroup] = useState<string>('All');
  const [q, setQ] = useState('');
  const [drafts, setDrafts] = useState<DraftMap>({});
  const [appTab, setAppTab] = useState<'website' | 'order_app'>('website');
  const [locale, setLocale] = useState<ContentLocale>('en');
  const [historyKey, setHistoryKey] = useState<string | null>(null);
  const [historyScope, setHistoryScope] = useState<ContentScope>('shared');
  const [revisions, setRevisions] = useState<ContentRevision[]>([]);
  const [schedules, setSchedules] = useState<ContentScheduleRow[]>([]);
  const [scheduleAt, setScheduleAt] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const uploadCtx = useRef<{
    blockKey: string;
    scope: ContentScope;
    onDone: (url: string) => void;
  } | null>(null);

  const loadGen = useRef(0);

  const load = async (loc: ContentLocale = locale) => {
    const gen = ++loadGen.current;
    setLoading(true);
    try {
      const [{ blocks: b }, { schedules: s }] = await Promise.all([
        getContentBlocks(loc),
        getContentSchedules('pending'),
      ]);
      if (gen !== loadGen.current) return;
      setBlocks(b);
      setSchedules(s);
      setDrafts({});
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when locale changes
  }, [locale]);

  const groups = useMemo(() => {
    const g = new Set(blocks.map((b) => b.group));
    return ['All', ...Array.from(g).sort()];
  }, [blocks]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return blocks.filter((b) => {
      if (group !== 'All' && b.group !== group) return false;
      if (!qq) return true;
      return b.key.toLowerCase().includes(qq) || b.label.toLowerCase().includes(qq);
    });
  }, [blocks, group, q]);

  const dirtyCount = useMemo(() => {
    let n = 0;
    for (const key of Object.keys(drafts)) {
      n += Object.keys(drafts[key] || {}).length;
    }
    return n;
  }, [drafts]);

  const setDraft = (key: string, scope: ContentScope, value: string) => {
    setDrafts((prev) => ({
      ...prev,
      [key]: { ...(prev[key] || {}), [scope]: value },
    }));
  };

  const publish = async () => {
    const changes = collectChanges(drafts, locale);
    if (changes.length === 0) return;
    setSaving(true);
    try {
      const { blocks: b } = await updateContent(changes, locale);
      setBlocks(b);
      setDrafts({});
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

  const toggleSplit = async (block: ContentBlock) => {
    try {
      if (block.state === 'shared') {
        const { blocks: b } = await splitContentBlock(block.key, locale);
        setBlocks(b);
        success('Now editing per app');
      } else {
        if (!window.confirm('Reset to shared? Per-app overrides will be removed.')) return;
        const { blocks: b } = await shareContentBlock(block.key, locale);
        setBlocks(b);
        success('Back to shared');
      }
    } catch (e) {
      error(e instanceof Error ? e.message : 'Toggle failed');
    }
  };

  const copy = async (block: ContentBlock, from: ContentScope, to: ContentScope) => {
    try {
      const { blocks: b } = await copyContentBlock(block.key, from, to, locale);
      setBlocks(b);
      success(`Copied ${from} → ${to}`);
    } catch (e) {
      error(e instanceof Error ? e.message : 'Copy failed');
    }
  };

  const onUpload = async (block: ContentBlock, scope: ContentScope, file: File) => {
    try {
      const res = await uploadContentImage(block.key, scope, file, undefined, locale);
      setDraft(block.key, scope, res.url);
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

  const handleEmbedFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const ctx = uploadCtx.current;
    e.target.value = '';
    uploadCtx.current = null;
    if (!file || !ctx) return;
    try {
      const res = await uploadContentImage(ctx.blockKey, ctx.scope, file, undefined, locale);
      ctx.onDone(res.url);
      success('Image uploaded');
    } catch (err) {
      error(err instanceof Error ? err.message : 'Upload failed');
    }
  };

  const openHistory = async (block: ContentBlock, scope: ContentScope) => {
    setHistoryKey(block.key);
    setHistoryScope(scope);
    try {
      const { revisions: r } = await getContentRevisions(block.key, scope, locale);
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
      const { revisions: r } = await getContentRevisions(historyKey, historyScope, locale);
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
      a.download = `content-export-${locale}-${new Date().toISOString().slice(0, 10)}.json`;
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

  const renderVisualEditor = (block: ContentBlock, editScope: ContentScope, val: string) => {
    const onChange = (next: string) => setDraft(block.key, editScope, next);
    const triggerUpload = makeTriggerUpload(block, editScope);
    const common = { label: block.label, value: val, onChange };

    switch (block.editor) {
      case 'hero': {
        const slideNum = block.key.replace('hero_slide_', '') || '1';
        return (
          <HeroSlideEditor
            {...common}
            uploadKey={`hero_${slideNum}_image`}
            triggerUpload={triggerUpload}
          />
        );
      }
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

  return (
    <div className={`content-studio-page${dirtyCount > 0 ? ' content-studio-page--dirty' : ''}`}>
      <PageHeader
        title="Content Studio"
        subtitle="Shared or per-app copy · EN / DV · schedule · history · import/export"
        action={
          <div className="content-studio-header-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <Btn onClick={() => void doExport()} variant="secondary">
              <Download size={16} /> Export
            </Btn>
            <Btn onClick={() => importInputRef.current?.click()} variant="secondary">
              <UploadIcon size={16} /> Import
            </Btn>
            <Btn onClick={() => void publish()} disabled={saving || dirtyCount === 0} className="content-studio-publish-desktop">
              <Save size={16} /> {saving ? 'Publishing…' : `Publish${dirtyCount ? ` (${dirtyCount})` : ''}`}
            </Btn>
          </div>
        }
      />

      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => void handleEmbedFile(e)} />
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
            <LayoutTemplate size={16} /> Groups
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
                onClick={() => setGroup(g)}
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
        </aside>

        <div className="content-studio-blocks" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {loading ? <p style={{ color: '#9C8E7E' }}>Loading…</p> : null}
          {!loading && filtered.length === 0 ? <p style={{ color: '#9C8E7E' }}>No blocks match.</p> : null}

          {filtered.map((block) => {
            const editScope = scopeForEdit(block, appTab);
            const val = valueFor(block, editScope, drafts);
            const appsLabel = block.apps.length > 1 ? 'Both apps' : (block.apps[0] === 'website' ? 'Website' : 'Order app');
            const visual = block.editor ? renderVisualEditor(block, editScope, val) : null;
            const showPreview = !!block.editor && VISUAL_PREVIEW_EDITORS.has(block.editor);

            return (
              <div key={`${block.key}-${locale}`} className="content-studio-block" style={{
                background: '#fff', border: '1px solid #E8E0D8', borderRadius: 14, padding: 16,
              }}>
                <div className="content-studio-block-head" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
                  <div style={{ minWidth: 0, flex: '1 1 160px' }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#1C1408' }}>{block.label}</div>
                    <div className="content-studio-block-meta" style={{ fontSize: 12, color: '#9C8E7E', marginTop: 2, wordBreak: 'break-word' }}>
                      {block.key} · {block.type}{block.editor ? ` · ${block.editor}` : ''} · {locale} · {appsLabel}
                      {' · '}
                      <span style={{ color: block.state === 'split' ? '#D4813A' : '#3d7a4a', fontWeight: 600 }}>
                        {block.state === 'split' ? 'Different per app' : 'Shared'}
                      </span>
                    </div>
                  </div>
                  <div className="content-studio-block-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => void openHistory(block, editScope)}
                      style={{
                        height: 36, padding: '0 10px', borderRadius: 10, border: '1px solid #E8E0D8',
                        background: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12,
                      }}
                    >
                      <History size={12} style={{ verticalAlign: -1 }} /> History
                    </button>
                    {block.shareable ? (
                      <>
                        <button
                          type="button"
                          onClick={() => void toggleSplit(block)}
                          style={{
                            height: 36, padding: '0 12px', borderRadius: 10, border: '1px solid #E8E0D8',
                            background: block.state === 'split' ? '#FFF7ED' : '#F8F6F3', cursor: 'pointer',
                            fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
                          }}
                        >
                          {block.state === 'shared' ? 'Make different per app' : 'Reset to shared'}
                        </button>
                        {block.state === 'split' ? (
                          <>
                            <button type="button" onClick={() => void copy(block, 'website', 'order_app')}
                              style={{ height: 36, padding: '0 10px', borderRadius: 10, border: '1px solid #E8E0D8', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}>
                              <Copy size={12} style={{ verticalAlign: -1 }} /> Web→Order
                            </button>
                            <button type="button" onClick={() => void copy(block, 'order_app', 'website')}
                              style={{ height: 36, padding: '0 10px', borderRadius: 10, border: '1px solid #E8E0D8', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}>
                              Order→Web
                            </button>
                          </>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </div>

                {block.shareable && block.state === 'split' ? (
                  <div className="tab-scroll-row content-studio-app-tabs" style={{ display: 'flex', gap: 0, marginBottom: 10, borderBottom: '1px solid #E8E0D8' }}>
                    {(['website', 'order_app'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setAppTab(t)}
                        style={{
                          padding: '8px 14px', border: 'none', background: 'none', cursor: 'pointer',
                          fontFamily: 'inherit', fontSize: 13, fontWeight: appTab === t ? 700 : 500,
                          color: appTab === t ? '#D4813A' : '#9C8E7E',
                          borderBottom: appTab === t ? '2px solid #D4813A' : '2px solid transparent',
                          marginBottom: -1,
                        }}
                      >
                        {t === 'website' ? 'Website' : 'Order app'}
                      </button>
                    ))}
                  </div>
                ) : null}

                {historyKey === block.key ? (
                  <div style={{ marginBottom: 12, padding: 12, borderRadius: 10, background: '#F8F6F3', border: '1px solid #E8E0D8' }}>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>History · {historyScope} · {locale}</div>
                    {revisions.length === 0 ? <p style={{ margin: 0, fontSize: 12, color: '#9C8E7E' }}>No revisions yet.</p> : null}
                    {revisions.map((r) => (
                      <div key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8, fontSize: 12 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ color: '#9C8E7E' }}>{new Date(r.created_at).toLocaleString()}</div>
                          <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 60, overflow: 'hidden' }}>
                            {(r.value || '—').slice(0, 200)}
                          </div>
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
                ) : block.type === 'boolean' ? (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                    <input
                      type="checkbox"
                      checked={val === 'true' || val === '1'}
                      onChange={(e) => setDraft(block.key, editScope, e.target.checked ? 'true' : 'false')}
                    />
                    Enabled
                  </label>
                ) : block.type === 'image' ? (
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    {val ? <img src={val} alt="" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 10 }} /> : null}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void onUpload(block, editScope, f);
                      }}
                    />
                    <input
                      value={val}
                      onChange={(e) => setDraft(block.key, editScope, e.target.value)}
                      placeholder="/storage/…"
                      style={{ flex: 1, minWidth: 180, height: 40, borderRadius: 10, border: '1px solid #E8E0D8', padding: '0 10px', fontFamily: 'inherit' }}
                    />
                  </div>
                ) : block.type === 'textarea' || block.type === 'json' ? (
                  <textarea
                    value={val}
                    onChange={(e) => setDraft(block.key, editScope, e.target.value)}
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
                    onChange={(e) => setDraft(block.key, editScope, e.target.value)}
                    dir={locale === 'dv' ? 'rtl' : 'ltr'}
                    style={{
                      width: '100%', height: 44, borderRadius: 10, border: '1px solid #E8E0D8',
                      padding: '0 12px', fontFamily: 'inherit', fontSize: 14,
                    }}
                  />
                )}

                {showPreview && block.editor ? (
                  <VisualBlockPreview
                    editor={block.editor}
                    value={val}
                    appLabel={`${previewAppLabel(block, editScope, appTab)} · ${locale}`}
                  />
                ) : (
                  <div style={{ marginTop: 10, fontSize: 12, color: '#9C8E7E' }}>
                    Preview: website “{(block.resolved_website || '—').toString().slice(0, 80)}”
                    {' · '}
                    order “{(block.resolved_order_app || '—').toString().slice(0, 80)}”
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {dirtyCount > 0 ? (
        <div className="content-studio-sticky-bar" role="region" aria-label="Unsaved changes">
          <span className="content-studio-sticky-bar-label">{dirtyCount} unsaved change{dirtyCount === 1 ? '' : 's'}</span>
          <Btn onClick={() => void publish()} disabled={saving} style={{ flex: 1 }}>
            <Save size={16} /> {saving ? 'Publishing…' : `Publish (${dirtyCount})`}
          </Btn>
        </div>
      ) : null}
    </div>
  );
}
