import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SurfaceBuilderLanding } from './SurfaceBuilderLanding';

vi.mock('../../api/content', () => ({
  getContentIntegrity: vi.fn(async () => ({
    generated_at: '2026-08-13T00:00:00Z',
    surfaces: [],
    issues: [],
    needs_review: [],
    summary: { issue_count: 0, needs_review_count: 0, surface_count: 14 },
  })),
}));

describe('SurfaceBuilderLanding', () => {
  it('renders Website / Order App surface tree and brand pages cluster', () => {
    const onSelectSurface = vi.fn();
    const onSelectTask = vi.fn();
    render(
      <SurfaceBuilderLanding
        surfaceCounts={{ 'website.mobile.header': 2, 'order_app.mobile.home': 5 }}
        dirtyGroups={new Set(['Branding'])}
        onSelectSurface={onSelectSurface}
        onSelectTask={onSelectTask}
      />,
    );

    expect(screen.getByTestId('surface-builder-landing')).toBeTruthy();
    expect(screen.getByTestId('surface-app-website')).toBeTruthy();
    expect(screen.getByTestId('surface-app-order_app')).toBeTruthy();
    expect(screen.getByTestId('surface-device-website-desktop')).toBeTruthy();
    expect(screen.getByTestId('surface-device-website-mobile')).toBeTruthy();
    expect(screen.getByTestId('surface-card-website.mobile.header')).toBeTruthy();
    expect(screen.getByTestId('surface-card-website.mobile.bottom_navigation')).toBeTruthy();
    expect(screen.queryByTestId('surface-card-website.desktop.bottom_navigation')).toBeNull();
    expect(screen.getByTestId('surface-count-website.mobile.header').textContent).toMatch(/2 components/);
    expect(screen.getByTestId('task-cluster-brand_pages')).toBeTruthy();
    expect(screen.getByTestId('task-dirty-brand_profile')).toBeTruthy();
    expect(screen.getByTestId('task-card-brand_profile')).toBeTruthy();
    expect(screen.getByTestId('task-card-hero')).toBeTruthy();
    expect(screen.getByTestId('task-card-announcement')).toBeTruthy();
    expect(screen.getByTestId('task-card-website_footer')).toBeTruthy();
    expect(screen.getByTestId('task-card-seo')).toBeTruthy();
    expect(screen.getByTestId('task-card-legal')).toBeTruthy();
    expect(screen.getByTestId('task-card-opening_hours')).toBeTruthy();
    expect(screen.getByTestId('task-card-order_menu')).toBeTruthy();

    fireEvent.click(screen.getByTestId('surface-card-order_app.mobile.home'));
    expect(onSelectSurface).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'order_app.mobile.home', app: 'order_app', slot: 'home' }),
    );

    fireEvent.click(screen.getByTestId('task-card-seo'));
    expect(onSelectTask).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'seo', group: 'SEO' }),
    );
  });

  it.each([320, 375, 390, 414, 767, 768, 1024, 1199, 1200, 1366] as const)('does not overflow horizontally at %ipx', (width) => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    const root = document.createElement('div');
    root.style.width = `${width}px`;
    root.style.overflow = 'auto';
    document.body.appendChild(root);

    render(
      <SurfaceBuilderLanding
        onSelectSurface={() => undefined}
        onSelectTask={() => undefined}
      />,
      { container: root },
    );

    expect(root.scrollWidth).toBeLessThanOrEqual(width + 1);
    root.remove();
  });

  it('uses full width of the editor column', () => {
    render(
      <SurfaceBuilderLanding
        onSelectSurface={() => undefined}
        onSelectTask={() => undefined}
      />,
    );
    const landing = screen.getByTestId('surface-builder-landing');
    expect(landing.className).toContain('hub-surface-landing');
    expect(getComputedStyle(landing).maxWidth === 'none' || getComputedStyle(landing).maxWidth === '').toBe(true);
  });
});
