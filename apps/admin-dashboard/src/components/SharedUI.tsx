/**
 * Shared UI primitives used by admin page components.
 */
import {
  Children, isValidElement, useEffect, useId, useRef, useState,
  type ButtonHTMLAttributes, type HTMLAttributes, type ReactElement, type ReactNode, type SelectHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { X, type LucideIcon } from 'lucide-react';
import { useInHub } from './hubContext';

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
      // `admin-card` lets the stylesheet trim the padding on a phone, where
      // twenty pixels a side out of 390 is a fifth of the card gone.
      className={['admin-card', className].filter(Boolean).join(' ')}
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

// ─── InlineIcon ───────────────────────────────────────────────────────────────
/**
 * A line icon sitting in a run of text, where the pages used colour emoji
 * (📍 👤 🛵 🖨️…). Emoji draw in each phone's own colours and style, so a row
 * of them never matched the admin's icons or the brand (owner, 2026-10-08:
 * "many admin pages doesn't follow the branding"). Takes the text's colour.
 */
export function InlineIcon({ icon: Icon, size = 14, gap = 4 }: { icon: LucideIcon; size?: number; gap?: number }) {
  return <Icon size={size} aria-hidden style={{ display: 'inline-block', verticalAlign: '-0.15em', marginRight: gap, flexShrink: 0 }} />;
}

// ─── Badge ────────────────────────────────────────────────────────────────────
export function Badge({
  label,
  color = 'gray',
  children,
}: { label?: string; color?: string; children?: ReactNode }) {
  const colorMap: Record<string, { bg: string; text: string; border: string }> = {
    green:  { bg: 'var(--color-success-bg)', text: 'var(--color-success-strong)', border: 'color-mix(in srgb, var(--color-success) 35%, transparent)' },
    red:    { bg: 'var(--color-danger-bg)', text: 'var(--color-danger-strong)', border: 'color-mix(in srgb, var(--color-danger) 45%, transparent)' },
    yellow: { bg: 'var(--color-tone-gold-bg)', text: 'var(--color-tone-gold-text)', border: 'var(--color-tone-gold-border)' },
    // Blue, purple and teal were never brand colours (owner, 2026-10-08: "many
    // admin pages doesn't follow the branding"). The names stay, since pages
    // and statColor ask for them, but they draw the brand tones: rust for in
    // progress, cocoa for plain labels, gold for ready.
    rust:   { bg: 'var(--color-tone-rust-bg)', text: 'var(--color-tone-rust-text)', border: 'var(--color-tone-rust-border)' },
    brown:  { bg: 'var(--color-tone-brown-bg)', text: 'var(--color-tone-brown-text)', border: 'var(--color-tone-brown-border)' },
    gold:   { bg: 'var(--color-tone-gold-bg)', text: 'var(--color-tone-gold-text)', border: 'var(--color-tone-gold-border)' },
    blue:   { bg: 'var(--color-tone-rust-bg)', text: 'var(--color-tone-rust-text)', border: 'var(--color-tone-rust-border)' },
    purple: { bg: 'var(--color-tone-brown-bg)', text: 'var(--color-tone-brown-text)', border: 'var(--color-tone-brown-border)' },
    teal:   { bg: 'var(--color-tone-gold-bg)', text: 'var(--color-tone-gold-text)', border: 'var(--color-tone-gold-border)' },
    gray:   { bg: 'var(--color-bg)', text: 'var(--color-text-secondary)', border: 'var(--color-border)' },
    orange: { bg: 'var(--color-warning-bg)', text: 'var(--color-warning-strong)', border: 'color-mix(in srgb, var(--color-warning) 35%, transparent)' },
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
      /* A pill that breaks into two lines in a squeezed table cell reads as
         two pills; a badge is one word or two and never needs to wrap. */
      whiteSpace: 'nowrap',
    }}>
      {/* Pages pass raw codes ("dine_in", "in_progress"); capitalize alone
          drew "Dine_in". */}
      {label != null ? label.replace(/_/g, ' ') : children}
    </span>
  );
}

