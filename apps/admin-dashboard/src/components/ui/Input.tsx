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
        <label htmlFor={inputId} className="text-xs font-semibold text-[#1C1408]">
          {label}
        </label>
      )}
      <div className="relative">
        {leftIcon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9C8E7E]">{leftIcon}</span>
        )}
        <input
          id={inputId}
          {...props}
          className={[
            'w-full h-9 rounded-[10px] border border-[#E8E0D8] bg-white px-3 text-sm text-[#1C1408]',
            'placeholder:text-[#9C8E7E] outline-none transition-all duration-150',
            'focus:border-[#D4813A] focus:ring-2 focus:ring-[#D4813A]/20',
            error ? 'border-red-400 focus:border-red-500 focus:ring-red-200' : '',
            leftIcon ? 'pl-9' : '',
            'disabled:bg-[#F8F6F3] disabled:cursor-not-allowed',
            className,
          ].join(' ')}
        />
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      {helper && !error && <p className="text-xs text-[#9C8E7E]">{helper}</p>}
    </div>
  );
}
