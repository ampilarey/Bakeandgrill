/**
 * Shared UI primitives used by admin page components.
 */
import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';

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

// ─── Modal ────────────────────────────────────────────────────────────────────
const FOCUSABLE_SEL = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function Modal({
  title, onClose, children, maxWidth = 440,
}: { title: string; onClose: () => void; children: ReactNode; maxWidth?: number }) {
  const uid = useId();
  const titleId = `modal-title-${uid}`;
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const els = () => Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SEL));
    els()[0]?.focus();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab') return;
      const focusable = els();
      if (!focusable.length) { e.preventDefault(); return; }
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last.focus(); } }
      else { if (document.activeElement === last) { e.preventDefault(); first.focus(); } }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(28,20,8,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div ref={panelRef} style={{
        background: '#fff', borderRadius: 16, padding: 28,
        width: '100%', maxWidth,
        boxShadow: '0 20px 60px rgba(28,20,8,0.18)',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 id={titleId} style={{ fontWeight: 800, fontSize: 17, color: '#1C1408', margin: 0 }}>{title}</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: '#F8F6F3', border: 'none', borderRadius: 8,
              width: 32, height: 32, cursor: 'pointer', color: '#6B5D4F',
              fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── ModalActions ─────────────────────────────────────────────────────────────
export function ModalActions({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24, paddingTop: 16, borderTop: '1px solid #E8E0D8' }}>
      {children}
    </div>
  );
}

// ─── StatCard ─────────────────────────────────────────────────────────────────
export function StatCard({
  label, value, sub, accent = '#D4813A',
}: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #E8E0D8',
      borderRadius: 14,
      padding: '20px 24px',
      borderLeft: `4px solid ${accent}`,
      boxShadow: '0 1px 2px rgba(28,20,8,0.05)',
      minWidth: 0,
    }}>
      <p style={{ fontSize: 11, color: '#9C8E7E', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8, margin: '0 0 8px' }}>{label}</p>
      <p style={{ fontSize: 22, fontWeight: 800, color: '#1C1408', margin: '0 0 4px' }}>{value}</p>
      {sub && <p style={{ fontSize: 12, color: '#9C8E7E', margin: 0 }}>{sub}</p>}
    </div>
  );
}

// ─── TableCard ────────────────────────────────────────────────────────────────
export function TableCard({ children }: { children: ReactNode }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #E8E0D8',
      borderRadius: 14, overflow: 'hidden',
      boxShadow: '0 1px 2px rgba(28,20,8,0.05)',
    }}>
      <div style={{ overflowX: 'auto' }}>
        {children}
      </div>
    </div>
  );
}

// ─── Th / Td helpers ─────────────────────────────────────────────────────────
export const TH: React.CSSProperties = {
  padding: '11px 16px', textAlign: 'left', fontWeight: 700,
  color: '#9C8E7E', fontSize: 11, textTransform: 'uppercase',
  background: '#F8F6F3', borderBottom: '1px solid #E8E0D8',
  whiteSpace: 'nowrap',
};
export const TD: React.CSSProperties = {
  padding: '12px 16px', fontSize: 14, color: '#1C1408',
  borderBottom: '1px solid #F0EBE5', verticalAlign: 'middle',
};

// ─── DateInput ────────────────────────────────────────────────────────────────
export function DateInput({ value, onChange, label, max }: {
  value: string; onChange: (v: string) => void; label?: string; max?: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {label && <label style={{ fontSize: 11, fontWeight: 700, color: '#6B5D4F', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</label>}
      <input
        type="date"
        value={value}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        style={{
          height: 36, padding: '0 10px',
          border: '1.5px solid #E8E0D8', borderRadius: 10,
          fontSize: 13, fontFamily: 'inherit',
          background: '#fff', color: '#1C1408', outline: 'none',
        }}
      />
    </div>
  );
}

// ─── SectionLabel ─────────────────────────────────────────────────────────────
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 style={{ fontSize: 13, fontWeight: 700, color: '#9C8E7E', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 10px' }}>
      {children}
    </h2>
  );
}

// ─── Pagination ───────────────────────────────────────────────────────────────
export function Pagination({ page, totalPages, onChange }: {
  page: number; totalPages: number; onChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, padding: '16px 0' }}>
      <Btn small variant="secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>← Prev</Btn>
      <span style={{ fontSize: 13, color: '#6B5D4F' }}>Page {page} of {totalPages}</span>
      <Btn small variant="secondary" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>Next →</Btn>
    </div>
  );
}

// ─── statColor ────────────────────────────────────────────────────────────────
export function statColor(status: string): string {
  const map: Record<string, string> = {
    // Order statuses
    payment_pending:  'orange',
    pending:          'yellow',
    confirmed:        'blue',
    preparing:        'blue',
    ready:            'teal',
    delivering:       'teal',
    out_for_delivery: 'blue',
    picked_up:        'yellow',
    on_the_way:       'orange',
    delivered:        'green',
    completed:        'green',
    cancelled:        'red',
    voided:           'red',
    refunded:         'orange',
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

// ─── ConfirmDialog ────────────────────────────────────────────────────────────
/**
 * Replacement for native window.confirm().
 * Usage:
 *   const [dialog, setDialog] = useConfirmDialog();
 *   <ConfirmDialog {...dialog} />
 *   // trigger: setDialog({ message: '...', onConfirm: () => doThing() })
 */
export interface ConfirmDialogState {
  open: boolean;
  message: string;
  title?: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
}

export function useConfirmDialog() {
  const [state, setState] = useState<ConfirmDialogState>({
    open: false, message: '', onConfirm: () => {},
  });

  const ask = (opts: Omit<ConfirmDialogState, 'open'>) => setState({ ...opts, open: true });
  const close = () => setState((s) => ({ ...s, open: false }));

  return { state, ask, close };
}

export function ConfirmDialog({ state, close }: { state: ConfirmDialogState; close: () => void }) {
  const uid = useId();
  const titleId = `cdlg-title-${uid}`;
  if (!state.open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.45)',
      }}
      onClick={close}
    >
      <div
        style={{
          background: '#fff', borderRadius: 14, padding: '1.75rem',
          maxWidth: 400, width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id={titleId} style={{ fontWeight: 700, fontSize: 17, marginBottom: 8 }}>
          {state.title ?? 'Confirm'}
        </h3>
        <p style={{ fontSize: 14, color: '#6B5D4F', marginBottom: 24, lineHeight: 1.5 }}>
          {state.message}
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Btn variant="secondary" onClick={close}>Cancel</Btn>
          <Btn
            variant={state.danger ? 'danger' : 'primary'}
            onClick={() => { state.onConfirm(); close(); }}
          >
            {state.confirmLabel ?? 'Confirm'}
          </Btn>
        </div>
      </div>
    </div>
  );
}
