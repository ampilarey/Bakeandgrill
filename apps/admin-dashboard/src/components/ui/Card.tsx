import type { CSSProperties, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  header?: ReactNode;
  footer?: ReactNode;
  style?: CSSProperties;
}

const paddingStyles = { none: '', sm: 'p-4', md: 'p-5', lg: 'p-6' };

export function Card({ children, className = '', padding = 'md', header, footer, style }: Props) {
  return (
    <div style={style} className={['bg-white border border-[#E8E0D8] rounded-[14px] shadow-[0_1px_2px_rgba(28,20,8,0.05)]', className].join(' ')}>
      {header && (
        <div className="px-5 py-4 border-b border-[#E8E0D8]">{header}</div>
      )}
      <div className={paddingStyles[padding]}>{children}</div>
      {footer && (
        <div className="px-5 py-4 border-t border-[#E8E0D8] bg-[#F8F6F3] rounded-b-[14px]">{footer}</div>
      )}
    </div>
  );
}
