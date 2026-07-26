/**
 * Freeform slide designer — element-tree WYSIWYG (Phase 1b).
 * Visual layer = shared @shared/signage SlideCanvas (same as /order/tv).
 * Editing chrome (selection/drag/resize/guides) overlays on top.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as RPE } from 'react';
import { AlignCenter, Copy, Eye, EyeOff, Lock, Redo2, Save, Trash2, Undo2, Unlock } from 'lucide-react';
import {
  SlideCanvas,
  type MenuItemLite,
  type SignageConfig,
  type SignageElement,
  type SignageSlide,
  type SignageTheme,
} from '@shared/signage';
import '@shared/signage/signage.css';
import { saveSignageCustomTemplate } from '../../api';
import { Btn } from '../../components/SharedUI';
import { useToast } from '../../components/ui';
import { MediaPicker } from '../../components/MediaPicker';

/** Shared element type; locked/hidden are editor fields already on SignageElement. */
export type DesignerElement = SignageElement;
export type DesignerSlide = SignageSlide & { [key: string]: unknown };

type Props = {
  slide: DesignerSlide;
  onChange: (slide: DesignerSlide) => void;
  onClose: () => void;
};

const ELEMENT_TYPES = [
  'text', 'image', 'video', 'shape', 'qr', 'clock', 'logo',
  'menu_list', 'item_card', 'price_row', 'variable',
] as const;

const ENTRANCES = ['fade', 'slide-in', 'zoom-in', 'rise', 'pop'];
const EMPHASES = ['', 'pulse', 'ken-burns', 'float', 'shine', 'count-up'];
const TRANSITIONS = ['fade', 'slide', 'zoom', 'dissolve', 'flip', 'push', 'cube', 'wipe'];

const PREVIEW_THEME: SignageTheme = {
  primary: '#D4813A',
  background: '#1C1408',
  surface: '#2A2118',
  text: '#FFF8F0',
  muted: '#C4B5A5',
  font_display: 'Georgia, serif',
  font_body: 'system-ui, sans-serif',
};

const PREVIEW_ITEMS: MenuItemLite[] = [
  { id: 1, name: 'Chicken Wrap', base_price: 45, sales_30d: 120, category_id: 1 },
  { id: 2, name: 'Beef Burger', base_price: 55, sales_30d: 90, category_id: 1 },
  { id: 3, name: 'Fish Combo', base_price: 65, sales_30d: 70, is_combo: true, category_id: 2 },
];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function previewConfig(slide: SignageSlide, orientation: string): SignageConfig {
  return {
    screen: null,
    playlist_id: null,
    playlist_version: 'designer-preview',
    source: 'preview',
    mode: 'normal',
    orientation,
    resolution: orientation === 'portrait' ? '1080x1920' : '1920x1080',
    refresh_seconds: 120,
    theme: PREVIEW_THEME,
    slides: [slide],
    rotation: [slide.id],
    variables: {
      branch_name: 'Bake & Grill',
      current_time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      today: new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' }),
      next_prayer: '',
      wifi_name: 'BG-Guest',
      wifi_password: '',
      promotion_name: '',
    },
    bestsellers: PREVIEW_ITEMS.map((i) => ({
      id: i.id,
      name: i.name,
      base_price: i.base_price,
      sales_30d: i.sales_30d,
    })),
    menu_new_days: 30,
  };
}

