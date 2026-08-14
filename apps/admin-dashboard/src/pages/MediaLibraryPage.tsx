import { useCallback, useEffect, useRef, useState, type CSSProperties, type DragEvent } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import 'react-easy-crop/react-easy-crop.css';
import {
  Check, ChevronLeft, ChevronRight, Clapperboard, Copy, Crop, Download, FileText, Film,
  FlipHorizontal2, FlipVertical2, Folder, Image, Images, Music, Pencil, Plus, RefreshCw,
  RotateCcw, RotateCw, Search, Sliders, Trash2, Upload, X,
} from 'lucide-react';
import {
  assignMediaCollections, bulkDeleteMedia, createMediaCollection, deleteMedia, deleteMediaCollection,
  editMedia, getMedia, getMediaCollections, getMediaUsage, reconcileMedia,
  restoreMedia, updateMedia, updateMediaCollection, uploadMedia, useMediaAs,
  type MediaAsset, type MediaCollection, type MediaEditOp,
  type MediaEditResult, type MediaPaginationMeta, type MediaType, type MediaUsageItem,
  type MediaUseAsKey,
} from '../api';
import { usePageTitle } from '../hooks/usePageTitle';
import { useIsMobile } from '../hooks/useIsMobile';
import { useCurrentUserPermissions } from '../hooks/usePermissions';
import { useToast } from '../components/ui';
import { Btn, EmptyState, Modal, PageHeader, PageShell, Spinner } from '../components/SharedUI';
import { VideoStudioModal } from '../components/VideoStudioModal';
import {
  buildRotateParams,
  computeResizeOutputSize,
  cropParamsFromArea,
  exportMediaAsset,
  isCropReady,
  isRotateReady,
  normalizeRotateDegrees,
  rotatePreviewTransforms,
  scaleSizeToPreview,
  toggleFlipAxis,
  type MediaFlip,
} from '../utils/mediaEditHelpers';

const RESIZE_PRESETS = [1200, 800, 512, 256];

const USE_AS_OPTIONS: { key: MediaUseAsKey; label: string }[] = [
  { key: 'default_item_image', label: 'Default item image (menu)' },
  { key: 'logo', label: 'Document logo' },
  { key: 'logo_dark', label: 'Document logo (dark)' },
  { key: 'favicon', label: 'Document favicon' },
  { key: 'og_image', label: 'Document OG image' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function mediaTypeIcon(type: MediaType, size = 32) {
  switch (type) {
    case 'image': return <Image size={size} style={{ color: 'var(--color-text-muted)' }} />;
    case 'video': return <Film size={size} style={{ color: 'var(--color-text-muted)' }} />;
    case 'audio': return <Music size={size} style={{ color: 'var(--color-text-muted)' }} />;
    default:      return <FileText size={size} style={{ color: 'var(--color-text-muted)' }} />;
  }
}

function thumbSrc(asset: MediaAsset): string | null {
  if (asset.media_type !== 'image') return null;
  const raw = asset.thumb_url || asset.url || null;
  return raw ? mediaPreviewSrc(raw, asset) : null;
}

/**
 * Append a version token so replace-mode edits (same path) reload in the browser.
 * Prefer checksum; fall back to updated_at / file_size.
 */
export function mediaPreviewSrc(url: string, asset: Pick<MediaAsset, 'checksum' | 'updated_at' | 'file_size' | 'id'>): string {
  if (!url) return url;
  const token = asset.checksum || asset.updated_at || String(asset.file_size ?? '') || String(asset.id);
  if (!token) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}v=${encodeURIComponent(token)}`;
}

/** Grid / compact preview — images use thumb_url||url with icon fallback on error. */
function AssetThumb({ asset }: { asset: MediaAsset }) {
  const [broken, setBroken] = useState(false);
  const src = thumbSrc(asset);
  useEffect(() => { setBroken(false); }, [src]);
  if (asset.media_type === 'image' && src && !broken) {
    return (
      <img
        key={src}
        src={src}
        alt={asset.alt_text || asset.title || ''}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        onError={() => setBroken(true)}
      />
    );
  }
  return mediaTypeIcon(asset.media_type);
}

/** Detail drawer large preview — full image URL; video/audio/pdf players. */
function AssetDetailPreview({ asset }: { asset: MediaAsset }) {
  const [broken, setBroken] = useState(false);
  const fullSrc = asset.url ? mediaPreviewSrc(asset.url, asset) : '';
  const thumbPoster = asset.thumb_url ? mediaPreviewSrc(asset.thumb_url, asset) : undefined;
  useEffect(() => { setBroken(false); }, [fullSrc]);

  if (asset.media_type === 'image' && fullSrc && !broken) {
    return (
      <img
        key={fullSrc}
        data-testid="detail-preview-img"
        src={fullSrc}
        alt={asset.alt_text || asset.title || ''}
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        onError={() => setBroken(true)}
      />
    );
  }
  if (asset.media_type === 'video' && asset.url) {
    return (
      <video
        key={fullSrc}
        data-testid="detail-preview-video"
        controls
        src={fullSrc}
        poster={thumbPoster}
        style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#111' }}
      />
    );
  }
  if (asset.media_type === 'audio' && asset.url) {
    return (
      <div style={{ width: '100%', padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        {mediaTypeIcon('audio', 40)}
        <audio key={fullSrc} data-testid="detail-preview-audio" controls src={fullSrc} style={{ width: '100%' }} />
      </div>
    );
  }
  if (asset.media_type === 'document' && asset.url) {
    const isPdf = (asset.mime_type || '').includes('pdf') || asset.url.toLowerCase().endsWith('.pdf');
    if (isPdf) {
      return (
        <iframe
          key={fullSrc}
          data-testid="detail-preview-pdf"
          title={asset.title || 'PDF'}
          src={fullSrc}
          style={{ width: '100%', height: '100%', border: 'none', background: 'var(--color-surface)' }}
        />
      );
    }
    return (
      <div style={{ textAlign: 'center', padding: 16 }}>
        {mediaTypeIcon('document', 40)}
        <a href={asset.url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 10, color: 'var(--color-primary)', fontWeight: 600, fontSize: 13 }}>
          Open
        </a>
      </div>
    );
  }
  return mediaTypeIcon(asset.media_type);
}

const tabStyle = (active: boolean, mobile = false): CSSProperties => ({
  height: mobile ? 44 : 36, minHeight: 44, padding: '0 14px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
  fontWeight: active ? 700 : 500, fontSize: 13,
  border: active ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)',
  background: active ? 'var(--color-warning-bg)' : 'var(--color-surface)', color: 'var(--color-text)', whiteSpace: 'nowrap',
  display: 'inline-flex', alignItems: 'center', gap: 6,
});

// ─── Tag chip input ───────────────────────────────────────────────────────────

function TagInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [input, setInput] = useState('');
  const addTag = () => {
    const t = input.trim().toLowerCase();
    if (t && !value.includes(t)) onChange([...value, t]);
    setInput('');
  };
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '6px 8px', border: '1px solid var(--color-border)', borderRadius: 8, minHeight: 44, alignItems: 'center' }}>
      {value.map((t) => (
        <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 9999, background: '#F5E6D3', color: '#3D2B1F', fontSize: 12, fontWeight: 600 }}>
          {t}
          <button type="button" onClick={() => onChange(value.filter((x) => x !== t))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--color-text-secondary)', lineHeight: 1 }}>×</button>
        </span>
      ))}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } }}
        onBlur={addTag}
        placeholder={value.length === 0 ? 'Add tags…' : ''}
        style={{ flex: 1, minWidth: 80, border: 'none', outline: 'none', fontSize: 13, fontFamily: 'inherit', background: 'transparent' }}
      />
    </div>
  );
}

// ─── Asset thumb card ─────────────────────────────────────────────────────────

function AssetCard({
  asset, detailSelected, checked, onOpen, onToggleCheck, canManage,
}: {
  asset: MediaAsset;
  detailSelected: boolean;
  checked: boolean;
  onOpen: () => void;
  onToggleCheck: () => void;
  canManage: boolean;
}) {
  return (
    <div
      data-testid={`asset-card-${asset.id}`}
      style={{
        border: detailSelected || checked ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
        borderRadius: 10, padding: 0, background: checked || detailSelected ? 'var(--color-warning-bg)' : 'var(--color-bg)',
        textAlign: 'left', overflow: 'hidden',
        position: 'relative',
        boxShadow: detailSelected || checked ? '0 0 0 2px rgba(212,129,58,0.2)' : 'none',
      }}
    >
      {canManage && (
        <label
          data-testid={`asset-check-${asset.id}`}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute', top: 6, left: 6, zIndex: 2,
            width: 28, height: 28, minWidth: 28, minHeight: 28,
            borderRadius: 8, background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', boxShadow: '0 1px 2px rgba(28,20,8,0.08)',
          }}
        >
          <input
            type="checkbox"
            checked={checked}
            onChange={onToggleCheck}
            aria-label={`Select ${asset.title || `asset ${asset.id}`}`}
            style={{ width: 16, height: 16, accentColor: 'var(--color-primary)', cursor: 'pointer' }}
          />
        </label>
      )}
      <button
        type="button"
        onClick={onOpen}
        style={{
          display: 'block', width: '100%', border: 'none', padding: 0, margin: 0,
          background: 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
        }}
      >
        <div style={{ width: '100%', aspectRatio: '4 / 3', overflow: 'hidden', background: '#EDE8E2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <AssetThumb asset={asset} />
        </div>
        <div style={{ padding: '6px 8px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#3D2B1F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {asset.title || asset.url.split('/').pop() || `#${asset.id}`}
          </div>
          <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 2 }}>{fmtBytes(asset.file_size)}</div>
        </div>
      </button>
      {detailSelected && !checked && (
        <div style={{ position: 'absolute', top: 6, right: 6, width: 20, height: 20, borderRadius: '50%', background: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Check size={12} style={{ color: '#fff' }} />
        </div>
      )}
    </div>
  );
}

