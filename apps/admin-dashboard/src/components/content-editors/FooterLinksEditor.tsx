import type { ContentEditorProps } from './types';
import { RepeaterShell } from './RepeaterShell';

type Row = { label: string; url: string };
const empty = (): Row => ({ label: '', url: '' });

export function FooterLinksEditor({ label, description, value, onChange }: ContentEditorProps) {
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
        itemLabel="link"
        // content-editor-row is what makes a repeater row stack on a phone.
        // This editor was missing it, so a label and a URL shared 340px.
        renderItem={(item, _idx, update) => (
          <div className="content-editor-row" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input value={item.label} onChange={(e) => update({ label: e.target.value })} placeholder="Label"
              style={{ flex: 1, minWidth: 100, height: 32, borderRadius: 8, border: '1px solid var(--color-border)', padding: '0 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none', color: 'var(--color-text)' }} />
            <input value={item.url} onChange={(e) => update({ url: e.target.value })} placeholder="/privacy"
              style={{ flex: 1, minWidth: 100, height: 32, borderRadius: 8, border: '1px solid var(--color-border)', padding: '0 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none', color: 'var(--color-text)' }} />
          </div>
        )}
      />
    </div>
  );
}
