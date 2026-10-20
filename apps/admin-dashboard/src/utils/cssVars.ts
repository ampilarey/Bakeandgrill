/**
 * For a computer-width value handed to the stylesheet as a custom property
 * (docs/MOBILE_FIRST.md): React adds "px" to a number in an ordinary style, never
 * in a custom property, so a bare number is turned into pixels here.
 */
export function px(value: number | string | undefined): string | undefined {
  return typeof value === 'number' ? `${value}px` : value;
}
