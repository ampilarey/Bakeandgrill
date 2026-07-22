import type { ContentEditorProps } from './types';
import { RepeaterShell } from './RepeaterShell';

type Row = { icon: string; heading: string; subtext: string };
const empty = (): Row => ({ icon: '', heading: '', subtext: '' });

export function TrustItemsEditor({ label, description, value, onChange }: ContentEditorProps) {
  let items: Row[] = [];
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
        itemLabel="trust item"
        renderItem={(item, _idx, update) => (
          <div className="content-editor-row" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <input className="content-editor-icon" value={item.icon} onChange={(e) => update({ icon: e.target.value })} placeholder="🌅"
              style={{ width: 40, height: 32, borderRadius: 8, border: '1px solid #E8E0D8', textAlign: 'center', fontSize: 18, fontFamily: 'inherit', outline: 'none', flexShrink: 0 }} />
            <input value={item.heading} onChange={(e) => update({ heading: e.target.value })} placeholder="Heading"
              style={{ flex: 2, minWidth: 100, height: 32, borderRadius: 8, border: '1px solid #E8E0D8', padding: '0 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#1C1408' }} />
            <input value={item.subtext} onChange={(e) => update({ subtext: e.target.value })} placeholder="Subtext"
              style={{ flex: 3, minWidth: 120, height: 32, borderRadius: 8, border: '1px solid #E8E0D8', padding: '0 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#1C1408' }} />
          </div>
        )}
      />
    </div>
  );
}