export function SignageDesigner({ slide, onChange, onClose }: Props) {
  const toast = useToast();
  const [local, setLocal] = useState<DesignerSlide>(() => clone(slide));
  const [orient, setOrient] = useState<'landscape' | 'portrait'>('landscape');
  const [previewSize, setPreviewSize] = useState<'desktop' | '1080p' | '4k'>('desktop');
  const [selected, setSelected] = useState<string[]>([]);
  const [history, setHistory] = useState<DesignerSlide[]>([clone(slide)]);
  const [histIdx, setHistIdx] = useState(0);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [drag, setDrag] = useState<{ ids: string[]; startX: number; startY: number; ox: number[]; oy: number[] } | null>(null);
  const [resize, setResize] = useState<{ id: string; startX: number; startY: number; ow: number; oh: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const elements = useMemo(
    () => [...(local.elements ?? [])].sort((a, b) => (a.z ?? 1) - (b.z ?? 1)),
    [local.elements],
  );

  const config = useMemo(() => previewConfig(local, orient), [local, orient]);

  const pushHistory = useCallback((next: DesignerSlide) => {
    setHistory((h) => {
      const trimmed = h.slice(0, histIdx + 1);
      return [...trimmed, clone(next)].slice(-40);
    });
    setHistIdx((i) => Math.min(i + 1, 39));
    setLocal(next);
  }, [histIdx]);

  const undo = () => {
    if (histIdx <= 0) return;
    const next = histIdx - 1;
    setHistIdx(next);
    setLocal(clone(history[next]));
  };
  const redo = () => {
    if (histIdx >= history.length - 1) return;
    const next = histIdx + 1;
    setHistIdx(next);
    setLocal(clone(history[next]));
  };

  const updateElements = (fn: (els: DesignerElement[]) => DesignerElement[]) => {
    const next = { ...local, elements: fn([...(local.elements ?? [])]) };
    pushHistory(next);
  };

  const addElement = (type: string) => {
    const el: DesignerElement = {
      id: uid(),
      type,
      x: 20,
      y: 20,
      w: type === 'menu_list' ? 60 : 30,
      h: type === 'menu_list' ? 50 : 20,
      z: (local.elements?.length ?? 0) + 1,
      rotation: 0,
      style: { fontSize: 3.5, color: '#FFF8F0', fontWeight: 700 },
      animation: { entrance: 'fade', duration: 700, delay: 0 },
      binding: type === 'qr' ? { url: '/order/view' } : type === 'menu_list' ? { type: 'smart', smart_type: 'bestsellers', limit: 8 } : {},
      text: type === 'text' || type === 'variable' ? 'New text {{branch_name}}' : undefined,
    };
    updateElements((els) => [...els, el]);
    setSelected([el.id]);
  };

  const selEl = selected.length === 1 ? elements.find((e) => e.id === selected[0]) : null;

  const patchSelected = (patch: Partial<DesignerElement>) => {
    if (!selEl) return;
    updateElements((els) => els.map((e) => (e.id === selEl.id ? { ...e, ...patch, style: { ...e.style, ...patch.style }, animation: { ...e.animation, ...patch.animation }, binding: { ...e.binding, ...patch.binding } } : e)));
  };

  const onPointerDown = (e: RPE, id: string) => {
    e.stopPropagation();
    const el = elements.find((x) => x.id === id);
    if (!el || el.locked) return;
    const ids = e.shiftKey ? Array.from(new Set([...selected, id])) : [id];
    setSelected(ids);
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    setDrag({
      ids,
      startX: e.clientX,
      startY: e.clientY,
      ox: ids.map((i) => elements.find((x) => x.id === i)?.x ?? 0),
      oy: ids.map((i) => elements.find((x) => x.id === i)?.y ?? 0),
    });
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      if (drag) {
        const dx = ((e.clientX - drag.startX) / rect.width) * 100;
        const dy = ((e.clientY - drag.startY) / rect.height) * 100;
        setLocal((prev) => ({
          ...prev,
          elements: (prev.elements ?? []).map((el) => {
            const idx = drag.ids.indexOf(el.id);
            if (idx < 0 || el.locked) return el;
            return {
              ...el,
              x: Math.max(0, Math.min(100 - el.w, Math.round((drag.ox[idx] + dx) * 2) / 2)),
              y: Math.max(0, Math.min(100 - el.h, Math.round((drag.oy[idx] + dy) * 2) / 2)),
            };
          }),
        }));
      }
      if (resize) {
        const dw = ((e.clientX - resize.startX) / rect.width) * 100;
        const dh = ((e.clientY - resize.startY) / rect.height) * 100;
        setLocal((prev) => ({
          ...prev,
          elements: (prev.elements ?? []).map((el) => {
            if (el.id !== resize.id || el.locked) return el;
            return {
              ...el,
              w: Math.max(4, Math.min(100 - el.x, Math.round((resize.ow + dw) * 2) / 2)),
              h: Math.max(4, Math.min(100 - el.y, Math.round((resize.oh + dh) * 2) / 2)),
            };
          }),
        }));
      }
    };
    const up = () => {
      if (drag || resize) {
        setLocal((prev) => {
          pushHistory(prev);
          return prev;
        });
      }
      setDrag(null);
      setResize(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [drag, resize, pushHistory]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); undo(); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'y') { e.preventDefault(); redo(); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'd' && selected.length) {
        e.preventDefault();
        updateElements((els) => {
          const copies = els.filter((x) => selected.includes(x.id)).map((x) => ({ ...clone(x), id: uid(), x: Math.min(90, x.x + 3), y: Math.min(90, x.y + 3) }));
          return [...els, ...copies];
        });
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected.length && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        updateElements((els) => els.filter((x) => !selected.includes(x.id) || x.locked));
        setSelected([]);
      }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && selected.length) {
        e.preventDefault();
        const step = e.shiftKey ? 5 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        updateElements((els) => els.map((el) => {
          if (!selected.includes(el.id) || el.locked) return el;
          return { ...el, x: Math.max(0, Math.min(100 - el.w, el.x + dx)), y: Math.max(0, Math.min(100 - el.h, el.y + dy)) };
        }));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const aspect = orient === 'landscape' ? '16 / 9' : '9 / 16';
  const maxW = previewSize === '4k' ? 960 : previewSize === '1080p' ? 720 : 560;

  const apply = () => {
    onChange(local);
    toast.success('Slide updated');
    onClose();
  };

  const saveTemplate = async () => {
    const key = `custom_${uid()}`;
    const label = local.name || 'Custom slide';
    try {
      await saveSignageCustomTemplate(key, label, local as Record<string, unknown>);
      toast.success('Saved as custom template');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    }
  };

  const panel: CSSProperties = { padding: 14, borderRadius: 12, background: '#fff', border: '1px solid #E8E0D8' };
  const label: CSSProperties = { fontSize: 11, fontWeight: 700, color: '#6B5D4F', display: 'block', marginBottom: 4 };
  const input: CSSProperties = { minHeight: 40, width: '100%', borderRadius: 8, border: '1px solid #E8E0D8', padding: '0 10px', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' };

  return (
    <div data-testid="signage-designer" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Btn type="button" variant="secondary" onClick={undo} style={{ minHeight: 40 }}><Undo2 size={14} /> Undo</Btn>
        <Btn type="button" variant="secondary" onClick={redo} style={{ minHeight: 40 }}><Redo2 size={14} /> Redo</Btn>
        <Btn type="button" variant="secondary" onClick={() => setOrient((o) => (o === 'landscape' ? 'portrait' : 'landscape'))} style={{ minHeight: 40 }}>
          {orient === 'landscape' ? '16:9' : '9:16'}
        </Btn>
        <select value={previewSize} onChange={(e) => setPreviewSize(e.target.value as typeof previewSize)} style={{ ...input, width: 120 }}>
          <option value="desktop">Desktop</option>
          <option value="1080p">1080p</option>
          <option value="4k">4K</option>
        </select>
        <Btn type="button" variant="secondary" onClick={() => void saveTemplate()} style={{ minHeight: 40 }}><Save size={14} /> Save as template</Btn>
        <div style={{ flex: 1 }} />
        <Btn type="button" variant="secondary" onClick={onClose} style={{ minHeight: 40 }}>Cancel</Btn>
        <Btn type="button" onClick={apply} style={{ minHeight: 40 }} data-testid="signage-designer-apply">Apply to playlist</Btn>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 260px', gap: 12 }}>
        <div style={panel}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Add</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {ELEMENT_TYPES.map((t) => (
              <button key={t} type="button" onClick={() => addElement(t)} style={{ minHeight: 36, borderRadius: 8, border: '1px solid #E8E0D8', background: '#F8F6F3', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600 }}>
                {t}
              </button>
            ))}
          </div>
          <div style={{ fontWeight: 700, margin: '14px 0 8px' }}>Layers</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflow: 'auto' }}>
            {[...elements].reverse().map((el) => (
              <button
                key={el.id}
                type="button"
                onClick={() => setSelected([el.id])}
                style={{
                  minHeight: 32, textAlign: 'left', borderRadius: 8, border: selected.includes(el.id) ? '1.5px solid #D4813A' : '1px solid #E8E0D8',
                  background: selected.includes(el.id) ? '#FFF7ED' : '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, padding: '0 8px',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                {el.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
                {el.locked ? <Lock size={12} /> : <Unlock size={12} />}
                {el.type}
              </button>
            ))}
          </div>
        </div>

        <div style={{ ...panel, display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#2A2118', minHeight: 360 }}>
          <div
            ref={canvasRef}
            data-testid="signage-designer-canvas"
            onPointerDown={() => setSelected([])}
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: maxW,
              aspectRatio: aspect,
              border: '1px solid #5C4A3A',
              boxShadow: '0 12px 40px rgba(0,0,0,.35)',
              overflow: 'hidden',
            }}
          >
            {/* Shared TV renderer — identical to /order/tv */}
            <SlideCanvas
              slide={local}
              theme={PREVIEW_THEME}
              variables={config.variables}
              items={PREVIEW_ITEMS}
              config={config}
              logoUrl="/logo.png"
              preview
            />

            {/* Safe zone guide */}
            <div style={{ position: 'absolute', inset: '5%', border: '1px dashed rgba(212,129,58,.45)', pointerEvents: 'none', zIndex: 2000 }} data-testid="signage-safe-zone" />

            {/* Interaction overlay — selection / drag / resize only */}
            {elements.map((el) => (
              <div
                key={el.id}
                data-testid={`designer-el-${el.id}`}
                onPointerDown={(e) => onPointerDown(e, el.id)}
                style={{
                  position: 'absolute',
                  left: `${el.x}%`,
                  top: `${el.y}%`,
                  width: `${el.w}%`,
                  height: `${el.h}%`,
                  zIndex: 1000 + (el.z ?? 1),
                  transform: `rotate(${el.rotation ?? 0}deg)`,
                  outline: selected.includes(el.id) ? '2px solid #D4813A' : el.hidden ? '1px dashed rgba(255,255,255,.35)' : '1px solid transparent',
                  cursor: el.locked ? 'not-allowed' : 'move',
                  background: el.hidden && !selected.includes(el.id) ? 'rgba(255,255,255,.04)' : 'transparent',
                  boxSizing: 'border-box',
                  userSelect: 'none',
                }}
              >
                {selected.includes(el.id) && !el.locked && (
                  <div
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setResize({ id: el.id, startX: e.clientX, startY: e.clientY, ow: el.w, oh: el.h });
                    }}
                    style={{ position: 'absolute', right: -4, bottom: -4, width: 12, height: 12, background: '#D4813A', borderRadius: 2, cursor: 'nwse-resize' }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        <div style={{ ...panel, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontWeight: 700 }}>Slide</div>
          <label style={label}>Name</label>
          <input style={input} value={local.name || ''} onChange={(e) => setLocal({ ...local, name: e.target.value })} />
          <label style={label}>Duration (s)</label>
          <input type="number" min={3} style={input} value={local.seconds ?? 12} onChange={(e) => setLocal({ ...local, seconds: Number(e.target.value) })} />
          <label style={label}>Weight</label>
          <input type="number" min={1} style={input} value={local.weight ?? 1} onChange={(e) => setLocal({ ...local, weight: Number(e.target.value) })} />
          <label style={label}>Transition</label>
          <select style={input} value={local.transition || 'fade'} onChange={(e) => setLocal({ ...local, transition: e.target.value })}>
            {TRANSITIONS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <label style={label}>Background</label>
          <input style={input} value={local.background?.value || '#1C1408'} onChange={(e) => setLocal({ ...local, background: { type: 'solid', value: e.target.value, opacity: 1 } })} />

          {selEl && (
            <>
              <div style={{ fontWeight: 700, marginTop: 8 }}>Element · {selEl.type}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <Btn type="button" variant="secondary" style={{ minHeight: 36 }} onClick={() => patchSelected({ locked: !selEl.locked })}>
                  {selEl.locked ? <Unlock size={14} /> : <Lock size={14} />}
                </Btn>
                <Btn type="button" variant="secondary" style={{ minHeight: 36 }} onClick={() => patchSelected({ hidden: !selEl.hidden })}>
                  {selEl.hidden ? <Eye size={14} /> : <EyeOff size={14} />}
                </Btn>
                <Btn type="button" variant="secondary" style={{ minHeight: 36 }} onClick={() => updateElements((els) => els.filter((e) => e.id !== selEl.id))}>
                  <Trash2 size={14} />
                </Btn>
                <Btn type="button" variant="secondary" style={{ minHeight: 36 }} onClick={() => patchSelected({ x: Math.max(0, (100 - selEl.w) / 2) })}>
                  <AlignCenter size={14} />
                </Btn>
              </div>
              {(selEl.type === 'text' || selEl.type === 'variable') && (
                <>
                  <label style={label}>Text</label>
                  <textarea
                    data-testid="designer-text"
                    style={{ ...input, minHeight: 72, padding: 10 }}
                    value={selEl.text || ''}
                    onChange={(e) => patchSelected({ text: e.target.value })}
                  />
                </>
              )}
              <label style={label}>Font size (vmin)</label>
              <input type="number" style={input} value={Number(selEl.style?.fontSize ?? 3.5)} onChange={(e) => patchSelected({ style: { fontSize: Number(e.target.value) } })} />
              <label style={label}>Color</label>
              <input style={input} value={String(selEl.style?.color ?? '#FFF8F0')} onChange={(e) => patchSelected({ style: { color: e.target.value } })} />
              <label style={label}>Entrance</label>
              <select style={input} value={selEl.animation?.entrance || 'fade'} onChange={(e) => patchSelected({ animation: { entrance: e.target.value } })}>
                {ENTRANCES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <label style={label}>Emphasis</label>
              <select style={input} value={selEl.animation?.emphasis || ''} onChange={(e) => patchSelected({ animation: { emphasis: e.target.value } })}>
                {EMPHASES.map((t) => <option key={t || 'none'} value={t}>{t || 'none'}</option>)}
              </select>
              {(selEl.type === 'image' || selEl.type === 'video') && (
                <Btn type="button" variant="secondary" style={{ minHeight: 40 }} onClick={() => setMediaOpen(true)}>
                  <Copy size={14} /> Media Library
                </Btn>
              )}
              {selEl.type === 'menu_list' && (
                <>
                  <label style={label}>Smart type</label>
                  <select
                    style={input}
                    value={String(selEl.binding?.smart_type ?? 'bestsellers')}
                    onChange={(e) => patchSelected({ binding: { type: 'smart', smart_type: e.target.value, limit: Number(selEl.binding?.limit ?? 8) } })}
                  >
                    {['offers', 'new', 'bestsellers', 'combos', 'todays_special', 'chef_recommendation'].map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </>
              )}
              <label style={label}>Z-order</label>
              <input type="number" style={input} value={selEl.z ?? 1} onChange={(e) => patchSelected({ z: Number(e.target.value) })} />
              <label style={label}>Rotation</label>
              <input type="number" style={input} value={selEl.rotation ?? 0} onChange={(e) => patchSelected({ rotation: Number(e.target.value) })} />
            </>
          )}
        </div>
      </div>

      <MediaPicker
        open={mediaOpen}
        onClose={() => setMediaOpen(false)}
        mediaType={selEl?.type === 'video' ? 'video' : 'image'}
        onPick={(asset) => {
          if (!selEl) return;
          patchSelected({ binding: { url: asset.url } });
          setMediaOpen(false);
        }}
      />
    </div>
  );
}
