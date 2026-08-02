import { Upload } from 'lucide-react';
import { Button } from '../ui';
import type { ContentEditorWithUploadProps } from './types';
import { RepeaterShell } from './RepeaterShell';

type Cat = {
  icon: string;
  label: string;
  name: string;
  hook: string;
  image_url: string;
  image_alt?: string;
  link: string;
};

const empty = (): Cat => ({ icon: '', label: '', name: '', hook: '', image_url: '', image_alt: '', link: '/menu' });

export function CategoriesEditor({ label, description, value, onChange, triggerUpload }: ContentEditorWithUploadProps) {
  let items: Cat[] = [];
  try { items = JSON.parse(value || '[]'); } catch { /* empty */ }
  if (!Array.isArray(items)) items = [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text)' }}>{label}</label>
      {description && <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0 }}>{description}</p>}
      <RepeaterShell
        items={items}
        onChange={(next) => onChange(JSON.stringify(next))}
        createItem={empty}
        itemLabel="category"
        renderItem={(item, idx, update) => (
          <>
            <div className="content-editor-row" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <input className="content-editor-icon" value={item.icon} onChange={(e) => update({ icon: e.target.value })} placeholder="🥐" title="Emoji icon"
                style={{ width: 40, height: 32, borderRadius: 8, border: '1px solid var(--color-border)', textAlign: 'center', fontSize: 18, fontFamily: 'inherit', outline: 'none', flexShrink: 0 }} />
              <input value={item.label} onChange={(e) => update({ label: e.target.value })} placeholder="Label tag"
                style={{ flex: 1, minWidth: 80, height: 32, borderRadius: 8, border: '1px solid var(--color-border)', padding: '0 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none', color: 'var(--color-text)' }} />
              <input value={item.name} onChange={(e) => update({ name: e.target.value })} placeholder="Card title"
                style={{ flex: 2, minWidth: 100, height: 32, borderRadius: 8, border: '1px solid var(--color-border)', padding: '0 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none', color: 'var(--color-text)' }} />
              <input value={item.link} onChange={(e) => update({ link: e.target.value })} placeholder="/menu" title="Link URL"
                style={{ width: 80, height: 32, borderRadius: 8, border: '1px solid var(--color-border)', padding: '0 8px', fontSize: 12, fontFamily: 'inherit', outline: 'none', color: 'var(--color-text)', flexShrink: 0 }} />
            </div>
            <input value={item.hook} onChange={(e) => update({ hook: e.target.value })} placeholder="Short hook text shown on the card"
              style={{ height: 32, borderRadius: 8, border: '1px solid var(--color-border)', padding: '0 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none', color: 'var(--color-text)' }} />
            <div className="content-editor-row" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {item.image_url ? (
                <img src={item.image_url} alt={item.image_alt || item.name || ''} style={{ height: 36, width: 56, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--color-border)', flexShrink: 0 }} />
              ) : (
                <div style={{ height: 36, width: 56, borderRadius: 6, border: '1.5px dashed var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: 10, flexShrink: 0 }}>no img</div>
              )}
              <Button variant="secondary" size="sm" icon={<Upload size={13} />}
                onClick={() => triggerUpload(`cat_${idx + 1}_image`, (url) => update({ image_url: url }))}>Upload</Button>
              <input value={item.image_url} onChange={(e) => update({ image_url: e.target.value })} placeholder="/images/cafe/photo.jpg"
                style={{ flex: 1, minWidth: 140, height: 32, borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-surface)', padding: '0 10px', fontSize: 12, fontFamily: 'inherit', outline: 'none', color: 'var(--color-text-secondary)' }} />
            </div>
            <input
              value={item.image_alt || ''}
              onChange={(e) => update({ image_alt: e.target.value })}
              placeholder="Image alt text (accessibility / SEO)"
              style={{ height: 32, borderRadius: 8, border: '1px solid var(--color-border)', padding: '0 10px', fontSize: 12, fontFamily: 'inherit', outline: 'none', color: 'var(--color-text)' }}
            />
          </>
        )}
      />
    </div>
  );
}
