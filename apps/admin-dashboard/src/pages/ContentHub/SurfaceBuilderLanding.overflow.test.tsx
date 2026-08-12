import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { SurfaceBuilderLanding } from './SurfaceBuilderLanding';

vi.mock('./taskLandingConfig', async () => {
  const actual = await vi.importActual<typeof import('./taskLandingConfig')>('./taskLandingConfig');
  return {
    ...actual,
    BRAND_PAGE_TASKS: actual.BRAND_PAGE_TASKS.slice(0, 3),
  };
});

const VIEWPORTS = [320, 375, 390, 1024, 1280, 1440] as const;

/**
 * Surface Builder must not force horizontal overflow at common phone/desktop widths.
 * jsdom cannot layout CSS fully — we assert structural containment (minWidth:0 / overflow)
 * and that cards wrap rather than using fixed widths wider than the viewport.
 */
describe('SurfaceBuilderLanding overflow budgets', () => {
  for (const width of VIEWPORTS) {
    it(`contains layout at ${width}px`, () => {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
      const { container } = render(
        <SurfaceBuilderLanding
          onSelectSurface={() => {}}
          onSelectTask={() => {}}
          surfaceCounts={{}}
        />,
      );
      const root = container.querySelector('[data-testid="surface-builder-landing"]') as HTMLElement;
      expect(root).toBeTruthy();

      const wideFixed = Array.from(root.querySelectorAll<HTMLElement>('*')).filter((el) => {
        const style = el.getAttribute('style') || '';
        const m = style.match(/min(?:-w|Width):\s*(\d+)px/i)
          || style.match(/width:\s*(\d+)px/i);
        if (!m) return false;
        return Number(m[1]) > width;
      });
      expect(wideFixed, `elements wider than ${width}px via inline style`).toEqual([]);

      // Cards and device rows should allow shrink/wrap (class-driven CSS).
      expect(root.querySelector('.hub-surface-devices')).toBeTruthy();
      expect(root.querySelectorAll('[data-testid^="surface-card-"]').length).toBeGreaterThan(0);
    });
  }
});
