import type { ContentEditorProps } from './types';
import { RepeaterShell } from './RepeaterShell';

type Row = { value: string; label: string };
const empty = (): Row => ({ value: '', label: '' });

export function ProofDetailsEditor({ label, description, value, onChange }: ContentEditorProps) {
  let items: Row[] = [];
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
        itemLabel="stat"
        renderItem={(item, _idx, update) => (
          <div className="content-editor-row" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <input value={item.value} onChange={(e) => update({ value: e.target.value })} placeholder="500+"
              style={{ width: 90, height: 32, borderRadius: 8, border: '1px solid var(--color-border)', padding: '0 10px', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', outline: 'none', color: 'var(--color-text)', flexShrink: 0 }} />
            <input value={item.label} onChange={(e) => update({ label: e.target.value })} placeholder="Label"
              style={{ flex: 1, minWidth: 120, height: 32, borderRadius: 8, border: '1px solid var(--color-border)', padding: '0 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none', color: 'var(--color-text)' }} />
          </div>
        )}
      />
    </div>
  );
}
