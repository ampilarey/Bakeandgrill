import type { ContentEditorProps } from './types';
import { RepeaterShell } from './RepeaterShell';

type Row = { text: string };
const empty = (): Row => ({ text: '' });

export function PreorderStepsEditor({ label, description, value, onChange }: ContentEditorProps) {
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
        itemLabel="step"
        renderItem={(item, idx, update) => (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 20, fontSize: 12, fontWeight: 700, color: 'var(--color-text-muted)', flexShrink: 0 }}>{idx + 1}.</span>
            <input value={item.text} onChange={(e) => update({ text: e.target.value })} placeholder="Step description"
              style={{ flex: 1, height: 32, borderRadius: 8, border: '1px solid var(--color-border)', padding: '0 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none', color: 'var(--color-text)' }} />
          </div>
        )}
      />
    </div>
  );
}
