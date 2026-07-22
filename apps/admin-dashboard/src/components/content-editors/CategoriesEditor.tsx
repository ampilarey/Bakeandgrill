import { Upload } from 'lucide-react';
import { Button } from '../ui';
import type { ContentEditorWithUploadProps } from './types';
import { RepeaterShell } from './RepeaterShell';

type Cat = { icon: string; label: string; name: string; hook: string; image_url: string; link: string };

const empty = (): Cat => ({ icon: '', label: '', name: '', hook: '', image_url: '', link: '/menu' });

export function CategoriesEditor({ label, description, value, onChange, triggerUpload }: ContentEditorWithUploadProps) {
  let items: Cat[] = [];
  try { items = JSON.parse(value || '[]'); } catch { /* empty */ }
  if (!Array.isArray(items)) items = [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 700, color: '#1C1408' }}>{label}</label>
      {description && <p style={{ fontSize: 12, color: '#9C8E7E', margin: 0 }}>{description}</p>}
      <RepeaterShell
        items={items}
        onChange={(next) => onChange(JSON.stringify(next))}
        createItem={empty}
        itemLabel="category"
        renderItem={(item, idx, update) => (
          <>
            <div className="content-editor-row" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <input className="content-editor-icon" value={item.icon} onChange={(e) => update({ icon: e.target.value })} placeholder="🥐" title="Emoji icon"
                style={{ width: 40, height: 32, borderRadius: 8, border: '1px solid #E8E0D8', textAlign: 'center', fontSize: 18, fontFamily: 'inherit', outline: 'none', flexShrink: 0 }} />
              <input value={item.label} onChange={(e) => update({ label: e.target.value })} placeholder="Label tag"
                style={{ flex: 1, minWidth: 80, height: 32, borderRadius: 8, border: '1px solid #E8E0D8', padding: '0 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#1C1408' }} />
              <input value={item.name} onChange={(e) => update({ name: e.target.value })} placeholder="Card title"
                style={{ flex: 2, minWidth: 100, height: 32, borderRadius: 8, border: '1px solid #E8E0D8', padding: '0 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#1C1408' }} />
              <input value={item.link} onChange={(e) => update({ link: e.target.value })} placeholder="/menu" title="Link URL"
                style={{ width: 80, height: 32, borderRadius: 8, border: '1px solid #E8E0D8', padding: '0 8px', fontSize: 12, fontFamily: 'inherit', outline: 'none', color: '#1C1408', flexShrink: 0 }} />
            </div>
            <input value={item.hook} onChange={(e) => update({ hook: e.target.value })} placeholder="Short hook text shown on the card"
              style={{ height: 32, borderRadius: 8, border: '1px solid #E8E0D8', padding: '0 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#1C1408' }} />
            <div className="content-editor-row" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {item.image_url ? (
                <img src={item.image_url} alt="" style={{ height: 36, width: 56, objectFit: 'cover', borderRadius: 6, border: '1px solid #E8E0D8', flexShrink: 0 }} />
              ) : (
                <div style={{ height: 36, width: 56, borderRadius: 6, border: '1.5px dashed #E8E0D8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9C8E7E', fontSize: 10, flexShrink: 0 }}>no img</div>
              )}
              <Button variant="secondary" size="sm" icon={<Upload size={13} />}
                onClick={() => triggerUpload(`cat_${idx + 1}_image`, (url) => update({ image_url: url }))}>Upload</Button>
              <input value={item.image_url} onChange={(e) => update({ image_url: e.target.value })} placeholder="/images/cafe/photo.jpg"
                style={{ flex: 1, minWidth: 140, height: 32, borderRadius: 8, border: '1px solid #E8E0D8', background: '#fff', padding: '0 10px', fontSize: 12, fontFamily: 'inherit', outline: 'none', color: '#6B5D4F' }} />
            </div>
          </>
        )}
      />
    </div>
  );
}
