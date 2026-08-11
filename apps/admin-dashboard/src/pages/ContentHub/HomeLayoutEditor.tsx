import { useCallback, useEffect, useState } from 'react';
import {
  createPageBlock,
  createPageBlockPreviewToken,
  deletePageBlock,
  discardPageBlockDraft,
  fetchAdminPageBlocks,
  publishPageBlocks,
  reorderPageBlocks,
  updatePageBlock,
  type PageBlockApp,
  type PageBlockRow,
  type PageBlockType,
} from '../../api/pageBlocks';
import { GenericBlockSettingsForm, isGenericBlockType, type BlockSettings } from './GenericBlockSettingsForm';

type Props = {
  /** Optional: bump to force reload after publish. */
  reloadKey?: number;
};

const APP_TABS: Array<{ id: PageBlockApp; label: string }> = [
  { id: 'website', label: 'Website home' },
  { id: 'order_app', label: 'Order app home' },
];

/**
 * Per-app home layout builder — lives inside ContentHub Homepage chrome
 * so the owner has one place to edit content and arrangement.
 */
export function HomeLayoutEditor({ reloadKey = 0 }: Props) {
  const [app, setApp] = useState<PageBlockApp>('website');
  const [blocks, setBlocks] = useState<PageBlockRow[]>([]);
  const [types, setTypes] = useState<PageBlockType[]>([]);
  const [unknown, setUnknown] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [addType, setAddType] = useState('');
  const [previewMsg, setPreviewMsg] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [draftVersion, setDraftVersion] = useState(0);
  const [hasDraft, setHasDraft] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setExpandedId(null);
    try {
      const res = await fetchAdminPageBlocks(app);
      setBlocks(res.blocks ?? []);
      setTypes(res.available_types ?? []);
      setUnknown(res.unknown_types ?? []);
      setDraftVersion(res.version ?? 0);
      setHasDraft(Boolean(res.draft));
      setSavedAt(res.saved_at ?? null);
    } catch (e) {
      setError((e as Error).message || 'Could not load home layout.');
    } finally {
      setLoading(false);
    }
  }, [app]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const usedTypes = new Set(blocks.map((b) => b.block_type));
  // Named sections exist once per page; generic content blocks (text, image,
  // divider, …) can be stacked as many times as the owner wants.
  const addable = types.filter(
    (t) => !usedTypes.has(t.type) || t.allows_multiple || t.type === 'promo_carousel',
  );

  const persistOrder = async (next: PageBlockRow[]) => {
    setBusy(true);
    setError('');
    try {
      await reorderPageBlocks({
        app,
        version: draftVersion,
        blocks: next.map((b, i) => ({
          id: b.id,
          position: i,
          is_enabled: b.is_enabled,
        })),
      }).then((res) => {
        setDraftVersion(res.version);
        setHasDraft(true);
      });
      setBlocks(next.map((b, i) => ({ ...b, position: i })));
    } catch (e) {
      setError((e as Error).message || 'Could not save order.');
      await load();
    } finally {
      setBusy(false);
    }
  };

  const move = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    const tmp = next[index];
    next[index] = next[j];
    next[j] = tmp;
    void persistOrder(next);
  };

  const toggleEnabled = async (block: PageBlockRow) => {
    if (!block.removable && block.is_enabled) {
      setError(block.non_removable_reason || `“${block.label}” cannot be turned off.`);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await updatePageBlock(block.id, {
        app,
        page: 'home',
        version: draftVersion,
        is_enabled: !block.is_enabled,
      });
      setBlocks((prev) => prev.map((b) => (b.id === block.id ? { ...b, ...res.block } : b)));
      setDraftVersion(res.version);
      setHasDraft(true);
    } catch (e) {
      setError((e as Error).message || 'Could not update block.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (block: PageBlockRow) => {
    if (!block.removable) {
      setError(block.non_removable_reason || `“${block.label}” cannot be removed.`);
      return;
    }
    if (!window.confirm(`Remove “${block.label}” from this home page?`)) return;
    setBusy(true);
    setError('');
    try {
      const res = await deletePageBlock({ id: block.id, app, version: draftVersion });
      setBlocks(res.blocks ?? []);
      setDraftVersion(res.version);
      setHasDraft(true);
    } catch (e) {
      setError((e as Error).message || 'Could not remove block.');
    } finally {
      setBusy(false);
    }
  };

  const setMode = async (block: PageBlockRow, mode: 'shared' | 'own') => {
    let shareSource: 'website' | 'order_app' | 'shared' | undefined;
    if (mode === 'shared' && block.content_mode === 'own') {
      const choice = window.prompt(
        `Share “${block.label}” across both apps.\n\nUse content from: website, order_app, or shared?`,
        app,
      );
      if (choice !== 'website' && choice !== 'order_app' && choice !== 'shared') {
        return;
      }
      shareSource = choice;
    }
    setBusy(true);
    setError('');
    try {
      const res = await updatePageBlock(block.id, {
        app,
        page: 'home',
        version: draftVersion,
        content_mode: mode,
        ...(shareSource ? { share_source: shareSource } : {}),
      });
      setBlocks((prev) => prev.map((b) => (b.id === block.id ? { ...b, ...res.block } : b)));
      setDraftVersion(res.version);
      setHasDraft(true);
      if (mode === 'own' && block.content_mode === 'shared') {
        setPreviewMsg(`Copied shared content into “${block.label}” as a starting point.`);
      }
    } catch (e) {
      setError((e as Error).message || 'Could not change content mode.');
    } finally {
      setBusy(false);
    }
  };

  const saveSettings = async (block: PageBlockRow, settings: BlockSettings) => {
    setBusy(true);
    setError('');
    try {
      const res = await updatePageBlock(block.id, {
        app,
        page: 'home',
        version: draftVersion,
        settings,
      });
      setBlocks((prev) => prev.map((b) => (b.id === block.id ? { ...b, ...res.block } : b)));
      setDraftVersion(res.version);
      setHasDraft(true);
    } catch (e) {
      setError((e as Error).message || 'Could not save this section’s content.');
      throw e;
    } finally {
      setBusy(false);
    }
  };

  const addBlock = async () => {
    if (!addType) return;
    setBusy(true);
    setError('');
    try {
      const def = types.find((t) => t.type === addType);
      const created = await createPageBlock({
        app,
        version: draftVersion,
        block_type: addType,
        content_mode: def?.supports_shared_content ? 'shared' : 'own',
      });
      setDraftVersion(created.version);
      setHasDraft(true);
      setAddType('');
      await load();
      // A fresh generic block is empty — open its form so the owner can type
      // something into it right away.
      if (isGenericBlockType(addType)) setExpandedId(created.block.id);
    } catch (e) {
      setError((e as Error).message || 'Could not add block.');
    } finally {
      setBusy(false);
    }
  };

  const preview = async () => {
    setBusy(true);
    setPreviewMsg('');
    setError('');
    try {
      const { token, website_url, order_app_url } = await createPageBlockPreviewToken({
        app,
        version: draftVersion,
      });
      const path = app === 'website'
        ? (website_url ?? `/admin/preview/website/home?token=${encodeURIComponent(token)}`)
        : (order_app_url ?? `/order/?previewToken=${encodeURIComponent(token)}`);
      window.open(path, '_blank', 'noopener,noreferrer');
      setPreviewMsg('Draft preview opened in a new tab. It expires in 15 minutes and does not change the live page.');
    } catch (e) {
      setError((e as Error).message || 'Could not create preview.');
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    setBusy(true);
    setError('');
    setPreviewMsg('');
    try {
      const res = await publishPageBlocks({ app, version: draftVersion });
      setBlocks(res.blocks ?? []);
      setDraftVersion(res.version ?? 0);
      setHasDraft(Boolean(res.draft));
      setSavedAt(null);
      setPreviewMsg('Published. The live home page now uses these layout changes.');
    } catch (e) {
      setError((e as Error).message || 'Could not publish layout.');
    } finally {
      setBusy(false);
    }
  };

  const discard = async () => {
    if (!window.confirm('Discard this unpublished layout draft?')) return;
    setBusy(true);
    setError('');
    setPreviewMsg('');
    try {
      const res = await discardPageBlockDraft({ app });
      setBlocks(res.blocks ?? []);
      setDraftVersion(res.version ?? 0);
      setHasDraft(Boolean(res.draft));
      setSavedAt(null);
      setPreviewMsg('Draft discarded. You are viewing the live layout again.');
    } catch (e) {
      setError((e as Error).message || 'Could not discard draft.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-testid="home-layout-editor"
      style={{
        border: '1px solid var(--color-border)',
        borderRadius: 12,
        padding: 14,
        background: 'var(--color-surface)',
        marginBottom: 12,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--color-text)' }}>Home page layout</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2, maxWidth: 480 }}>
            Add, turn on/off, and rearrange sections for each home page. Text blocks, pictures,
            videos, buttons, dividers, and FAQs are written right here with “Edit content”. The
            named sections (hero, specials, categories …) are still edited in the cards below.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <span
            style={{
              alignSelf: 'center',
              fontSize: 12,
              fontWeight: 700,
              color: hasDraft ? 'var(--color-warning-strong)' : 'var(--color-success)',
            }}
          >
            {hasDraft ? `Draft v${draftVersion}${savedAt ? ' saved' : ''}` : 'Saved live'}
          </span>
          <button
            type="button"
            onClick={() => void preview()}
            disabled={busy || loading}
            style={btnSecondary}
          >
            Draft preview
          </button>
          <button
            type="button"
            onClick={() => void publish()}
            disabled={busy || loading || !hasDraft}
            style={btnPrimary}
          >
            Publish
          </button>
          <button
            type="button"
            onClick={() => void discard()}
            disabled={busy || loading || !hasDraft}
            style={btnSecondary}
          >
            Discard
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {APP_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            data-testid={`home-layout-tab-${tab.id}`}
            onClick={() => setApp(tab.id)}
            style={{
              ...btnSecondary,
              background: app === tab.id ? 'var(--color-primary)' : 'transparent',
              color: app === tab.id ? 'var(--color-bg)' : 'var(--color-text-secondary)',
              borderColor: app === tab.id ? 'var(--color-primary)' : 'var(--color-border)',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Loading layout…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {blocks.length === 0 && !error && (
            <div
              role="alert"
              data-testid="home-layout-empty-warning"
              style={{
                border: '2px solid var(--color-danger)',
                background: 'var(--color-danger-bg)',
                borderRadius: 10,
                padding: '10px 12px',
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--color-danger-strong)',
              }}
            >
              This home page has no sections — customers will only see required chrome. Add sections below.
            </div>
          )}
          {blocks.map((block, index) => (
            <div
              key={block.id}
              data-testid={`home-layout-block-${block.block_type}`}
              data-block-id={block.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: 8,
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid var(--color-border)',
                background: block.is_enabled ? 'var(--color-bg)' : 'var(--color-border-light)',
                opacity: block.is_enabled ? 1 : 0.7,
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--color-text)' }}>
                  {block.label}
                  {!block.is_enabled && (
                    <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)' }}>
                      Off
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
                  {block.description}
                </div>
                {block.block_type === 'opening_status' && (
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
                    Shown inside the hero banner while the hero is on — moving it here only
                    matters when the hero is turned off.
                  </div>
                )}
                {!block.removable && (
                  <div style={{ fontSize: 11, color: 'var(--color-warning-strong)', marginTop: 4, fontWeight: 600 }}>
                    Required — {block.non_removable_reason}
                  </div>
                )}
                {block.supports_shared_content && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Content:</span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void setMode(block, 'shared')}
                      style={{
                        ...chipBtn,
                        background: block.content_mode === 'shared' ? 'var(--color-primary)' : 'transparent',
                        color: block.content_mode === 'shared' ? 'var(--color-bg)' : 'var(--color-text-secondary)',
                      }}
                    >
                      Shared (both apps)
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void setMode(block, 'own')}
                      style={{
                        ...chipBtn,
                        background: block.content_mode === 'own' ? 'var(--color-primary)' : 'transparent',
                        color: block.content_mode === 'own' ? 'var(--color-bg)' : 'var(--color-text-secondary)',
                      }}
                    >
                      This app only
                    </button>
                  </div>
                )}
                {isGenericBlockType(block.block_type) && (
                  <>
                    <button
                      type="button"
                      data-testid={`home-layout-edit-${block.id}`}
                      onClick={() => setExpandedId(expandedId === block.id ? null : block.id)}
                      style={{ ...chipBtn, marginTop: 8 }}
                    >
                      {expandedId === block.id ? 'Hide content' : 'Edit content'}
                    </button>
                    {expandedId === block.id && (
                      <GenericBlockSettingsForm
                        block={block}
                        busy={busy}
                        onSave={(settings) => saveSettings(block, settings)}
                      />
                    )}
                  </>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'stretch' }}>
                <button type="button" disabled={busy || index === 0} onClick={() => move(index, -1)} style={btnTiny}>↑</button>
                <button type="button" disabled={busy || index === blocks.length - 1} onClick={() => move(index, 1)} style={btnTiny}>↓</button>
                <button type="button" disabled={busy} onClick={() => void toggleEnabled(block)} style={btnTiny}>
                  {block.is_enabled ? 'Turn off' : 'Turn on'}
                </button>
                <button
                  type="button"
                  disabled={busy || !block.removable}
                  title={!block.removable ? (block.non_removable_reason ?? undefined) : 'Remove'}
                  onClick={() => void remove(block)}
                  style={{ ...btnTiny, color: block.removable ? 'var(--color-danger)' : 'var(--color-text-muted)' }}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}

          <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              value={addType}
              onChange={(e) => setAddType(e.target.value)}
              style={{
                minHeight: 40,
                borderRadius: 8,
                border: '1px solid var(--color-border)',
                padding: '0 10px',
                fontSize: 13,
                flex: 1,
                minWidth: 180,
              }}
            >
              <option value="">Add a section…</option>
              {addable.map((t) => (
                <option key={t.type} value={t.type}>{t.label}</option>
              ))}
            </select>
            <button type="button" disabled={busy || !addType} onClick={() => void addBlock()} style={btnPrimary}>
              Add
            </button>
          </div>
        </div>
      )}

      {unknown.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--color-warning-strong)' }}>
          Unknown section types on this page (hidden on the live site): {unknown.join(', ')}
        </div>
      )}
      {error && (
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--color-danger)', fontWeight: 600 }}>{error}</div>
      )}
      {previewMsg && (
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--color-success)' }}>{previewMsg}</div>
      )}
    </div>
  );
}

const btnSecondary: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const btnPrimary: React.CSSProperties = {
  ...btnSecondary,
  background: 'var(--color-primary)',
  borderColor: 'var(--color-primary)',
  color: 'var(--color-bg)',
};

const btnTiny: React.CSSProperties = {
  padding: '4px 8px',
  borderRadius: 6,
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
  fontSize: 11,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const chipBtn: React.CSSProperties = {
  padding: '4px 8px',
  borderRadius: 999,
  border: '1px solid var(--color-border)',
  fontSize: 11,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
