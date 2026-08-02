import type { ContentEditorProps } from './types';

const WEEK_DAYS = [
  { key: 'mon', label: 'Monday' },
  { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' },
  { key: 'sat', label: 'Saturday' },
  { key: 'sun', label: 'Sunday' },
];

export function BusinessHoursEditor({ label, description, value, onChange }: ContentEditorProps) {
  let parsed: Record<string, string> = {};
  try { parsed = JSON.parse(value || '{}'); } catch { /* keep empty */ }

  const update = (day: string, v: string) => onChange(JSON.stringify({ ...parsed, [day]: v }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text)' }}>{label}</label>
      {description && <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0 }}>{description}</p>}
      <div style={{ background: '#fff', border: '1.5px solid var(--color-border)', borderRadius: 12, overflow: 'hidden' }}>
        {WEEK_DAYS.map(({ key, label: dayLabel }, i) => {
          const val = parsed[key] ?? '';
          const isClosed = val.toLowerCase() === 'closed';
          return (
            <div key={key} style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderTop: i === 0 ? 'none' : '1px solid var(--color-border-light)', gap: 12, background: isClosed ? '#FAFAFA' : '#fff' }}>
              <span style={{ width: 90, fontSize: 13, fontWeight: 600, color: 'var(--color-text)', flexShrink: 0 }}>{dayLabel}</span>
              <input
                value={val}
                onChange={(e) => update(key, e.target.value)}
                placeholder="e.g. 8:00 AM – 8:00 PM or Closed"
                style={{ flex: 1, height: 32, padding: '0 10px', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', color: isClosed ? 'var(--color-text-muted)' : 'var(--color-text)', background: '#fff' }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
