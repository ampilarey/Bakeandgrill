import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
  type CSSProperties,
} from 'react';
import { ChevronRight } from 'lucide-react';
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
import { ContentEditorSheet } from '../../components/ContentEditorSheet';
import { GenericBlockSettingsForm, isGenericBlockType, type BlockSettings } from './GenericBlockSettingsForm';
import {
  HOME_COMPONENT_LIBRARY,
  instanceStatus,
  placementLabels,
  type HomeApp,
  type LibraryComponent,
} from './homeComponentLibrary';
import { heroPromoConflict } from './surfaceRegistry';
import {
  blockOnSurface,
  surfaceBreadcrumb,
  typesForSlot,
  type SurfaceFilter,
} from './surfaceCatalog';

export type LayoutDraftSignal = {
  hasDraft: boolean;
  /** Bumps whenever either app's layout draft version changes — used to remint previews. */
  revision: number;
};

type Props = {
  reloadKey?: number;
  initialApp?: PageBlockApp;
  surfaceFilter?: SurfaceFilter;
  onLayoutDraftChange?: (signal: LayoutDraftSignal) => void;
};

type AppState = {
  blocks: PageBlockRow[];
  types: PageBlockType[];
  version: number;
  hasDraft: boolean;
};

/** Imperative handle so a parent (Content Hub unified publish bar) can drive this editor. */
export type HomeLayoutEditorHandle = {
  publishAll: () => Promise<void>;
  discardAll: () => Promise<void>;
  reload: () => Promise<void>;
  hasDraft: boolean;
};

/** One overview row — a single component instance (or an unfilled "add" slot for a type). */
type OverviewRow = {
  rowKey: string;
  comp: LibraryComponent;
  website?: PageBlockRow;
  orderApp?: PageBlockRow;
  /** True for the trailing "add another" slot on multi-instance types. */
  isAddSlot?: boolean;
};

/**
 * The currently open editor sheet, identified by specific block ids rather
 * than just a type — required so multi-instance blocks (e.g. rich text) edit
 * one instance at a time instead of always the first of that type.
 */
type EditingSession = {
  type: string;
  websiteId: number | null;
  orderId: number | null;
  isAddSlot: boolean;
};

const emptyApp = (): AppState => ({ blocks: [], types: [], version: 0, hasDraft: false });

/**
 * Home Components overview — dual-app cards + focused editor.
 * Overview shows Website / Order App status; Edit opens drawer/sheet.
 */
