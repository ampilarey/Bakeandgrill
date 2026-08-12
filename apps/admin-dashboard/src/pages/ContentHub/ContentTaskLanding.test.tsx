import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ContentTaskLanding } from './ContentTaskLanding';

describe('ContentTaskLanding', () => {
  it('renders task clusters and calls onSelectTask', () => {
    const onSelectTask = vi.fn();
    render(
      <ContentTaskLanding
        availableGroups={new Set(['Hero', 'Branding', 'Homepage', 'Order App', 'SEO'])}
        dirtyGroups={new Set(['Hero'])}
        onSelectTask={onSelectTask}
      />,
    );

    expect(screen.getByTestId('content-task-landing')).toBeTruthy();
    expect(screen.getByTestId('task-cluster-quick')).toBeTruthy();
    expect(screen.getByTestId('task-dirty-hero')).toBeTruthy();

    fireEvent.click(screen.getByTestId('task-card-hero'));
    expect(onSelectTask).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'hero', group: 'Hero' }),
    );

    fireEvent.click(screen.getByTestId('task-card-order_home'));
    expect(onSelectTask).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'order_home', group: 'Homepage', homeAppHint: 'order_app' }),
    );
  });

  it.each([320, 375, 390] as const)('does not overflow horizontally at %ipx', (width) => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    const root = document.createElement('div');
    root.style.width = `${width}px`;
    root.style.overflow = 'auto';
    document.body.appendChild(root);

    render(
      <ContentTaskLanding
        availableGroups={new Set(['Hero', 'Branding', 'Homepage', 'Order App', 'SEO', 'Legal', 'General'])}
        onSelectTask={() => undefined}
      />,
      { container: root },
    );

    expect(root.scrollWidth).toBeLessThanOrEqual(width + 1);
    root.remove();
  });
});
