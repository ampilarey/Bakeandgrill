import { useCallback, useEffect, useRef, useState, type CSSProperties, type DragEvent } from 'react';
import {
  Check, ChevronLeft, ChevronRight, Copy, Crop, FileText, Film, Folder,
  Image, Images, Music, Pencil, Plus, RefreshCw, RotateCw,
  Search, Sliders, Trash2, Upload, X,
} from 'lucide-react';
import {
  assignMediaCollections, createMediaCollection, deleteMedia, deleteMediaCollection,
  editMedia, getMedia, getMediaCollections, getMediaUsage, reconcileMedia,
  restoreMedia, updateMedia, updateMediaCollection, uploadMedia,
  type MediaAsset, type MediaCollection, type MediaEditOp,
  type MediaEditResult, type MediaPaginationMeta, type MediaType, type MediaUsageItem,
} from '../api';
import { usePageTitle } from '../hooks/usePageTitle';
import { useCurrentUserPermissions } from '../hooks/usePermissions';
import { Btn, EmptyState, Modal, PageHeader, PageShell, Spinner } from '../components/SharedUI';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function mediaTypeIcon(type: MediaType) {
  switch (type) {
    case 'image': return <Image size={32} style={{ color: '#9C8E7E' }} />;
    case 'video': return <Film size={32} style={{ color: '#9C8E7E' }} />;
    case 'audio': return <Music size={32} style={{ color: '#9C8E7E' }} />;
    default:      return <FileText size={32} style={{ color: '#9C8E7E' }} />;
  }
}