export const HomeLayoutEditor = forwardRef<HomeLayoutEditorHandle, Props>(function HomeLayoutEditor({
  reloadKey = 0,
  initialApp = 'website',
  surfaceFilter,
  onLayoutDraftChange,
}: Props, ref) {
  const [website, setWebsite] = useState<AppState>(emptyApp);
  const [orderApp, setOrderApp] = useState<AppState>(emptyApp);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [previewMsg, setPreviewMsg] = useState('');
  const [editingSession, setEditingSession] = useState<EditingSession | null>(null);
  const [reorderApp, setReorderApp] = useState<HomeApp | null>(null);
  const [focusApp, setFocusApp] = useState<HomeApp>(surfaceFilter?.app ?? initialApp);

  useEffect(() => {
    setFocusApp(surfaceFilter?.app ?? initialApp);
  }, [initialApp, surfaceFilter?.app]);

  const hasDraft = website.hasDraft || orderApp.hasDraft;
  const layoutRevision = (website.version * 1_000_000) + orderApp.version + (hasDraft ? 1 : 0);
  // Skip while loading so we don't briefly report "no draft" and clear the
  // parent's layoutDraft flag that was seeded from the landing fetch.
  useEffect(() => {
    if (loading) return;
    onLayoutDraftChange?.({ hasDraft, revision: layoutRevision });
  }, [hasDraft, layoutRevision, onLayoutDraftChange, loading]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [w, o] = await Promise.all([
        fetchAdminPageBlocks('website'),
        fetchAdminPageBlocks('order_app'),
      ]);
      setWebsite({
        blocks: w.blocks ?? [],
        types: w.available_types ?? [],
        version: w.version ?? 0,
        hasDraft: Boolean(w.draft),
      });
      setOrderApp({
        blocks: o.blocks ?? [],
        types: o.available_types ?? [],
        version: o.version ?? 0,
        hasDraft: Boolean(o.draft),
      });
    } catch (e) {
      setError((e as Error).message || 'Could not load home layouts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const stateFor = (app: HomeApp) => (app === 'website' ? website : orderApp);
  const setStateFor = (app: HomeApp, next: AppState) => {
    if (app === 'website') setWebsite(next);
    else setOrderApp(next);
  };

  /** Find a specific instance by id, or (legacy) the first instance of a type. */
  const findInstance = (app: HomeApp, type: string, id?: number) => {
    const list = stateFor(app).blocks;
    if (id !== undefined) return list.find((b) => b.id === id);
    return list.find((b) => b.block_type === type);
  };

  const library = useMemo(() => {
    const fromApi = [...website.types, ...orderApp.types];
    const byType = new Map<string, LibraryComponent>();
    for (const c of HOME_COMPONENT_LIBRARY) byType.set(c.type, c);
    for (const t of fromApi) {
      if (t.deprecated) continue;
      if (!byType.has(t.type)) {
        byType.set(t.type, {
          type: t.type,
          name: t.label,
          summary: t.description,
          supportsSharedContent: t.supports_shared_content,
          allowsMultiple: t.allows_multiple,
          flowWarning: t.flow_warning ?? undefined,
          dynamicSource: t.dynamic_source ?? undefined,
        });
      }
    }
    return Array.from(byType.values());
  }, [website.types, orderApp.types]);

  const visibleLibrary = useMemo(() => {
    if (!surfaceFilter) return library;
    const slotTypes = new Set(typesForSlot(surfaceFilter.slot));
    return library.filter((comp) => {
      if (slotTypes.has(comp.type)) return true;
      const inst = stateFor(surfaceFilter.app).blocks.find((b) => b.block_type === comp.type);
      if (!inst) return false;
      return blockOnSurface(inst.settings, surfaceFilter.device, surfaceFilter.slot);
    });
  }, [library, surfaceFilter, website.blocks, orderApp.blocks]);

  const conflict =
    heroPromoConflict(website.blocks.filter((b) => b.is_enabled).map((b) => b.block_type))
    || heroPromoConflict(orderApp.blocks.filter((b) => b.is_enabled).map((b) => b.block_type));

  /**
   * Overview rows — one card per component type normally, but one card per
   * *instance* for blocks that allow multiple (e.g. rich text). Each app's
   * instances are listed independently since multi-instance blocks are not
   * paired 1:1 across apps like singleton blocks are.
   */
  const overviewRows = useMemo((): OverviewRow[] => {
    const rows: OverviewRow[] = [];
    for (const comp of visibleLibrary) {
      if (!comp.allowsMultiple) {
        rows.push({
          rowKey: comp.type,
          comp,
          website: findInstance('website', comp.type),
          orderApp: findInstance('order_app', comp.type),
        });
        continue;
      }
      const wInstances = website.blocks.filter((b) => b.block_type === comp.type);
      const oInstances = orderApp.blocks.filter((b) => b.block_type === comp.type);
      const max = Math.max(wInstances.length, oInstances.length);
      for (let i = 0; i < max; i += 1) {
        rows.push({
          rowKey: `${comp.type}-${wInstances[i]?.id ?? 'none'}-${oInstances[i]?.id ?? 'none'}`,
          comp,
          website: wInstances[i],
          orderApp: oInstances[i],
        });
      }
      // Always offer one more empty slot so staff can add another instance
      // even after the first one exists (multi-instance blocks are not capped).
      rows.push({ rowKey: `${comp.type}-add-${max}`, comp, isAddSlot: max > 0 });
    }
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleLibrary, website.blocks, orderApp.blocks]);

  const addToApp = async (app: HomeApp, type: string): Promise<PageBlockRow | null> => {
    setBusy(true);
    setError('');
    try {
      const st = stateFor(app);
      const res = await createPageBlock({
        app,
        version: st.version,
        block_type: type,
        content_mode: 'own',
        settings: {},
      });
      const refreshed = await fetchAdminPageBlocks(app);
      setStateFor(app, {
        blocks: refreshed.blocks ?? [],
        types: refreshed.available_types ?? st.types,
        version: refreshed.version ?? res.version,
        hasDraft: true,
      });
      return res.block;
    } catch (e) {
      setError((e as Error).message || `Could not add to ${app}.`);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const toggleEnabled = async (app: HomeApp, block: PageBlockRow) => {
    if (block.flow_warning && block.is_enabled) {
      if (!window.confirm(`${block.flow_warning}\n\nTurn off “${block.label}” for ${app === 'website' ? 'Website' : 'Order App'}?`)) {
        return;
      }
    }
    setBusy(true);
    setError('');
    try {
      const st = stateFor(app);
      const res = await updatePageBlock(block.id, {
        app,
        page: 'home',
        version: st.version,
        is_enabled: !block.is_enabled,
      });
      setStateFor(app, {
        ...st,
        blocks: st.blocks.map((b) => (b.id === block.id ? { ...b, ...res.block } : b)),
        version: res.version,
        hasDraft: true,
      });
    } catch (e) {
      setError((e as Error).message || 'Could not update visibility.');
    } finally {
      setBusy(false);
    }
  };

  const removeFromApp = async (app: HomeApp, block: PageBlockRow) => {
    const warn = block.flow_warning ? `${block.flow_warning}\n\n` : '';
    if (!window.confirm(`${warn}Remove “${block.label}” from ${app === 'website' ? 'Website' : 'Order App'} Home?`)) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      const st = stateFor(app);
      const res = await deletePageBlock({ id: block.id, app, version: st.version });
      setStateFor(app, {
        ...st,
        blocks: res.blocks ?? [],
        version: res.version,
        hasDraft: true,
      });
    } catch (e) {
      setError((e as Error).message || 'Could not remove component.');
    } finally {
      setBusy(false);
    }
  };

  const saveSettings = async (app: HomeApp, block: PageBlockRow, settings: BlockSettings) => {
    setBusy(true);
    setError('');
    try {
      const st = stateFor(app);
      const res = await updatePageBlock(block.id, {
        app,
        page: 'home',
        version: st.version,
        settings,
      });
      setStateFor(app, {
        ...st,
        blocks: st.blocks.map((b) => (b.id === block.id ? { ...b, ...res.block, settings } : b)),
        version: res.version,
        hasDraft: true,
      });
    } catch (e) {
      setError((e as Error).message || 'Could not save settings.');
    } finally {
      setBusy(false);
    }
  };

  const persistOrder = async (app: HomeApp, next: PageBlockRow[]) => {
    setBusy(true);
    setError('');
    try {
      const st = stateFor(app);
      const res = await reorderPageBlocks({
        app,
        version: st.version,
        blocks: next.map((b, i) => ({ id: b.id, position: i, is_enabled: b.is_enabled })),
      });
      setStateFor(app, {
        ...st,
        blocks: next.map((b, i) => ({ ...b, position: i })),
        version: res.version,
        hasDraft: true,
      });
    } catch (e) {
      setError((e as Error).message || 'Could not save order.');
      await load();
    } finally {
      setBusy(false);
    }
  };

  const move = (app: HomeApp, index: number, dir: -1 | 1) => {
    const list = [...stateFor(app).blocks].sort((a, b) => a.position - b.position);
    const j = index + dir;
    if (j < 0 || j >= list.length) return;
    const tmp = list[index];
    list[index] = list[j];
    list[j] = tmp;
    void persistOrder(app, list);
  };

  const publish = async () => {
    setBusy(true);
    setError('');
    setPreviewMsg('');
    try {
      // Fresh server read — local hasDraft can lag while load() is in flight,
      // and the hub Publish bar may enable before our first load settles.
      const [w, o] = await Promise.all([
        fetchAdminPageBlocks('website'),
        fetchAdminPageBlocks('order_app'),
      ]);
      for (const res of [w, o]) {
        if (!res.draft) continue;
        await publishPageBlocks({ app: res.app as HomeApp, version: res.version ?? 0 });
      }
      await load();
      setPreviewMsg('Published to Website and Order App Home.');
    } catch (e) {
      setError((e as Error).message || 'Could not publish.');
    } finally {
      setBusy(false);
    }
  };

  const discard = async (skipConfirm = false) => {
    if (!skipConfirm && !window.confirm('Discard unpublished Home layout drafts for both apps?')) return;
    setBusy(true);
    try {
      const [w, o] = await Promise.all([
        fetchAdminPageBlocks('website'),
        fetchAdminPageBlocks('order_app'),
      ]);
      for (const res of [w, o]) {
        if (!res.draft) continue;
        await discardPageBlockDraft({ app: res.app as HomeApp });
      }
      await load();
      setPreviewMsg('Drafts discarded.');
    } catch (e) {
      setError((e as Error).message || 'Could not discard.');
    } finally {
      setBusy(false);
    }
  };

  // Exposed so the Content Hub's unified publish/discard bar can drive the
  // layout editor without duplicating its confirm/API-call logic.
  useImperativeHandle(ref, () => ({
    publishAll: () => publish(),
    discardAll: () => discard(true),
    reload: () => load(),
    hasDraft,
  }));

  const preview = async (app: HomeApp, device: 'desktop' | 'mobile') => {
    setBusy(true);
    setError('');
    try {
      const st = stateFor(app);
      const res = await createPageBlockPreviewToken({ app, version: st.version });
      const base = app === 'website' ? '/' : '/order/';
      const url = new URL(base, window.location.origin);
      if (res.token) url.searchParams.set('previewToken', res.token);
      url.searchParams.set('previewDevice', device);
      window.open(url.toString(), '_blank', 'noopener,noreferrer');
      setPreviewMsg(`Opened ${app === 'website' ? 'Website' : 'Order App'} ${device} preview.`);
    } catch (e) {
      setError((e as Error).message || 'Could not create preview.');
    } finally {
      setBusy(false);
    }
  };

  const editingComp = editingSession ? library.find((c) => c.type === editingSession.type) ?? null : null;
  const webInst = editingSession?.websiteId != null
    ? findInstance('website', editingSession.type, editingSession.websiteId)
    : undefined;
  const orderInst = editingSession?.orderId != null
    ? findInstance('order_app', editingSession.type, editingSession.orderId)
    : undefined;

  return (
    <div
      data-testid="home-layout-editor"
      data-reorder={reorderApp ? 'true' : 'false'}
      data-app={focusApp}
      data-surface={surfaceFilter ? `${surfaceFilter.app}.${surfaceFilter.device}.${surfaceFilter.slot}` : undefined}
      style={{
        border: '1px solid var(--color-border)',
        borderRadius: 12,
        padding: 14,
        background: 'var(--color-surface)',
        marginBottom: 12,
        minWidth: 0,
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          {surfaceFilter ? (
            <div
              data-testid="home-layout-surface-breadcrumb"
              style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: 4 }}
            >
              {surfaceBreadcrumb(surfaceFilter)}
            </div>
          ) : null}
          <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--color-text)' }}>
            {surfaceFilter ? 'Surface components' : 'Home Components'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2, maxWidth: 560 }}>
            {surfaceFilter
              ? 'Components you can place on this surface. Edit to adjust visibility, order, and content.'
              : 'Choose which components appear on each customer surface, then edit placement and visibility per app.'}
          </div>
          <div
            data-testid="home-layout-draft-status"
            style={{
              marginTop: 8,
              fontSize: 12,
              fontWeight: 700,
              color: hasDraft ? 'var(--color-warning-strong)' : 'var(--color-success)',
            }}
          >
            {hasDraft ? 'Draft saved — not live' : 'All published'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button
            type="button"
            data-testid="home-layout-reorder-toggle"
            onClick={() => setReorderApp((r) => (r ? null : focusApp))}
            style={{
              ...btnSecondary,
              background: reorderApp ? 'var(--color-primary)' : 'var(--color-surface)',
              color: reorderApp ? 'var(--color-bg)' : 'var(--color-text)',
            }}
          >
            {reorderApp ? 'Done reordering' : 'Reorder'}
          </button>
          {hasDraft ? (
            <>
              <button type="button" data-testid="home-layout-publish-btn" disabled={busy} onClick={() => void publish()} style={btnPrimary}>
                Publish changes
              </button>
              <button type="button" data-testid="home-layout-discard-btn" disabled={busy} onClick={() => void discard()} style={btnSecondary}>
                Discard draft
              </button>
            </>
          ) : null}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {!surfaceFilter ? (
          ([
            ['website', 'Website'],
            ['order_app', 'Order App'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              data-testid={`home-layout-tab-${id}`}
              onClick={() => {
                setFocusApp(id);
                if (reorderApp) setReorderApp(id);
              }}
              style={{
                ...btnSecondary,
                background: focusApp === id ? 'var(--color-primary)' : 'transparent',
                color: focusApp === id ? 'var(--color-bg)' : 'var(--color-text-secondary)',
              }}
            >
              {label}
            </button>
          ))
        ) : (
          <span
            data-testid="home-layout-surface-app-lock"
            style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', alignSelf: 'center' }}
          >
            {focusApp === 'website' ? 'Website' : 'Order App'}
          </span>
        )}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginLeft: 'auto' }}>
          {(['desktop', 'mobile'] as const).map((device) => (
            <button
              key={device}
              type="button"
              data-testid={`home-layout-preview-${focusApp}-${device}`}
              disabled={busy || loading}
              onClick={() => void preview(focusApp, device)}
              style={btnSecondary}
            >
              Preview {device}
            </button>
          ))}
        </div>
      </div>

      {conflict ? (
        <div className="hub-hero-promo-warning" data-testid="home-layout-hero-promo-warning" role="status">
          Hero and legacy Promo carousel both exist. Promo is merged into Hero — remove the legacy Promo row.
        </div>
      ) : null}

      {error ? (
        <div role="alert" style={{ color: 'var(--color-danger)', fontSize: 13, marginBottom: 8 }}>{error}</div>
      ) : null}
      {previewMsg ? (
        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 8 }}>{previewMsg}</div>
      ) : null}

      {loading ? (
        <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Loading Home components…</div>
      ) : reorderApp ? (
        <ReorderList
          app={reorderApp}
          blocks={[...stateFor(reorderApp).blocks].sort((a, b) => a.position - b.position)}
          busy={busy}
          onMove={move}
        />
      ) : (
        <div
          data-testid="home-components-overview"
          style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          {overviewRows.map((row) => {
            const { comp, rowKey, isAddSlot } = row;
            const w = row.website;
            const o = row.orderApp;
            const wStatus = instanceStatus(w);
            const oStatus = instanceStatus(o);
            return (
              <div
                key={rowKey}
                data-testid={`home-layout-block-${rowKey}`}
                data-block-id={w?.id ?? o?.id ?? comp.type}
                className="home-layout-section-card"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: 10,
                  padding: '12px 12px',
                  borderRadius: 10,
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-bg)',
                  minWidth: 0,
                }}
              >
                <button
                  type="button"
                  data-testid={`home-layout-edit-${w?.id ?? o?.id ?? comp.type}`}
                  onClick={() => setEditingSession({
                    type: comp.type,
                    websiteId: w?.id ?? null,
                    orderId: o?.id ?? null,
                    isAddSlot: Boolean(isAddSlot),
                  })}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: 6,
                    minWidth: 0,
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--color-text)', overflowWrap: 'anywhere' }}>
                    {isAddSlot ? `+ Add another ${comp.name}` : comp.name}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)', overflowWrap: 'anywhere' }}>
                    {comp.summary}
                  </span>
                  <span className="hub-task-card-meta" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    <span
                      data-testid={`home-comp-website-status-${rowKey}`}
                      className="hub-placement-chip hub-placement-chip--status"
                      style={badgeStyle(wStatus === 'Added')}
                    >
                      Website: {wStatus}
                    </span>
                    <span
                      data-testid={`home-comp-order-status-${rowKey}`}
                      className="hub-placement-chip hub-placement-chip--status"
                      style={badgeStyle(oStatus === 'Added')}
                    >
                      Order App: {oStatus}
                    </span>
                  </span>
                  {(w || o) ? (
                    <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                      {w ? `Website ${placementLabels(w.settings).join(' · ')}` : null}
                      {w && o ? ' · ' : null}
                      {o ? `Order ${placementLabels(o.settings).join(' · ')}` : null}
                    </span>
                  ) : null}
                </button>
                <ChevronRight size={18} aria-hidden style={{ alignSelf: 'center', color: 'var(--color-text-muted)' }} />
              </div>
            );
          })}
        </div>
      )}

      {editingComp ? (
        <ContentEditorSheet
          open
          title={editingSession?.isAddSlot ? `Add another ${editingComp.name}` : `Edit ${editingComp.name}`}
          onClose={() => setEditingSession(null)}
          layer={1}
          testId="home-layout-section-editor"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-muted)' }}>{editingComp.summary}</p>
            {editingComp.flowWarning ? (
              <div role="status" style={{ fontSize: 12, color: 'var(--color-warning-strong)' }}>
                {editingComp.flowWarning}
              </div>
            ) : null}
            {editingComp.dynamicSource ? (
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                Live data: {editingComp.dynamicSource}
              </div>
            ) : null}

            <AppInstancePanel
              app="website"
              label="Website"
              block={webInst}
              busy={busy}
              onAdd={() => {
                void addToApp('website', editingComp.type).then((block) => {
                  if (block) setEditingSession((prev) => (prev ? { ...prev, websiteId: block.id } : prev));
                });
              }}
              onToggle={() => webInst && void toggleEnabled('website', webInst)}
              onRemove={() => webInst && void removeFromApp('website', webInst)}
              onSaveSettings={(settings) => webInst && void saveSettings('website', webInst, settings)}
            />
            <AppInstancePanel
              app="order_app"
              label="Order App"
              block={orderInst}
              busy={busy}
              onAdd={() => {
                void addToApp('order_app', editingComp.type).then((block) => {
                  if (block) setEditingSession((prev) => (prev ? { ...prev, orderId: block.id } : prev));
                });
              }}
              onToggle={() => orderInst && void toggleEnabled('order_app', orderInst)}
              onRemove={() => orderInst && void removeFromApp('order_app', orderInst)}
              onSaveSettings={(settings) => orderInst && void saveSettings('order_app', orderInst, settings)}
            />
          </div>
        </ContentEditorSheet>
      ) : null}
    </div>
  );
});

