import { Upload } from 'lucide-react';
import { Button } from '../ui';
import type { HeroSlideEditorProps } from './types';

export function HeroSlideEditor({ label, description, uploadKey, value, onChange, triggerUpload }: HeroSlideEditorProps) {
  let parsed: Record<string, string> = {};
  try { parsed = JSON.parse(value || '{}'); } catch { /* empty */ }

  const update = (field: string, v: string) => onChange(JSON.stringify({ ...parsed, [field]: v }));

  const fields = [
    { key: 'eyebrow',   label: 'Eyebrow tag',            col: 'half', placeholder: "Malé's neighbourhood café" },
    { key: 'cta_text',  label: 'Button 1 text',          col: 'half', placeholder: 'Order Now →' },
    { key: 'cta_url',   label: 'Button 1 URL',           col: 'half', placeholder: '/order/' },
    { key: 'cta2_text', label: 'Button 2 text',          col: 'half', placeholder: 'View Menu' },
    { key: 'cta2_url',  label: 'Button 2 URL',           col: 'half', placeholder: '/menu' },
    { key: 'title',     label: 'Title (HTML: <br> <em>)', col: 'full', placeholder: 'Dhivehi breakfast<br>meets <em>artisan baking</em>' },
    { key: 'subtitle',  label: 'Subtitle',               col: 'full', placeholder: 'Real food. Proper char. Baked fresh at 5am.' },
  ];

  return (
    <div style={{ background: '#FAFAF8', borderRadius: 12, border: '1.5px solid #E8E0D8', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <p style={{ fontSize: 14, fontWeight: 700, color: '#1C1408', margin: 0 }}>{label}</p>
        {description && <p style={{ fontSize: 12, color: '#9C8E7E', margin: '3px 0 0' }}>{description}</p>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: '#6B5D4F', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Slide Image</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {parsed.image ? (
            <img src={parsed.image} alt="slide" style={{ height: 54, width: 90, objectFit: 'cover', borderRadius: 8, border: '1px solid #E8E0D8', flexShrink: 0 }} />
          ) : (
            <div style={{ height: 54, width: 90, borderRadius: 8, border: '1.5px dashed #E8E0D8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9C8E7E', fontSize: 11, flexShrink: 0 }}>No image</div>
          )}
          <Button variant="secondary" size="sm" icon={<Upload size={13} />} onClick={() => triggerUpload(uploadKey, (url) => update('image', url))}>
            Upload image
          </Button>
          <input
            value={parsed.image ?? ''}
            onChange={(e) => update('image', e.target.value)}
            placeholder="/images/cafe/filename.jpg"
            style={{ flex: 1, minWidth: 160, height: 32, borderRadius: 8, border: '1px solid #E8E0D8', background: '#fff', padding: '0 10px', fontSize: 12, fontFamily: 'inherit', outline: 'none', color: '#6B5D4F' }}
          />
        </div>
      </div>
      <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {fields.map((f) => (
          <div key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: f.col === 'full' ? '1 / -1' : undefined }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#6B5D4F' }}>{f.label}</label>
            <input value={parsed[f.key] ?? ''} onChange={(e) => update(f.key, e.target.value)} placeholder={f.placeholder}
              style={{ height: 32, borderRadius: 8, border: '1px solid #E8E0D8', background: '#fff', padding: '0 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#1C1408' }} />
          </div>
        ))}
      </div>
    </div>
  );
}
