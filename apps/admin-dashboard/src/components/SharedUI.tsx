/**
 * Shared UI primitives used by admin page components.
 */
import {
  Children, isValidElement, useEffect, useId, useRef, useState,
  type ButtonHTMLAttributes, type ReactElement, type ReactNode, type SelectHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';

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
        <circle cx="12" cy="12" r="10" stroke="var(--color-border)" strokeWidth="3" />
        <path d="M12 2a10 10 0 0110 10" stroke="var(--color-primary)" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </div>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────
export function Card({
  children, style, className, ...rest
}: { children: ReactNode; style?: React.CSSProperties; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={className}
      {...rest}
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 14,
        padding: '1.25rem',
        boxShadow: '0 1px 2px rgba(28,20,8,0.05)',
        ...style,
      }}
    >
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
    green:  { bg: 'var(--color-success-bg)', text: 'var(--color-success-strong)', border: '#86efac' },
    red:    { bg: 'var(--color-danger-bg)', text: 'var(--color-danger-strong)', border: '#fca5a5' },
    yellow: { bg: '#fef9c3', text: '#a16207', border: '#fde047' },
    blue:   { bg: '#dbeafe', text: '#1d4ed8', border: '#93c5fd' },
    purple: { bg: '#f3e8ff', text: '#7e22ce', border: '#d8b4fe' },
    teal:   { bg: '#ccfbf1', text: '#0f766e', border: '#5eead4' },
    gray:   { bg: 'var(--color-bg)', text: 'var(--color-text-secondary)', border: 'var(--color-border)' },
    orange: { bg: 'var(--color-warning-bg)', text: '#c2410c', border: '#fed7aa' },
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
      background: 'var(--color-danger-bg)', border: '1px solid #fca5a5', borderRadius: 10,
      padding: '0.75rem 1rem', color: 'var(--color-danger-strong)', fontSize: '0.875rem', marginBottom: '1rem',
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
      color: 'var(--color-text-muted)', fontSize: '0.9375rem',
    }}>
      {message ?? children ?? 'Nothing to show.'}
    </div>
  );
}

