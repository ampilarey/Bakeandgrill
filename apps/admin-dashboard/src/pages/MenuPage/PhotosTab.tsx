import { useEffect, useRef, useState } from 'react';
import { Star, Trash2, Upload } from 'lucide-react';
import { getItemPhotos, uploadItemPhoto, updateItemPhoto, deleteItemPhoto, type ItemPhoto } from '../../api';

export function PhotosTab({ itemId }: { itemId: number }) {
  const [photos, setPhotos] = useState<ItemPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try { setPhotos((await getItemPhotos(itemId)).data); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [itemId]);

  const handleUpload = async (file: File) => {
    setUploading(true); setError('');
    try {
      const { photo } = await uploadItemPhoto(itemId, file);
      setPhotos((p) => [...p, photo]);
    } catch (e) { setError((e as Error).message); }
    finally { setUploading(false); }
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
        {uploading ? 'Uploading…' : 'Upload Photo'}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleUpload(f);
          e.target.value = '';
        }}
      />

      {photos.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#9C8E7E', padding: '20px 0', fontSize: 13 }}>
          No photos yet. Upload one above.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 12 }}>
          {photos.map((ph) => (
            <div key={ph.id} style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', border: ph.is_primary ? '2px solid #D4813A' : '2px solid #E8E0D8' }}>
              <img
                src={ph.url}
                alt=""
                style={{ width: '100%', height: 100, objectFit: 'cover', display: 'block' }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
              {ph.is_primary && (
                <div style={{ position: 'absolute', top: 4, left: 4, background: '#D4813A', color: '#fff', borderRadius: 6, padding: '2px 6px', fontSize: 10, fontWeight: 700 }}>
                  Primary
                </div>
              )}
              <div style={{ display: 'flex', gap: 4, padding: '6px 6px 6px' }}>
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
