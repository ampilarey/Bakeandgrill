import { useState } from 'react';

type Props = {
  value: string[];
  onChange: (tags: string[]) => void;
  presets: readonly string[];
  placeholder?: string;
  max?: number;
};

function slugTag(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Toggle chips for dietary/allergen tags with optional custom add. */
export function TagChipField({
  value,
  onChange,
  presets,
  placeholder = 'Add custom…',
  max = 12,
}: Props) {
  const [custom, setCustom] = useState('');
  const selected = new Set(value.map((t) => t.toLowerCase()));

  const toggle = (tag: string) => {
    const key = tag.toLowerCase();
    if (selected.has(key)) {
      onChange(value.filter((t) => t.toLowerCase() !== key));
      return;
    }
    if (value.length >= max) return;
    onChange([...value, tag]);
  };

  const addCustom = () => {
    const tag = slugTag(custom);
    if (!tag) return;
    if (!selected.has(tag) && value.length < max) onChange([...value, tag]);
    setCustom('');
  };

  const extras = value.filter((t) => !presets.some((p) => p.toLowerCase() === t.toLowerCase()));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {presets.map((tag) => {
          const on = selected.has(tag.toLowerCase());
          return (
            <button
              key={tag}
              type="button"
              onClick={() => toggle(tag)}
              style={{
                minHeight: 36,
                padding: '0 12px',
                borderRadius: 999,
                border: on ? '2px solid var(--color-primary)' : '1.5px solid var(--color-border)',
                background: on ? '#FEF3E8' : 'var(--color-surface)',
                color: on ? '#B86820' : 'var(--color-text-secondary)',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {tag.replace(/-/g, ' ')}
            </button>
          );
        })}
        {extras.map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => toggle(tag)}
            style={{
              minHeight: 36,
              padding: '0 12px',
              borderRadius: 999,
              border: '2px solid var(--color-primary)',
              background: '#FEF3E8',
              color: '#B86820',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {tag.replace(/-/g, ' ')} ×
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addCustom();
            }
          }}
          placeholder={placeholder}
          style={{
            flex: 1,
            minHeight: 40,
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            padding: '0 10px',
            fontSize: 13,
          }}
        />
        <button
          type="button"
          onClick={addCustom}
          disabled={!custom.trim() || value.length >= max}
          style={{
            minHeight: 40,
            padding: '0 14px',
            borderRadius: 8,
            border: '1px solid var(--color-border)',
            background: 'var(--color-bg)',
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
            color: 'var(--color-text-secondary)',
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}

export function parseTagsCsv(raw: string): string[] {
  return raw
    .split(',')
    .map((t) => slugTag(t))
    .filter(Boolean)
    .slice(0, 12);
}

export function tagsToCsv(tags: string[]): string {
  return tags.join(', ');
}
