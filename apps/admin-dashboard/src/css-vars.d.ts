/**
 * Custom properties in a style={{…}}: the page hands the stylesheet its computer-width
 * value (`'--cols': '1fr 1fr'`) and the stylesheet decides per width, phone first
 * (docs/MOBILE_FIRST.md). React writes them as they are, so a length needs its unit.
 */
import 'react';

declare module 'react' {
  interface CSSProperties {
    [key: `--${string}`]: string | number | undefined;
  }
}
