import { useRef, useState } from 'react';
import { uploadMenuImage } from '../../api';
import { Input } from '../../components/Layout';
import { ImageCropModal } from './ImageCropModal';

export function ImageUploadField({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropName, setCropName] = useState('menu-image.jpg');
  const inputRef = useRef<HTMLInputElement>(null);

  const openCropper = (file: File) => {
    setUploadError('');
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropName(file.name || 'menu-image.jpg');
    setCropSrc(URL.createObjectURL(file));
  };

  const closeCropper = () => {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
  };

  const uploadCropped = async (file: File) => {
    setUploading(true);
    setUploadError('');
    try {
      const { url } = await uploadMenuImage(file);
      onChange(url);
      closeCropper();
    } catch (e) {
      setUploadError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
          }}
        >
          {uploading ? '⏳ Uploading…' : '📁 Upload & crop'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) openCropper(file);
            e.target.value = '';
          }}
        />
      </div>
      <p style={{ margin: 0, fontSize: 11, color: '#9C8E7E' }}>
        Uploads open a 4:3 crop tool so every item photo matches the online menu card.
      </p>
      {uploadError && <p style={{ color: '#dc2626', fontSize: 12, margin: 0 }}>{uploadError}</p>}
      {value && (
        <img
          src={value}
          alt="preview"
          style={{ width: 160, height: 120, objectFit: 'cover', borderRadius: 8, border: '1px solid #E8E0D8' }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      )}
      {cropSrc && (
        <ImageCropModal
          imageSrc={cropSrc}
          fileName={cropName}
          title="Crop item image"
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
