import { useState } from 'react';
import { Check, Pencil, X } from 'lucide-react';

/*
 * Rename a saved label in place (Labels audit, 2026-10-11). The old way was
 * a browser prompt box, which a phone shows as a bare system dialog with
 * the name cut off. Now the name turns into a box with Save and Cancel.
 */
export function InlineRename({ name, onSave, className = '', buttonClassName = '' }: {
  name: string;
  onSave: (name: string) => Promise<void> | void;
  className?: string;
  /** The name as it sits in the row; a pencil follows it. */
  buttonClassName?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);

  const start = () => { setValue(name); setEditing(true); };
  const save = async () => {
    const v = value.trim();
    if (!v || v === name) { setEditing(false); return; }
    setBusy(true);
    try { await onSave(v); setEditing(false); } finally { setBusy(false); }
  };

  if (!editing) {
    return (
      <button type="button" onClick={start} className={`inline-flex items-center gap-1.5 min-h-[32px] text-left hover:underline ${buttonClassName}`} aria-label={`Rename ${name}`}>
        <span className="min-w-0">{name}</span>
        <Pencil size={13} className="shrink-0 text-[var(--color-text-muted)]" aria-hidden />
      </button>
    );
  }
  return (
    <form className={`flex items-center gap-1.5 ${className}`} onSubmit={(e) => { e.preventDefault(); void save(); }} data-testid="inline-rename">
      <input
        autoFocus
        value={value}
        maxLength={120}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false); }}
        className="h-10 min-h-[44px] px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-text)] flex-1 min-w-0"
        aria-label="New name"
      />
      <button type="submit" disabled={busy} className="w-10 h-10 min-h-[44px] inline-flex items-center justify-center rounded-lg bg-[var(--color-primary)] text-[var(--color-on-primary)] disabled:opacity-50" aria-label="Save name"><Check size={16} /></button>
      <button type="button" onClick={() => setEditing(false)} className="w-10 h-10 min-h-[44px] inline-flex items-center justify-center rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)]" aria-label="Cancel rename"><X size={16} /></button>
    </form>
  );
}
