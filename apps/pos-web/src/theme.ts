/**
 * POS design tokens — single source of truth for colors / spacing / type.
 *
 * The audit found three loose visual systems coexisting in the app: a
 * slate POS chrome, a warm "bake" brown (login / device gate / send
 * bill panel), and a rainbow set of category tile colors. This file
 * unifies everything around one neutral slate scale + one brand
 * primary (orange-amber, kept because it matches the bake-and-grill
 * brand) so a cashier never sees two competing "products" in the same
 * shift.
 *
 * Components import the named constants (no string typos, IDE
 * autocomplete) and the small style helpers (`elevated`, `card`,
 * `inputField`, `btnPrimary` etc.) for the most common patterns. New
 * surfaces should reach for these before inventing local tokens.
 */

// ── Palette ────────────────────────────────────────────────────────────

export const palette = {
  // Surfaces
  bg: '#F8FAFC',        // app background
  bgAlt: '#F1F5F9',     // secondary surface (drawer back, hover)
  panel: '#FFFFFF',     // cards, modals, sidebar
  panelInk: '#0F172A',  // primary text on panels
  panelMuted: '#64748B',// secondary text on panels
  panelSubtle: '#94A3B8',// tertiary text

  // Borders
  border: '#E2E8F0',
  borderStrong: '#CBD5E1',
  borderInk: '#94A3B8',

  // Inverted (dark sidebar, charge panel)
  ink: '#0F172A',
  inkSoft: '#1E293B',
  inkText: '#F8FAFC',
  inkMuted: '#94A3B8',

  // Brand — bake & grill orange (already in use as accent, we just
  // commit to it as THE brand color)
  primary: '#D4813A',
  primaryDark: '#B86820',
  primaryLight: '#FBD9B8',
  primaryBg: '#FEF3E8',

  // States
  success: '#10B981',
  successDark: '#047857',
  successBg: '#ECFDF5',
  successBorder: '#A7F3D0',
  warn: '#F59E0B',
  warnDark: '#92400E',
  warnBg: '#FFFBEB',
  warnBorder: '#FCD34D',
  danger: '#DC2626',
  dangerDark: '#991B1B',
  dangerBg: '#FEE2E2',
  dangerBorder: '#FCA5A5',
  info: '#2563EB',
  infoBg: '#EFF6FF',
} as const;

// ── Spacing ────────────────────────────────────────────────────────────
// 4px base scale — covers ~99% of real layouts. If you need 6 or 10,
// reach for `space.s` / `space.m` first. Off-grid values should be
// the exception and have a comment.

export const space = {
  xxs: 4,
  xs: 6,
  s: 8,
  m: 12,
  l: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
} as const;

// ── Radii ──────────────────────────────────────────────────────────────

export const radius = {
  xs: 4,
  s: 6,
  m: 8,
  l: 10,
  xl: 14,
  xxl: 20,
  pill: 999,
} as const;

// ── Shadows ────────────────────────────────────────────────────────────

export const shadow = {
  none: 'none',
  xs: '0 1px 2px rgba(15, 23, 42, 0.04)',
  s: '0 2px 6px rgba(15, 23, 42, 0.06)',
  m: '0 4px 12px rgba(15, 23, 42, 0.08)',
  l: '0 8px 24px rgba(15, 23, 42, 0.12)',
  xl: '0 12px 32px rgba(15, 23, 42, 0.18)',
  /** Focused brand glow — for primary CTAs / focused inputs. */
  brand: '0 0 0 3px rgba(212, 129, 58, 0.22)',
} as const;

// ── Type ramp ──────────────────────────────────────────────────────────
// Six levels are plenty for a POS. Display is the tender amount, body
// is the default, label is uppercase-tracked.

export const type = {
  display: { fontSize: 32, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1 },
  title:   { fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.2 },
  subtitle:{ fontSize: 16, fontWeight: 700, lineHeight: 1.3 },
  body:    { fontSize: 14, fontWeight: 500, lineHeight: 1.4 },
  bodySm:  { fontSize: 13, fontWeight: 500, lineHeight: 1.4 },
  caption: { fontSize: 12, fontWeight: 500, lineHeight: 1.4 },
  label:   {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    lineHeight: 1.2,
  },
} as const;

// ── Z-index scale ──────────────────────────────────────────────────────
// Documented so layered surfaces don't collide. Higher = on top.

export const z = {
  base: 0,
  raised: 10,
  drawer: 30,
  banner: 40,
  modalBackdrop: 50,
  modal: 51,
  toast: 80,
  lock: 90,
} as const;

// ── Breakpoints ────────────────────────────────────────────────────────
// POS is a tablet/desktop tool. Phone support is "doesn't break",
// tablet portrait is "works comfortably", tablet landscape and up is
// "designed for".

export const bp = {
  /** Tablet portrait (e.g. iPad held vertically). */
  md: 820,
  /** Tablet landscape / small desktop. */
  lg: 1100,
} as const;

// ── Common style helpers ──────────────────────────────────────────────

import type { CSSProperties } from 'react';

/** A flat card surface with subtle elevation. */
export const card: CSSProperties = {
  background: palette.panel,
  border: `1px solid ${palette.border}`,
  borderRadius: radius.l,
  boxShadow: shadow.xs,
};

/** A larger, more prominent card — used for modals + hero panels. */
export const cardElevated: CSSProperties = {
  background: palette.panel,
  border: `1px solid ${palette.border}`,
  borderRadius: radius.xl,
  boxShadow: shadow.l,
};

/** Standard form input. */
export const inputField: CSSProperties = {
  padding: `${space.s}px ${space.m}px`,
  borderRadius: radius.s,
  border: `1px solid ${palette.borderStrong}`,
  background: palette.panel,
  fontSize: type.body.fontSize,
  fontWeight: 500,
  color: palette.panelInk,
  outline: 'none',
  minHeight: 40,
  boxSizing: 'border-box',
};

/** Primary CTA — brand color. */
export function btnPrimary(disabled = false): CSSProperties {
  return {
    padding: `${space.s + 2}px ${space.l}px`,
    minHeight: 44, // WCAG touch target
    borderRadius: radius.s,
    border: 'none',
    background: disabled ? palette.primaryLight : palette.primary,
    color: '#FFFFFF',
    fontSize: type.body.fontSize,
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    whiteSpace: 'nowrap',
    transition: 'background 120ms ease, transform 80ms ease',
  };
}

/** Secondary CTA — outlined, neutral. */
export function btnSecondary(disabled = false): CSSProperties {
  return {
    padding: `${space.s + 2}px ${space.l}px`,
    minHeight: 44,
    borderRadius: radius.s,
    border: `1px solid ${palette.borderStrong}`,
    background: palette.panel,
    color: disabled ? palette.panelSubtle : palette.panelInk,
    fontSize: type.body.fontSize,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    whiteSpace: 'nowrap',
  };
}

/** Destructive CTA — red. */
export function btnDanger(disabled = false): CSSProperties {
  return {
    padding: `${space.s + 2}px ${space.l}px`,
    minHeight: 44,
    borderRadius: radius.s,
    border: 'none',
    background: disabled ? palette.dangerBorder : palette.danger,
    color: '#FFFFFF',
    fontSize: type.body.fontSize,
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    whiteSpace: 'nowrap',
  };
}

/** Ghost / link-style button. */
export function btnGhost(disabled = false): CSSProperties {
  return {
    padding: `${space.xs}px ${space.s}px`,
    border: 'none',
    background: 'transparent',
    color: disabled ? palette.panelSubtle : palette.panelMuted,
    fontSize: type.bodySm.fontSize,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
}
