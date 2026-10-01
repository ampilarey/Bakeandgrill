import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Crop, Images, Star, Trash2, Upload } from 'lucide-react';
import { getItemPhotos, uploadItemPhoto, updateItemPhoto, deleteItemPhoto, reorderItemPhotos, uploadItemVideo, type ItemPhoto } from '../../api';
import { addItemPhotoFromLibrary } from '../../api/menu';
import { MediaPicker } from '../../components/MediaPicker';
import type { MediaAsset } from '../../api/media';
import { ImageCropModal } from './ImageCropModal';
import { CutoutSlot } from './CutoutSlot';
import { ImageUploadField, type ImageUrls } from './menuFormPrimitives';
import { prepareImageForCrop, prepareUploadFromFile, resolveMediaUrl, revokeCropSrc } from './mediaUrl';
import { MENU_VIDEO_LIMITS, prepareVideoClip } from './videoClip';

/**
 * Every picture of an item on one tab, each section saying where it shows
 * (owner, 2026-10-01: "make it clear which pic is for pos and which is for
 * menu and where more pic and video is shown and how is shown").
 *
 *   1. Main photo        the item's one plain photo: POS, signage, offers,
 *                        and the menu cards when nothing below exists
 *   2. Thumbnail cut-out the see-through PNG for the two menu pages' cards
 *                        (over a circle) and the POS tile (no circle)
 *   3. Gallery & video   what a customer sees after opening the item
 */
export function PhotosTab({
  itemId,
  mainPhoto,
  onMainPhotoChange,
}: {
  /** Absent for an item that is not saved yet: only the main photo can be set. */
  itemId?: number;
  mainPhoto?: { image_url: string; image_original_url: string };
  onMainPhotoChange?: (next: ImageUrls) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <WhereEachShows />

      {mainPhoto && onMainPhotoChange && (
        <PictureSection
          number={1}
          title="Main photo"
          shows="POS tile and its item sheet, TV signage, offers and specials, social cards. Also the menu cards and shared links when there is no cut-out or gallery photo. Saved with the item (Save Item)."
          testId="photos-main-section"
        >
          <ImageUploadField
            value={mainPhoto.image_url}
            originalValue={mainPhoto.image_original_url}
            onChange={onMainPhotoChange}
          />
        </PictureSection>
      )}

      <PictureSection
        number={2}
        title="Thumbnail cut-out"
        shows="Website menu cards and order app menu cards, floating over a circle. POS tile, with no circle. Never on the opened item."
        testId="photos-cutout-section"
      >
        {itemId ? <CutoutSlot itemId={itemId} /> : <SaveFirst what="a cut-out" />}
      </PictureSection>

      <PictureSection
        number={3}
        title="Gallery photos and video"
        shows="The slideshow a customer sees after tapping the item on the website or in the order app, in this order. The starred photo is also the card photo when there is no cut-out, and the picture a shared link shows. Not used on the POS or signage."
        testId="photos-gallery-section"
      >
        {itemId ? <Gallery itemId={itemId} /> : <SaveFirst what="gallery photos and video" />}
      </PictureSection>
    </div>
  );
}

