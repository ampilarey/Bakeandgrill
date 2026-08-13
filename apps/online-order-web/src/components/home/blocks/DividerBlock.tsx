import { str, type GenericBlockSettings } from './blockTypes';

const HEIGHTS: Record<string, number> = { sm: 16, md: 32, lg: 56 };

/** Blank space or a thin rule between sections. */
export function DividerBlock({ settings }: { settings: GenericBlockSettings }) {
  const style = str(settings, 'style') === 'rule' ? 'rule' : 'spacer';
  const sizeKey = str(settings, 'size');
  const size = sizeKey in HEIGHTS ? sizeKey : 'md';

  return (
    <div
      data-home-block="divider"
      data-divider-style={style}
      data-divider-size={size}
      aria-hidden="true"
      style={{
        height: HEIGHTS[size],
        maxWidth: 'var(--layout-max)',
        margin: '0 auto',
        width: '100%',
        padding: '0 var(--page-gutter)',
        boxSizing: 'border-box',
        borderBottom: style === 'rule' ? '1px solid var(--color-border)' : undefined,
      }}
    />
  );
}
