import { Copy, GripVertical, Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { useRef, useState, type CSSProperties, type ReactNode } from 'react';

type Props<T> = {
  items: T[];
  onChange: (next: T[]) => void;
  /** Empty template when adding a row */
  createItem: () => T;
  renderItem: (item: T, index: number, update: (patch: Partial<T>) => void) => ReactNode;
  itemLabel?: string;
  minItems?: number;
};

/**
 * Unlimited repeater with HTML5 drag-and-drop + keyboard move / duplicate / remove.
 * No hard caps — callers must not reintroduce .slice(0, N).
 */
export function RepeaterShell<T extends Record<string, unknown>>({
  items,
  onChange,
  createItem,
  renderItem,
  itemLabel = 'item',
  minItems = 0,
}: Props<T>) {
  const dragFrom = useRef<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const move = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return;
    const next = items.slice();
    const [row] = next.splice(from, 1);
    next.splice(to, 0, row);
    onChange(next);
  };

  const updateAt = (idx: number, patch: Partial<T>) => {
    onChange(items.map((item, i) => (i === idx ? { ...item, ...patch } : item)));
  };

  const removeAt = (idx: number) => {
    if (items.length <= minItems) return;
    onChange(items.filter((_, i) => i !== idx));
  };

  const duplicateAt = (idx: number) => {
    const clone = { ...items[idx] };
    const next = items.slice();
    next.splice(idx + 1, 0, clone);
    onChange(next);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map((item, idx) => (
        <div
          key={idx}
          draggable
          onDragStart={() => { dragFrom.current = idx; }}
          onDragEnd={() => { dragFrom.current = null; setOverIdx(null); }}
          onDragOver={(e) => { e.preventDefault(); setOverIdx(idx); }}
          onDrop={(e) => {
            e.preventDefault();
            if (dragFrom.current != null) move(dragFrom.current, idx);
            dragFrom.current = null;
            setOverIdx(null);
          }}
          data-testid="repeater-row"
          style={{
            background: '#fff',
            border: overIdx === idx ? '1.5px solid var(--color-primary)' : '1.5px solid var(--color-border)',
            borderRadius: 12,
            padding: 14,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            opacity: dragFrom.current === idx ? 0.7 : 1,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <span
              aria-hidden
              title="Drag to reorder"
              style={{ cursor: 'grab', color: 'var(--color-text-muted)', display: 'inline-flex', padding: 2 }}
            >
              <GripVertical size={16} />
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', flex: 1 }}>
              {itemLabel} {idx + 1}
            </span>
            <button
              type="button"
              aria-label={`Move ${itemLabel} up`}
              disabled={idx === 0}
              onClick={() => move(idx, idx - 1)}
              style={iconBtnStyle(idx === 0)}
            >
              <ChevronUp size={14} />
            </button>
            <button
              type="button"
              aria-label={`Move ${itemLabel} down`}
              disabled={idx >= items.length - 1}
              onClick={() => move(idx, idx + 1)}
              style={iconBtnStyle(idx >= items.length - 1)}
            >
              <ChevronDown size={14} />
            </button>
            <button
              type="button"
              aria-label={`Duplicate ${itemLabel}`}
              onClick={() => duplicateAt(idx)}
              style={iconBtnStyle(false)}
            >
              <Copy size={14} />
            </button>
            <button
              type="button"
              aria-label={`Remove ${itemLabel}`}
              disabled={items.length <= minItems}
              onClick={() => removeAt(idx)}
              style={iconBtnStyle(items.length <= minItems)}
            >
              <Trash2 size={14} />
            </button>
          </div>
          {renderItem(item, idx, (patch) => updateAt(idx, patch))}
        </div>
      ))}
      <button
        type="button"
        data-testid="repeater-add"
        onClick={() => onChange([...items, createItem()])}
        style={{
          alignSelf: 'flex-start', height: 36, padding: '0 12px', borderRadius: 10,
          border: '1px dashed var(--color-primary)', background: '#FFF7ED', color: 'var(--color-primary)',
          fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}
      >
        <Plus size={14} /> Add {itemLabel}
      </button>
    </div>
  );
}

function iconBtnStyle(disabled: boolean): CSSProperties {
  return {
    height: 28, width: 28, borderRadius: 8, border: '1px solid var(--color-border)',
    background: '#fff', cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.4 : 1, display: 'inline-flex', alignItems: 'center',
    justifyContent: 'center', color: 'var(--color-text-secondary)', padding: 0,
  };
}