// ─── Edit operation panels ────────────────────────────────────────────────────

type EditParams = Record<string, unknown>;

const CROP_ASPECTS: Array<{ label: string; value: number | undefined }> = [
  { label: 'Free', value: undefined },
  { label: '1:1', value: 1 },
  { label: '4:3', value: 4 / 3 },
  { label: '16:9', value: 16 / 9 },
];

/**
 * Interactive crop — same react-easy-crop approach as MenuPage/ImageCropModal,
 * but outputs x/y/width/height for the media edit API (not a downloaded File).
 * ImageCropModal itself is a portal that exports a menu JPEG; not reusable here.
 */
function CropEditPanel({
  params, onChange, asset, compact,
}: {
  params: EditParams;
  onChange: (p: EditParams) => void;
  asset?: MediaAsset | null;
  compact?: boolean;
}) {
  const [cropPos, setCropPos] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [aspect, setAspect] = useState<number | undefined>(undefined);
  const imageSrc = asset?.url ? mediaPreviewSrc(asset.url, asset) : '';
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const frameH = compact ? 'min(56vh, 380px)' : 260;

  const onCropComplete = useCallback((_area: Area, pixels: Area) => {
    onChange({ ...paramsRef.current, ...cropParamsFromArea(pixels) });
  }, [onChange]);

  const chip = (active: boolean): CSSProperties => ({
    height: 44, minHeight: 44, padding: '0 14px', borderRadius: 8, cursor: 'pointer',
    fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
    border: active ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
    background: active ? 'var(--color-warning-bg)' : 'var(--color-surface)',
    color: 'var(--color-text)',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} data-testid="media-crop-panel">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }} role="group" aria-label="Crop aspect ratio">
        {CROP_ASPECTS.map(({ label, value }) => (
          <button
            key={label}
            type="button"
            onClick={() => setAspect(value)}
            aria-pressed={aspect === value}
            style={chip(aspect === value)}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        data-testid="media-crop-frame"
        style={{
          position: 'relative', width: '100%', height: frameH, minHeight: compact ? 280 : 220,
          background: 'var(--color-text)', borderRadius: 10, overflow: 'hidden',
          touchAction: 'none',
        }}
      >
        {imageSrc ? (
          <Cropper
            image={imageSrc}
            crop={cropPos}
            zoom={zoom}
            aspect={aspect}
            onCropChange={setCropPos}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            objectFit="contain"
            showGrid
            style={{ containerStyle: { width: '100%', height: '100%' } }}
          />
        ) : (
          <div style={{ color: '#fff', padding: 16 }}>No image</div>
        )}
      </div>
      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block' }}>
        Zoom
        <input
          type="range"
          min={1}
          max={3}
          step={0.05}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          style={{ width: '100%', marginTop: 6, minHeight: 44 }}
          aria-label="Crop zoom"
          data-testid="media-crop-zoom"
        />
      </label>
      <div data-testid="media-crop-pixels" style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
        Selection: {Number(params.width) > 0 ? Math.round(Number(params.width)) : '—'}
        {' × '}
        {Number(params.height) > 0 ? Math.round(Number(params.height)) : '—'}
        {' px'}
        {(params.x != null || params.y != null)
          ? ` @ ${Math.round(Number(params.x) || 0)}, ${Math.round(Number(params.y) || 0)}`
          : ''}
      </div>
      <p style={{ margin: 0, fontSize: 11, color: 'var(--color-text-muted)' }}>
        Drag to move · pinch or use the slider to zoom. The framed area is what gets saved.
      </p>
    </div>
  );
}

function RotateEditPanel({
  params, onChange, asset,
}: {
  params: EditParams;
  onChange: (p: EditParams) => void;
  asset?: MediaAsset | null;
}) {
  const degrees = normalizeRotateDegrees(Number(params.degrees) || 0);
  const flip = (String(params.flip || '') as MediaFlip) || '';
  const src = asset?.url ? mediaPreviewSrc(asset.url, asset) : '';
  const srcW = asset?.width || 400;
  const srcH = asset?.height || 300;

  const commit = (nextDegrees: number, nextFlip: MediaFlip) => {
    onChange(buildRotateParams(nextDegrees, nextFlip));
  };

  const rad = (degrees * Math.PI) / 180;
  const outW = Math.round(Math.abs(srcW * Math.cos(rad)) + Math.abs(srcH * Math.sin(rad))) || srcW;
  const outH = Math.round(Math.abs(srcW * Math.sin(rad)) + Math.abs(srcH * Math.cos(rad))) || srcH;
  const transform = rotatePreviewTransforms(degrees, flip);

  const chip = (active: boolean): CSSProperties => ({
    height: 44, minHeight: 44, padding: '0 12px', borderRadius: 8, cursor: 'pointer',
    fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
    border: active ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
    background: active ? 'var(--color-warning-bg)' : 'var(--color-surface)',
    color: 'var(--color-text)',
    display: 'inline-flex', alignItems: 'center', gap: 6,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} data-testid="media-rotate-panel">
      <div
        data-testid="edit-live-preview"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          minHeight: 260, width: '100%', background: 'var(--color-text)',
          borderRadius: 10, overflow: 'hidden', padding: 16, boxSizing: 'border-box',
        }}
      >
        {src ? (
          <img
            key={src}
            src={src}
            alt=""
            style={{
              maxWidth: degrees % 180 === 90 ? 160 : 220,
              maxHeight: 200,
              objectFit: 'contain',
              transform: transform || undefined,
              transition: 'transform 0.2s ease',
            }}
          />
        ) : (
          <div style={{ color: '#fff', fontSize: 13 }}>No image</div>
        )}
      </div>

      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
        {degrees || flip
          ? <>Preview: {degrees}°{flip ? ` · flip ${flip}` : ''} · ~{outW}×{outH} px</>
          : 'Choose a rotation or flip'}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button type="button" onClick={() => commit(degrees - 90, flip)} style={chip(false)} aria-label="Rotate left 90 degrees">
          <RotateCcw size={16} /> 90°
        </button>
        <button type="button" onClick={() => commit(degrees + 90, flip)} style={chip(false)} aria-label="Rotate right 90 degrees">
          <RotateCw size={16} /> 90°
        </button>
        <button
          type="button"
          onClick={() => commit(degrees, toggleFlipAxis(flip, 'horizontal'))}
          style={chip(flip === 'horizontal' || flip === 'both')}
          aria-label="Flip horizontal"
          data-testid="media-flip-h"
        >
          <FlipHorizontal2 size={16} /> Flip H
        </button>
        <button
          type="button"
          onClick={() => commit(degrees, toggleFlipAxis(flip, 'vertical'))}
          style={chip(flip === 'vertical' || flip === 'both')}
          aria-label="Flip vertical"
          data-testid="media-flip-v"
        >
          <FlipVertical2 size={16} /> Flip V
        </button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {[0, 90, 180, 270].map((d) => (
          <button key={d} type="button" onClick={() => commit(d, flip)} style={chip(degrees === d)}>
            {d}°
          </button>
        ))}
      </div>

      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block' }}>
        Angle ({degrees}°)
        <input
          type="range"
          min={0}
          max={359}
          step={1}
          value={degrees}
          onChange={(e) => commit(Number(e.target.value), flip)}
          style={{ width: '100%', marginTop: 6, minHeight: 44 }}
          data-testid="rotate-angle-slider"
          aria-label="Rotation angle"
        />
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'end' }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block' }}>
          Exact degrees
          <input
            type="number"
            min={0}
            max={359}
            value={degrees}
            onChange={(e) => commit(e.target.value === '' ? 0 : Number(e.target.value), flip)}
            data-testid="rotate-degrees-input"
            style={{
              display: 'block', width: '100%', marginTop: 4, height: 44, minHeight: 44,
              border: '1px solid var(--color-border)', borderRadius: 8, padding: '0 10px',
              fontFamily: 'inherit', fontSize: 13, boxSizing: 'border-box',
              background: 'var(--color-surface)', color: 'var(--color-text)',
            }}
          />
        </label>
        <button type="button" onClick={() => onChange({})} style={{ ...chip(false), height: 44 }}>
          Reset
        </button>
      </div>
    </div>
  );
}