// ─── ErrorMsg ─────────────────────────────────────────────────────────────────
export function ErrorMsg({ message }: { message: string }) {
  return (
    <div style={{
      background: 'var(--color-danger-bg)', border: '1px solid color-mix(in srgb, var(--color-danger) 45%, transparent)', borderRadius: 10,
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
  // Inside a hub the hub owns the shell; a nested one would double the padding.
  const inHub = useInHub();
  if (inHub) {
    return <div className={className} style={style}>{children}</div>;
  }
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
  // Inside a hub the title is the hub's; only the page's own buttons and
  // filters survive.
  const inHub = useInHub();
  if (inHub) {
    if (!action && !children) return null;
    return (
      <div className="page-header page-header--embedded">
        {children ? <div>{children}</div> : null}
        {action && <div className="page-header-actions">{action}</div>}
      </div>
    );
  }
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

/*
 * A row of tabs or chips. It used to scroll sideways on a narrow screen, with
 * fades and a chevron to say more sat off the edge (phone sweep, 2026-09-14).
 * Owner, 2026-10-09: "Still horizontal scrolling is there in many places."
 * The row wraps now: every tab is in sight, on two or three lines on a phone,
 * as the Business section buttons have since the owner asked on 2026-08-15.
 * A page's own `overflowX` on the row is dropped, so no caller can bring the
 * sideways scroll back.
 *
 * `fit` keeps the row as wide as its tabs (the pill strip); without it the
 * row is block-wide (the underlined group bar).
 */
export function TabScrollRow({
  children, className, style, fit = false, ...rest
}: HTMLAttributes<HTMLDivElement> & { fit?: boolean }) {
  const { overflowX: _overflowX, overflow: _overflow, flexWrap: _flexWrap, ...rowStyle } = style ?? {};
  return (
    <div className={`tab-scroll-wrap${fit ? ' tab-scroll-wrap--fit' : ''}`}>
      <div
        className={['tab-scroll-row', className].filter(Boolean).join(' ')}
        style={rowStyle}
        {...rest}
      >
        {children}
      </div>
    </div>
  );
}

// ─── Btn ──────────────────────────────────────────────────────────────────────
type BtnVariant = 'primary' | 'secondary' | 'danger' | 'danger-outline' | 'ghost';

const BTN_STYLES: Record<BtnVariant, React.CSSProperties> = {
  primary:   { background: 'var(--color-primary)', color: '#fff', border: 'none' },
  secondary: { background: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--color-border)' },
  danger:    { background: 'var(--color-danger)', color: '#fff', border: 'none' },
  // A row's Delete / Remove / Reject: red words on the secondary button. Solid
  // red is for the final "yes, do it" (a confirm, a bulk action); a column of
  // solid red buttons down a list was the loudest thing on the page.
  'danger-outline': { background: 'var(--color-bg)', color: 'var(--color-danger-strong)', border: '1px solid color-mix(in srgb, var(--color-danger) 35%, transparent)' },
  ghost:     { background: 'transparent', color: 'var(--color-text-secondary)', border: 'none' },
};

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant;
  small?: boolean;
  children: ReactNode;
  /** React 19 passes ref as an ordinary prop — ConfirmDialog focuses Cancel with it. */
  ref?: React.Ref<HTMLButtonElement>;
}

export function Btn({ variant = 'primary', small, children, style, ref, ...rest }: BtnProps) {
  return (
    <button
      ref={ref}
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

// ─── Switch ───────────────────────────────────────────────────────────────────
type SwitchProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'role' | 'children'> & {
  checked: boolean;
  onChange: (next: boolean) => void;
  size?: 'sm' | 'md';
};

/**
 * The one on/off switch. Pages drew their own: green on some, rust on others,
 * cool grey when off, and the ones without role="switch" were stretched to a
 * lozenge by the phone rule that makes every button 44px tall.
 */
export function Switch({ checked, onChange, size = 'md', disabled, style, ...rest }: SwitchProps) {
  const w = size === 'sm' ? 40 : 48;
  const h = size === 'sm' ? 22 : 28;
  const knob = h - 6;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      {...rest}
      style={{
        position: 'relative', display: 'inline-block', flexShrink: 0,
        width: w, height: h, minHeight: 0, padding: 0, border: 'none', borderRadius: h / 2,
        background: checked ? 'var(--color-primary)' : 'var(--color-switch-off)',
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1,
        transition: 'background 0.2s',
        ...style,
      }}
    >
      <span aria-hidden style={{
        position: 'absolute', top: 3, left: checked ? w - knob - 3 : 3,
        width: knob, height: knob, borderRadius: '50%', background: 'var(--color-switch-knob)',
        boxShadow: '0 1px 3px rgba(28, 20, 8, 0.25)', transition: 'left 0.2s',
      }} />
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
  // Flex sizing a caller asks for belongs on the wrapper, which is the flex
  // item; on the inner box `flex: 1` did nothing, the field kept its natural
  // width, and in a narrow row it pushed the button beside it over its
  // neighbour (Wholesale → Shops, "Search" under "Active only", 2026-10-08).
  const { flex, flexGrow, flexShrink, flexBasis, ...inputStyle } = style ?? {};
  const grows = flex !== undefined || flexGrow !== undefined || flexBasis !== undefined;
  // Only the keys the caller set: React writes an undefined longhand as '',
  // and flexGrow: '' after flex: '1 1 100%' wiped the shorthand, so the
  // wrapper never grew (the menu photo address stayed a stub).
  const flexStyle = Object.fromEntries(
    Object.entries({ flex, flexGrow, flexShrink, flexBasis }).filter(([, v]) => v !== undefined),
  ) as React.CSSProperties;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: '0.25rem',
      ...(grows ? { ...flexStyle, minWidth: 0 } : {}),
    }}>
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
          ...(grows ? { width: '100%', minWidth: 0 } : {}),
          ...inputStyle,
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
export const FOCUSABLE_SEL = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * The five things a dialog owes the person using it: Escape closes it, Tab
 * cannot walk out of it, focus comes back where it started, the page behind
 * does not scroll, and it is announced as a dialog.
 *
 * Extracted 2026-09-04 from Modal, which had all five, so ConfirmDialog — used
 * by 20 pages to ask before a delete — could stop having none of them.
 *
 * Exported the same day for the other nine overlays in the layout audit (A3).
 * Anything that covers the page should call this rather than re-implement a
 * subset of it — the audit found five different subsets.
 *
 * @param panelRef   the dialog panel, whose focusables the trap cycles
 * @param firstFocus what to focus on open (a close button, or the safe action)
 * @param active     false leaves the page alone entirely. For a panel that is
 *                   only a dialog at some widths — MediaLibraryPage's detail
 *                   drawer is a full-screen sheet on a phone and a sticky
 *                   sidebar on a desktop, and trapping focus in a sidebar
 *                   would be a bug, not a fix.
 */
export function useDialogChrome(
  onClose: () => void,
  panelRef: React.RefObject<HTMLElement | null>,
  firstFocus?: React.RefObject<HTMLElement | null>,
  active = true,
) {
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!active) return;
    previouslyFocused.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => firstFocus?.current?.focus(), 0);

    const els = () => {
      const panel = panelRef.current;
      return panel ? Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SEL)) : [];
    };

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
  }, [panelRef, firstFocus, active]);
}

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

  const childArr = Children.toArray(children);
  const last = childArr[childArr.length - 1];
  const lastIsActions = footer == null && isModalActionsElement(last);
  const bodyChildren = lastIsActions ? childArr.slice(0, -1) : children;
  const footerNode = footer ?? (lastIsActions ? last : null);

  useDialogChrome(onClose, panelRef, closeRef);

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
          ><X size={18} aria-hidden /></button>
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
        {/* A long figure ("MVR 12,450.00") broke after "MVR" in a phone's
            two-up grid; it steps down with the screen instead. */}
        <p style={{ fontSize: value.length > 9 ? 'clamp(16px, 4.6vw, 22px)' : 22, fontWeight: 800, color: 'var(--color-text)', margin: 0, lineHeight: 1.1 }}>{value}</p>
        {trend && (
          <span style={{
            fontSize: 11,
            fontWeight: 700,
            color: trend.positive === true ? 'var(--color-success-strong)' : trend.positive === false ? 'var(--color-danger-strong)' : 'var(--color-text-secondary)',
            background: trend.positive === true ? 'var(--color-success-bg)' : trend.positive === false ? 'var(--color-danger-bg)' : 'var(--color-bg)',
            border: `1px solid ${trend.positive === true ? 'color-mix(in srgb, var(--color-success) 35%, transparent)' : trend.positive === false ? 'color-mix(in srgb, var(--color-danger) 45%, transparent)' : 'var(--color-border)'}`,
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
/** A cell holding a date, a time or an amount. Those never break over two lines
 *  ("MVR" above "0.00", "2026-" above "10-08" on an upright iPad); the table
 *  scrolls inside its card instead. */
export const TD_NOWRAP: React.CSSProperties = { ...TD, whiteSpace: 'nowrap' };

// ─── DateInput ────────────────────────────────────────────────────────────────
export function DateInput({ value, onChange, label, max }: {
  value: string; onChange: (v: string) => void; label?: string; max?: string;
}) {
  return (
    // `date-input`: on a phone a From/To pair shares one full-width row
    // (index.css) instead of two half-empty rows.
    <div className="date-input" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
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
    confirmed:        'rust',
    preparing:        'rust',
    ready:            'gold',
    delivering:       'gold',
    out_for_delivery: 'rust',
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
  if (!state.open) return null;

  // Keyed on the message so each new question mounts a fresh dialog — the
  // hooks below must not carry the previous question's focus or scroll state.
  return <ConfirmDialogPanel key={state.message} state={state} close={close} />;
}

function ConfirmDialogPanel({ state, close }: { state: ConfirmDialogState; close: () => void }) {
  const uid = useId();
  const titleId = `cdlg-title-${uid}`;
  const descId = `cdlg-desc-${uid}`;
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Focus starts on Cancel, not Confirm: the safe option should be the one a
  // stray Enter or Space lands on when the question is "delete this?".
  useDialogChrome(close, panelRef, cancelRef);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      data-testid="confirm-dialog"
      style={{
        // Above Modal (50) and the customer drawer (56); the toast still clears it.
        position: 'fixed', inset: 0, zIndex: 'var(--z-dialog-over)' as unknown as number,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.45)', padding: 16,
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <div
        ref={panelRef}
        style={{
          background: 'var(--color-surface)', borderRadius: 14,
          maxWidth: 400, width: '100%', boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          // A long question on a phone in landscape used to push Cancel and
          // Confirm off the bottom with nothing to scroll. The buttons are
          // outside the scroll region now, so they are always reachable.
          maxHeight: 'min(85dvh, 640px)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        <div style={{ padding: '1.75rem 1.75rem 0' }}>
          <h3 id={titleId} style={{ fontWeight: 700, fontSize: 17, margin: '0 0 8px', color: 'var(--color-text)' }}>
            {state.title ?? 'Confirm'}
          </h3>
        </div>
        <p
          id={descId}
          style={{
            fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.5,
            margin: 0, padding: '0 1.75rem 1.25rem',
            flex: '1 1 auto', minHeight: 0, overflowY: 'auto',
          }}
        >
          {state.message}
        </p>
        <div style={{
          display: 'flex', gap: 10, justifyContent: 'flex-end', flexShrink: 0,
          padding: '0 1.75rem 1.75rem',
        }}>
          <Btn ref={cancelRef} variant="secondary" onClick={close}>Cancel</Btn>
          <Btn
            variant={state.danger ? 'danger' : 'primary'}
            onClick={() => { state.onConfirm(); close(); }}
          >
            {state.confirmLabel ?? 'Confirm'}
          </Btn>
        </div>
      </div>
    </div>,
    document.body,
  );
}
