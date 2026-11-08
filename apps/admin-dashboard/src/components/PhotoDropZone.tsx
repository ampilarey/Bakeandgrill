import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import { ImagePlus } from 'lucide-react';

/*
 * Drop a photo onto an upload box (owner, 2026-11-08: "can u add photo drop option?"). Wraps the
 * box: dragging a file over it lights it up with "Drop the photo here", and the dropped file goes
 * to the same handler as the Upload button, so the cropper and every check after it are unchanged.
 * A phone cannot drag files, so the "or drag a photo here" line shows only where there is a mouse
 * (`.photo-drop-hint` in index.css); the drop itself works anywhere.
 */

/** Whether a file matches an `accept` list like "image/*,.heic,video/mp4". */
export function fileMatchesAccept(file: File, accept: string): boolean {
  const name = file.name.toLowerCase();
  const type = (file.type || '').toLowerCase();
  return accept.split(',').map((a) => a.trim().toLowerCase()).filter(Boolean).some((a) => {
    if (a.startsWith('.')) return name.endsWith(a);
    if (a.endsWith('/*')) return type.startsWith(a.slice(0, -1));
    return type === a;
  });
}

function hasFiles(e: DragEvent): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes('Files');
}

export function PhotoDropZone({
  onFile, accept = 'image/*,.heic,.heif', disabled = false, label = 'Drop the photo here', hint = 'or drag a photo here',
  onReject, testId = 'photo-drop-zone', children,
}: {
  onFile: (file: File) => void;
  /** Which files it takes; anything else is refused with a message. */
  accept?: string;
  disabled?: boolean;
  label?: string;
  /** The line under the box on a computer; empty for none. */
  hint?: string;
  onReject?: (message: string) => void;
  testId?: string;
  children: ReactNode;
}) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);

  const onDragEnter = (e: DragEvent<HTMLDivElement>) => {
    if (disabled || !hasFiles(e)) return;
    e.preventDefault();
    depth.current += 1;
    setOver(true);
  };
  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (disabled || !hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };
  const onDragLeave = () => {
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setOver(false);
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth.current = 0;
    setOver(false);
    if (disabled) return;
    const files = Array.from(e.dataTransfer.files ?? []);
    const file = files.find((f) => fileMatchesAccept(f, accept));
    if (file) onFile(file);
    else if (files.length) onReject?.(`That file is not a photo this box takes (${files[0].name}).`);
  };

  return (
    // A place to drop files only: the Upload button inside stays the way in for keyboards and phones.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      data-testid={testId}
      data-drop-over={over ? 'true' : undefined}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={{
        position: 'relative', borderRadius: 10,
        outline: over ? '2px dashed var(--color-primary)' : 'none', outlineOffset: 4,
      }}
    >
      {children}
      {hint && !disabled && (
        <span className="photo-drop-hint" style={{ alignItems: 'center', gap: 6, marginTop: 6, fontSize: 11, color: 'var(--color-text-muted)' }}>
          <ImagePlus size={12} aria-hidden /> {hint}
        </span>
      )}
      {over && (
        <div
          aria-hidden
          style={{
            position: 'absolute', inset: 0, borderRadius: 10, pointerEvents: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            background: 'color-mix(in srgb, var(--color-tone-rust-bg) 92%, transparent)',
            color: 'var(--color-primary)', fontSize: 14, fontWeight: 700, zIndex: 2,
          }}
        >
          <ImagePlus size={18} /> {label}
        </div>
      )}
    </div>
  );
}
