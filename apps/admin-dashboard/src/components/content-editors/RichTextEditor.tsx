import { useEffect, useRef } from 'react';
import type { ContentEditorProps } from './types';

/** Lightweight WYSIWYG — outputs HTML sanitized server-side by ContentSanitizer. */
export function RichTextEditor({ label, description, value, onChange }: ContentEditorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const lastExternal = useRef<string | null>(null);

  // Sync external value only when it changes from outside (locale switch / load).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const next = value || '';
    if (lastExternal.current === next) return;
    if (document.activeElement === el) return;
    el.innerHTML = next;
    lastExternal.current = next;
  }, [value]);

  const emit = () => {
    const html = ref.current?.innerHTML || '';
    lastExternal.current = html;
    onChange(html);
  };

  const exec = (cmd: string, arg?: string) => {
    document.execCommand(cmd, false, arg);
    emit();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label ? <label style={{ fontSize: 12, fontWeight: 700, color: '#1C1408' }}>{label}</label> : null}
      {description ? <p style={{ margin: 0, fontSize: 12, color: '#9C8E7E' }}>{description}</p> : null}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="toolbar" aria-label="Formatting">
        {[
          ['bold', 'Bold'],
          ['italic', 'Italic'],
          ['insertUnorderedList', 'List'],
          ['createLink', 'Link'],
        ].map(([cmd, name]) => (
          <button
            key={cmd}
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              if (cmd === 'createLink') {
                const url = window.prompt('Link URL');
                if (url) exec(cmd, url);
              } else {
                exec(cmd);
              }
            }}
            style={{
              height: 32, padding: '0 10px', borderRadius: 8, border: '1px solid #E8E0D8',
              background: '#F8F6F3', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {name}
          </button>
        ))}
      </div>
      <div
        ref={ref}
        contentEditable
        role="textbox"
        aria-multiline="true"
        data-testid="rich-text-editor"
        suppressContentEditableWarning
        onInput={emit}
        style={{
          minHeight: 88, borderRadius: 10, border: '1px solid #E8E0D8', padding: 12,
          fontSize: 14, fontFamily: 'inherit', background: '#fff', color: '#1C1408',
        }}
      />
    </div>
  );
}
