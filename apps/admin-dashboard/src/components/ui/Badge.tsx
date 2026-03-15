import type { ReactNode } from 'react';

type Variant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'brand';

const styles: Record<Variant, string> = {
  success: 'bg-green-50 text-green-700 border-green-200',
  warning: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  danger:  'bg-red-50 text-red-700 border-red-200',
  info:    'bg-blue-50 text-blue-700 border-blue-200',
  neutral: 'bg-[#F8F6F3] text-[#6B5D4F] border-[#E8E0D8]',
  brand:   'bg-orange-50 text-[#D4813A] border-orange-200',
};

interface Props {
  variant?: Variant;
  children: ReactNode;
  className?: string;
}

export function Badge({ variant = 'neutral', children, className = '' }: Props) {
  return (
    <span className={[
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border',
      styles[variant],
      className,
    ].join(' ')}>
      {children}
    </span>
  );
}
