import type { ContentEditorProps } from './types';

export function AboutValuesEditor({ label, description, value, onChange }: ContentEditorProps) {
  let items: { initial: string; title: string; description: string }[] = [];
  try { items = JSON.parse(value || '[]'); } catch { /* empty */ }
  while (items.length < 4) items.push({ initial: '', title: '', description: '' });

  const update = (idx: number, field: string, v: string) => {
    const next = items.map((item, i) => i === idx ? { ...item, [field]: v } : item);
    onChange(JSON.stringify(next.slice(0, 4)));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 700, color: '#1C1408' }}>{label}</label>
      {description && <p style={{ fontSize: 12, color: '#9C8E7E', margin: 0 }}>{description}</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.slice(0, 4).map((item, idx) => (
          <div key={idx} style={{ background: '#fff', border: '1.5px solid #E8E0D8', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input value={item.initial} onChange={(e) => update(idx, 'initial', e.target.value)} placeholder="F" title="Initial letter"
                style={{ width: 40, height: 32, borderRadius: 8, border: '1px solid #E8E0D8', textAlign: 'center', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', outline: 'none', flexShrink: 0 }} />
              <input value={item.title} onChange={(e) => update(idx, 'title', e.target.value)} placeholder="Title"
                style={{ flex: 1, minWidth: 120, height: 32, borderRadius: 8, border: '1px solid #E8E0D8', padding: '0 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#1C1408' }} />
            </div>
            <input value={item.description} onChange={(e) => update(idx, 'description', e.target.value)} placeholder="Description"
              style={{ width: '100%', height: 32, borderRadius: 8, border: '1px solid #E8E0D8', padding: '0 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#1C1408', boxSizing: 'border-box' }} />
          </div>
        ))}
      </div>
    </div>
  );
}