// ─── TableSkeleton ────────────────────────────────────────────────────────────
export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div style={{ padding: '8px 0' }}>
      {Array.from({ length: rows }).map((_, ri) => (
        <div key={ri} className="table-skeleton-row">
          {Array.from({ length: cols }).map((__, ci) => (
            <div key={ci} className="table-skeleton-cell skeleton" style={{ flex: ci === 0 ? 2 : 1 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── TableStateBar ────────────────────────────────────────────────────────────
export function TableStateBar({
  loading, error, onRetry, isEmpty, emptyMessage, filterActive, onClearFilters,
}: {
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
  isEmpty?: boolean;
  emptyMessage?: string;
  filterActive?: boolean;
  onClearFilters?: () => void;
}) {
  if (loading) return null;
  if (error) {
    return (
      <div className="table-state-bar">
        <ErrorMsg message={error} />
        {onRetry && (
          <Btn variant="secondary" onClick={onRetry}>Retry</Btn>
        )}
      </div>
    );
  }
  if (isEmpty) {
    return <EmptyState message={emptyMessage ?? 'No records found.'} />;
  }
  if (filterActive && onClearFilters) {
    return (
      <div className="table-state-bar">
        <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Filters applied</span>
        <Btn variant="ghost" onClick={onClearFilters}>Clear filters</Btn>
      </div>
    );
  }
  return null;
}

// ─── PageShell ────────────────────────────────────────────────────────────────
export function PageShell({
  children, className, style,
}: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={['page-shell', 'animate-fade-in', className].filter(Boolean).join(' ')} style={style}>
      {children}
    </div>
  );
}

// ─── PageHeader ───────────────────────────────────────────────────────────────
export function PageHeader({
  title, subtitle, action, children, section, breadcrumb,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children?: ReactNode;
  /** Level-1 section label for "Section › Page" breadcrumb */
  section?: string;
  breadcrumb?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        {(breadcrumb || section) && (
          <div className="page-header-breadcrumb">
            {breadcrumb ?? (
              <>
                <span>{section}</span>
                <span className="page-header-breadcrumb-sep" aria-hidden>›</span>
                <span>{title}</span>
              </>
            )}
          </div>
        )}
        <h1 className="page-header-title">{title}</h1>
        {subtitle && <p className="page-header-subtitle">{subtitle}</p>}
        {children}
      </div>
      {action && <div className="page-header-actions">{action}</div>}
    </div>
  );
}

// ─── ScrollX / ResponsiveTable / Toolbar ──────────────────────────────────────
export function ScrollX({
  children, className, style,
}: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={['scroll-x', className].filter(Boolean).join(' ')} style={style}>
      {children}
    </div>
  );
}

export function ResponsiveTable({
  children, className, style, minWidth = 640,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  minWidth?: number | string;
}) {
  return (
    <div className={['responsive-table', 'table-scroll', className].filter(Boolean).join(' ')} style={style}>
      <div style={{ minWidth }}>
        {children}
      </div>
    </div>
  );
}

export function Toolbar({
  children, className, style,
}: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={['toolbar', className].filter(Boolean).join(' ')} style={style}>
      {children}
    </div>
  );
}

// ─── Btn ──────────────────────────────────────────────────────────────────────
type BtnVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

const BTN_STYLES: Record<BtnVariant, React.CSSProperties> = {
  primary:   { background: 'var(--color-primary)', color: '#fff', border: 'none' },
  secondary: { background: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--color-border)' },
  danger:    { background: 'var(--color-danger)', color: '#fff', border: 'none' },
  ghost:     { background: 'transparent', color: 'var(--color-text-secondary)', border: 'none' },
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
        minHeight: '44px',
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
      {label && <label htmlFor={inputId} style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text)' }}>{label}</label>}
      <input
        id={inputId}
        {...rest}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        style={{
          minHeight: 44, height: 44, padding: '0 0.75rem',
          border: '1.5px solid var(--color-border)', borderRadius: 10,
          fontSize: '0.9rem', fontFamily: 'inherit',
          background: 'var(--color-surface)', color: 'var(--color-text)',
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
      {label && <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text)' }}>{label}</label>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        {...rest}
        style={{
          minHeight: 44, height: 44, padding: '0 0.75rem',
          border: '1.5px solid var(--color-border)', borderRadius: 10,
          fontSize: '0.875rem', fontFamily: 'inherit',
          background: 'var(--color-surface)', color: 'var(--color-text)',
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

// ─── ModalActions ─────────────────────────────────────────────────────────────
export function ModalActions({ children }: { children: ReactNode }) {
  return (
    <div className="modal-actions" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
      {children}
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────
const FOCUSABLE_SEL = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function isModalActionsElement(node: ReactNode): node is ReactElement<{ children?: ReactNode }> {
  return isValidElement(node) && node.type === ModalActions;
}

export function Modal({
  title, onClose, children, footer, maxWidth = 440,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Optional sticky footer. If omitted, a trailing ModalActions child is lifted into the footer. */
  footer?: ReactNode;
  maxWidth?: number;
}) {
  const uid = useId();
  const titleId = `modal-title-${uid}`;
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const childArr = Children.toArray(children);
  const last = childArr[childArr.length - 1];
  const lastIsActions = footer == null && isModalActionsElement(last);
  const bodyChildren = lastIsActions ? childArr.slice(0, -1) : children;
  const footerNode = footer ?? (lastIsActions ? last : null);

  // Body scroll lock + focus management (same pattern as ContentEditorSheet).
  useEffect(() => {
    previouslyFocused.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => closeRef.current?.focus(), 0);

    const panel = panelRef.current;
    const els = () =>
      panel ? Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SEL)) : [];

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onCloseRef.current(); return; }
      if (e.key !== 'Tab') return;
      const focusable = els();
      if (!focusable.length) { e.preventDefault(); return; }
      const first = focusable[0]; const lastEl = focusable[focusable.length - 1];
      if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); lastEl.focus(); } }
      else { if (document.activeElement === lastEl) { e.preventDefault(); first.focus(); } }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', handleKey);
      const target = previouslyFocused.current;
      if (target && typeof target.focus === 'function') {
        window.setTimeout(() => target.focus(), 0);
      }
    };
  }, []);

  if (typeof document === 'undefined') return null;

  // Portal to body so position:fixed is not trapped by transformed ancestors
  // (same approach as ContentEditorSheet). Desktop look is unchanged.
  return createPortal(
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid="shared-modal-backdrop"
      style={{
        position: 'fixed', inset: 0, zIndex: 'var(--z-modal)' as unknown as number,
        background: 'rgba(28,20,8,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={panelRef}
        className="modal-container"
        style={{ width: '100%', maxWidth }}
      >
        <div className="modal-header">
          <h3 id={titleId} style={{ fontWeight: 800, fontSize: 17, color: 'var(--color-text)', margin: 0 }}>{title}</h3>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            data-testid="shared-modal-close"
            className="icon-button"
            style={{
              background: 'var(--color-bg)', border: 'none', borderRadius: 8,
              width: 40, height: 40, minHeight: 40, cursor: 'pointer', color: 'var(--color-text-secondary)',
              fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >✕</button>
        </div>
        <div className="modal-body" data-testid="modal-body">
          {bodyChildren}
        </div>
        {footerNode != null && (
          <div className="modal-footer" data-testid="modal-footer">
            {footerNode}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

// ─── StatCard ─────────────────────────────────────────────────────────────────
export function StatCard({
  label, value, sub, accent = 'var(--color-primary)', icon: Icon, trend,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
  icon?: React.ElementType;
  trend?: { value: string; positive?: boolean };
}) {
  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 14,
      padding: '16px 20px',
      boxShadow: '0 1px 2px rgba(28,20,8,0.05)',
      minWidth: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    }}>
      {/* Label row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', margin: 0 }}>{label}</p>
        {Icon && (
          <div style={{
            width: 30, height: 30, borderRadius: 8,
            background: `color-mix(in srgb, ${accent} 14%, transparent)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: accent, flexShrink: 0,
          }}>
            <Icon size={15} />
          </div>
        )}
      </div>
      {/* Value row */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
        <p style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-text)', margin: 0, lineHeight: 1 }}>{value}</p>
        {trend && (
          <span style={{
            fontSize: 11,
            fontWeight: 700,
            color: trend.positive === true ? 'var(--color-success-strong)' : trend.positive === false ? 'var(--color-danger-strong)' : 'var(--color-text-secondary)',
            background: trend.positive === true ? 'var(--color-success-bg)' : trend.positive === false ? 'var(--color-danger-bg)' : 'var(--color-bg)',
            border: `1px solid ${trend.positive === true ? '#86efac' : trend.positive === false ? '#fca5a5' : 'var(--color-border)'}`,
            borderRadius: 9999,
            padding: '2px 7px',
            whiteSpace: 'nowrap',
          }}>
            {trend.value}
          </span>
        )}
      </div>
      {sub && <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0 }}>{sub}</p>}
    </div>
  );
}

// ─── TableCard ────────────────────────────────────────────────────────────────
export function TableCard({ children, stickyHead }: { children: ReactNode; stickyHead?: boolean }) {
  return (
    <div style={{
      background: 'var(--color-surface)', border: '1px solid var(--color-border)',
      borderRadius: 14, overflow: 'hidden',
      boxShadow: '0 1px 2px rgba(28,20,8,0.05)',
    }}>
      <div className={`table-scroll${stickyHead ? ' admin-table-sticky-head' : ''}`} style={{ overflowX: 'auto' }}>
        {children}
      </div>
    </div>
  );
}

// ─── Th / Td helpers ─────────────────────────────────────────────────────────
export const TH: React.CSSProperties = {
  padding: '11px 16px', textAlign: 'left', fontWeight: 700,
  color: 'var(--color-text-muted)', fontSize: 11, textTransform: 'uppercase',
  background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)',
  whiteSpace: 'nowrap',
};
export const TD: React.CSSProperties = {
  padding: '12px 16px', fontSize: 14, color: 'var(--color-text)',
  borderBottom: '1px solid var(--color-border-light)', verticalAlign: 'middle',
};

// ─── DateInput ────────────────────────────────────────────────────────────────
export function DateInput({ value, onChange, label, max }: {
  value: string; onChange: (v: string) => void; label?: string; max?: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {label && <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</label>}
      <input
        type="date"
        value={value}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        style={{
          height: 36, padding: '0 10px',
          border: '1.5px solid var(--color-border)', borderRadius: 10,
          fontSize: 13, fontFamily: 'inherit',
          background: 'var(--color-surface)', color: 'var(--color-text)', outline: 'none',
        }}
      />
    </div>
  );
}

// ─── SectionLabel ─────────────────────────────────────────────────────────────
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 10px' }}>
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
      <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Page {page} of {totalPages}</span>
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
        position: 'fixed', inset: 0, zIndex: 60,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.45)',
      }}
      onClick={close}
    >
      <div
        className="modal-container"
        style={{
          background: 'var(--color-surface)', borderRadius: 14, padding: '1.75rem',
          maxWidth: 400, width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id={titleId} style={{ fontWeight: 700, fontSize: 17, marginBottom: 8 }}>
          {state.title ?? 'Confirm'}
        </h3>
        <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 24, lineHeight: 1.5 }}>
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
