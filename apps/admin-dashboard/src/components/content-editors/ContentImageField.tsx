import { useRef, useState } from 'react';
import { Images, Upload } from 'lucide-react';
import { Button } from '../ui';
import { MediaPicker } from '../MediaPicker';
import type { MediaAsset } from '../../api';
import { ImageCropModal } from '../../pages/MenuPage/ImageCropModal';
import { MENU_IMAGE_ASPECT, MENU_IMAGE_HEIGHT, MENU_IMAGE_WIDTH } from '../../pages/MenuPage/cropImage';

export type ContentImageUploadResult = {
  url: string;
  original_url?: string | null;
  thumb_url?: string;
};

type Props = {
  imageUrl: string;
  imageAlt?: string;
  focalX?: number | string;
  focalY?: number | string;
  /** Upload cropped + original master files */
  upload: (cropped: File, original: File) => Promise<ContentImageUploadResult>;
  onChange: (patch: {
    image?: string;
    image_master?: string;
    image_focal_x?: number;
    image_focal_y?: number;
    image_alt?: string;
  }) => void;
  showAlt?: boolean;
  /** Show Media Library picker (default true). */
  allowLibrary?: boolean;
};

/** Interactive crop + master upload for content images (reuses Menu ImageCropModal). */
export function ContentImageField({
  imageUrl,
  imageAlt = '',
  focalX = 50,
  focalY = 50,
  upload,
  onChange,
  showAlt = true,
  allowLibrary = true,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [libraryOpen, setLibraryOpen] = useState(false);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setOriginalFile(file);
    setCropSrc(URL.createObjectURL(file));
  };

  const confirmCrop = async (cropped: File) => {
    if (!originalFile) return;
    setBusy(true);
    setError('');
    try {
      const res = await upload(cropped, originalFile);
      onChange({
        image: res.url,
        image_master: res.original_url || undefined,
        image_focal_x: Number(focalX) || 50,
        image_focal_y: Number(focalY) || 50,
        image_alt: imageAlt,
      });
      if (cropSrc) URL.revokeObjectURL(cropSrc);
      setCropSrc(null);
      setOriginalFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  const pickFromLibrary = (asset: MediaAsset) => {
    onChange({
      image: asset.url,
      image_master: asset.original_url || undefined,
      image_focal_x: Number(focalX) || 50,
      image_focal_y: Number(focalY) || 50,
      image_alt: imageAlt || asset.alt_text || '',
    });
    setLibraryOpen(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={imageAlt || ''}
            style={{
              height: 54, width: 90, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--color-border)', flexShrink: 0,
              objectPosition: `${focalX}% ${focalY}%`,
            }}
          />
        ) : (
          <div style={{ height: 54, width: 90, borderRadius: 8, border: '1.5px dashed var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: 11, flexShrink: 0 }}>No image</div>
        )}
        <Button variant="secondary" size="sm" icon={<Upload size={13} />} onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? 'Uploading…' : 'Crop & upload'}
        </Button>
        {allowLibrary ? (
          <Button variant="secondary" size="sm" icon={<Images size={13} />} onClick={() => setLibraryOpen(true)} disabled={busy}>
            Library
          </Button>
        ) : null}
        <input ref={inputRef} type="file" accept="image/*,.heic,.heif" style={{ display: 'none' }} onChange={onFile} />
      </div>
      {showAlt ? (
        <input
          value={imageAlt}
          onChange={(e) => onChange({ image_alt: e.target.value })}
          placeholder="Alt text (accessibility)"
          style={{ height: 32, borderRadius: 8, border: '1px solid var(--color-border)', padding: '0 10px', fontSize: 12, fontFamily: 'inherit' }}
        />
      ) : null}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>Focal X%</label>
        <input
          type="number" min={0} max={100} value={Number(focalX) || 50}
          onChange={(e) => onChange({ image_focal_x: Number(e.target.value) })}
          style={{ width: 64, height: 32, borderRadius: 8, border: '1px solid var(--color-border)', padding: '0 8px', fontFamily: 'inherit' }}
        />
        <label style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>Focal Y%</label>
        <input
          type="number" min={0} max={100} value={Number(focalY) || 50}
          onChange={(e) => onChange({ image_focal_y: Number(e.target.value) })}
          style={{ width: 64, height: 32, borderRadius: 8, border: '1px solid var(--color-border)', padding: '0 8px', fontFamily: 'inherit' }}
        />
      </div>
      {error ? <p style={{ margin: 0, fontSize: 12, color: '#B91C1C' }}>{error}</p> : null}
      {cropSrc ? (
        <ImageCropModal
          imageSrc={cropSrc}
          fileName={originalFile?.name || 'content.jpg'}
          title="Crop content image"
          hint="Drag and zoom. The framed area is what customers see; the original is kept as a re-croppable master."
          aspect={MENU_IMAGE_ASPECT}
          outputWidth={MENU_IMAGE_WIDTH}
          outputHeight={MENU_IMAGE_HEIGHT}
          onCancel={() => {
            if (cropSrc) URL.revokeObjectURL(cropSrc);
            setCropSrc(null);
            setOriginalFile(null);
          }}
          onConfirm={(file) => void confirmCrop(file)}
        />
      ) : null}
      {allowLibrary ? (
        <MediaPicker
          open={libraryOpen}
          onClose={() => setLibraryOpen(false)}
          mediaType="image"
          title="Pick hero image"
          onPick={pickFromLibrary}
        />
      ) : null}
    </div>
  );
}
