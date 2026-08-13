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
  it('renders Stage 7 hybrid landing: primary, pages, surfaces, site-wide', () => {
    const onSelectSurface = vi.fn();
    const onSelectTask = vi.fn();
    render(
      <SurfaceBuilderLanding
        surfaceCounts={{ 'website.mobile.header': 2, 'order_app.mobile.home': 5 }}
        dirtyGroups={new Set(['Everywhere', 'Home'])}
        onSelectSurface={onSelectSurface}
        onSelectTask={onSelectTask}
      />,
    );

    expect(screen.getByTestId('surface-builder-landing')).toBeTruthy();
    expect(screen.getByTestId('hub-landing-primary')).toBeTruthy();
    expect(screen.getByTestId('task-card-hero')).toBeTruthy();
    expect(screen.getByTestId('hub-landing-home-cta')).toBeTruthy();
    expect(screen.getByTestId('task-dirty-hero')).toBeTruthy();

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
    expect(screen.getByTestId('task-card-announcement')).toBeTruthy();
    expect(screen.getByTestId('task-card-website_footer')).toBeTruthy();
    expect(screen.getByTestId('task-card-seo')).toBeTruthy();
    expect(screen.getByTestId('task-card-legal')).toBeTruthy();
    expect(screen.getByTestId('task-card-opening_hours')).toBeTruthy();
    expect(screen.getByTestId('task-card-order_menu')).toBeTruthy();

    fireEvent.click(screen.getByTestId('task-card-hero'));
    expect(onSelectTask).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'hero', focusBlockKey: 'hero_slides' }),
    );

    fireEvent.click(screen.getByTestId('hub-landing-home-cta'));
    expect(onSelectSurface).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'website.mobile.home', app: 'website', slot: 'home' }),
    );

    fireEvent.click(screen.getByTestId('surface-card-order_app.mobile.home'));
    expect(onSelectSurface).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'order_app.mobile.home', app: 'order_app', slot: 'home' }),
    );

    fireEvent.click(screen.getByTestId('task-card-seo'));
    expect(onSelectTask).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'seo', group: 'Everywhere' }),
    );
  });

  it('uses page rows when provided and filters by app', () => {
    const onSelectPage = vi.fn();
    render(
      <SurfaceBuilderLanding
        appFilter="website"
        preferredDevice="desktop"
        pageRows={[
          { name: 'Contact page', dirty: false, count: 3 },
          { name: 'Hours page', dirty: true, count: 2 },
        ]}
        onSelectPage={onSelectPage}
        onSelectSurface={() => undefined}
        onSelectTask={() => undefined}
      />,
    );

    expect(screen.getByTestId('hub-landing-page-contact-page')).toBeTruthy();
    expect(screen.getByTestId('hub-landing-page-hours-page')).toBeTruthy();
    expect(screen.queryByTestId('task-card-opening_hours')).toBeNull();
    expect(screen.queryByTestId('surface-app-order_app')).toBeNull();
    expect(screen.getByTestId('hub-landing-home-cta').textContent).toMatch(/Desktop/);

    fireEvent.click(screen.getByTestId('hub-landing-device-tab-mobile'));
    expect(screen.getByTestId('surface-card-website.mobile.header')).toBeTruthy();

    fireEvent.click(screen.getByTestId('hub-landing-page-contact-page'));
    expect(onSelectPage).toHaveBeenCalledWith('Contact page');
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
