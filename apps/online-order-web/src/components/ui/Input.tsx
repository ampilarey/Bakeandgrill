import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

const BASE_INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  height: 'var(--input-height)',
  padding: '0 0.875rem',
  border: '1.5px solid var(--color-border)',
  borderRadius: 'var(--radius-lg)',
  fontSize: '0.9rem',
  outline: 'none',
  fontFamily: 'inherit',
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  boxSizing: 'border-box',
};

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, id, ...props }: InputProps) {
  const inputId = id ?? (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
      {label && (
        <label htmlFor={inputId} style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-dark)' }}>
          {label}
        </label>
      )}
      <input
        id={inputId}
        style={{
          ...BASE_INPUT_STYLE,
          borderColor: error ? 'var(--color-error)' : 'var(--color-border)',
        }}
        aria-invalid={!!error}
        aria-describedby={error && inputId ? `${inputId}-error` : undefined}
        {...props}
      />
      {error && (
        <span id={inputId ? `${inputId}-error` : undefined} style={{ fontSize: '0.8rem', color: 'var(--color-error)' }}>
          {error}
        </span>
      )}
    </div>
  );
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export function Textarea({ label, error, id, ...props }: TextareaProps) {
  const inputId = id ?? (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
      {label && (
        <label htmlFor={inputId} style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-dark)' }}>
          {label}
        </label>
      )}
      <textarea
        id={inputId}
        style={{
          width: '100%',
          padding: '0.75rem 0.875rem',
          border: `1.5px solid ${error ? 'var(--color-error)' : 'var(--color-border)'}`,
          borderRadius: 'var(--radius-lg)',
          fontSize: '0.9rem',
          outline: 'none',
          fontFamily: 'inherit',
          background: 'var(--color-surface)',
          color: 'var(--color-text)',
          resize: 'vertical',
          boxSizing: 'border-box',
        }}
        aria-invalid={!!error}
        aria-describedby={error && inputId ? `${inputId}-error` : undefined}
        {...props}
      />
      {error && (
        <span id={inputId ? `${inputId}-error` : undefined} style={{ fontSize: '0.8rem', color: 'var(--color-error)' }}>
          {error}
        </span>
      )}
    </div>
  );
}