function ReorderList({
  app,
  blocks,
  busy,
  onMove,
}: {
  app: HomeApp;
  blocks: PageBlockRow[];
  busy: boolean;
  onMove: (app: HomeApp, index: number, dir: -1 | 1) => void;
}) {
  return (
    <div data-testid="home-layout-reorder-list" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--color-text-secondary)' }}>
        Reorder {app === 'website' ? 'Website' : 'Order App'} Home
      </div>
      {blocks.map((block, index) => (
        <div
          key={block.id}
          data-testid={`home-layout-block-${block.block_type}`}
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            gap: 8,
            padding: '10px 12px',
            border: '1px solid var(--color-border)',
            borderRadius: 10,
            opacity: block.is_enabled ? 1 : 0.7,
          }}
        >
          <div>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{block.label}</div>
            <div
              data-testid={`home-layout-visibility-${block.id}`}
              style={{ fontSize: 12, color: 'var(--color-text-muted)' }}
            >
              {block.is_enabled ? 'Showing' : 'Hidden'}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <button
              type="button"
              aria-label={`Move ${block.label} up`}
              data-testid={`home-layout-move-up-${block.id}`}
              disabled={busy || index === 0}
              onClick={() => onMove(app, index, -1)}
              style={btnTiny}
            >
              ↑
            </button>
            <button
              type="button"
              aria-label={`Move ${block.label} down`}
              data-testid={`home-layout-move-down-${block.id}`}
              disabled={busy || index === blocks.length - 1}
              onClick={() => onMove(app, index, 1)}
              style={btnTiny}
            >
              ↓
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function AppInstancePanel({
  app,
  label,
  block,
  busy,
  onAdd,
  onToggle,
  onRemove,
  onSaveSettings,
}: {
  app: HomeApp;
  label: string;
  block?: PageBlockRow;
  busy: boolean;
  onAdd: () => void;
  onToggle: () => void;
  onRemove: () => void;
  onSaveSettings: (settings: BlockSettings) => void;
}) {
  const [localSettings, setLocalSettings] = useState<BlockSettings>((block?.settings ?? {}) as BlockSettings);
  useEffect(() => {
    setLocalSettings((block?.settings ?? {}) as BlockSettings);
  }, [block?.id, block?.settings]);

  return (
    <section
      data-testid={`home-comp-editor-${app}`}
      style={{
        border: '1px solid var(--color-border)',
        borderRadius: 10,
        padding: 12,
        minWidth: 0,
      }}
    >
      <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8 }}>{label}</div>
      {!block ? (
        <button type="button" disabled={busy} onClick={onAdd} style={btnPrimary} data-testid={`home-comp-add-${app}`}>
          Add to {label}
        </button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              data-testid={`home-layout-visibility-switch-${block.id}`}
              disabled={busy}
              onClick={onToggle}
              style={btnSecondary}
            >
              {block.is_enabled ? 'Turn off' : 'Turn on'}
            </button>
            <button
              type="button"
              data-testid={`home-layout-remove-${block.id}`}
              disabled={busy}
              onClick={onRemove}
              style={{ ...btnSecondary, color: 'var(--color-danger)' }}
            >
              Remove
            </button>
          </div>
          <DevicePlacementFields
            settings={localSettings}
            onChange={setLocalSettings}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => onSaveSettings(localSettings)}
            style={btnPrimary}
          >
            Save {label} placement
          </button>

          {isGenericBlockType(block.block_type) ? (
            <GenericBlockSettingsForm
              block={{ ...block, settings: localSettings }}
              busy={busy}
              onSave={async (settings) => {
                setLocalSettings(settings);
                onSaveSettings(settings);
              }}
            />
          ) : null}
        </div>
      )}
    </section>
  );
}

