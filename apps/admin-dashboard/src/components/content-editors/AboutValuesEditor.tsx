import type { ContentEditorProps } from './types';
import { RepeaterShell } from './RepeaterShell';

type Row = { initial: string; title: string; description: string };
const empty = (): Row => ({ initial: '', title: '', description: '' });

export function AboutValuesEditor({ label, description, value, onChange }: ContentEditorProps) {
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
        itemLabel="value"
        renderItem={(item, _idx, update) => (
          <>
            <div className="content-editor-row" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input className="content-editor-icon" value={item.initial} onChange={(e) => update({ initial: e.target.value })} placeholder="F" title="Initial letter"
                style={{ width: 40, height: 32, borderRadius: 8, border: '1px solid var(--color-border)', textAlign: 'center', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', outline: 'none', flexShrink: 0 }} />
              <input value={item.title} onChange={(e) => update({ title: e.target.value })} placeholder="Title"
                style={{ flex: 1, minWidth: 120, height: 32, borderRadius: 8, border: '1px solid var(--color-border)', padding: '0 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none', color: 'var(--color-text)' }} />
            </div>
            <input value={item.description} onChange={(e) => update({ description: e.target.value })} placeholder="Description"
              style={{ width: '100%', height: 32, borderRadius: 8, border: '1px solid var(--color-border)', padding: '0 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none', color: 'var(--color-text)', boxSizing: 'border-box' }} />
          </>
        )}
      />
    </div>
  );
}
