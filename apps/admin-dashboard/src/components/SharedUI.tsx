/**
 * Shared UI primitives used by admin page components.
 * These were previously inlined in Layout.tsx.
 */
import { type ButtonHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';

// ─── Spinner ──────────────────────────────────────────────────────────────────
export function Spinner({ size = 24 }: { size?: number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        style={{ animation: 'spin 0.8s linear infinite' }}
      >
        <circle cx="12" cy="12" r="10" stroke="#E8E0D8" strokeWidth="3" />
        <path d="M12 2a10 10 0 0110 10" stroke="#D4813A" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </div>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────
export function Card({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #E8E0D8',
      borderRadius: 14,
      padding: '1.25rem',
      boxShadow: '0 1px 2px rgba(28,20,8,0.05)',
      ...style,
    }}>
      {children}
    </div>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────
export function Badge({
  label,
  color = 'gray',
  children,
}: { label?: string; color?: string; children?: ReactNode }) {
  const colorMap: Record<string, { bg: string; text: string; border: string }> = {
    green:  { bg: '#dcfce7', text: '#15803d', border: '#86efac' },
    red:    { bg: '#fee2e2', text: '#b91c1c', border: '#fca5a5' },
    yellow: { bg: '#fef9c3', text: '#a16207', border: '#fde047' },
    blue:   { bg: '#dbeafe', text: '#1d4ed8', border: '#93c5fd' },
    purple: { bg: '#f3e8ff', text: '#7e22ce', border: '#d8b4fe' },
    teal:   { bg: '#ccfbf1', text: '#0f766e', border: '#5eead4' },
    gray:   { bg: '#F8F6F3', text: '#6B5D4F', border: '#E8E0D8' },
    orange: { bg: '#fff7ed', text: '#c2410c', border: '#fed7aa' },
  };
  const s = colorMap[color] ?? colorMap.gray;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '0.15rem 0.5rem',
      borderRadius: 9999,
      fontSize: '0.72rem', fontWeight: 700,
      background: s.bg, color: s.text, border: `1px solid ${s.border}`,
      textTransform: 'capitalize' as const,
    }}>
      {label ?? children}
    </span>
  );
}

// ─── ErrorMsg ─────────────────────────────────────────────────────────────────
export function ErrorMsg({ message }: { message: string }) {
  return (
    <div style={{
      background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 10,
      padding: '0.75rem 1rem', color: '#b91c1c', fontSize: '0.875rem', marginBottom: '1rem',
    }}>
      {message}
    </div>
  );
}

// ─── EmptyState ───────────────────────────────────────────────────────────────
export function EmptyState({ message, children }: { message?: string; children?: ReactNode }) {
  return (
    <div style={{
      textAlign: 'center', padding: '3rem 1.5rem',
      color: '#9C8E7E', fontSize: '0.9375rem',
    }}>
      {message ?? children ?? 'Nothing to show.'}
    </div>
  );
}

// ─── PageHeader ───────────────────────────────────────────────────────────────
export function PageHeader({
  title, subtitle, action, children,
}: { title: string; subtitle?: string; action?: ReactNode; children?: ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.5rem',
    }}>
      <div>
        <h1 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#1C1408', margin: 0 }}>{title}</h1>
        {subtitle && <p style={{ fontSize: '0.875rem', color: '#9C8E7E', margin: '0.25rem 0 0' }}>{subtitle}</p>}
        {children}
      </div>
      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
    </div>
  );
}

// ─── Btn ──────────────────────────────────────────────────────────────────────
type BtnVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

const BTN_STYLES: Record<BtnVariant, React.CSSProperties> = {
  primary:   { background: '#D4813A', color: '#fff', border: 'none' },
  secondary: { background: '#F8F6F3', color: '#1C1408', border: '1px solid #E8E0D8' },
  danger:    { background: '#ef4444', color: '#fff', border: 'none' },
  ghost:     { background: 'transparent', color: '#6B5D4F', border: 'none' },
};

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant;
  small?: boolean;
  children: ReactNode;
}

export function Btn({ variant = 'primary', small, children, style, ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
        height: small ? '2rem' : '2.25rem',
        padding: small ? '0 0.75rem' : '0 1rem',
        borderRadius: 10, fontWeight: 600,
        fontSize: small ? '0.8125rem' : '0.875rem',
        cursor: rest.disabled ? 'not-allowed' : 'pointer',
        opacity: rest.disabled ? 0.5 : 1,
        transition: 'all 0.15s',
        fontFamily: 'inherit',
        ...BTN_STYLES[variant],
        ...style,
      }}
    >
      {children}
    </button>
  );
}

// ─── Input ────────────────────────────────────────────────────────────────────
interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  label?: string;
  onChange?: (value: string) => void;
}

export function Input({ label, id, style, onChange, ...rest }: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      {label && <label htmlFor={inputId} style={{ fontSize: '0.75rem', fontWeight: 600, color: '#1C1408' }}>{label}</label>}
      <input
        id={inputId}
        {...rest}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        style={{
          height: 36, padding: '0 0.75rem',
          border: '1.5px solid #E8E0D8', borderRadius: 10,
          fontSize: '0.9rem', fontFamily: 'inherit',
          background: '#fff', color: '#1C1408',
          outline: 'none',
          ...style,
        }}
      />
    </div>
  );
}

// ─── Select ───────────────────────────────────────────────────────────────────
interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  options: { value: string; label: string }[];
  value: string;
  onChange: (val: string) => void;
  label?: string;
}

export function Select({ options, value, onChange, label, style, ...rest }: SelectProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      {label && <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#1C1408' }}>{label}</label>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        {...rest}
        style={{
          height: 36, padding: '0 0.75rem',
          border: '1.5px solid #E8E0D8', borderRadius: 10,
          fontSize: '0.875rem', fontFamily: 'inherit',
          background: '#fff', color: '#1C1408',
          cursor: 'pointer', outline: 'none',
          ...style,
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

// ─── statColor ────────────────────────────────────────────────────────────────
export function statColor(status: string): string {
  const map: Record<string, string> = {
    // Order statuses
    pending:    'yellow',
    confirmed:  'blue',
    preparing:  'blue',
    ready:      'teal',
    delivering: 'teal',
    delivered:  'green',
    completed:  'green',
    cancelled:  'red',
    voided:     'red',
    refunded:   'orange',
    // Invoice statuses
    paid:       'green',
    unpaid:     'yellow',
    overdue:    'red',
    draft:      'gray',
    // Generic
    active:     'green',
    inactive:   'gray',
    open:       'green',
    closed:     'red',
  };
  return map[status?.toLowerCase()] ?? 'gray';
}
