import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ContentTaskLanding } from './ContentTaskLanding';

describe('ContentTaskLanding', () => {
  it('renders Global / Website / Order App / Tools and calls onSelectTask', () => {
    const onSelectTask = vi.fn();
    render(
      <ContentTaskLanding
        availableGroups={new Set(['Hero', 'Branding', 'Homepage', 'Order App', 'SEO', 'Menu', 'Status banners'])}
        dirtyGroups={new Set(['Hero'])}
        onSelectTask={onSelectTask}
      />,
    );

    expect(screen.getByTestId('content-task-landing')).toBeTruthy();
    expect(screen.getByTestId('task-cluster-global')).toBeTruthy();
    expect(screen.getByTestId('task-cluster-website')).toBeTruthy();
    expect(screen.getByTestId('task-cluster-order_app')).toBeTruthy();
    expect(screen.getByTestId('task-cluster-tools')).toBeTruthy();
    expect(screen.getByTestId('task-dirty-hero')).toBeTruthy();

    // Menu + status banners reachable without search / desktop rail.
    expect(screen.getByTestId('task-card-order_menu')).toBeTruthy();
    expect(screen.getByTestId('task-card-status_banners')).toBeTruthy();
    expect(screen.getByTestId('task-card-brand_profile')).toBeTruthy();

    fireEvent.click(screen.getByTestId('task-card-hero'));
    expect(onSelectTask).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'hero', group: 'Hero' }),
    );

    fireEvent.click(screen.getByTestId('task-card-order_home'));
    expect(onSelectTask).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'order_home', group: 'Homepage', homeAppHint: 'order_app' }),
    );

    expect(screen.getByTestId('task-card-contact_map')).toBeTruthy();
    expect(screen.getByTestId('task-card-opening_hours')).toBeTruthy();
    expect(screen.getByTestId('task-placements-opening_hours').textContent).toMatch(/Shared|Website hours|Order App hours/);
  });

  it.each([320, 375, 390, 1024, 1280, 1440] as const)('does not overflow horizontally at %ipx', (width) => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    const root = document.createElement('div');
    root.style.width = `${width}px`;
    root.style.overflow = 'auto';
    document.body.appendChild(root);

    render(
      <ContentTaskLanding
        availableGroups={new Set(['Hero', 'Branding', 'Homepage', 'Order App', 'SEO', 'Legal', 'Menu', 'Status banners'])}
        onSelectTask={() => undefined}
      />,
      { container: root },
    );

    expect(root.scrollWidth).toBeLessThanOrEqual(width + 1);
    root.remove();
  });

  it('uses full width of the editor column (no phone-style max-width cap)', () => {
    render(
      <ContentTaskLanding
        availableGroups={new Set(['Hero', 'Branding', 'Homepage'])}
        onSelectTask={() => undefined}
      />,
    );
    const landing = screen.getByTestId('content-task-landing');
    expect(landing.className).toContain('hub-task-landing');
    // Cap removed so desktop can use a multi-column task grid.
    expect(getComputedStyle(landing).maxWidth === 'none' || getComputedStyle(landing).maxWidth === '').toBe(true);
  });
});
