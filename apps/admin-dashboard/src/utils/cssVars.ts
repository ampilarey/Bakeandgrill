import type { CSSProperties } from 'react';

/**
 * For a computer-width value handed to the stylesheet as a custom property
 * (docs/MOBILE_FIRST.md): React adds "px" to a number in an ordinary style, never
 * in a custom property, so a bare number is turned into pixels here.
 */
export function px(value: number | string | undefined): string | undefined {
  return typeof value === 'number' ? `${value}px` : value;
}

/**
 * An input's, select's or textarea's style with its fontSize handed to the stylesheet
 * as --fs: a phone keeps 16px (iOS zooms into anything smaller) and from 768px the
 * input gets this size (index.css). Wrap every such style in it; SharedUI's Input,
 * Select and DateInput do it themselves.
 */
export function inputFont(style: CSSProperties | undefined): CSSProperties | undefined {
  if (!style || style.fontSize === undefined) return style;
  const { fontSize, ...rest } = style;
  return { ...rest, '--fs': px(fontSize) };
}
