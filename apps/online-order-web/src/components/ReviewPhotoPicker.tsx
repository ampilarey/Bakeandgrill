// Up to three photos on a review (iruali import plan, feature 6). The server
// re-encodes them, so EXIF and location never leave with the picture.
import { useEffect, useMemo } from 'react';
import { Camera, X } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

export const MAX_REVIEW_PHOTOS = 3;

export function ReviewPhotoPicker({ photos, onChange }: { photos: File[]; onChange: (files: File[]) => void }) {
  const { t } = useLanguage();
  const previews = useMemo(() => photos.map((f) => (typeof URL.createObjectURL === 'function' ? URL.createObjectURL(f) : '')), [photos]);
  useEffect(() => () => { previews.forEach((u) => u && URL.revokeObjectURL(u)); }, [previews]);

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {photos.map((f, i) => (
          <div key={`${f.name}-${i}`} style={{ position: 'relative', width: 56, height: 56 }}>
            {previews[i] && <img src={previews[i]} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8, display: 'block' }} />}
            <button
              type="button"
              onClick={() => onChange(photos.filter((_, j) => j !== i))}
              aria-label={t('review.photo_remove')}
              style={{ position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, border: 'none', background: 'var(--color-text)', color: 'var(--color-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}
            >
              <X size={12} aria-hidden />
            </button>
          </div>
        ))}
        {photos.length < MAX_REVIEW_PHOTOS && (
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 10, border: '1.5px dashed var(--color-border)', fontSize: 13, fontWeight: 600, color: 'var(--color-text-muted)', cursor: 'pointer' }}>
            <Camera size={14} aria-hidden /> {t('review.add_photos')}
            <input
              type="file"
              accept="image/*"
              multiple
              data-testid="review-photo-input"
              style={{ display: 'none' }}
              onChange={(e) => {
                const picked = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith('image/'));
                onChange([...photos, ...picked].slice(0, MAX_REVIEW_PHOTOS));
                e.target.value = '';
              }}
            />
          </label>
        )}
      </div>
      <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--color-text-muted)' }}>{t('review.photos_hint')}</p>
    </div>
  );
}
