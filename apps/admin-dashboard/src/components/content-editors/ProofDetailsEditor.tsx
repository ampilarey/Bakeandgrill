import type { ContentEditorProps } from './types';

export function ProofDetailsEditor({ label, description, value, onChange }: ContentEditorProps) {
  let items: { value: string; label: string }[] = [];
  try { items = JSON.parse(value || '[]'); } catch { /* empty */ }
  while (items.length < 3) items.push({ value: '', label: '' });

  const update = (idx: number, field: string, v: string) => {
    const next = items.map((item, i) => i === idx ? { ...item, [field]: v } : item);
    onChange(JSON.stringify(next.slice(0, 3)));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 700, color: '#1C1408' }}>{label}</label>
      {description && <p style={{ fontSize: 12, color: '#9C8E7E', margin: 0 }}>{description}</p>}
      <div style={{ background: '#fff', border: '1.5px solid #E8E0D8', borderRadius: 12, overflow: 'hidden' }}>
        {items.slice(0, 3).map((item, idx) => (
          <div key={idx} className="content-editor-row" style={{ display: 'flex', alignItems: 'center', padding: '8px 14px', borderTop: idx === 0 ? 'none' : '1px solid #F0EBE5', gap: 8 }}>
            <input value={item.value} onChange={(e) => update(idx, 'value', e.target.value)} placeholder="500+"
              style={{ width: 90, height: 32, borderRadius: 8, border: '1px solid #E8E0D8', padding: '0 10px', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', outline: 'none', color: '#1C1408', flexShrink: 0 }} />
            <input value={item.label} onChange={(e) => update(idx, 'label', e.target.value)} placeholder="Label"
              style={{ flex: 1, height: 32, borderRadius: 8, border: '1px solid #E8E0D8', padding: '0 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#1C1408' }} />
          </div>
        ))}
      </div>
    </div>
  );
}
