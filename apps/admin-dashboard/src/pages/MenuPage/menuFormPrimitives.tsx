import { useRef, useState } from 'react';
import { Crop, Upload } from 'lucide-react';
import { uploadMenuImage } from '../../api';
import { Input } from '../../components/Layout';
import {
  CATEGORY_BANNER_ASPECT,
  CATEGORY_BANNER_HEIGHT,
  CATEGORY_BANNER_WIDTH,
  MENU_IMAGE_ASPECT,
  MENU_IMAGE_HEIGHT,
  MENU_IMAGE_WIDTH,
} from './cropImage';
import { ImageCropModal } from './ImageCropModal';
import { prepareImageForCrop, prepareUploadFromFile, resolveMediaUrl, revokeCropSrc } from './mediaUrl';

type ImageUrls = { url: string; original_url: string; thumb_url?: string };

type Variant = 'item' | 'banner';

const VARIANT_CONFIG: Record<Variant, {
  purpose: 'menu' | 'banner';
  aspect: number;
  width: number;
  height: number;
  title: string;
  hint: string;
  help: string;
  previewAlt: string;
  previewStyle: React.CSSProperties;
}> = {
  item: {
    purpose: 'menu',
    aspect: MENU_IMAGE_ASPECT,
    width: MENU_IMAGE_WIDTH,
    height: MENU_IMAGE_HEIGHT,
    title: 'Edit item image',
    hint: 'Drag, zoom, and rotate. Only the framed area is saved — this is what customers see on the menu and what cashiers see on POS.',
    help: 'Menu/POS show a 1200×900 (4:3) crop. The full photo is kept on the server so you can re-crop later.',
    previewAlt: 'Item thumbnail preview',
    previewStyle: {
      width: 160, height: 120, objectFit: 'cover', borderRadius: 8,
      border: '1px solid #E8E0D8', background: '#F8F6F3',
    },
  },
  banner: {
    purpose: 'banner',
    aspect: CATEGORY_BANNER_ASPECT,
    width: CATEGORY_BANNER_WIDTH,
    height: CATEGORY_BANNER_HEIGHT,
    title: 'Edit category menu banner',
    hint: 'Wide 7:3 crop for the order-app category promo. Keep the subject toward the centre-left so the title overlay stays readable on phones and desktop.',
    help: 'Order-app category banner — 1400×600 (7:3). Fits mobile and desktop. Full photo kept for re-crop.',
    previewAlt: 'Category banner preview',
    previewStyle: {
      width: '100%', maxWidth: 520, aspectRatio: '7 / 3', height: 'auto',
      objectFit: 'cover', borderRadius: 12, border: '1px solid #E8E0D8', background: '#F8F6F3',
      display: 'block',
    },
  },
};

export function ImageUploadField({
  value,
  originalValue = '',
  onChange,
  variant = 'item',
}: {
  value: string;
  /** Full-frame master for re-crop; omit for fields that only store the public crop. */
  originalValue?: string;
  onChange: (next: ImageUrls) => void;
  /** `banner` = wide category promo; `item` = 4:3 menu/POS tile. */
  variant?: Variant;
}) {
  const cfg = VARIANT_CONFIG[variant];
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropName, setCropName] = useState('menu-image.jpg');
  const [pendingMaster, setPendingMaster] = useState<File | null>(null);
  const [previewKey, setPreviewKey] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const closeCropper = () => {
    setCropSrc((prev) => {
      revokeCropSrc(prev);
      return null;
    });
    setPendingMaster(null);
  };

  const openCropperFromFile = async (file: File) => {
    setUploadError('');
    setUploading(true);
    try {
      const { cropSrc: src, masterFile } = await prepareUploadFromFile(file);
      setCropName(file.name || 'menu-image.jpg');
      setPendingMaster(masterFile);
      setCropSrc((prev) => {
        revokeCropSrc(prev);
        return src;
      });
    } catch (e) {
      setUploadError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const openCropperFromExisting = async () => {
    const master = (originalValue || value).trim();
    if (!master) return;
    setUploadError('');
    setUploading(true);
    try {
      const src = await prepareImageForCrop(master);
      setCropName(variant === 'banner' ? 'category-banner.jpg' : 'menu-image.jpg');
      setPendingMaster(null);
      setCropSrc((prev) => {
        revokeCropSrc(prev);
        return src;
      });
    } catch (e) {
      setUploadError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const uploadCropped = async (file: File) => {
    setUploading(true);
    setUploadError('');
    try {
      const res = await uploadMenuImage(file, pendingMaster ?? undefined, cfg.purpose);
      if (!res.url) throw new Error('Upload succeeded but no image URL was returned.');
      onChange({
        url: res.url,
        original_url: res.original_url || originalValue || '',
        thumb_url: res.thumb_url || '',
      });
      setPreviewKey((k) => k + 1);
      closeCropper();
    } catch (e) {
      setUploadError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const previewSrc = value
    ? `${resolveMediaUrl(value)}${value.includes('?') ? '&' : '?'}v=${previewKey}`
    : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Input
          value={value}
          onChange={(v) => onChange({ url: v, original_url: '' })}
          placeholder="https://… or upload & crop below"
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          style={{
            flexShrink: 0, padding: '8px 14px', background: '#F8F6F3',
            border: '1px solid #E8E0D8', borderRadius: 8, cursor: uploading ? 'not-allowed' : 'pointer',
            fontSize: 13, fontWeight: 600, color: '#6B5D4F', whiteSpace: 'nowrap',
            display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44,
          }}
        >
          <Upload size={14} />
          {uploading && !cropSrc ? 'Preparing…' : 'Upload & crop'}
        </button>
        {value.trim() && (
          <button
            type="button"
            onClick={() => void openCropperFromExisting()}
            disabled={uploading}
            style={{
              flexShrink: 0, padding: '8px 14px', background: '#FEF3E8',
              border: '1px solid #F0D9C0', borderRadius: 8, cursor: uploading ? 'not-allowed' : 'pointer',
              fontSize: 13, fontWeight: 600, color: '#B86820', whiteSpace: 'nowrap',
              display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44,
            }}
          >
            <Crop size={14} />
            Edit / re-crop
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void openCropperFromFile(file);
            e.target.value = '';
          }}
        />
      </div>
      <p style={{ margin: 0, fontSize: 11, color: '#9C8E7E' }}>
        {cfg.help}
        {originalValue.trim() ? ' Master saved ✓' : ''}
      </p>
      {uploadError && <p style={{ color: '#dc2626', fontSize: 12, margin: 0 }}>{uploadError}</p>}
      {previewSrc && (
        <img
          key={previewKey}
          src={previewSrc}
          alt={cfg.previewAlt}
          style={cfg.previewStyle}
          onError={() => setUploadError('Preview failed to load. On the server run: php artisan storage:link')}
        />
      )}
      {cropSrc && (
        <ImageCropModal
          imageSrc={cropSrc}
          fileName={cropName}
          title={cfg.title}
          hint={cfg.hint}
          aspect={cfg.aspect}
          outputWidth={cfg.width}
          outputHeight={cfg.height}
          onCancel={closeCropper}
          onConfirm={uploadCropped}
        />
      )}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6B5D4F', marginBottom: 4 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

export function FormTextarea({ value, onChange, placeholder, rows = 3 }: {
  value: string; onChange: (v: string) => void; placeholder?: string; rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      style={{
        width: '100%', border: '1px solid #E8E0D8', borderRadius: 9,
        padding: '9px 12px', fontSize: 14, fontFamily: 'inherit', resize: 'vertical',
        boxSizing: 'border-box',
      }}
    />
  );
}