function ResizeEditPanel({
  params, onChange, asset,
}: {
  params: EditParams;
  onChange: (p: EditParams) => void;
  asset?: MediaAsset | null;
}) {
  const srcW = asset?.width || 400;
  const srcH = asset?.height || 300;
  const keepAspect = (params.keep_aspect as boolean | undefined)
    ?? (params.maintain_aspect as boolean | undefined)
    ?? true;
  const w = params.width as number | undefined;
  const h = params.height as number | undefined;
  const out = computeResizeOutputSize(srcW, srcH, { width: w, height: h, keepAspect });
  const preview = scaleSizeToPreview(out.width, out.height, 200);
  const src = asset?.url ? mediaPreviewSrc(asset.url, asset) : '';

  const commit = (next: EditParams) => {
    const maintain = (next.keep_aspect as boolean | undefined)
      ?? (next.maintain_aspect as boolean | undefined)
      ?? keepAspect;
    onChange({ ...next, keep_aspect: maintain, maintain_aspect: maintain });
  };

  const chip = (active: boolean): CSSProperties => ({
    height: 44, minHeight: 44, padding: '0 14px', borderRadius: 8, cursor: 'pointer',
    fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
    border: active ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
    background: active ? 'var(--color-warning-bg)' : 'var(--color-surface)',
    color: 'var(--color-text)',
  });

  const labelStyle: CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 };
  const inputStyle: CSSProperties = {
    width: '100%', height: 44, minHeight: 44, border: '1px solid var(--color-border)',
    borderRadius: 8, padding: '0 10px', fontFamily: 'inherit', fontSize: 13,
    boxSizing: 'border-box', background: 'var(--color-surface)', color: 'var(--color-text)',
  };

  let hint = 'Set width and/or height';
  if (w || h) hint = `New size: ${out.width} × ${out.height} px`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} data-testid="media-resize-panel">
      <div
        data-testid="edit-live-preview"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          minHeight: Math.max(160, preview.height + 24), width: '100%',
          background: 'var(--color-text)', borderRadius: 10, overflow: 'hidden',
          padding: 12, boxSizing: 'border-box',
        }}
      >
        {src ? (
          <img
            key={src}
            src={src}
            alt=""
            data-testid="resize-preview-img"
            style={{
              width: preview.width,
              height: preview.height,
              objectFit: keepAspect ? 'contain' : 'fill',
              transition: 'width 0.15s ease, height 0.15s ease',
            }}
          />
        ) : (
          <div style={{ color: '#fff', fontSize: 13 }}>No image</div>
        )}
      </div>

      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
        {hint}{asset?.width && asset?.height ? ` · Original ${asset.width}×${asset.height}` : ''}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }} role="group" aria-label="Resize presets">
        {RESIZE_PRESETS.map((px) => (
          <button
            key={px}
            type="button"
            onClick={() => commit({
              ...params,
              width: px,
              height: keepAspect ? Math.round((px * srcH) / srcW) : h,
            })}
            style={chip(w === px)}
          >
            {px}px
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <label style={labelStyle}>Width (px)
          <input
            type="number"
            min={1}
            value={w ?? ''}
            onChange={(e) => commit({ ...params, width: e.target.value ? Number(e.target.value) : undefined })}
            placeholder="auto"
            data-testid="resize-width"
            style={{ ...inputStyle, marginTop: 4 }}
          />
        </label>
        <label style={labelStyle}>Height (px)
          <input
            type="number"
            min={1}
            value={h ?? ''}
            onChange={(e) => commit({ ...params, height: e.target.value ? Number(e.target.value) : undefined })}
            placeholder="auto"
            data-testid="resize-height"
            style={{ ...inputStyle, marginTop: 4 }}
          />
        </label>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', minHeight: 44 }}>
        <input
          type="checkbox"
          checked={keepAspect}
          onChange={(e) => commit({ ...params, keep_aspect: e.target.checked, maintain_aspect: e.target.checked })}
          data-testid="resize-keep-aspect"
        />
        Maintain aspect ratio
      </label>
    </div>
  );
}

function EditOpPanel({
  op, params, onChange, asset, compact,
}: {
  op: MediaEditOp;
  params: EditParams;
  onChange: (p: EditParams) => void;
  asset?: MediaAsset | null;
  compact?: boolean;
}) {
  const set = (k: string, v: unknown) => onChange({ ...params, [k]: v });
  const labelStyle: CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 };
  const inputStyle: CSSProperties = { width: '100%', height: 44, minHeight: 44, border: '1px solid var(--color-border)', borderRadius: 8, padding: '0 10px', fontFamily: 'inherit', fontSize: 13, boxSizing: 'border-box', background: 'var(--color-surface)', color: 'var(--color-text)' };

  switch (op) {
    case 'convert':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={labelStyle}>Output format
            <select value={(params.format as string) || 'jpeg'} onChange={(e) => set('format', e.target.value)} style={{ ...inputStyle, marginTop: 4 }}>
              <option value="jpeg">JPEG</option>
              <option value="png">PNG</option>
              <option value="webp">WebP</option>
            </select>
          </label>
          <label style={labelStyle}>Quality (1–100)
            <input type="number" min={1} max={100} value={(params.quality as number) ?? 85} onChange={(e) => set('quality', Number(e.target.value))} style={{ ...inputStyle, marginTop: 4 }} />
          </label>
        </div>
      );
    case 'resize':
      return <ResizeEditPanel params={params} onChange={onChange} asset={asset} />;
    case 'crop':
      return <CropEditPanel params={params} onChange={onChange} asset={asset} compact={compact} />;
    case 'rotate':
      return <RotateEditPanel params={params} onChange={onChange} asset={asset} />;
    case 'thumbnail': {
      const tw = (params.width as number) ?? 300;
      const th = (params.height as number) ?? 200;
      const preview = scaleSizeToPreview(tw, th, 200);
      const src = asset?.url ? mediaPreviewSrc(asset.url, asset) : '';
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} data-testid="media-thumbnail-panel">
          <div
            data-testid="edit-live-preview"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              minHeight: Math.max(140, preview.height + 24), width: '100%',
              background: 'var(--color-text)', borderRadius: 10, overflow: 'hidden',
              padding: 12, boxSizing: 'border-box',
            }}
          >
            {src ? (
              <img
                key={src}
                src={src}
                alt=""
                style={{
                  width: preview.width,
                  height: preview.height,
                  objectFit: 'cover',
                  transition: 'width 0.15s ease, height 0.15s ease',
                }}
              />
            ) : (
              <div style={{ color: '#fff', fontSize: 13 }}>No image</div>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <label style={labelStyle}>Width (px)
              <input type="number" min={1} value={tw} onChange={(e) => set('width', Number(e.target.value))} style={{ ...inputStyle, marginTop: 4 }} />
            </label>
            <label style={labelStyle}>Height (px)
              <input type="number" min={1} value={th} onChange={(e) => set('height', Number(e.target.value))} style={{ ...inputStyle, marginTop: 4 }} />
            </label>
          </div>
        </div>
      );
    }
    case 'optimize':
      return (
        <label style={labelStyle}>Quality (1–100)
          <input type="number" min={1} max={100} value={(params.quality as number) ?? 80} onChange={(e) => set('quality', Number(e.target.value))} style={{ ...inputStyle, marginTop: 4 }} />
        </label>
      );
    default:
      return null;
  }
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function MediaLibraryPage() {
  usePageTitle('Media Library');
  const isMobile = useIsMobile();
  const { can } = useCurrentUserPermissions();
  const toast = useToast();
  const canManage = can('media.manage');
  const canUseAs = can('media.manage') || can('website.manage');
  const [useAsKey, setUseAsKey] = useState<MediaUseAsKey>('default_item_image');
  const [useAsSaving, setUseAsSaving] = useState(false);

  // List state
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [meta, setMeta] = useState<MediaPaginationMeta>({ current_page: 1, last_page: 1, per_page: 24, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [activeType, setActiveType] = useState<MediaType | ''>('');
  const [activeCollection, setActiveCollection] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // Collections sidebar
  const [collections, setCollections] = useState<MediaCollection[]>([]);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renamingName, setRenamingName] = useState('');
  const [colSaving, setColSaving] = useState(false);

  // Detail drawer
  const [selected, setSelected] = useState<MediaAsset | null>(null);
  const [detailTitle, setDetailTitle] = useState('');
  const [detailAlt, setDetailAlt] = useState('');
  const [detailTags, setDetailTags] = useState<string[]>([]);
  const [detailSaving, setDetailSaving] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Usage
  const [usageItems, setUsageItems] = useState<MediaUsageItem[]>([]);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);

  const [videoStudioOpen, setVideoStudioOpen] = useState(false);

  // Edit tools
  const [editOp, setEditOp] = useState<MediaEditOp | null>(null);
  const [editParams, setEditParams] = useState<EditParams>({});
  const [showSaveModeModal, setShowSaveModeModal] = useState(false);
  const [editResult, setEditResult] = useState<MediaEditResult | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [canRestore, setCanRestore] = useState(false);

  // Upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [uploadCollectionId, setUploadCollectionId] = useState<number | ''>('');
  const [uploadResults, setUploadResults] = useState<Array<{ name: string; deduped: boolean }>>([]);

  // Delete (single or multi-select)
  const [checkedIds, setCheckedIds] = useState<number[]>([]);
  const [deleteTargets, setDeleteTargets] = useState<MediaAsset[] | null>(null);
  const [forceDelete, setForceDelete] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);

  // ─── Loaders ──────────────────────────────────────────────────────────────

  const loadCollections = useCallback(async () => {
    try {
      const res = await getMediaCollections();
      setCollections(res.data);
    } catch {
      // non-fatal
    }
  }, []);

  const loadAssets = useCallback(async () => {
    setLoading(true);
    setError('');
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
    } catch (e) {
      setError((e as Error).message || 'Failed to load media');
    } finally {
      setLoading(false);
    }
  }, [activeType, activeCollection, search, page]);

  useEffect(() => { void loadCollections(); }, [loadCollections]);
  useEffect(() => { void loadAssets(); }, [loadAssets]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [activeType, activeCollection, search]);

  // Clear multi-select when the visible page/filter set changes
  useEffect(() => { setCheckedIds([]); }, [activeType, activeCollection, search, page]);

  // ─── Detail drawer helpers ────────────────────────────────────────────────

  const openDetail = (asset: MediaAsset) => {
    setSelected(asset);
    setDetailTitle(asset.title || '');
    setDetailAlt(asset.alt_text || '');
    setDetailTags(asset.tags || []);
    setDetailError('');
    setEditOp(null);
    setEditParams({});
    setEditResult(null);
    setCanRestore(false);
    setUsageItems([]);
    setUsageOpen(false);
  };

  const closeDetail = () => {
    setSelected(null);
    setEditOp(null);
    setEditResult(null);
    setCanRestore(false);
  };

  const loadUsage = async (id: number) => {
    setUsageLoading(true);
    try {
      const res = await getMediaUsage(id);
      setUsageItems(res.data);
      setUsageOpen(true);
    } catch {
      setUsageItems([]);
    } finally {
      setUsageLoading(false);
    }
  };

  const saveDetail = async () => {
    if (!selected) return;
    setDetailSaving(true);
    setDetailError('');
    try {
      const res = await updateMedia(selected.id, {
        title: detailTitle || undefined,
        alt_text: detailAlt || undefined,
        tags: detailTags,
      });
      const updated = res.data;
      setSelected(updated);
      setAssets((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    } catch (e) {
      setDetailError((e as Error).message || 'Save failed');
    } finally {
      setDetailSaving(false);
    }
  };

  const copyUrl = async () => {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(selected.url);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      // fallback: do nothing
    }
  };

  const handleExport = async (preferOriginal = false) => {
    if (!selected) return;
    setExporting(true);
    try {
      await exportMediaAsset(selected, preferOriginal);
      toast.success(preferOriginal ? 'Original downloaded' : 'File downloaded');
    } catch (e) {
      try {
        const url = preferOriginal && selected.original_url ? selected.original_url : selected.url;
        window.open(url, '_blank', 'noopener,noreferrer');
        toast.success('Opened file in a new tab');
      } catch {
        toast.error((e as Error).message || 'Export failed');
      }
    } finally {
      setExporting(false);
    }
  };

  // ─── Edit tools ───────────────────────────────────────────────────────────

  const applyEditOp = async (mode: 'replace' | 'copy') => {
    if (!selected || !editOp) return;
    setEditSaving(true);
    setEditError('');
    setShowSaveModeModal(false);
    try {
      const result = await editMedia(selected.id, editOp, editParams, mode);
      const next = result.asset;
      setEditResult(result);
      setCanRestore(mode === 'replace');
      setSelected(next);
      setDetailTitle(next.title || '');
      setDetailAlt(next.alt_text || '');
      setDetailTags(next.tags || []);
      // Copy creates a new id — map() would miss it and the grid would stay stale until refresh.
      if (mode === 'copy') {
        setAssets((prev) => {
          if (prev.some((a) => a.id === next.id)) {
            return prev.map((a) => (a.id === next.id ? next : a));
          }
          return [next, ...prev];
        });
        setMeta((m) => ({ ...m, total: m.total + 1 }));
      } else {
        setAssets((prev) => prev.map((a) => (a.id === next.id ? next : a)));
      }
      setEditOp(null);
    } catch (e) {
      setEditError((e as Error).message || 'Edit failed');
    } finally {
      setEditSaving(false);
    }
  };

  const handleRestore = async () => {
    if (!selected) return;
    setEditSaving(true);
    setEditError('');
    try {
      const res = await restoreMedia(selected.id);
      setSelected(res.asset);
      setAssets((prev) => prev.map((a) => (a.id === res.asset.id ? res.asset : a)));
      setEditResult(null);
      setCanRestore(false);
    } catch (e) {
      setEditError((e as Error).message || 'Restore failed');
    } finally {
      setEditSaving(false);
    }
  };

  // ─── Upload ───────────────────────────────────────────────────────────────

  const doUpload = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;
    setUploading(true);
    setUploadStatus('Starting…');
    setUploadError('');
    setUploadResults([]);
    try {
      const res = await uploadMedia(fileArray, {
        collection_ids: uploadCollectionId ? [uploadCollectionId] : [],
        onStatus: setUploadStatus,
      });
      setUploadResults(res.data.map((r) => ({
        name: r.asset.title || r.asset.url.split('/').pop() || `#${r.asset.id}`,
        deduped: r.deduped,
      })));
      void loadAssets();
    } catch (e) {
      setUploadError((e as Error).message || 'Upload failed');
    } finally {
      setUploading(false);
      setUploadStatus('');
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) void doUpload(e.dataTransfer.files);
  };

  // ─── Collections CRUD ─────────────────────────────────────────────────────

  const addCollection = async () => {
    const name = newCollectionName.trim();
    if (!name) return;
    setColSaving(true);
    try {
      const res = await createMediaCollection(name);
      setCollections((prev) => [...prev, res.data]);
      setNewCollectionName('');
    } catch {
      // non-fatal
    } finally {
      setColSaving(false);
    }
  };

  const renameCollection = async (id: number) => {
    const name = renamingName.trim();
    if (!name) return;
    setColSaving(true);
    try {
      const res = await updateMediaCollection(id, name);
      setCollections((prev) => prev.map((c) => (c.id === id ? res.data : c)));
      setRenamingId(null);
    } catch {
      // non-fatal
    } finally {
      setColSaving(false);
    }
  };

  const removeCollection = async (id: number) => {
    if (!window.confirm('Delete this collection? Assets are kept.')) return;
    try {
      await deleteMediaCollection(id);
      setCollections((prev) => prev.filter((c) => c.id !== id));
      if (activeCollection === collections.find((c) => c.id === id)?.slug) {
        setActiveCollection('');
      }
    } catch {
      // non-fatal
    }
  };

  // ─── Assign collection to selected asset ─────────────────────────────────

  const toggleAssetCollection = async (colId: number) => {
    if (!selected) return;
    const currentIds = selected.collections.map((c) => c.id);
    const nextIds = currentIds.includes(colId)
      ? currentIds.filter((id) => id !== colId)
      : [...currentIds, colId];
    try {
      const res = await assignMediaCollections(selected.id, nextIds);
      setSelected(res.data);
      setAssets((prev) => prev.map((a) => (a.id === res.data.id ? res.data : a)));
    } catch {
      // non-fatal
    }
  };

  // ─── Multi-select + Delete ────────────────────────────────────────────────

  const toggleChecked = (id: number) => {
    setCheckedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const selectAllOnPage = () => {
    setCheckedIds(assets.map((a) => a.id));
  };

  const clearChecked = () => setCheckedIds([]);

  const checkedAssets = assets.filter((a) => checkedIds.includes(a.id));
  const checkedInUseCount = checkedAssets.filter((a) => a.usage_count > 0).length;

  const openBulkDelete = () => {
    if (checkedAssets.length === 0) return;
    setDeleteTargets(checkedAssets);
    setDeleteError('');
    setForceDelete(false);
  };

  const confirmDelete = async () => {
    if (!deleteTargets || deleteTargets.length === 0) return;
    setDeleting(true);
    setDeleteError('');
    try {
      const ids = deleteTargets.map((a) => a.id);
      if (ids.length === 1) {
        await deleteMedia(ids[0], forceDelete);
        setAssets((prev) => prev.filter((a) => a.id !== ids[0]));
        if (selected?.id === ids[0]) closeDetail();
        setCheckedIds((prev) => prev.filter((id) => id !== ids[0]));
      } else {
        const res = await bulkDeleteMedia(ids, forceDelete);
        const deletedSet = new Set(res.deleted);
        setAssets((prev) => prev.filter((a) => !deletedSet.has(a.id)));
        if (selected && deletedSet.has(selected.id)) closeDetail();
        setCheckedIds((prev) => prev.filter((id) => !deletedSet.has(id)));
        if (res.blocked.length > 0 && res.deleted.length === 0) {
          setDeleteError(
            `${res.blocked.length} asset${res.blocked.length === 1 ? ' is' : 's are'} in use. Enable force delete to remove them.`,
          );
          setDeleting(false);
          return;
        }
        if (res.blocked.length > 0) {
          setDeleteError(
            `Deleted ${res.deleted.length}. ${res.blocked.length} still in use — enable force delete and try again.`,
          );
          setDeleteTargets(deleteTargets.filter((a) => res.blocked.some((b) => b.id === a.id)));
          setDeleting(false);
          return;
        }
      }
      setDeleteTargets(null);
      setForceDelete(false);
    } catch (e) {
      setDeleteError((e as Error).message || 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  // ─── Reconcile ────────────────────────────────────────────────────────────

  const handleReconcile = async () => {
    try {
      const res = await reconcileMedia();
      alert(
        `Reconcile finished: ${res.created} new, ${res.skipped} skipped, ${res.thumbs_fixed} thumbs fixed (${res.scanned} scanned)`,
      );
      void loadAssets();
    } catch (e) {
      alert((e as Error).message || 'Reconcile failed');
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  const TYPE_TABS: Array<{ label: string; value: MediaType | ''; icon: React.ReactNode }> = [
    { label: 'All', value: '', icon: <Images size={14} /> },
    { label: 'Images', value: 'image', icon: <Image size={14} /> },
    { label: 'Video', value: 'video', icon: <Film size={14} /> },
    { label: 'Audio', value: 'audio', icon: <Music size={14} /> },
    { label: 'Documents', value: 'document', icon: <FileText size={14} /> },
  ];

  const EDIT_OPS: Array<{ op: MediaEditOp; label: string; icon: React.ReactNode }> = [
    { op: 'convert',   label: 'Convert',   icon: <Image size={14} /> },
    { op: 'resize',    label: 'Resize',    icon: <Sliders size={14} /> },
    { op: 'crop',      label: 'Crop',      icon: <Crop size={14} /> },
    { op: 'rotate',    label: 'Rotate',    icon: <RotateCw size={14} /> },
    { op: 'thumbnail', label: 'Thumbnail', icon: <Images size={14} /> },
    { op: 'optimize',  label: 'Optimize',  icon: <Sliders size={14} /> },
  ];

  return (
    <PageShell>
      <PageHeader
        title="Media Library"
        subtitle="Upload, organise and edit images, video, audio, and documents"
        section="System"
        action={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {canManage && (
              <Btn variant="secondary" onClick={handleReconcile}>
                <RefreshCw size={14} /> Reconcile
              </Btn>
            )}
            {canManage && (
              <Btn onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                <Upload size={14} /> Upload
              </Btn>
            )}
          </div>
        }
      />

      {/* Type tabs + search */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {TYPE_TABS.map(({ label, value, icon }) => (
            <button
              key={value}
              type="button"
              style={tabStyle(activeType === value, isMobile)}
              onClick={() => setActiveType(value)}
              aria-pressed={activeType === value}
            >
              {icon} {label}
            </button>
          ))}
        </div>
        <div style={{ marginLeft: isMobile ? 0 : 'auto', position: 'relative', minWidth: isMobile ? '100%' : 220, flex: isMobile ? '1 1 100%' : undefined }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: isMobile ? 15 : 12, color: 'var(--color-text-muted)' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search media…"
            style={{ width: '100%', height: isMobile ? 44 : 38, paddingLeft: 30, borderRadius: 10, border: '1px solid var(--color-border)', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }}
          />
        </div>
      </div>

      {/* Main layout: sidebar + content + drawer */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexDirection: isMobile ? 'column' : 'row' }}>

        {/* Collections sidebar / mobile chip row */}
        <aside
          data-testid="collections-sidebar"
          data-layout={isMobile ? 'chips' : 'sidebar'}
          style={isMobile ? {
            width: '100%', flexShrink: 0, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 14, padding: 12,
          } : {
            width: 200, flexShrink: 0, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 14, padding: 12, position: 'sticky', top: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13, color: 'var(--color-text)', marginBottom: 10 }}>
            <Folder size={15} /> Collections
          </div>

          <div
            data-testid={isMobile ? 'collections-chip-row' : undefined}
            style={isMobile ? {
              display: 'flex', gap: 8, overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 4,
            } : undefined}
          >
          <button
            type="button"
            onClick={() => setActiveCollection('')}
            style={{
              display: isMobile ? 'inline-flex' : 'block',
              width: isMobile ? 'auto' : '100%',
              textAlign: 'left',
              padding: isMobile ? '10px 14px' : '7px 9px',
              minHeight: 44,
              border: isMobile ? (activeCollection === '' ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)') : 'none',
              borderRadius: isMobile ? 9999 : 8,
              cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 13, fontWeight: activeCollection === '' ? 700 : 400,
              background: activeCollection === '' ? '#F5E6D3' : (isMobile ? 'var(--color-bg)' : 'transparent'),
              color: activeCollection === '' ? 'var(--color-text)' : 'var(--color-text-secondary)',
              marginBottom: isMobile ? 0 : 2,
              flexShrink: 0,
              alignItems: 'center',
            }}
          >
            All media
          </button>

          {collections.map((col) => (
            <div key={col.id} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: isMobile ? 0 : 2, flexShrink: 0 }}>
              {renamingId === col.id ? (
                <form
                  onSubmit={(e) => { e.preventDefault(); void renameCollection(col.id); }}
                  style={{ flex: 1, display: 'flex', gap: 4 }}
                >
                  <input
                    autoFocus
                    value={renamingName}
                    onChange={(e) => setRenamingName(e.target.value)}
                    style={{ flex: 1, minWidth: 0, height: 44, border: '1px solid var(--color-primary)', borderRadius: 6, padding: '0 6px', fontSize: 12, fontFamily: 'inherit' }}
                  />
                  <button type="submit" disabled={colSaving} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary)', padding: '0 2px', minWidth: 44, minHeight: 44 }}><Check size={14} /></button>
                  <button type="button" onClick={() => setRenamingId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: '0 2px', minWidth: 44, minHeight: 44 }}><X size={14} /></button>
                </form>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setActiveCollection(col.slug)}
                    style={{
                      flex: isMobile ? undefined : 1,
                      textAlign: 'left',
                      padding: isMobile ? '10px 14px' : '7px 9px',
                      minHeight: 44,
                      border: isMobile ? (activeCollection === col.slug ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)') : 'none',
                      borderRadius: isMobile ? 9999 : 8,
                      cursor: 'pointer', fontFamily: 'inherit', fontSize: 13,
                      fontWeight: activeCollection === col.slug ? 700 : 400,
                      background: activeCollection === col.slug ? '#F5E6D3' : (isMobile ? 'var(--color-bg)' : 'transparent'),
                      color: activeCollection === col.slug ? 'var(--color-text)' : 'var(--color-text-secondary)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}
                    data-testid={`collection-btn-${col.slug}`}
                  >
                    {col.name}
                  </button>
                  {canManage && !isMobile && (
                    <>
                      <button type="button" onClick={() => { setRenamingId(col.id); setRenamingName(col.name); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 2, flexShrink: 0 }} aria-label={`Rename ${col.name}`}><Pencil size={12} /></button>
                      <button type="button" onClick={() => void removeCollection(col.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-danger)', padding: 2, flexShrink: 0 }} aria-label={`Delete ${col.name}`}><Trash2 size={12} /></button>
                    </>
                  )}
                </>
              )}
            </div>
          ))}
          </div>

          {canManage && (
            <form onSubmit={(e) => { e.preventDefault(); void addCollection(); }} style={{ marginTop: 10, display: 'flex', gap: 6 }}>
              <input
                value={newCollectionName}
                onChange={(e) => setNewCollectionName(e.target.value)}
                placeholder="New collection…"
                style={{ flex: 1, minWidth: 0, height: 32, border: '1px solid var(--color-border)', borderRadius: 6, padding: '0 8px', fontSize: 12, fontFamily: 'inherit' }}
              />
              <button type="submit" disabled={!newCollectionName.trim() || colSaving} style={{ height: 32, width: 32, border: '1px solid var(--color-primary)', borderRadius: 6, background: 'var(--color-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Plus size={14} style={{ color: '#fff' }} />
              </button>
            </form>
          )}
        </aside>

        {/* Main content area */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* Upload dropzone */}
          {canManage && (
            <div
              onDragOver={(e) => { e.preventDefault(); if (!uploading) setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { if (!uploading) onDrop(e); else e.preventDefault(); }}
              onClick={() => { if (!uploading) fileInputRef.current?.click(); }}
              style={{
                border: `2px dashed ${dragOver ? 'var(--color-primary)' : '#C4B5A5'}`,
                borderRadius: 12, padding: isMobile ? '28px 16px' : '20px 16px', textAlign: 'center',
                cursor: uploading ? 'wait' : 'pointer',
                background: dragOver ? 'var(--color-warning-bg)' : 'var(--color-bg)', marginBottom: 16,
                transition: 'border-color 0.15s, background 0.15s',
                minHeight: isMobile ? 88 : undefined,
                opacity: uploading ? 0.85 : 1,
              }}
            >
              <Upload size={22} style={{ color: 'var(--color-text-muted)', marginBottom: 6 }} />
              <div style={{ fontSize: 14, fontWeight: 600, color: '#3D2B1F' }}>
                {uploading ? (uploadStatus || 'Uploading…') : 'Drop files here or click to browse'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>
                {uploading
                  ? 'Please wait — iPhone HEIC photos are converted before upload'
                  : 'Images, video, audio, documents — multi-select supported'}
              </div>
              {collections.length > 0 && (
                <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 8 }} onClick={(e) => e.stopPropagation()}>
                  <label style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 600 }}>Collection:</label>
                  <select
                    value={uploadCollectionId}
                    onChange={(e) => setUploadCollectionId(e.target.value ? Number(e.target.value) : '')}
                    style={{ height: 30, borderRadius: 6, border: '1px solid var(--color-border)', padding: '0 8px', fontSize: 12, fontFamily: 'inherit' }}
                  >
                    <option value="">None</option>
                    {collections.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.heic,.heif,video/mp4,video/webm,video/quicktime,.mov,audio/*,application/pdf"
            style={{ display: 'none' }}
            onChange={(e) => { if (e.target.files) void doUpload(e.target.files); e.target.value = ''; }}
          />

          {uploadError && (
            <div style={{ background: 'var(--color-danger-bg)', border: '1px solid #fca5a5', borderRadius: 10, padding: '10px 14px', color: 'var(--color-danger-strong)', fontSize: 13, marginBottom: 12 }}>
              {uploadError}
            </div>
          )}

          {uploadResults.length > 0 && (
            <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13 }}>
              <strong>{uploadResults.length} file{uploadResults.length === 1 ? '' : 's'} uploaded</strong>
              {uploadResults.some((r) => r.deduped) && (
                <span style={{ marginLeft: 8, color: 'var(--color-text-secondary)' }}>
                  · {uploadResults.filter((r) => r.deduped).length} duplicate{uploadResults.filter((r) => r.deduped).length === 1 ? '' : 's'} detected (existing asset returned)
                </span>
              )}
            </div>
          )}

          {/* Grid */}
          {loading && <Spinner />}
          {!loading && error && (
            <div style={{ background: 'var(--color-danger-bg)', border: '1px solid #fca5a5', borderRadius: 10, padding: '10px 14px', color: 'var(--color-danger-strong)', fontSize: 13 }}>{error}</div>
          )}
          {!loading && !error && assets.length === 0 && (
            <EmptyState message="No assets found. Upload some files to get started." />
          )}
          {!loading && assets.length > 0 && (
            <>
              {canManage && (
                <div
                  data-testid="media-bulk-bar"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                    marginBottom: 12, padding: '10px 12px', borderRadius: 10,
                    background: checkedIds.length > 0 ? 'var(--color-warning-bg)' : 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  <Btn variant="secondary" small onClick={selectAllOnPage}>
                    Select all ({assets.length})
                  </Btn>
                  {checkedIds.length > 0 && (
                    <>
                      <Btn variant="ghost" small onClick={clearChecked}>Clear</Btn>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>
                        {checkedIds.length} selected
                        {checkedInUseCount > 0 ? ` · ${checkedInUseCount} in use` : ''}
                      </span>
                      <div style={{ marginLeft: 'auto' }}>
                        <Btn variant="danger" small onClick={openBulkDelete}>
                          <Trash2 size={14} /> Delete selected
                        </Btn>
                      </div>
                    </>
                  )}
                  {checkedIds.length === 0 && (
                    <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                      Tick photos to delete several at once
                    </span>
                  )}
                </div>
              )}
              <div
                data-testid="media-grid"
                style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? 100 : 140}px, 1fr))`, gap: 10 }}
              >
                {assets.map((asset) => (
                  <AssetCard
                    key={asset.id}
                    asset={asset}
                    detailSelected={selected?.id === asset.id}
                    checked={checkedIds.includes(asset.id)}
                    canManage={canManage}
                    onOpen={() => openDetail(asset)}
                    onToggleCheck={() => toggleChecked(asset.id)}
                  />
                ))}
              </div>
            </>
          )}

          {/* Pagination */}
          {meta.last_page > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, marginTop: 20 }}>
              <Btn variant="secondary" small disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft size={14} /> Prev
              </Btn>
              <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                Page {meta.current_page} of {meta.last_page} · {meta.total} files
              </span>
              <Btn variant="secondary" small disabled={page >= meta.last_page} onClick={() => setPage((p) => p + 1)}>
                Next <ChevronRight size={14} />
              </Btn>
            </div>
          )}
        </div>

        {/* Detail Drawer */}
        {selected && (
          <>
            {isMobile && (
              <div
                data-testid="detail-drawer-backdrop"
                onClick={closeDetail}
                style={{ position: 'fixed', inset: 0, background: 'rgba(28, 20, 8, 0.45)', zIndex: 'var(--z-overlay)' as unknown as number }}
              />
            )}
          <aside
            data-testid="detail-drawer"
            data-mobile-overlay={isMobile ? 'true' : undefined}
            style={isMobile ? {
              position: 'fixed', inset: 0, zIndex: 'var(--z-modal)' as unknown as number,
              width: '100%', maxWidth: '100%', overflowY: 'auto', WebkitOverflowScrolling: 'touch',
              background: 'var(--color-surface)', border: 'none', borderRadius: 0, padding: 16,
              paddingBottom: 'max(96px, calc(24px + env(safe-area-inset-bottom, 0px)))',
            } : {
              width: 320, flexShrink: 0, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 14, padding: 16, position: 'sticky', top: 12,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-text)' }}>Asset details</span>
              <button type="button" onClick={closeDetail} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 4, minWidth: 44, minHeight: 44 }} aria-label="Close drawer">
                <X size={18} />
              </button>
            </div>

            {/* Preview */}
            <div style={{ width: '100%', aspectRatio: isMobile ? '16/10' : '4/3', borderRadius: 10, overflow: 'hidden', background: '#F0EBE2', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12, minHeight: isMobile ? 200 : undefined }}>
              <AssetDetailPreview asset={selected} />
            </div>

            {/* Meta */}
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 12, lineHeight: 1.6 }}>
              <div>{selected.mime_type} · {fmtBytes(selected.file_size)}</div>
              {selected.width && selected.height && <div>{selected.width} × {selected.height} px</div>}
              <div>Source: {selected.source}</div>
              <div>Used in {selected.usage_count} place{selected.usage_count === 1 ? '' : 's'}</div>
            </div>

            {/* Copy URL + Export */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => void copyUrl()}
                style={{
                  flex: 1, minWidth: 120, height: 44, minHeight: 44, borderRadius: 8,
                  border: '1px solid var(--color-border)',
                  background: copiedUrl ? 'var(--color-success-bg, #f0fdf4)' : 'var(--color-bg)',
                  cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
                  color: copiedUrl ? 'var(--color-success-strong)' : 'var(--color-text-secondary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                {copiedUrl ? <Check size={14} /> : <Copy size={14} />}
                {copiedUrl ? 'Copied!' : 'Copy URL'}
              </button>
              <button
                type="button"
                data-testid="export-download"
                onClick={() => void handleExport(false)}
                disabled={exporting || !selected.url}
                style={{
                  flex: 1, minWidth: 120, height: 44, minHeight: 44, borderRadius: 8,
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-primary-soft, #FFF7ED)',
                  cursor: exporting ? 'wait' : 'pointer', fontFamily: 'inherit',
                  fontSize: 13, fontWeight: 600, color: 'var(--color-text)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                <Download size={14} />
                {exporting ? 'Exporting…' : 'Export'}
              </button>
            </div>
            {selected.original_url && selected.original_url !== selected.url && (
              <button
                type="button"
                data-testid="export-original"
                onClick={() => void handleExport(true)}
                disabled={exporting}
                style={{
                  width: '100%', height: 40, minHeight: 40, marginTop: -6, marginBottom: 14,
                  borderRadius: 8, border: '1px dashed var(--color-border)',
                  background: 'var(--color-surface)', cursor: exporting ? 'wait' : 'pointer',
                  fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
                  color: 'var(--color-text-secondary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                <Download size={13} /> Export original
              </button>
            )}

            {selected.media_type === 'image' && canUseAs && (
              <div data-testid="media-use-as" style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Set on business record</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select
                    value={useAsKey}
                    onChange={(e) => setUseAsKey(e.target.value as MediaUseAsKey)}
                    style={{
                      flex: 1, height: 38, borderRadius: 8, border: '1px solid var(--color-border)',
                      padding: '0 10px', fontFamily: 'inherit', fontSize: 13, background: 'var(--color-surface)',
                    }}
                  >
                    {USE_AS_OPTIONS.map((opt) => (
                      <option key={opt.key} value={opt.key}>{opt.label}</option>
                    ))}
                  </select>
                  <Btn
                    type="button"
                    disabled={useAsSaving}
                    data-testid="media-use-as-apply"
                    onClick={() => {
                      void (async () => {
                        setUseAsSaving(true);
                        setDetailError('');
                        try {
                          const res = await useMediaAs(selected.id, useAsKey);
                          toast.success(res.message || 'Setting updated.');
                        } catch (e) {
                          setDetailError(e instanceof Error ? e.message : 'Failed to set.');
                        } finally {
                          setUseAsSaving(false);
                        }
                      })();
                    }}
                    style={{ minHeight: 38, height: 38 }}
                  >
                    {useAsSaving ? '…' : 'Set'}
                  </Btn>
                </div>
              </div>
            )}

            {detailError && (
              <div style={{ background: 'var(--color-danger-bg)', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px 12px', color: 'var(--color-danger-strong)', fontSize: 12, marginBottom: 10 }}>{detailError}</div>
            )}

            {/* Edit form */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }}>Title
                <input
                  value={detailTitle}
                  onChange={(e) => setDetailTitle(e.target.value)}
                  placeholder="Descriptive title"
                  style={{ display: 'block', width: '100%', marginTop: 4, height: 38, border: '1px solid var(--color-border)', borderRadius: 8, padding: '0 10px', fontFamily: 'inherit', fontSize: 13, boxSizing: 'border-box' }}
                />
              </label>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }}>Alt text
                <input
                  value={detailAlt}
                  onChange={(e) => setDetailAlt(e.target.value)}
                  placeholder="Describe for screen readers"
                  style={{ display: 'block', width: '100%', marginTop: 4, height: 38, border: '1px solid var(--color-border)', borderRadius: 8, padding: '0 10px', fontFamily: 'inherit', fontSize: 13, boxSizing: 'border-box' }}
                />
              </label>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>Tags</label>
                <TagInput value={detailTags} onChange={setDetailTags} />
              </div>
            </div>

            {/* Collections */}
            {collections.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Collections</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {collections.map((col) => {
                    const active = selected.collections.some((c) => c.id === col.id);
                    return (
                      <button
                        key={col.id}
                        type="button"
                        onClick={() => void toggleAssetCollection(col.id)}
                        disabled={!canManage}
                        style={{
                          padding: '3px 10px', borderRadius: 9999, fontSize: 11, fontWeight: 600, cursor: canManage ? 'pointer' : 'default',
                          background: active ? '#F5E6D3' : 'var(--color-bg)',
                          color: active ? '#3D2B1F' : 'var(--color-text-secondary)',
                          border: active ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)',
                        }}
                      >
                        {col.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Used in */}
            <div style={{ marginBottom: 14 }}>
              <button
                type="button"
                onClick={() => { if (!usageOpen) void loadUsage(selected.id); else setUsageOpen(false); }}
                style={{ width: '100%', height: 34, borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }}
              >
                {usageLoading ? 'Loading usage…' : usageOpen ? 'Hide usage' : 'Show usage'}
              </button>
              {usageOpen && (
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-text-secondary)' }}>
                  {usageItems.length === 0 ? (
                    <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>Not referenced anywhere.</p>
                  ) : (
                    <ul style={{ margin: 0, paddingLeft: 16 }}>
                      {usageItems.map((u, i) => (
                        <li key={i}>{u.label} ({u.type} · {u.field})</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {/* Video editor — always highlight for video assets */}
            {selected.media_type === 'video' && (
              <div
                data-testid="media-video-editor"
                style={{
                  marginBottom: 14,
                  padding: 12,
                  borderRadius: 12,
                  border: '1.5px solid #E8D4B8',
                  background: '#FFFBF5',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Clapperboard size={16} color="var(--color-primary)" />
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>Video editor</div>
                </div>
                <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--color-text-secondary)' }}>
                  Trim, crop aspect, pick a poster frame, export muted MP4.
                </p>
                <button
                  type="button"
                  onClick={() => setVideoStudioOpen(true)}
                  disabled={!canManage}
                  style={{
                    height: 40, padding: '0 14px', borderRadius: 8, border: 'none',
                    background: canManage ? 'var(--color-primary)' : 'var(--color-border)', cursor: canManage ? 'pointer' : 'not-allowed',
                    fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
                    color: canManage ? '#fff' : 'var(--color-text-muted)', display: 'inline-flex', alignItems: 'center', gap: 8,
                  }}
                >
                  <Clapperboard size={16} /> Open video editor
                </button>
                {!canManage ? (
                  <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--color-text-muted)' }}>Needs media.manage permission.</p>
                ) : null}
              </div>
            )}

            {/* Edit tools (images only) */}
            {selected.media_type === 'image' && canManage && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 8 }}>Edit tools</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                  {EDIT_OPS.map(({ op, label, icon }) => (
                    <button
                      key={op}
                      type="button"
                      onClick={() => {
                        if (editOp === op) {
                          setEditOp(null);
                          setEditParams({});
                        } else {
                          setEditOp(op);
                          setEditParams(
                            op === 'optimize' ? { quality: 80 }
                              : op === 'thumbnail' ? { width: 300, height: 200 }
                                : op === 'convert' ? { format: 'jpeg', quality: 85 }
                                  : op === 'resize' ? { keep_aspect: true, maintain_aspect: true }
                                    : {},
                          );
                        }
                        setEditError('');
                      }}
                      style={{
                        height: isMobile ? 40 : 32, minHeight: isMobile ? 40 : 32, padding: '0 10px', borderRadius: 8,
                        border: editOp === op ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)',
                        background: editOp === op ? 'var(--color-warning-bg)' : 'var(--color-bg)', cursor: 'pointer',
                        fontFamily: 'inherit', fontSize: 11, fontWeight: 600,
                        color: editOp === op ? 'var(--color-text)' : 'var(--color-text-secondary)',
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                      }}
                    >
                      {icon} {label}
                    </button>
                  ))}
                </div>

                {editOp && (
                  <div
                    data-testid="media-edit-panel"
                    style={{ background: 'var(--color-bg)', borderRadius: 10, padding: 12, border: '1px solid var(--color-border)' }}
                  >
                    <EditOpPanel
                      op={editOp}
                      params={editParams}
                      onChange={setEditParams}
                      asset={selected}
                      compact={isMobile}
                    />
                    {editError && <p style={{ color: 'var(--color-danger-strong)', fontSize: 12, margin: '8px 0 0' }}>{editError}</p>}
                    <div
                      style={{
                        marginTop: 10,
                        display: 'flex',
                        gap: 8,
                        position: isMobile ? 'sticky' : 'static',
                        bottom: isMobile ? 'max(8px, env(safe-area-inset-bottom, 0px))' : undefined,
                        paddingTop: 8,
                        paddingBottom: isMobile ? 4 : 0,
                        background: 'var(--color-bg)',
                        zIndex: 2,
                      }}
                    >
                      <Btn
                        onClick={() => setShowSaveModeModal(true)}
                        disabled={
                          editSaving
                          || (editOp === 'crop' && !isCropReady(editParams))
                          || (editOp === 'rotate' && !isRotateReady(editParams))
                        }
                        style={{ flex: 1, minHeight: 44 }}
                        data-testid="media-edit-apply"
                      >
                        {editSaving ? 'Applying…' : 'Apply'}
                      </Btn>
                      <Btn variant="ghost" onClick={() => { setEditOp(null); setEditParams({}); }} style={{ minHeight: 44 }}>
                        Cancel
                      </Btn>
                    </div>
                  </div>
                )}

                {editResult && (
                  <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '10px 12px', fontSize: 12, marginTop: 8 }}>
                    {editResult.mode === 'replace'
                      ? `Replaced in ${editResult.updated_references} reference${editResult.updated_references === 1 ? '' : 's'}`
                      : 'Saved as a new copy'}
                    {canRestore && (
                      <button
                        type="button"
                        onClick={() => void handleRestore()}
                        disabled={editSaving}
                        style={{ display: 'block', marginTop: 6, background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, padding: 0 }}
                      >
                        Restore previous version
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Save + Delete */}
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn onClick={() => void saveDetail()} disabled={detailSaving} style={{ flex: 1, minHeight: 44 }}>
                {detailSaving ? 'Saving…' : 'Save'}
              </Btn>
              {canManage && (
                <Btn variant="danger" onClick={() => { setDeleteTargets(selected ? [selected] : null); setDeleteError(''); setForceDelete(false); }} style={{ minHeight: 44, minWidth: 44 }}>
                  <Trash2 size={14} />
                </Btn>
              )}
            </div>
          </aside>
          </>
        )}
      </div>

      {/* Save mode modal */}
      {showSaveModeModal && (
        <Modal title="How to save the edit?" onClose={() => setShowSaveModeModal(false)} maxWidth={440}>
          <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
            Choose whether to update the existing asset (all references will show the new version) or create a new copy.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
            <button
              type="button"
              onClick={() => void applyEditOp('replace')}
              style={{ textAlign: 'left', padding: '12px 14px', borderRadius: 10, border: '2px solid var(--color-primary)', background: 'var(--color-warning-bg)', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-text)', marginBottom: 4 }}>Replace everywhere</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Update the file in place. All {selected?.usage_count ?? 0} references will show the new version. You can restore the previous version afterwards.</div>
            </button>
            <button
              type="button"
              onClick={() => void applyEditOp('copy')}
              style={{ textAlign: 'left', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--color-border)', background: 'var(--color-bg)', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-text)', marginBottom: 4 }}>Save as new copy</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Keep the original unchanged and create a new asset. Existing references are not updated.</div>
            </button>
          </div>
          <Btn variant="ghost" onClick={() => setShowSaveModeModal(false)}>Cancel</Btn>
        </Modal>
      )}

      {selected?.media_type === 'video' && videoStudioOpen ? (
        <VideoStudioModal
          open
          sourceUrl={selected.url}
          mediaId={selected.id}
          onClose={() => setVideoStudioOpen(false)}
          onExported={() => {
            setVideoStudioOpen(false);
            void loadAssets();
            toast.success('Exported muted MP4 into the media library');
          }}
        />
      ) : null}

      {/* Delete confirm modal (single or bulk) */}
      {deleteTargets && deleteTargets.length > 0 && (
        <Modal
          title={deleteTargets.length === 1 ? 'Delete asset?' : `Delete ${deleteTargets.length} assets?`}
          onClose={() => setDeleteTargets(null)}
          maxWidth={400}
        >
          <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 12 }}>
            {deleteTargets.length === 1 ? (
              <>
                Delete <strong>{deleteTargets[0].title || deleteTargets[0].url.split('/').pop()}</strong>?
                {deleteTargets[0].usage_count > 0 && (
                  <span style={{ color: 'var(--color-danger-strong)' }}> This asset is used in {deleteTargets[0].usage_count} place{deleteTargets[0].usage_count === 1 ? '' : 's'}.</span>
                )}
              </>
            ) : (
              <>
                Permanently delete <strong>{deleteTargets.length}</strong> selected files from the library and disk.
                {deleteTargets.some((a) => a.usage_count > 0) && (
                  <span style={{ color: 'var(--color-danger-strong)' }}>
                    {' '}{deleteTargets.filter((a) => a.usage_count > 0).length} of them are still in use.
                  </span>
                )}
              </>
            )}
          </p>
          {deleteTargets.some((a) => a.usage_count > 0) && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', marginBottom: 12 }}>
              <input type="checkbox" checked={forceDelete} onChange={(e) => setForceDelete(e.target.checked)} />
              Force delete (removes despite active references)
            </label>
          )}
          {deleteError && <p style={{ color: 'var(--color-danger-strong)', fontSize: 13, marginBottom: 10 }}>{deleteError}</p>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Btn variant="ghost" onClick={() => setDeleteTargets(null)}>Cancel</Btn>
            <Btn
              variant="danger"
              onClick={() => void confirmDelete()}
              disabled={deleting || (deleteTargets.some((a) => a.usage_count > 0) && !forceDelete)}
            >
              {deleting ? 'Deleting…' : deleteTargets.length === 1 ? 'Delete' : `Delete ${deleteTargets.length}`}
            </Btn>
          </div>
        </Modal>
      )}
    </PageShell>
  );
}
