import type { InputHTMLAttributes, ReactNode } from 'react';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helper?: string;
  leftIcon?: ReactNode;
}

export function Input({ label, error, helper, leftIcon, className = '', id, ...props }: Props) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={inputId} className="text-xs font-semibold text-[var(--color-text)]">
          {label}
        </label>
      )}
      <div className="relative">
        {leftIcon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]">{leftIcon}</span>
        )}
        <input
          id={inputId}
          {...props}
          className={[
            'w-full h-9 rounded-[10px] border border-[var(--color-border)] bg-white px-3 text-sm text-[var(--color-text)]',
            'placeholder:text-[var(--color-text-muted)] outline-none transition-all duration-150',
            'focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20',
            error ? 'border-red-400 focus:border-red-500 focus:ring-red-200' : '',
            leftIcon ? 'pl-9' : '',
            'disabled:bg-[var(--color-bg)] disabled:cursor-not-allowed',
            className,
          ].join(' ')}
        />
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      {helper && !error && <p className="text-xs text-[var(--color-text-muted)]">{helper}</p>}
    </div>
  );
}
