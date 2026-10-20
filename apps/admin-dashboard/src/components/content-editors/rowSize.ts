import type { CSSProperties } from 'react';

/**
 * A control's size in a `content-editor-row`, read by the stylesheet from 768px
 * (index.css, Content Studio). On a phone the row stacks and every control takes
 * the full width, so the page code no longer sets these inline.
 */
export function rowSize(flex: string, minWidth?: number, width?: number): CSSProperties {
  return {
    '--ce-flex': flex,
    ...(minWidth !== undefined ? { '--ce-min': `${minWidth}px` } : {}),
    ...(width !== undefined ? { '--ce-w': `${width}px` } : {}),
  } as CSSProperties;
}
