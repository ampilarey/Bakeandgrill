import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, LayoutTemplate, Save, Search } from 'lucide-react';
import {
  copyContentBlock,
  getContentBlocks,
  shareContentBlock,
  splitContentBlock,
  updateContent,
  uploadContentImage,
  type ContentBlock,
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadCtx = useRef<{
    blockKey: string;
    scope: ContentScope;
    onDone: (url: string) => void;
  } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { blocks: b } = await getContentBlocks();
      setBlocks(b);
      setDrafts({});
    } catch (e) {
      error(e instanceof Error ? e.message : 'Failed to load content');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

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
    const changes: Array<{ key: string; scope: ContentScope; value: string }> = [];
    for (const [key, scopes] of Object.entries(drafts)) {
      for (const [scope, value] of Object.entries(scopes)) {
        changes.push({ key, scope: scope as ContentScope, value });
      }
    }
    if (changes.length === 0) return;
    setSaving(true);
    try {
      const { blocks: b } = await updateContent(changes);
      setBlocks(b);
      setDrafts({});
      success('Content published');
    } catch (e) {
      error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const toggleSplit = async (block: ContentBlock) => {
    try {
      if (block.state === 'shared') {
        const { blocks: b } = await splitContentBlock(block.key);
        setBlocks(b);
        success('Now editing per app');
      } else {
        if (!window.confirm('Reset to shared? Per-app overrides will be removed.')) return;
        const { blocks: b } = await shareContentBlock(block.key);
        setBlocks(b);
        success('Back to shared');
      }
    } catch (e) {
      error(e instanceof Error ? e.message : 'Toggle failed');
    }
  };

  const copy = async (block: ContentBlock, from: ContentScope, to: ContentScope) => {
    try {
      const { blocks: b } = await copyContentBlock(block.key, from, to);
      setBlocks(b);
      success(`Copied ${from} → ${to}`);
    } catch (e) {
      error(e instanceof Error ? e.message : 'Copy failed');
    }
  };

  const onUpload = async (block: ContentBlock, scope: ContentScope, file: File) => {
    try {
      const res = await uploadContentImage(block.key, scope, file);
      setDraft(block.key, scope, res.url);
      success('Image uploaded');
    } catch (e) {
      error(e instanceof Error ? e.message : 'Upload failed');
    }
  };

  /** Scoped crop upload for visual editors — embeds URL into draft JSON (does not wipe the block). */
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
      const res = await uploadContentImage(ctx.blockKey, ctx.scope, file);
      ctx.onDone(res.url);
      success('Image uploaded');
    } catch (err) {
      error(err instanceof Error ? err.message : 'Upload failed');
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
    <div>
      <PageHeader
        title="Content Studio"
        subtitle="Shared or per-app copy for the website and order app"
        action={
          <Btn onClick={() => void publish()} disabled={saving || dirtyCount === 0}>
            <Save size={16} /> {saving ? 'Publishing…' : `Publish${dirtyCount ? ` (${dirtyCount})` : ''}`}
          </Btn>
        }
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => void handleEmbedFile(e)}
      />

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }} className="form-grid-2">
        <aside style={{
          width: 220, flexShrink: 0, background: '#fff', border: '1px solid #E8E0D8',
          borderRadius: 14, padding: 12, position: 'sticky', top: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, color: '#1C1408', fontWeight: 700 }}>
            <LayoutTemplate size={16} /> Groups
          </div>
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: '#9C8E7E' }} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search blocks…"
              style={{
                width: '100%', height: 36, paddingLeft: 30, borderRadius: 10,
                border: '1px solid #E8E0D8', fontSize: 13, fontFamily: 'inherit',
              }}
            />
          </div>
          {groups.map((g) => (
            <button
              key={g}
              type="button"
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
        </aside>

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {loading ? <p style={{ color: '#9C8E7E' }}>Loading…</p> : null}
          {!loading && filtered.length === 0 ? <p style={{ color: '#9C8E7E' }}>No blocks match.</p> : null}

          {filtered.map((block) => {
            const editScope = scopeForEdit(block, appTab);
            const val = valueFor(block, editScope, drafts);
            const appsLabel = block.apps.length > 1 ? 'Both apps' : (block.apps[0] === 'website' ? 'Website' : 'Order app');
            const visual = block.editor ? renderVisualEditor(block, editScope, val) : null;
            const showPreview = !!block.editor && VISUAL_PREVIEW_EDITORS.has(block.editor);

            return (
              <div key={block.key} style={{
                background: '#fff', border: '1px solid #E8E0D8', borderRadius: 14, padding: 16,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#1C1408' }}>{block.label}</div>
                    <div style={{ fontSize: 12, color: '#9C8E7E', marginTop: 2 }}>
                      {block.key} · {block.type}{block.editor ? ` · ${block.editor}` : ''} · {appsLabel}
                      {' · '}
                      <span style={{ color: block.state === 'split' ? '#D4813A' : '#3d7a4a', fontWeight: 600 }}>
                        {block.state === 'split' ? 'Different per app' : 'Shared'}
                      </span>
                    </div>
                  </div>
                  {block.shareable ? (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
                    </div>
                  ) : null}
                </div>

                {block.shareable && block.state === 'split' ? (
                  <div style={{ display: 'flex', gap: 0, marginBottom: 10, borderBottom: '1px solid #E8E0D8' }}>
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
                    style={{
                      width: '100%', borderRadius: 10, border: '1px solid #E8E0D8', padding: 10,
                      fontFamily: block.type === 'json' ? 'ui-monospace, monospace' : 'inherit', fontSize: 13,
                    }}
                  />
                ) : (
                  <input
                    value={val}
                    onChange={(e) => setDraft(block.key, editScope, e.target.value)}
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
                    appLabel={previewAppLabel(block, editScope, appTab)}
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
    </div>
  );
}
