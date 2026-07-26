import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  PARITY_ITEMS,
  PARITY_MARKERS,
  PARITY_SLIDE,
  PARITY_THEME,
  PARITY_VARIABLES,
  SlideCanvas,
  parityConfig,
} from '@shared/signage';
import '@shared/signage/signage.css';

describe('shared signage renderer parity (admin app)', () => {
  it('renders the same element-tree structure as /order/tv via @shared/signage', () => {
    const config = parityConfig('portrait');
    render(
      <SlideCanvas
        slide={PARITY_SLIDE}
        theme={PARITY_THEME}
        variables={PARITY_VARIABLES}
        items={PARITY_ITEMS}
        config={config}
        preview
      />,
    );

    for (const id of PARITY_MARKERS) {
      expect(screen.getByTestId(id)).toBeTruthy();
    }
    expect(screen.getByText('Hello Bake & Grill')).toBeTruthy();
    expect(screen.getByText('Chicken Wrap')).toBeTruthy();
    expect(screen.getByText('45.00/-')).toBeTruthy();
    expect(document.querySelector('.signage-slide-canvas.is-preview')).toBeTruthy();
    expect(document.querySelector('.signage-enter-fade')).toBeTruthy();
    expect(document.querySelector('.signage-menu-list')).toBeTruthy();
  });
});
