import type { ContentEditorProps } from './types';

export function FooterLinksEditor({ label, description, value, onChange }: ContentEditorProps) {
  let items: { label: string; url: string }[] = [];
  try { items = JSON.parse(value || '[]'); } catch { /* empty */ }
  while (items.length < 2) items.push({ label: '', url: '' });

  const update = (idx: number, field: string, v: string) => {
    const next = items.map((item, i) => i === idx ? { ...item, [field]: v } : item);
    onChange(JSON.stringify(next));
  };

  const addRow = () => onChange(JSON.stringify([...items, { label: '', url: '' }]));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 700, color: '#1C1408' }}>{label}</label>
      {description && <p style={{ fontSize: 12, color: '#9C8E7E', margin: 0 }}>{description}</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((item, idx) => (
          <div key={idx} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input value={item.label} onChange={(e) => update(idx, 'label', e.target.value)} placeholder="Label"
              style={{ flex: 1, minWidth: 100, height: 32, borderRadius: 8, border: '1px solid #E8E0D8', padding: '0 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#1C1408' }} />
            <input value={item.url} onChange={(e) => update(idx, 'url', e.target.value)} placeholder="/privacy"
              style={{ flex: 1, minWidth: 100, height: 32, borderRadius: 8, border: '1px solid #E8E0D8', padding: '0 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#1C1408' }} />
          </div>
        ))}
        <button type="button" onClick={addRow} style={{ alignSelf: 'flex-start', fontSize: 12, fontWeight: 600, color: '#D4813A', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
          + Add link
        </button>
      </div>
    </div>
  );
}
