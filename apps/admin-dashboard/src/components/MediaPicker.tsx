import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, FileText, Film, Folder, Image, Images, Music, Search, X } from 'lucide-react';
import {
  getMedia, getMediaCollections,
  type MediaAsset, type MediaCollection, type MediaType,
} from '../api';
import { Spinner, useDialogChrome } from './SharedUI';

// ─── Types ────────────────────────────────────────────────────────────────────

export type MediaPickerProps = {
  open: boolean;
  onClose: () => void;
  /** Called with the selected asset when user confirms a pick. */
  onPick: (asset: MediaAsset) => void;
  /** Pre-filter the media type tab. */
  mediaType?: MediaType;
  /** Pre-select a collection slug. */
  collection?: string;
  /** Modal title override. */
  title?: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TYPE_TABS: Array<{ label: string; value: MediaType | ''; icon: React.ReactNode }> = [
  { label: 'All',       value: '',         icon: <Images size={13} /> },
  { label: 'Images',    value: 'image',    icon: <Image size={13} /> },
  { label: 'Video',     value: 'video',    icon: <Film size={13} /> },
  { label: 'Audio',     value: 'audio',    icon: <Music size={13} /> },
  { label: 'Documents', value: 'document', icon: <FileText size={13} /> },
];

function thumbNode(asset: MediaAsset) {
  if (asset.media_type === 'image' && asset.thumb_url) {
    return (
      <img
        src={asset.thumb_url}
        alt={asset.alt_text || asset.title || ''}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    );
  }
  const icons: Record<MediaType, React.ReactNode> = {
    image:    <Image size={28} style={{ color: 'var(--color-text-muted)' }} />,
    video:    <Film size={28} style={{ color: 'var(--color-text-muted)' }} />,
    audio:    <Music size={28} style={{ color: 'var(--color-text-muted)' }} />,
    document: <FileText size={28} style={{ color: 'var(--color-text-muted)' }} />,
  };
  return icons[asset.media_type] ?? icons.document;
}

// ─── Component ────────────────────────────────────────────────────────────────

/*
 * Gate and panel are separate so the panel can call `useDialogChrome`
 * unconditionally. The audit (A3) found this one announced itself as a dialog
 * and did nothing else a dialog does.
 */
export function MediaPicker(props: MediaPickerProps) {
  if (!props.open) return null;

  return <MediaPickerPanel {...props} />;
}

function MediaPickerPanel({ onClose, onPick, mediaType, collection, title = 'Pick from Library' }: MediaPickerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogChrome(onClose, panelRef);

  const [activeType, setActiveType] = useState<MediaType | ''>(mediaType ?? '');
  const [activeCollection, setActiveCollection] = useState(collection ?? '');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, per_page: 24, total: 0 });
  const [loading, setLoading] = useState(false);
  const [collections, setCollections] = useState<MediaCollection[]>([]);
  const [highlighted, setHighlighted] = useState<MediaAsset | null>(null);

  // ─── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getMedia({
        type: activeType || undefined,
        collection: activeCollection || undefined,
        q: search || undefined,
        page,
        per_page: 24,
      });
      setAssets(res.data);
      setMeta(res.meta);
    } catch {
      // leave existing list
    } finally {
      setLoading(false);
    }
  }, [activeType, activeCollection, search, page]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    void getMediaCollections().then((r) => setCollections(r.data)).catch(() => {});
  }, [open]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [activeType, activeCollection, search]);

  // Sync prop changes
  useEffect(() => { setActiveType(mediaType ?? ''); }, [mediaType]);
  useEffect(() => { setActiveCollection(collection ?? ''); }, [collection]);


  const handlePick = () => {
    if (highlighted) {
      onPick(highlighted);
      onClose();
    }
  };

  const selectedLabel = highlighted
    ? (highlighted.title || highlighted.url.split('/').pop() || `#${highlighted.id}`)
    : '';

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-testid="media-picker-modal"
      className="media-picker-backdrop"
      style={{
        /* Above ContentEditorSheet layers (50+) so library/crop stay usable inside sheets */
        position: 'fixed', inset: 0, zIndex: 70,
        background: 'rgba(28,20,8,0.45)', display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: 16,
      }}
      onClick={onClose}
    >
      <div
        className="media-picker-shell"
        style={{
          width: 'min(860px, 100%)', maxHeight: '90vh', overflow: 'hidden',
          background: 'var(--color-surface)', borderRadius: 16, border: '1px solid var(--color-border)',
          display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(28,20,8,0.18)',
          minWidth: 0,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Images size={18} /> {title}
          </span>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 4 }} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {/* Toolbar */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '12px 20px', borderBottom: '1px solid #F0EBE4', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {TYPE_TABS.map(({ label, value, icon }) => (
              <button
                key={value}
                type="button"
                aria-pressed={activeType === value}
                onClick={() => setActiveType(value)}
                style={{
                  height: 32, padding: '0 12px', borderRadius: 9, cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: 12, fontWeight: activeType === value ? 700 : 500,
                  border: activeType === value ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)',
                  background: activeType === value ? 'var(--color-warning-bg)' : 'var(--color-bg)', color: 'var(--color-text)',
                  display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
                }}
              >
                {icon} {label}
              </button>
            ))}
          </div>
          <div style={{ marginLeft: 'auto', position: 'relative', minWidth: 180 }}>
            <Search size={13} style={{ position: 'absolute', left: 8, top: 10, color: 'var(--color-text-muted)' }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              style={{ width: '100%', height: 34, paddingLeft: 26, borderRadius: 9, border: '1px solid var(--color-border)', fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box' }}
            />
          </div>
        </div>

        {/* Body: sidebar + grid */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* Collections sidebar */}
          {collections.length > 0 && (
            <aside className="media-picker-sidebar" style={{ width: 160, flexShrink: 0, borderRight: '1px solid var(--color-border-light)', padding: '10px 8px', overflowY: 'auto' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Folder size={12} /> Collections
              </div>
              <button type="button" onClick={() => setActiveCollection('')}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', border: 'none', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: activeCollection === '' ? 700 : 400, background: activeCollection === '' ? '#F5E6D3' : 'transparent', color: activeCollection === '' ? 'var(--color-text)' : 'var(--color-text-secondary)', marginBottom: 1 }}>
                All
              </button>
              {collections.map((col) => (
                <button key={col.id} type="button"
                  onClick={() => setActiveCollection(col.slug)}
                  data-testid={`picker-collection-${col.slug}`}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', border: 'none', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: activeCollection === col.slug ? 700 : 400, background: activeCollection === col.slug ? '#F5E6D3' : 'transparent', color: activeCollection === col.slug ? 'var(--color-text)' : 'var(--color-text-secondary)', marginBottom: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {col.name}
                </button>
              ))}
            </aside>
          )}

          {/* Grid */}
          <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px' }}>
            {loading && <Spinner />}
            {!loading && assets.length === 0 && (
              <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem 0', fontSize: 13 }}>
                No media found.
              </p>
            )}
            {!loading && assets.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8 }}>
                {assets.map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    data-testid={`picker-asset-${asset.id}`}
                    onClick={() => setHighlighted((prev) => (prev?.id === asset.id ? null : asset))}
                    onDoubleClick={() => { onPick(asset); onClose(); }}
                    style={{
                      border: highlighted?.id === asset.id ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                      borderRadius: 9, padding: 0, background: highlighted?.id === asset.id ? 'var(--color-warning-bg)' : 'var(--color-bg)',
                      cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', overflow: 'hidden',
                    }}
                  >
                    <div style={{ width: '100%', aspectRatio: '4/3', overflow: 'hidden', background: '#EDE8E2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {thumbNode(asset)}
                    </div>
                    <div style={{ padding: '4px 6px', fontSize: 10, fontWeight: 600, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {asset.title || asset.url.split('/').pop() || `#${asset.id}`}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer — stacks on mobile so Cancel / Use this file stay on-screen */}
        <div
          className="media-picker-footer"
          data-testid="media-picker-footer"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 20px',
            borderTop: '1px solid var(--color-border)',
            flexShrink: 0,
            gap: 10,
            minWidth: 0,
          }}
        >
          <div className="media-picker-footer-pager" style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {meta.last_page > 1 && (
              <>
                <button type="button" onClick={() => setPage((p) => p - 1)} disabled={page <= 1}
                  style={{ height: 32, padding: '0 10px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg)', cursor: page <= 1 ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontSize: 12, opacity: page <= 1 ? 0.5 : 1, display: 'inline-flex', alignItems: 'center' }}>
                  <ChevronLeft size={14} /> Prev
                </button>
                <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>{meta.current_page} / {meta.last_page}</span>
                <button type="button" onClick={() => setPage((p) => p + 1)} disabled={page >= meta.last_page}
                  style={{ height: 32, padding: '0 10px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg)', cursor: page >= meta.last_page ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontSize: 12, opacity: page >= meta.last_page ? 0.5 : 1, display: 'inline-flex', alignItems: 'center' }}>
                  Next <ChevronRight size={14} />
                </button>
              </>
            )}
          </div>

          {highlighted && (
            <span
              className="media-picker-footer-selected"
              title={selectedLabel}
              style={{
                fontSize: 12,
                color: 'var(--color-text-secondary)',
                minWidth: 0,
                maxWidth: '100%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              Selected: {selectedLabel}
            </span>
          )}

          <div className="media-picker-footer-actions" style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0, marginLeft: 'auto' }}>
            <button type="button" onClick={onClose}
              style={{ height: 44, minHeight: 44, padding: '0 16px', borderRadius: 10, border: '1px solid var(--color-border)', background: 'var(--color-bg)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
              Cancel
            </button>
            <button
              type="button"
              onClick={handlePick}
              disabled={!highlighted}
              data-testid="media-picker-confirm"
              style={{
                height: 44,
                minHeight: 44,
                padding: '0 16px',
                borderRadius: 10,
                background: highlighted ? 'var(--color-primary)' : 'var(--color-border)',
                color: highlighted ? '#fff' : 'var(--color-text-muted)',
                border: 'none',
                cursor: highlighted ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit',
                fontSize: 13,
                fontWeight: 700,
                whiteSpace: 'nowrap',
              }}
            >
              Use this file
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