function WhereEachShows() {
  const row = (surface: string, picture: string) => (
    <tr key={surface}>
      <td style={{ padding: '4px 8px 4px 0', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap', verticalAlign: 'top' }}>{surface}</td>
      <td style={{ padding: '4px 0', color: 'var(--color-text)' }}>{picture}</td>
    </tr>
  );
  return (
    <div style={{ border: '1px solid var(--color-border)', borderRadius: 12, padding: '10px 12px', background: 'var(--color-surface)' }} data-testid="photos-where-table">
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text)', marginBottom: 4 }}>Which picture shows where</div>
      <table style={{ fontSize: 12, borderCollapse: 'collapse', width: '100%' }}>
        <tbody>
          {row('Menu card (website, order app)', 'Cut-out over a circle. Otherwise the starred gallery photo. Otherwise the main photo.')}
          {row('Opened item (website, order app)', 'Gallery photos and video as a slideshow. Otherwise the main photo.')}
          {row('POS tile', 'Cut-out on the tile colour, no circle. Otherwise the main photo.')}
          {row('TV signage, offers, social cards', 'Main photo.')}
        </tbody>
      </table>
    </div>
  );
}

function PictureSection({ number, title, shows, testId, children }: {
  number: number;
  title: string;
  shows: string;
  testId: string;
  children: ReactNode;
}) {
  return (
    <section data-testid={testId} style={{ border: '1px solid var(--color-border)', borderRadius: 12, padding: 12, background: 'var(--color-bg)', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text)' }}>
          <span style={{ display: 'inline-flex', width: 22, height: 22, borderRadius: 999, background: 'var(--color-primary)', color: 'white', fontSize: 12, alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>{number}</span>
          {title}
        </div>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.45 }}>
          <strong>Shows on:</strong> {shows}
        </p>
      </div>
      {children}
    </section>
  );
}

function SaveFirst({ what }: { what: string }) {
  return (
    <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-muted)' }} data-testid="photos-save-first">
      Save the item first, then come back here to add {what}.
    </p>
  );
}

/** Section 3: the gallery and video, exactly as before, now under its own heading. */
function Gallery({ itemId }: { itemId: number }) {
  const [photos, setPhotos] = useState<ItemPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropName, setCropName] = useState('item-photo.jpg');
  const [replacingPhoto, setReplacingPhoto] = useState<ItemPhoto | null>(null);
  const [pendingMaster, setPendingMaster] = useState<File | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
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

  // Owner, 2026-09-30: "there is no option to pic from the library".
  const addFromLibrary = async (asset: MediaAsset) => {
    setError('');
    setUploading(true);
    try {
      await addItemPhotoFromLibrary(itemId, asset.id);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <div style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 14 }}>Loading photos…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {error && <div style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger-strong)', padding: '8px 12px', borderRadius: 8, fontSize: 13 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '10px 16px', background: 'var(--color-border-light)', border: '2px dashed #cbd5e1',
            borderRadius: 10, cursor: uploading ? 'not-allowed' : 'pointer',
            fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)',
          }}
        >
          <Upload size={15} />
          {uploading && !cropSrc ? 'Preparing…' : 'Upload & crop photo'}
        </button>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          disabled={uploading}
          data-testid="gallery-pick-from-library-btn"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '10px 16px', background: 'var(--color-surface)', border: '2px dashed var(--color-border)',
            borderRadius: 10, cursor: uploading ? 'not-allowed' : 'pointer',
            fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)',
          }}
        >
          <Images size={15} />
          Pick from Library
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
      </div>
      <MediaPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        mediaType="image"
        collection="menu-items"
        title="Pick a gallery photo"
        onPick={(asset: MediaAsset) => { void addFromLibrary(asset); }}
      />
      <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-muted)' }}>
        Photos are cropped 4:3 at 1200×900; the full original is kept for re-cropping. A video plays muted in the opened item only and the cards show its poster. Max {(MENU_VIDEO_LIMITS.maxBytes / (1024 * 1024)).toFixed(0)} MB.
      </p>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,.heic,.heif"
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
        <div style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '20px 0', fontSize: 13 }}>
          No gallery photos yet. Upload one or pick from the library above.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 12 }}>
          {[...photos].sort((a, b) => a.sort_order - b.sort_order).map((ph, index, sorted) => (
            <div key={ph.id} style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', border: ph.is_primary ? '2px solid var(--color-primary)' : '2px solid var(--color-border)' }}>
              <img
                src={resolveMediaUrl(ph.media_type === 'video' ? (ph.poster_url || ph.thumb_url || ph.url) : ph.url)}
                alt={ph.alt_text || ''}
                style={{ width: '100%', height: 100, objectFit: 'cover', display: 'block', background: 'var(--color-bg)' }}
              />
              {ph.media_type === 'video' && (
                <div style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(28,20,8,0.75)', color: '#fff', borderRadius: 6, padding: '2px 6px', fontSize: 10, fontWeight: 700 }}>
                  ▶ Video
                </div>
              )}
              {ph.is_primary && (
                <div style={{ position: 'absolute', top: 4, left: 4, background: 'var(--color-primary)', color: '#fff', borderRadius: 6, padding: '2px 6px', fontSize: 10, fontWeight: 700 }}>
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
                    border: '1px solid var(--color-border)', borderRadius: 6, padding: '4px 6px',
                    fontSize: 11, fontFamily: 'inherit', color: 'var(--color-text)', background: 'var(--color-surface)',
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
                    style={{ flex: '1 1 100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '6px', background: '#FEF3E8', border: '1px solid #F0D9C0', borderRadius: 6, cursor: uploading ? 'not-allowed' : 'pointer', fontSize: 11, fontWeight: 700, color: '#A1420B' }}
                  >
                    <Crop size={12} /> Edit crop
                  </button>
                )}
                <button
                  type="button"
                  title="Move earlier"
                  disabled={index === 0}
                  onClick={() => void movePhoto(ph.id, -1)}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 6, cursor: index === 0 ? 'not-allowed' : 'pointer', opacity: index === 0 ? 0.4 : 1 }}
                >
                  <ChevronLeft size={13} />
                </button>
                <button
                  type="button"
                  title="Move later"
                  disabled={index === sorted.length - 1}
                  onClick={() => void movePhoto(ph.id, 1)}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 6, cursor: index === sorted.length - 1 ? 'not-allowed' : 'pointer', opacity: index === sorted.length - 1 ? 0.4 : 1 }}
                >
                  <ChevronRight size={13} />
                </button>
                {!ph.is_primary && (
                  <button
                    type="button"
                    title="Set as primary (card photo, first slide, shared-link picture)"
                    onClick={() => void setPrimary(ph.id)}
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px', background: 'var(--color-warning-bg)', border: '1px solid #fcd34d', borderRadius: 6, cursor: 'pointer' }}
                  >
                    <Star size={13} color="#d97706" />
                  </button>
                )}
                <button
                  type="button"
                  title="Delete"
                  onClick={() => void remove(ph.id)}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px', background: 'var(--color-danger-bg)', border: '1px solid #fca5a5', borderRadius: 6, cursor: 'pointer' }}
                >
                  <Trash2 size={13} color="var(--color-danger-strong)" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
