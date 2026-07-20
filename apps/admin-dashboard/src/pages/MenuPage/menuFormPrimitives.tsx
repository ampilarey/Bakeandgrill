import { useRef, useState } from 'react';
import { Crop, Upload } from 'lucide-react';
import { uploadMenuImage } from '../../api';
import { Input } from '../../components/Layout';
import { ImageCropModal } from './ImageCropModal';
import { fileToDataUrl, loadImageAsDataUrl, resolveMediaUrl } from './mediaUrl';

export function ImageUploadField({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropName, setCropName] = useState('menu-image.jpg');
  const [previewKey, setPreviewKey] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const closeCropper = () => setCropSrc(null);

  const openCropperFromFile = async (file: File) => {
    setUploadError('');
    setUploading(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      setCropName(file.name || 'menu-image.jpg');
      setCropSrc(dataUrl);
    } catch (e) {
      setUploadError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const openCropperFromExisting = async () => {
    if (!value.trim()) return;
    setUploadError('');
    setUploading(true);
    try {
      const dataUrl = await loadImageAsDataUrl(value.trim());
      setCropName('menu-image.jpg');
      setCropSrc(dataUrl);
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
      const { url } = await uploadMenuImage(file);
      if (!url) throw new Error('Upload succeeded but no image URL was returned.');
      onChange(url);
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
          onChange={onChange}
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
          {uploading && !cropSrc ? 'Working…' : 'Upload & crop'}
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
        Crop to 4:3 for a clean menu/POS thumbnail. Use Edit / re-crop on photos already saved.
      </p>
      {uploadError && <p style={{ color: '#dc2626', fontSize: 12, margin: 0 }}>{uploadError}</p>}
      {previewSrc && (
        <img
          key={previewKey}
          src={previewSrc}
          alt="Item thumbnail preview"
          style={{ width: 160, height: 120, objectFit: 'cover', borderRadius: 8, border: '1px solid #E8E0D8', background: '#F8F6F3' }}
          onError={() => setUploadError('Preview failed to load. On the server run: php artisan storage:link')}
        />
      )}
      {cropSrc && (
        <ImageCropModal
          imageSrc={cropSrc}
          fileName={cropName}
          title="Edit item image"
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
