import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
type Size = 'sm' | 'md' | 'lg';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
}

const variantStyles: Record<Variant, string> = {
  primary:   'bg-[#D4813A] hover:bg-[#B5692E] text-white shadow-sm',
  secondary: 'bg-[#F8F6F3] hover:bg-[#EDE4D4] text-[#1C1408] border border-[#E8E0D8]',
  danger:    'bg-red-500 hover:bg-red-600 text-white shadow-sm',
  ghost:     'bg-transparent hover:bg-[#F8F6F3] text-[#6B5D4F]',
  outline:   'bg-transparent border border-[#D4813A] text-[#D4813A] hover:bg-[#FDF8F4]',
};

const sizeStyles: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
  lg: 'h-11 px-6 text-base gap-2',
};

export function Button({ variant = 'primary', size = 'md', loading, icon, children, className = '', disabled, ...props }: Props) {
  const isDisabled = disabled || loading;
  return (
    <button
      {...props}
      disabled={isDisabled}
      className={[
        'inline-flex items-center justify-center font-semibold rounded-[10px] transition-all duration-150 cursor-pointer border-0',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4813A] focus-visible:ring-offset-1',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variantStyles[variant],
        sizeStyles[size],
        className,
      ].join(' ')}
    >
      {loading ? (
        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : icon}
      {children}
    </button>
  );
}
