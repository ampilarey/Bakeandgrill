import { useRef, useState } from 'react';
import { uploadMenuImage } from '../../api';
import { Input } from '../../components/Layout';

export function ImageUploadField({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setUploadError('');
    setUploading(true);
    try {
      const { url } = await uploadMenuImage(file);
      onChange(url);
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
          placeholder="https://… or upload below"
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          style={{
            flexShrink: 0, padding: '8px 14px', background: '#F8F6F3',
            border: '1px solid #E8E0D8', borderRadius: 8, cursor: 'pointer',
            fontSize: 13, fontWeight: 600, color: '#6B5D4F', whiteSpace: 'nowrap',
          }}
        >
          {uploading ? '⏳ Uploading…' : '📁 Upload'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            e.target.value = '';
          }}
        />
      </div>
      {uploadError && <p style={{ color: '#dc2626', fontSize: 12, margin: 0 }}>{uploadError}</p>}
      {value && (
        <img
          src={value}
          alt="preview"
          style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid #E8E0D8' }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
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
