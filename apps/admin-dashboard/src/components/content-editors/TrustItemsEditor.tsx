import type { ContentEditorProps } from './types';

export function TrustItemsEditor({ label, description, value, onChange }: ContentEditorProps) {
  let items: { icon: string; heading: string; subtext: string }[] = [];
  try { items = JSON.parse(value || '[]'); } catch { /* empty */ }
  while (items.length < 4) items.push({ icon: '', heading: '', subtext: '' });

  const update = (idx: number, field: string, v: string) => {
    const next = items.map((item, i) => i === idx ? { ...item, [field]: v } : item);
    onChange(JSON.stringify(next.slice(0, 4)));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 700, color: '#1C1408' }}>{label}</label>
      {description && <p style={{ fontSize: 12, color: '#9C8E7E', margin: 0 }}>{description}</p>}
      <div style={{ background: '#fff', border: '1.5px solid #E8E0D8', borderRadius: 12, overflow: 'hidden' }}>
        {items.slice(0, 4).map((item, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', padding: '8px 14px', borderTop: idx === 0 ? 'none' : '1px solid #F0EBE5', gap: 8 }}>
            <input value={item.icon} onChange={(e) => update(idx, 'icon', e.target.value)} placeholder="🌅"
              style={{ width: 40, height: 32, borderRadius: 8, border: '1px solid #E8E0D8', textAlign: 'center', fontSize: 18, fontFamily: 'inherit', outline: 'none', flexShrink: 0 }} />
            <input value={item.heading} onChange={(e) => update(idx, 'heading', e.target.value)} placeholder="Heading"
              style={{ flex: 2, height: 32, borderRadius: 8, border: '1px solid #E8E0D8', padding: '0 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#1C1408' }} />
            <input value={item.subtext} onChange={(e) => update(idx, 'subtext', e.target.value)} placeholder="Subtext"
              style={{ flex: 3, height: 32, borderRadius: 8, border: '1px solid #E8E0D8', padding: '0 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#1C1408' }} />
          </div>
        ))}
      </div>
    </div>
  );
}
