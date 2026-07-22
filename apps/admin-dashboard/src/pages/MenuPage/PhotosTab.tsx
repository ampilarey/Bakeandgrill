import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Crop, Star, Trash2, Upload } from 'lucide-react';
import { getItemPhotos, uploadItemPhoto, updateItemPhoto, deleteItemPhoto, reorderItemPhotos, uploadItemVideo, type ItemPhoto } from '../../api';
import { ImageCropModal } from './ImageCropModal';
import { prepareImageForCrop, prepareUploadFromFile, resolveMediaUrl, revokeCropSrc } from './mediaUrl';
import { MENU_VIDEO_LIMITS, prepareVideoClip } from './videoClip';

export function PhotosTab({ itemId }: { itemId: number }) {
  const [photos, setPhotos] = useState<ItemPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropName, setCropName] = useState('item-photo.jpg');
  const [replacingPhoto, setReplacingPhoto] = useState<ItemPhoto | null>(null);
  const [pendingMaster, setPendingMaster] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getItemPhotos(itemId);
      setPhotos(Array.isArray(res.photos) ? res.photos : []);
    } catch (e) {
      setError((e as Error).message);
      setPhotos([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [itemId]);

  const closeCropper = () => {
    setCropSrc((prev) => {
      revokeCropSrc(prev);
      return null;
    });
    setReplacingPhoto(null);
    setPendingMaster(null);
  };

  const openCropperFromFile = async (file: File) => {
    setError('');
    setUploading(true);
    try {
      const { cropSrc: src, masterFile } = await prepareUploadFromFile(file);
      setCropName(file.name || 'item-photo.jpg');
      setReplacingPhoto(null);
      setPendingMaster(masterFile);
      setCropSrc((prev) => {
        revokeCropSrc(prev);
        return src;
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const openCropperFromExisting = async (photo: ItemPhoto) => {
    setUploading(true);
    setError('');
    try {
      const master = (photo.original_url || photo.url).trim();
      const src = await prepareImageForCrop(master);
      setCropName(`item-photo-${photo.id}.jpg`);
      setReplacingPhoto(photo);
      setPendingMaster(null);
      setCropSrc((prev) => {
        revokeCropSrc(prev);
        return src;
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const handleUpload = async (file: File) => {
    setUploading(true); setError('');
    try {
      const reusedMaster = !pendingMaster ? (replacingPhoto?.original_url || null) : null;
      const { photo } = await uploadItemPhoto(itemId, file, {
        original: pendingMaster ?? undefined,
        original_url: reusedMaster || undefined,
      });
      if (!photo) throw new Error('Upload succeeded but no photo was returned.');

      if (replacingPhoto) {
        await updateItemPhoto(itemId, photo.id, {
          sort_order: replacingPhoto.sort_order,
          ...(replacingPhoto.is_primary ? { is_primary: true } : {}),
        });
        // If the new row reuses the old master path, detach it from the old
        // row first so destroy does not delete the shared master file.
        if (reusedMaster && photo.original_url === reusedMaster) {
          await updateItemPhoto(itemId, replacingPhoto.id, { original_url: null });
        }
        await deleteItemPhoto(itemId, replacingPhoto.id);
      }

      await load();
      closeCropper();
    } catch (e) { setError((e as Error).message); }
    finally { setUploading(false); }
  };

  const handleVideoPick = async (file: File) => {
    setUploading(true);
    setError('');
    try {
      const { video, poster } = await prepareVideoClip(file);
      const { photo } = await uploadItemVideo(itemId, video, poster);
      if (!photo) throw new Error('Upload succeeded but no video was returned.');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const setPrimary = async (photoId: number) => {
    try {
      await updateItemPhoto(itemId, photoId, { is_primary: true });
      setPhotos((p) => p.map((ph) => ({ ...ph, is_primary: ph.id === photoId })));
    } catch (e) { setError((e as Error).message); }
  };

  const remove = async (photoId: number) => {
    try {
      await deleteItemPhoto(itemId, photoId);
      setPhotos((p) => p.filter((ph) => ph.id !== photoId));
    } catch (e) { setError((e as Error).message); }
  };

  const movePhoto = async (photoId: number, direction: -1 | 1) => {
    const sorted = [...photos].sort((a, b) => a.sort_order - b.sort_order);
    const idx = sorted.findIndex((p) => p.id === photoId);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= sorted.length) return;
    const next = [...sorted];
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    const order = next.map((p) => p.id);
    try {
      const res = await reorderItemPhotos(itemId, order);
      setPhotos(Array.isArray(res.photos) ? res.photos : next.map((p, i) => ({ ...p, sort_order: i + 1 })));
    } catch (e) { setError((e as Error).message); }
  };

  const setAltText = async (photoId: number, altText: string) => {
    try {
      const { photo } = await updateItemPhoto(itemId, photoId, { alt_text: altText });
      setPhotos((list) => list.map((ph) => (ph.id === photoId ? { ...ph, alt_text: photo.alt_text ?? altText } : ph)));
    } catch (e) { setError((e as Error).message); }
  };

  if (loading) return <div style={{ padding: 24, textAlign: 'center', color: '#9C8E7E', fontSize: 14 }}>Loading photos…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {error && <div style={{ background: '#fee2e2', color: '#991b1b', padding: '8px 12px', borderRadius: 8, fontSize: 13 }}>{error}</div>}

      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          padding: '10px 16px', background: '#F0EBE5', border: '2px dashed #cbd5e1',
          borderRadius: 10, cursor: uploading ? 'not-allowed' : 'pointer',
          fontSize: 13, fontWeight: 600, color: '#6B5D4F',
        }}
      >
        <Upload size={15} />
        {uploading && !cropSrc ? 'Preparing…' : 'Upload & crop photo'}
      </button>
      <button
        type="button"
        onClick={() => videoRef.current?.click()}
        disabled={uploading}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          padding: '10px 16px', background: '#EEF6FF', border: '2px dashed #bfdbfe',
          borderRadius: 10, cursor: uploading ? 'not-allowed' : 'pointer',
          fontSize: 13, fontWeight: 600, color: '#1e40af',
        }}
      >
        <Upload size={15} />
        Add video clip (≤{MENU_VIDEO_LIMITS.maxSeconds}s)
      </button>
      <p style={{ margin: 0, fontSize: 12, color: '#9C8E7E' }}>
        Photos: 1200×900 crop. Videos play muted in the item sheet only (cards show the poster). Max {(MENU_VIDEO_LIMITS.maxBytes / (1024 * 1024)).toFixed(0)} MB.
      </p>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void openCropperFromFile(f);
          e.target.value = '';
        }}
      />
      <input
        ref={videoRef}
        type="file"
        accept={MENU_VIDEO_LIMITS.accept}
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleVideoPick(f);
          e.target.value = '';
        }}
      />
      {cropSrc && (
        <ImageCropModal
          imageSrc={cropSrc}
          fileName={cropName}
          title={replacingPhoto ? 'Re-crop gallery photo' : 'Crop gallery photo'}
          onCancel={closeCropper}
          onConfirm={handleUpload}
        />
      )}

      {photos.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#9C8E7E', padding: '20px 0', fontSize: 13 }}>
          No photos yet. Upload one above.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 12 }}>
          {[...photos].sort((a, b) => a.sort_order - b.sort_order).map((ph, index, sorted) => (
            <div key={ph.id} style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', border: ph.is_primary ? '2px solid #D4813A' : '2px solid #E8E0D8' }}>
              <img
                src={resolveMediaUrl(ph.media_type === 'video' ? (ph.poster_url || ph.thumb_url || ph.url) : ph.url)}
                alt={ph.alt_text || ''}
                style={{ width: '100%', height: 100, objectFit: 'cover', display: 'block', background: '#F8F6F3' }}
              />
              {ph.media_type === 'video' && (
                <div style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(28,20,8,0.75)', color: '#fff', borderRadius: 6, padding: '2px 6px', fontSize: 10, fontWeight: 700 }}>
                  ▶ Video
                </div>
              )}
              {ph.is_primary && (
                <div style={{ position: 'absolute', top: 4, left: 4, background: '#D4813A', color: '#fff', borderRadius: 6, padding: '2px 6px', fontSize: 10, fontWeight: 700 }}>
                  Primary
                </div>
              )}
              <div style={{ padding: '6px 6px 0' }}>
                <input
                  type="text"
                  defaultValue={ph.alt_text ?? ''}
                  placeholder="Alt text (a11y)"
                  aria-label={`Alt text for photo ${ph.id}`}
                  onBlur={(e) => {
                    const next = e.target.value.trim();
                    if (next !== (ph.alt_text ?? '').trim()) {
                      void setAltText(ph.id, next);
                    }
                  }}
                  style={{
                    width: '100%', boxSizing: 'border-box', minHeight: 32,
                    border: '1px solid #E8E0D8', borderRadius: 6, padding: '4px 6px',
                    fontSize: 11, fontFamily: 'inherit', color: '#1C1408', background: '#fff',
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: 4, padding: '6px', flexWrap: 'wrap' }}>
                {ph.media_type !== 'video' && (
                  <button
                    type="button"
                    title="Edit / re-crop"
                    disabled={uploading}
                    onClick={() => void openCropperFromExisting(ph)}
                    style={{ flex: '1 1 100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '6px', background: '#FEF3E8', border: '1px solid #F0D9C0', borderRadius: 6, cursor: uploading ? 'not-allowed' : 'pointer', fontSize: 11, fontWeight: 700, color: '#B86820' }}
                  >
                    <Crop size={12} /> Edit crop
                  </button>
                )}
                <button
                  type="button"
                  title="Move earlier"
                  disabled={index === 0}
                  onClick={() => void movePhoto(ph.id, -1)}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px', background: '#F8F6F3', border: '1px solid #E8E0D8', borderRadius: 6, cursor: index === 0 ? 'not-allowed' : 'pointer', opacity: index === 0 ? 0.4 : 1 }}
                >
                  <ChevronLeft size={13} />
                </button>
                <button
                  type="button"
                  title="Move later"
                  disabled={index === sorted.length - 1}
                  onClick={() => void movePhoto(ph.id, 1)}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px', background: '#F8F6F3', border: '1px solid #E8E0D8', borderRadius: 6, cursor: index === sorted.length - 1 ? 'not-allowed' : 'pointer', opacity: index === sorted.length - 1 ? 0.4 : 1 }}
                >
                  <ChevronRight size={13} />
                </button>
                {!ph.is_primary && (
                  <button
                    type="button"
                    title="Set as primary"
                    onClick={() => void setPrimary(ph.id)}
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 6, cursor: 'pointer' }}
                  >
                    <Star size={13} color="#d97706" />
                  </button>
                )}
                <button
                  type="button"
                  title="Delete"
                  onClick={() => void remove(ph.id)}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 6, cursor: 'pointer' }}
                >
                  <Trash2 size={13} color="#dc2626" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
