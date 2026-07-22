import type { ContentEditorProps } from './types';

export function PreorderStepsEditor({ label, description, value, onChange }: ContentEditorProps) {
  let items: { text: string }[] = [];
  try { items = JSON.parse(value || '[]'); } catch { /* empty */ }
  while (items.length < 3) items.push({ text: '' });

  const update = (idx: number, v: string) => {
    const next = items.map((item, i) => i === idx ? { text: v } : item);
    onChange(JSON.stringify(next.slice(0, 3)));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 700, color: '#1C1408' }}>{label}</label>
      {description && <p style={{ fontSize: 12, color: '#9C8E7E', margin: 0 }}>{description}</p>}
      <div style={{ background: '#fff', border: '1.5px solid #E8E0D8', borderRadius: 12, overflow: 'hidden' }}>
        {items.slice(0, 3).map((item, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', padding: '8px 14px', borderTop: idx === 0 ? 'none' : '1px solid #F0EBE5', gap: 8 }}>
            <span style={{ width: 20, fontSize: 12, fontWeight: 700, color: '#9C8E7E', flexShrink: 0 }}>{idx + 1}.</span>
            <input value={item.text} onChange={(e) => update(idx, e.target.value)} placeholder="Step description"
              style={{ flex: 1, height: 32, borderRadius: 8, border: '1px solid #E8E0D8', padding: '0 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#1C1408' }} />
          </div>
        ))}
      </div>
    </div>
  );
}