const tabStyle = (active: boolean): CSSProperties => ({
  height: 36, padding: '0 14px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
  fontWeight: active ? 700 : 500, fontSize: 13,
  border: active ? '1.5px solid #D4813A' : '1px solid #E8E0D8',
  background: active ? '#FFF7ED' : '#fff', color: '#1C1408', whiteSpace: 'nowrap',
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
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '6px 8px', border: '1px solid #E8E0D8', borderRadius: 8, minHeight: 44, alignItems: 'center' }}>
      {value.map((t) => (
        <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 9999, background: '#F5E6D3', color: '#3D2B1F', fontSize: 12, fontWeight: 600 }}>
          {t}
          <button type="button" onClick={() => onChange(value.filter((x) => x !== t))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#6B5D4F', lineHeight: 1 }}>×</button>
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
  asset, selected, onClick,
}: { asset: MediaAsset; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`asset-card-${asset.id}`}
      style={{
        border: selected ? '2px solid #D4813A' : '1px solid #E8E0D8',
        borderRadius: 10, padding: 0, background: selected ? '#FFF7ED' : '#F8F6F3',
        cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', overflow: 'hidden',
        position: 'relative',
        boxShadow: selected ? '0 0 0 2px rgba(212,129,58,0.2)' : 'none',
      }}
    >
      <div style={{ width: '100%', aspectRatio: '4 / 3', overflow: 'hidden', background: '#EDE8E2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {asset.media_type === 'image' && asset.thumb_url ? (
          <img src={asset.thumb_url} alt={asset.alt_text || asset.title || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          mediaTypeIcon(asset.media_type)
        )}
      </div>
      <div style={{ padding: '6px 8px' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#3D2B1F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {asset.title || asset.url.split('/').pop() || `#${asset.id}`}
        </div>
        <div style={{ fontSize: 10, color: '#9C8E7E', marginTop: 2 }}>{fmtBytes(asset.file_size)}</div>
      </div>
      {selected && (
        <div style={{ position: 'absolute', top: 6, right: 6, width: 20, height: 20, borderRadius: '50%', background: '#D4813A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Check size={12} style={{ color: '#fff' }} />
        </div>
      )}
    </button>
  );
}

// ─── Edit operation panels ────────────────────────────────────────────────────

type EditParams = Record<string, unknown>;

function EditOpPanel({ op, params, onChange }: { op: MediaEditOp; params: EditParams; onChange: (p: EditParams) => void }) {
  const set = (k: string, v: unknown) => onChange({ ...params, [k]: v });
  const labelStyle: CSSProperties = { fontSize: 12, fontWeight: 600, color: '#6B5D4F', display: 'block', marginBottom: 4 };
  const inputStyle: CSSProperties = { width: '100%', height: 38, border: '1px solid #E8E0D8', borderRadius: 8, padding: '0 10px', fontFamily: 'inherit', fontSize: 13 };

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
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <label style={labelStyle}>Width (px)
              <input type="number" min={1} value={(params.width as number) ?? ''} onChange={(e) => set('width', e.target.value ? Number(e.target.value) : undefined)} placeholder="auto" style={{ ...inputStyle, marginTop: 4 }} />
            </label>
            <label style={labelStyle}>Height (px)
              <input type="number" min={1} value={(params.height as number) ?? ''} onChange={(e) => set('height', e.target.value ? Number(e.target.value) : undefined)} placeholder="auto" style={{ ...inputStyle, marginTop: 4 }} />
            </label>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={(params.maintain_aspect as boolean) ?? true} onChange={(e) => set('maintain_aspect', e.target.checked)} />
            Maintain aspect ratio
          </label>
        </div>
      );
    case 'crop':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <label style={labelStyle}>X offset
              <input type="number" min={0} value={(params.x as number) ?? 0} onChange={(e) => set('x', Number(e.target.value))} style={{ ...inputStyle, marginTop: 4 }} />
            </label>
            <label style={labelStyle}>Y offset
              <input type="number" min={0} value={(params.y as number) ?? 0} onChange={(e) => set('y', Number(e.target.value))} style={{ ...inputStyle, marginTop: 4 }} />
            </label>
            <label style={labelStyle}>Width
              <input type="number" min={1} value={(params.width as number) ?? ''} onChange={(e) => set('width', e.target.value ? Number(e.target.value) : undefined)} placeholder="required" style={{ ...inputStyle, marginTop: 4 }} />
            </label>
            <label style={labelStyle}>Height
              <input type="number" min={1} value={(params.height as number) ?? ''} onChange={(e) => set('height', e.target.value ? Number(e.target.value) : undefined)} placeholder="required" style={{ ...inputStyle, marginTop: 4 }} />
            </label>
          </div>
        </div>
      );
    case 'rotate':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={labelStyle}>Degrees
            <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
              {[90, 180, 270].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => set('degrees', d)}
                  style={{ height: 36, padding: '0 14px', borderRadius: 8, border: (params.degrees as number) === d ? '2px solid #D4813A' : '1px solid #E8E0D8', background: (params.degrees as number) === d ? '#FFF7ED' : '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }}
                >
                  {d}°
                </button>
              ))}
              <input type="number" min={1} max={359} value={![90, 180, 270].includes(params.degrees as number) ? (params.degrees as number) ?? '' : ''} onChange={(e) => set('degrees', e.target.value ? Number(e.target.value) : 90)} placeholder="Custom" style={{ flex: 1, minWidth: 60, height: 36, border: '1px solid #E8E0D8', borderRadius: 8, padding: '0 10px', fontFamily: 'inherit', fontSize: 13 }} />
            </div>
          </label>
        </div>
      );
    case 'thumbnail':
      return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <label style={labelStyle}>Width (px)
            <input type="number" min={1} value={(params.width as number) ?? 300} onChange={(e) => set('width', Number(e.target.value))} style={{ ...inputStyle, marginTop: 4 }} />
          </label>
          <label style={labelStyle}>Height (px)
            <input type="number" min={1} value={(params.height as number) ?? 200} onChange={(e) => set('height', Number(e.target.value))} style={{ ...inputStyle, marginTop: 4 }} />
          </label>
        </div>
      );
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
  const { can } = useCurrentUserPermissions();
  const canManage = can('media.manage');

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

  // Usage
  const [usageItems, setUsageItems] = useState<MediaUsageItem[]>([]);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);

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
  const [uploadError, setUploadError] = useState('');
  const [uploadCollectionId, setUploadCollectionId] = useState<number | ''>('');
  const [uploadResults, setUploadResults] = useState<Array<{ name: string; deduped: boolean }>>([]);

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<MediaAsset | null>(null);
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

  // ─── Edit tools ───────────────────────────────────────────────────────────

  const applyEditOp = async (mode: 'replace' | 'copy') => {
    if (!selected || !editOp) return;
    setEditSaving(true);
    setEditError('');
    setShowSaveModeModal(false);
    try {
      const result = await editMedia(selected.id, editOp, editParams, mode);
      setEditResult(result);
      setCanRestore(mode === 'replace');
      setSelected(result.asset);
      setAssets((prev) => prev.map((a) => (a.id === result.asset.id ? result.asset : a)));
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
    setUploadError('');
    setUploadResults([]);
    try {
      const res = await uploadMedia(fileArray, {
        collection_ids: uploadCollectionId ? [uploadCollectionId] : [],
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

  // ─── Delete ───────────────────────────────────────────────────────────────

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await deleteMedia(deleteTarget.id, forceDelete);
      setAssets((prev) => prev.filter((a) => a.id !== deleteTarget.id));
      if (selected?.id === deleteTarget.id) closeDetail();
      setDeleteTarget(null);
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
      alert(`Reconciled ${res.reconciled} asset${res.reconciled === 1 ? '' : 's'}`);
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
              style={tabStyle(activeType === value)}
              onClick={() => setActiveType(value)}
              aria-pressed={activeType === value}
            >
              {icon} {label}
            </button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', position: 'relative', minWidth: 220 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 12, color: '#9C8E7E' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search media…"
            style={{ width: '100%', height: 38, paddingLeft: 30, borderRadius: 10, border: '1px solid #E8E0D8', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }}
          />
        </div>
      </div>

      {/* Main layout: sidebar + content + drawer */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>

        {/* Collections sidebar */}
        <aside
          data-testid="collections-sidebar"
          style={{ width: 200, flexShrink: 0, background: '#fff', border: '1px solid #E8E0D8', borderRadius: 14, padding: 12, position: 'sticky', top: 12 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13, color: '#1C1408', marginBottom: 10 }}>
            <Folder size={15} /> Collections
          </div>

          <button
            type="button"
            onClick={() => setActiveCollection('')}
            style={{
              display: 'block', width: '100%', textAlign: 'left', padding: '7px 9px',
              border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 13, fontWeight: activeCollection === '' ? 700 : 400,
              background: activeCollection === '' ? '#F5E6D3' : 'transparent',
              color: activeCollection === '' ? '#1C1408' : '#6B5D4F', marginBottom: 2,
            }}
          >
            All media
          </button>

          {collections.map((col) => (
            <div key={col.id} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
              {renamingId === col.id ? (
                <form
                  onSubmit={(e) => { e.preventDefault(); void renameCollection(col.id); }}
                  style={{ flex: 1, display: 'flex', gap: 4 }}
                >
                  <input
                    autoFocus
                    value={renamingName}
                    onChange={(e) => setRenamingName(e.target.value)}
                    style={{ flex: 1, minWidth: 0, height: 32, border: '1px solid #D4813A', borderRadius: 6, padding: '0 6px', fontSize: 12, fontFamily: 'inherit' }}
                  />
                  <button type="submit" disabled={colSaving} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#D4813A', padding: '0 2px' }}><Check size={14} /></button>
                  <button type="button" onClick={() => setRenamingId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9C8E7E', padding: '0 2px' }}><X size={14} /></button>
                </form>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setActiveCollection(col.slug)}
                    style={{
                      flex: 1, textAlign: 'left', padding: '7px 9px', border: 'none', borderRadius: 8,
                      cursor: 'pointer', fontFamily: 'inherit', fontSize: 13,
                      fontWeight: activeCollection === col.slug ? 700 : 400,
                      background: activeCollection === col.slug ? '#F5E6D3' : 'transparent',
                      color: activeCollection === col.slug ? '#1C1408' : '#6B5D4F',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}
                    data-testid={`collection-btn-${col.slug}`}
                  >
                    {col.name}
                  </button>
                  {canManage && (
                    <>
                      <button type="button" onClick={() => { setRenamingId(col.id); setRenamingName(col.name); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9C8E7E', padding: 2, flexShrink: 0 }} aria-label={`Rename ${col.name}`}><Pencil size={12} /></button>
                      <button type="button" onClick={() => void removeCollection(col.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 2, flexShrink: 0 }} aria-label={`Delete ${col.name}`}><Trash2 size={12} /></button>
                    </>
                  )}
                </>
              )}
            </div>
          ))}

          {canManage && (
            <form onSubmit={(e) => { e.preventDefault(); void addCollection(); }} style={{ marginTop: 10, display: 'flex', gap: 6 }}>
              <input
                value={newCollectionName}
                onChange={(e) => setNewCollectionName(e.target.value)}
                placeholder="New collection…"
                style={{ flex: 1, minWidth: 0, height: 32, border: '1px solid #E8E0D8', borderRadius: 6, padding: '0 8px', fontSize: 12, fontFamily: 'inherit' }}
              />
              <button type="submit" disabled={!newCollectionName.trim() || colSaving} style={{ height: 32, width: 32, border: '1px solid #D4813A', borderRadius: 6, background: '#D4813A', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
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
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${dragOver ? '#D4813A' : '#C4B5A5'}`,
                borderRadius: 12, padding: '20px 16px', textAlign: 'center', cursor: 'pointer',
                background: dragOver ? '#FFF7ED' : '#F8F6F3', marginBottom: 16,
                transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              <Upload size={22} style={{ color: '#9C8E7E', marginBottom: 6 }} />
              <div style={{ fontSize: 14, fontWeight: 600, color: '#3D2B1F' }}>
                {uploading ? 'Uploading…' : 'Drop files here or click to browse'}
              </div>
              <div style={{ fontSize: 12, color: '#9C8E7E', marginTop: 4 }}>Images, video, audio, documents — multi-select supported</div>
              {collections.length > 0 && (
                <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 8 }} onClick={(e) => e.stopPropagation()}>
                  <label style={{ fontSize: 12, color: '#6B5D4F', fontWeight: 600 }}>Collection:</label>
                  <select
                    value={uploadCollectionId}
                    onChange={(e) => setUploadCollectionId(e.target.value ? Number(e.target.value) : '')}
                    style={{ height: 30, borderRadius: 6, border: '1px solid #E8E0D8', padding: '0 8px', fontSize: 12, fontFamily: 'inherit' }}
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
            style={{ display: 'none' }}
            onChange={(e) => { if (e.target.files) void doUpload(e.target.files); e.target.value = ''; }}
          />

          {uploadError && (
            <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 10, padding: '10px 14px', color: '#b91c1c', fontSize: 13, marginBottom: 12 }}>
              {uploadError}
            </div>
          )}

          {uploadResults.length > 0 && (
            <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13 }}>
              <strong>{uploadResults.length} file{uploadResults.length === 1 ? '' : 's'} uploaded</strong>
              {uploadResults.some((r) => r.deduped) && (
                <span style={{ marginLeft: 8, color: '#6B5D4F' }}>
                  · {uploadResults.filter((r) => r.deduped).length} duplicate{uploadResults.filter((r) => r.deduped).length === 1 ? '' : 's'} detected (existing asset returned)
                </span>
              )}
            </div>
          )}

          {/* Grid */}
          {loading && <Spinner />}
          {!loading && error && (
            <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 10, padding: '10px 14px', color: '#b91c1c', fontSize: 13 }}>{error}</div>
          )}
          {!loading && !error && assets.length === 0 && (
            <EmptyState message="No assets found. Upload some files to get started." />
          )}
          {!loading && assets.length > 0 && (
            <div
              data-testid="media-grid"
              style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}
            >
              {assets.map((asset) => (
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  selected={selected?.id === asset.id}
                  onClick={() => openDetail(asset)}
                />
              ))}
            </div>
          )}

          {/* Pagination */}
          {meta.last_page > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, marginTop: 20 }}>
              <Btn variant="secondary" small disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft size={14} /> Prev
              </Btn>
              <span style={{ fontSize: 13, color: '#6B5D4F' }}>
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
          <aside
            data-testid="detail-drawer"
            style={{ width: 300, flexShrink: 0, background: '#fff', border: '1px solid #E8E0D8', borderRadius: 14, padding: 16, position: 'sticky', top: 12 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: '#1C1408' }}>Asset details</span>
              <button type="button" onClick={closeDetail} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9C8E7E', padding: 4 }} aria-label="Close drawer">
                <X size={18} />
              </button>
            </div>

            {/* Preview */}
            <div style={{ width: '100%', aspectRatio: '4/3', borderRadius: 10, overflow: 'hidden', background: '#F0EBE2', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              {selected.media_type === 'image' && selected.thumb_url ? (
                <img src={selected.thumb_url} alt={selected.alt_text || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                mediaTypeIcon(selected.media_type)
              )}
            </div>

            {/* Meta */}
            <div style={{ fontSize: 11, color: '#9C8E7E', marginBottom: 12, lineHeight: 1.6 }}>
              <div>{selected.mime_type} · {fmtBytes(selected.file_size)}</div>
              {selected.width && selected.height && <div>{selected.width} × {selected.height} px</div>}
              <div>Source: {selected.source}</div>
              <div>Used in {selected.usage_count} place{selected.usage_count === 1 ? '' : 's'}</div>
            </div>

            {/* Copy URL */}
            <button
              type="button"
              onClick={() => void copyUrl()}
              style={{ width: '100%', height: 36, borderRadius: 8, border: '1px solid #E8E0D8', background: copiedUrl ? '#f0fdf4' : '#F8F6F3', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: copiedUrl ? '#15803d' : '#6B5D4F', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 14 }}
            >
              {copiedUrl ? <Check size={14} /> : <Copy size={14} />}
              {copiedUrl ? 'Copied!' : 'Copy URL'}
            </button>

            {detailError && (
              <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px 12px', color: '#b91c1c', fontSize: 12, marginBottom: 10 }}>{detailError}</div>
            )}

            {/* Edit form */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#6B5D4F' }}>Title
                <input
                  value={detailTitle}
                  onChange={(e) => setDetailTitle(e.target.value)}
                  placeholder="Descriptive title"
                  style={{ display: 'block', width: '100%', marginTop: 4, height: 38, border: '1px solid #E8E0D8', borderRadius: 8, padding: '0 10px', fontFamily: 'inherit', fontSize: 13, boxSizing: 'border-box' }}
                />
              </label>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#6B5D4F' }}>Alt text
                <input
                  value={detailAlt}
                  onChange={(e) => setDetailAlt(e.target.value)}
                  placeholder="Describe for screen readers"
                  style={{ display: 'block', width: '100%', marginTop: 4, height: 38, border: '1px solid #E8E0D8', borderRadius: 8, padding: '0 10px', fontFamily: 'inherit', fontSize: 13, boxSizing: 'border-box' }}
                />
              </label>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#6B5D4F', display: 'block', marginBottom: 4 }}>Tags</label>
                <TagInput value={detailTags} onChange={setDetailTags} />
              </div>
            </div>

            {/* Collections */}
            {collections.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#6B5D4F', marginBottom: 6 }}>Collections</div>
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
                          background: active ? '#F5E6D3' : '#F8F6F3',
                          color: active ? '#3D2B1F' : '#6B5D4F',
                          border: active ? '1.5px solid #D4813A' : '1px solid #E8E0D8',
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
                style={{ width: '100%', height: 34, borderRadius: 8, border: '1px solid #E8E0D8', background: '#F8F6F3', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: '#6B5D4F' }}
              >
                {usageLoading ? 'Loading usage…' : usageOpen ? 'Hide usage' : 'Show usage'}
              </button>
              {usageOpen && (
                <div style={{ marginTop: 8, fontSize: 12, color: '#6B5D4F' }}>
                  {usageItems.length === 0 ? (
                    <p style={{ margin: 0, color: '#9C8E7E' }}>Not referenced anywhere.</p>
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

            {/* Edit tools (images only) */}
            {selected.media_type === 'image' && canManage && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#6B5D4F', marginBottom: 8 }}>Edit tools</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                  {EDIT_OPS.map(({ op, label, icon }) => (
                    <button
                      key={op}
                      type="button"
                      onClick={() => { setEditOp(editOp === op ? null : op); setEditParams({}); setEditError(''); }}
                      style={{
                        height: 32, padding: '0 10px', borderRadius: 8, border: editOp === op ? '1.5px solid #D4813A' : '1px solid #E8E0D8',
                        background: editOp === op ? '#FFF7ED' : '#F8F6F3', cursor: 'pointer',
                        fontFamily: 'inherit', fontSize: 11, fontWeight: 600, color: editOp === op ? '#3D2B1F' : '#6B5D4F',
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                      }}
                    >
                      {icon} {label}
                    </button>
                  ))}
                </div>

                {editOp && (
                  <div style={{ background: '#F8F6F3', borderRadius: 10, padding: 12, border: '1px solid #E8E0D8' }}>
                    <EditOpPanel op={editOp} params={editParams} onChange={setEditParams} />
                    {editError && <p style={{ color: '#b91c1c', fontSize: 12, margin: '8px 0 0' }}>{editError}</p>}
                    <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                      <Btn
                        onClick={() => setShowSaveModeModal(true)}
                        disabled={editSaving}
                        style={{ flex: 1 }}
                      >
                        {editSaving ? 'Applying…' : 'Apply'}
                      </Btn>
                      <Btn variant="ghost" onClick={() => { setEditOp(null); setEditParams({}); }}>Cancel</Btn>
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
                        style={{ display: 'block', marginTop: 6, background: 'none', border: 'none', color: '#D4813A', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, padding: 0 }}
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
              <Btn onClick={() => void saveDetail()} disabled={detailSaving} style={{ flex: 1 }}>
                {detailSaving ? 'Saving…' : 'Save'}
              </Btn>
              {canManage && (
                <Btn variant="danger" onClick={() => { setDeleteTarget(selected); setDeleteError(''); setForceDelete(false); }}>
                  <Trash2 size={14} />
                </Btn>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* Save mode modal */}
      {showSaveModeModal && (
        <Modal title="How to save the edit?" onClose={() => setShowSaveModeModal(false)} maxWidth={440}>
          <p style={{ fontSize: 14, color: '#6B5D4F', marginBottom: 16, lineHeight: 1.5 }}>
            Choose whether to update the existing asset (all references will show the new version) or create a new copy.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
            <button
              type="button"
              onClick={() => void applyEditOp('replace')}
              style={{ textAlign: 'left', padding: '12px 14px', borderRadius: 10, border: '2px solid #D4813A', background: '#FFF7ED', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <div style={{ fontWeight: 700, fontSize: 14, color: '#1C1408', marginBottom: 4 }}>Replace everywhere</div>
              <div style={{ fontSize: 12, color: '#6B5D4F' }}>Update the file in place. All {selected?.usage_count ?? 0} references will show the new version. You can restore the previous version afterwards.</div>
            </button>
            <button
              type="button"
              onClick={() => void applyEditOp('copy')}
              style={{ textAlign: 'left', padding: '12px 14px', borderRadius: 10, border: '1px solid #E8E0D8', background: '#F8F6F3', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <div style={{ fontWeight: 700, fontSize: 14, color: '#1C1408', marginBottom: 4 }}>Save as new copy</div>
              <div style={{ fontSize: 12, color: '#6B5D4F' }}>Keep the original unchanged and create a new asset. Existing references are not updated.</div>
            </button>
          </div>
          <Btn variant="ghost" onClick={() => setShowSaveModeModal(false)}>Cancel</Btn>
        </Modal>
      )}

      {/* Delete confirm modal */}
      {deleteTarget && (
        <Modal title="Delete asset?" onClose={() => setDeleteTarget(null)} maxWidth={400}>
          <p style={{ fontSize: 14, color: '#6B5D4F', marginBottom: 12 }}>
            Delete <strong>{deleteTarget.title || deleteTarget.url.split('/').pop()}</strong>?
            {deleteTarget.usage_count > 0 && (
              <span style={{ color: '#b91c1c' }}> This asset is used in {deleteTarget.usage_count} place{deleteTarget.usage_count === 1 ? '' : 's'}.</span>
            )}
          </p>
          {deleteTarget.usage_count > 0 && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', marginBottom: 12 }}>
              <input type="checkbox" checked={forceDelete} onChange={(e) => setForceDelete(e.target.checked)} />
              Force delete (removes despite active references)
            </label>
          )}
          {deleteError && <p style={{ color: '#b91c1c', fontSize: 13, marginBottom: 10 }}>{deleteError}</p>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Btn variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Btn>
            <Btn
              variant="danger"
              onClick={() => void confirmDelete()}
              disabled={deleting || (deleteTarget.usage_count > 0 && !forceDelete)}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </Btn>
          </div>
        </Modal>
      )}
    </PageShell>
  );
}