function DevicePlacementFields({
  settings,
  onChange,
  device,
}: {
  settings: BlockSettings;
  onChange: (s: BlockSettings) => void;
  device?: 'desktop' | 'mobile';
}) {
  const set = (key: string, value: unknown) => onChange({ ...settings, [key]: value });

  const desktopOptions: Array<{ value: string; label: string }> = [
    { value: 'home', label: 'Home' },
    { value: 'header', label: 'Header' },
    { value: 'footer', label: 'Footer' },
    { value: 'off', label: 'Hidden' },
  ];

  const mobileOptions: Array<{ value: string; label: string }> = [
    { value: 'home', label: 'Home' },
    { value: 'header', label: 'Header' },
    { value: 'footer', label: 'Footer' },
    { value: 'bottom_navigation', label: 'Bottom navigation' },
    { value: 'off', label: 'Hidden' },
  ];

  function selectValue(showKey: 'show_desktop' | 'show_mobile', placeKey: 'placement_desktop' | 'placement_mobile'): string {
    if (settings[showKey] === false) return 'off';
    const v = settings[placeKey];
    if (v === 'header' || v === 'home' || v === 'footer' || v === 'bottom_navigation') return v;
    return 'home';
  }

  const fields: Array<{ id: 'desktop' | 'mobile'; label: string; showKey: 'show_desktop' | 'show_mobile'; placeKey: 'placement_desktop' | 'placement_mobile'; options: Array<{ value: string; label: string }> }> = [
    { id: 'desktop', label: 'Desktop', showKey: 'show_desktop', placeKey: 'placement_desktop', options: desktopOptions },
    { id: 'mobile', label: 'Mobile', showKey: 'show_mobile', placeKey: 'placement_mobile', options: mobileOptions },
  ];

  const visibleFields = device ? fields.filter((f) => f.id === device) : fields;

  return (
    <div style={{ display: 'grid', gap: 8, gridTemplateColumns: visibleFields.length > 1 ? '1fr 1fr' : '1fr' }} className="form-grid-2">
      {visibleFields.map((field) => (
        <label key={field.id} style={labelStyle}>
          {field.label}
          <select
            value={selectValue(field.showKey, field.placeKey)}
            onChange={(e) => {
              const v = e.target.value;
              if (v === 'off') set(field.showKey, false);
              else {
                set(field.showKey, true);
                set(field.placeKey, v);
              }
            }}
            style={selectStyle}
            data-testid={`home-layout-placement-${field.id}`}
          >
            {field.options.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}

function badgeStyle(on: boolean): CSSProperties {
  return {
    background: on ? 'var(--color-success-bg, #dcfce7)' : 'var(--color-border-light)',
    color: on ? 'var(--color-success)' : 'var(--color-text-muted)',
  };
}

const btnPrimary: CSSProperties = {
  minHeight: 40,
  padding: '0 14px',
  borderRadius: 8,
  border: 'none',
  background: 'var(--color-primary)',
  color: 'var(--color-bg)',
  fontWeight: 700,
  fontSize: 13,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const btnSecondary: CSSProperties = {
  minHeight: 40,
  padding: '0 12px',
  borderRadius: 8,
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  fontWeight: 600,
  fontSize: 13,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const btnTiny: CSSProperties = {
  minHeight: 44,
  minWidth: 44,
  borderRadius: 8,
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const labelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--color-text-secondary)',
  minWidth: 0,
};

const selectStyle: CSSProperties = {
  minHeight: 40,
  borderRadius: 8,
  border: '1px solid var(--color-border)',
  padding: '0 10px',
  fontSize: 13,
  fontFamily: 'inherit',
};
